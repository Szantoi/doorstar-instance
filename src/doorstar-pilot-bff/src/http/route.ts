import { Buffer } from "node:buffer";
import type { PilotBffConfig } from "../config/pilotBffConfig.js";
import type {
  NewPilotRosterUserRequest,
  UpdatePilotRosterUserRequest,
} from "../domain/roster.js";
import { PilotAuthError, PilotRosterAdminError } from "../application/errors.js";
import type { PilotAuthService } from "../application/authService.js";
import type { PilotRosterAdminService } from "../application/rosterAdminService.js";
import {
  clearBrowserBindingCookie,
  clearSessionCookie,
  hasHeader,
  PilotCookieError,
  pilotBrowserCookieName,
  pilotSessionCookieName,
  readRequestCookie,
  readSingleHeader,
  setBrowserBindingCookie,
  setSessionCookie,
} from "./cookies.js";
import {
  pilotJsonBodyLimitBytes,
  type PilotHttpRequest,
  type PilotHttpResponse,
} from "./contracts.js";

const safeResponseHeaders = Object.freeze({
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
});

const forbiddenHeaderNames = [
  "authorization",
  "x-role",
  "x-scope",
  "x-actor",
  "x-principal",
  "x-capability",
  "x-can-manage-pilot-roster",
  "role",
  "scope",
  "actor",
  "capability",
  "can-manage-pilot-roster",
] as const;

const bindingIdPathPattern = /^\/admin\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Pure route dispatcher: tests exercise it without a socket or external call.
 * Admin mutations are deliberately `PUT` replacements, not PATCH: the body
 * always supplies the complete requested Office policy plus audit version.
 */
export async function dispatchPilotAuthRequest(
  request: PilotHttpRequest,
  config: PilotBffConfig,
  auth: PilotAuthService,
  roster?: PilotRosterAdminService,
): Promise<PilotHttpResponse> {
  try {
    assertNoCredentialOverrideHeaders(request);
    const url = parseRequestUrl(request, config);
    const method = request.method?.toUpperCase();

    if (url.pathname === "/auth/login") {
      assertMethod(method, "GET");
      assertOnlyQueryNames(url, []);
      assertNoRequestBody(request);
      const start = await auth.startLogin(readRequestCookie(request.headers, pilotBrowserCookieName));
      const headers: Record<string, string | readonly string[]> = {
        ...safeResponseHeaders,
        Location: start.authorizationUrl,
      };
      if (start.issueBrowserBindingCookie) {
        headers["Set-Cookie"] = setBrowserBindingCookie(
          start.browserBinding,
          config.browserBindingTtlSeconds,
        );
      }
      return { statusCode: 302, headers };
    }

    if (url.pathname === "/auth/callback") {
      assertMethod(method, "GET");
      assertOnlyQueryNames(url, ["code", "state"]);
      assertNoRequestBody(request);
      const completion = await auth.completeCallback({
        code: readRequiredQuery(url, "code"),
        state: readRequiredQuery(url, "state"),
        browserBinding: readRequestCookie(request.headers, pilotBrowserCookieName),
      });
      return {
        statusCode: 303,
        headers: {
          ...safeResponseHeaders,
          Location: completion.redirectPath,
          "Set-Cookie": [
            setSessionCookie(completion.sessionToken, config.sessionTtlSeconds),
            clearBrowserBindingCookie(),
          ],
        },
      };
    }

    if (url.pathname === "/auth/session") {
      assertMethod(method, "GET");
      assertOnlyQueryNames(url, []);
      assertNoRequestBody(request);
      const session = await auth.getSession(readRequestCookie(request.headers, pilotSessionCookieName));
      if (!session) {
        return jsonResponse(401, { error: "authentication_required" }, [
          clearSessionCookie(),
        ]);
      }
      return jsonResponse(200, {
        authenticated: true,
        principal: {
          actorKey: session.actorKey,
          displayName: session.displayName,
          role: session.role,
        },
      });
    }

    if (url.pathname === "/auth/logout") {
      assertMethod(method, "POST");
      assertOnlyQueryNames(url, []);
      assertNoRequestBody(request);
      assertSameOrigin(request, config);
      await auth.logout(readRequestCookie(request.headers, pilotSessionCookieName));
      return {
        statusCode: 204,
        headers: {
          ...safeResponseHeaders,
          "Set-Cookie": clearSessionCookie(),
        },
      };
    }

    if (url.pathname === "/admin/users") {
      const adminRoster = requireRosterService(roster);
      assertOnlyQueryNames(url, []);
      if (method === "GET") {
        assertNoRequestBody(request);
        const users = await adminRoster.listUsers(
          readRequestCookie(request.headers, pilotSessionCookieName),
        );
        return jsonResponse(200, { users });
      }
      if (method === "POST") {
        assertSameOrigin(request, config);
        const user = await adminRoster.createUser(
          readRequestCookie(request.headers, pilotSessionCookieName),
          parseNewUserBody(request),
        );
        return jsonResponse(201, { user });
      }
      throw methodNotAllowed("GET, POST");
    }

    const bindingMatch = bindingIdPathPattern.exec(url.pathname);
    if (bindingMatch) {
      const adminRoster = requireRosterService(roster);
      assertOnlyQueryNames(url, []);
      assertMethod(method, "PUT");
      assertSameOrigin(request, config);
      const user = await adminRoster.updateUser(
        readRequestCookie(request.headers, pilotSessionCookieName),
        bindingMatch[1],
        parseUpdateUserBody(request),
      );
      return jsonResponse(200, { user });
    }

    return jsonResponse(404, { error: "not_found" });
  } catch (error) {
    return errorResponse(error);
  }
}

function requireRosterService(
  roster: PilotRosterAdminService | undefined,
): PilotRosterAdminService {
  if (!roster) {
    throw new PilotRosterAdminError(503, "roster_not_composed");
  }
  return roster;
}

function assertNoCredentialOverrideHeaders(request: PilotHttpRequest): void {
  if (forbiddenHeaderNames.some((header) => hasHeader(request.headers, header))) {
    throw new PilotAuthError(400, "credential_override_header_rejected");
  }
}

function assertNoRequestBody(request: PilotHttpRequest): void {
  const contentLength = readSingleHeader(request.headers, "content-length");
  if (contentLength && (!/^[0-9]+$/.test(contentLength) || Number(contentLength) !== 0)) {
    throw new PilotAuthError(400, "request_body_rejected");
  }
  if (hasHeader(request.headers, "transfer-encoding") || (request.body !== undefined && request.body.length !== 0)) {
    throw new PilotAuthError(400, "request_body_rejected");
  }
}

function parseRequestUrl(request: PilotHttpRequest, config: PilotBffConfig): URL {
  const target = request.url;
  if (!target || /^https?:\/\//i.test(target) || target.startsWith("//")) {
    throw new PilotAuthError(400, "request_target_invalid");
  }
  try {
    return new URL(target, config.publicOrigin);
  } catch {
    throw new PilotAuthError(400, "request_target_invalid");
  }
}

function assertMethod(actual: string | undefined, expected: "GET" | "POST" | "PUT"): void {
  if (actual !== expected) {
    throw methodNotAllowed(expected);
  }
}

function methodNotAllowed(expectedMethod: string): PilotAuthError {
  const error = new PilotAuthError(400, "method_not_allowed");
  Object.assign(error, { expectedMethod });
  return error;
}

function assertOnlyQueryNames(url: URL, permittedNames: readonly string[]): void {
  const permitted = new Set(permittedNames);
  for (const [name] of url.searchParams) {
    if (!permitted.has(name)) {
      throw new PilotAuthError(400, "query_parameter_rejected");
    }
  }
}

function readRequiredQuery(url: URL, name: string): string {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || !values[0]) {
    throw new PilotAuthError(400, "query_parameter_invalid");
  }
  return values[0];
}

function assertSameOrigin(request: PilotHttpRequest, config: PilotBffConfig): void {
  if (readSingleHeader(request.headers, "origin") !== config.publicOrigin) {
    throw new PilotAuthError(400, "origin_rejected");
  }
}

function parseNewUserBody(request: PilotHttpRequest): NewPilotRosterUserRequest {
  const value = parseJsonObject(request);
  assertExactKeys(value, ["displayName", "email", "role", "canManagePilotRoster"]);
  return {
    displayName: value.displayName as string,
    email: value.email as string,
    role: value.role as NewPilotRosterUserRequest["role"],
    canManagePilotRoster: value.canManagePilotRoster as boolean,
  };
}

function parseUpdateUserBody(request: PilotHttpRequest): UpdatePilotRosterUserRequest {
  const value = parseJsonObject(request);
  assertExactKeys(value, ["expectedAuditVersion", "role", "active", "canManagePilotRoster"]);
  return {
    expectedAuditVersion: value.expectedAuditVersion as number,
    role: value.role as UpdatePilotRosterUserRequest["role"],
    active: value.active as boolean,
    canManagePilotRoster: value.canManagePilotRoster as boolean,
  };
}

function parseJsonObject(request: PilotHttpRequest): Readonly<Record<string, unknown>> {
  const contentType = readSingleHeader(request.headers, "content-type");
  if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new PilotRosterAdminError(400, "roster_content_type_invalid");
  }
  const body = request.body;
  const contentLength = readSingleHeader(request.headers, "content-length");
  const bodyLength = typeof body === "string" ? Buffer.byteLength(body, "utf8") : -1;
  if (
    typeof body !== "string"
    || body.length === 0
    || bodyLength > pilotJsonBodyLimitBytes
    || (
      contentLength !== undefined
      && (!/^[0-9]+$/.test(contentLength) || Number(contentLength) !== bodyLength)
    )
  ) {
    throw new PilotRosterAdminError(400, "roster_body_invalid");
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed) || Array.isArray(parsed)) {
      throw new Error("not_object");
    }
    return parsed;
  } catch {
    throw new PilotRosterAdminError(400, "roster_json_invalid");
  }
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new PilotRosterAdminError(400, "roster_body_fields_invalid");
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function errorResponse(error: unknown): PilotHttpResponse {
  if (error instanceof PilotCookieError) {
    return jsonResponse(400, { error: "invalid_request" });
  }
  if (error instanceof PilotRosterAdminError) {
    if (error.status === 401) {
      return jsonResponse(401, { error: "authentication_required" }, [clearSessionCookie()]);
    }
    if (error.status === 403) {
      return jsonResponse(403, { error: "access_denied" });
    }
    if (error.status === 503) {
      return jsonResponse(503, { error: "administration_unavailable" });
    }
    return jsonResponse(400, { error: "invalid_request" });
  }
  if (error instanceof PilotAuthError) {
    if (error.code === "method_not_allowed") {
      const expectedMethod = (error as PilotAuthError & { expectedMethod?: string }).expectedMethod;
      return jsonResponse(405, { error: "method_not_allowed" }, [], expectedMethod);
    }
    if (error.status === 401) {
      return jsonResponse(401, { error: "authentication_required" });
    }
    if (error.status === 403) {
      return jsonResponse(403, { error: "access_denied" });
    }
    return jsonResponse(400, { error: "invalid_request" });
  }
  return jsonResponse(500, { error: "authentication_unavailable" });
}

function jsonResponse(
  statusCode: number,
  body: Readonly<Record<string, unknown>>,
  setCookies: readonly string[] = [],
  allow?: string,
): PilotHttpResponse {
  const headers: Record<string, string | readonly string[]> = {
    ...safeResponseHeaders,
    "Content-Type": "application/json; charset=utf-8",
  };
  if (setCookies.length === 1) {
    headers["Set-Cookie"] = setCookies[0];
  } else if (setCookies.length > 1) {
    headers["Set-Cookie"] = setCookies;
  }
  if (allow) {
    headers.Allow = allow;
  }
  return { statusCode, headers, body: JSON.stringify(body) };
}
