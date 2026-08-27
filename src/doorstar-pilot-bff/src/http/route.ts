import type { PilotBffConfig } from "../config/pilotBffConfig.js";
import { PilotAuthError } from "../application/errors.js";
import type { PilotAuthService } from "../application/authService.js";
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
import type { PilotHttpRequest, PilotHttpResponse } from "./contracts.js";

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
  "role",
  "scope",
  "actor",
] as const;

/** Pure route dispatcher: tests exercise it without a socket or external call. */
export async function dispatchPilotAuthRequest(
  request: PilotHttpRequest,
  config: PilotBffConfig,
  auth: PilotAuthService,
): Promise<PilotHttpResponse> {
  try {
    assertNoCredentialOverrideHeaders(request);
    assertNoRequestBody(request);
    const url = parseRequestUrl(request, config);
    const method = request.method?.toUpperCase();

    if (url.pathname === "/auth/login") {
      assertMethod(method, "GET");
      assertOnlyQueryNames(url, []);
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

    return jsonResponse(404, { error: "not_found" });
  } catch (error) {
    return errorResponse(error);
  }
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
  if (hasHeader(request.headers, "transfer-encoding")) {
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

function assertMethod(actual: string | undefined, expected: "GET" | "POST"): void {
  if (actual !== expected) {
    const error = new PilotAuthError(400, "method_not_allowed");
    Object.assign(error, { expectedMethod: expected });
    throw error;
  }
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

function errorResponse(error: unknown): PilotHttpResponse {
  if (error instanceof PilotCookieError) {
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
