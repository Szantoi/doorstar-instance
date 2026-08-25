import { timingSafeEqual } from "node:crypto";

export const doorstarBffSessionCookieName = "__Host-doorstar-session";
export const doorstarBffCsrfCookieName = "__Host-doorstar-csrf";

const MAX_RAW_HEADER_PAIRS = 200;
const MAX_COOKIE_HEADER_LENGTH = 8_192;
const MAX_COOKIE_PAIRS = 128;
const MAX_COOKIE_VALUE_LENGTH = 4_096;
const forbiddenAuthorityHeaderFragments = [
  "role",
  "station",
  "principal",
  "tenant",
  "consumer",
] as const;

declare const canonicalBffOriginBrand: unique symbol;

/** An exact, configured HTTPS origin; never derived from request headers. */
export type CanonicalBffOrigin = string & { readonly [canonicalBffOriginBrand]: "CanonicalBffOrigin" };

export type CanonicalBffOriginParseResult =
  | { readonly kind: "accepted"; readonly canonicalOrigin: CanonicalBffOrigin }
  | { readonly kind: "rejected"; readonly code: "bff_canonical_origin_invalid" };

export type BffProtectedRequestMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface BffRequestPreflightInput {
  /** Node IncomingMessage.rawHeaders; normalized Express headers are unsafe here. */
  readonly rawHeaders: readonly unknown[];
  /** Node's actual request method; only GET/HEAD are CSRF-safe. */
  readonly method: unknown;
}

export type BffRequestPreflightFunction = (input: BffRequestPreflightInput) => BffRequestPreflight;

/**
 * Constructed from deployment configuration during future BFF composition.
 * The canonical origin is captured in the closure and is never supplied by a
 * browser request or a per-request adapter argument.
 */
export type BffRequestPreflightFactoryResult =
  | { readonly kind: "accepted"; readonly preflight: BffRequestPreflightFunction }
  | { readonly kind: "rejected"; readonly code: "bff_canonical_origin_invalid" };

export type BffRequestPreflight =
  | BffRequestPreflightAccepted
  | {
      readonly kind: "rejected";
      readonly status: 401 | 403;
      readonly code:
        | "bff_request_malformed"
        | "bff_authority_header_forbidden"
        | "bff_session_required"
        | "bff_csrf_rejected";
    };

/**
 * Intentionally log-safe result shape. Cookie values stay in a module-private
 * WeakMap and can only be consumed through useAcceptedBffTransportSecrets.
 */
export interface BffRequestPreflightAccepted {
  readonly kind: "accepted";
}

export interface BffAcceptedTransportSecrets {
  readonly sessionCookieValue: string;
  readonly csrfCookieValue?: string;
}

interface RawHeader {
  readonly normalizedName: string;
  readonly value: string;
}

interface ParsedCookie {
  readonly name: string;
  readonly value: string;
}

const acceptedBffTransportSecrets = new WeakMap<BffRequestPreflightAccepted, BffAcceptedTransportSecrets>();

/**
 * Accepts only the one explicit HTTPS origin that a future BFF deployment may
 * use. There is deliberately no CORS_ORIGIN, Host, or forwarded-header fallback.
 */
export function parseCanonicalBffOrigin(value: unknown): CanonicalBffOriginParseResult {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return rejectedCanonicalOrigin();
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.origin === "null"
      || parsed.origin !== value) {
      return rejectedCanonicalOrigin();
    }

    return Object.freeze({
      kind: "accepted" as const,
      canonicalOrigin: value as CanonicalBffOrigin,
    });
  } catch {
    return rejectedCanonicalOrigin();
  }
}

/**
 * Validates the one deployment-owned BFF origin and returns a request
 * preflight closure. Invalid configuration is fail-closed before any route is
 * mounted; there is intentionally no API that accepts canonicalOrigin per
 * request.
 */
export function createBffRequestPreflight(canonicalOriginConfiguration: unknown): BffRequestPreflightFactoryResult {
  const canonicalOrigin = parseCanonicalBffOrigin(canonicalOriginConfiguration);
  if (canonicalOrigin.kind === "rejected") return canonicalOrigin;
  return Object.freeze({
    kind: "accepted" as const,
    preflight: (input: BffRequestPreflightInput) => preflightBffProtectedRequest(input, canonicalOrigin.canonicalOrigin),
  });
}

/**
 * Validates only the request transport boundary for an eventual BFF-only
 * route. It neither validates a session nor reads authority/tenant state.
 */
function preflightBffProtectedRequest(
  input: BffRequestPreflightInput,
  canonicalOrigin: CanonicalBffOrigin,
): BffRequestPreflight {
  const headers = parseRawHeaders(input.rawHeaders);
  if (headers === undefined) return reject(403, "bff_request_malformed");
  if (headers.some((header) => isForbiddenAuthorityHeader(header.normalizedName))) {
    return reject(403, "bff_authority_header_forbidden");
  }

  if (!isBffProtectedRequestMethod(input.method)) return reject(403, "bff_request_malformed");

  const cookies = parseCookies(headerValues(headers, "cookie"));
  if (cookies === undefined) return reject(403, "bff_request_malformed");

  const sessionCookie = exactCookie(cookies, doorstarBffSessionCookieName);
  if (sessionCookie === undefined) {
    // M1's transport contract deliberately treats every mutation transport
    // failure alike: it must not disclose whether a session selector existed.
    return isSafeBffReadMethod(input.method)
      ? reject(401, "bff_session_required")
      : reject(403, "bff_csrf_rejected");
  }
  if (isSafeBffReadMethod(input.method)) {
    return accept({ sessionCookieValue: sessionCookie.value });
  }

  const csrfCookie = exactCookie(cookies, doorstarBffCsrfCookieName);
  const csrfHeaderValues = headerValues(headers, "x-doorstar-csrf");
  const originValues = headerValues(headers, "origin");
  if (csrfCookie === undefined
    || csrfHeaderValues.length !== 1
    || !isSafeCookieValue(csrfHeaderValues[0])
    || !sameOpaqueValue(csrfCookie.value, csrfHeaderValues[0])
    || originValues.length !== 1
    || originValues[0] !== canonicalOrigin) {
    return reject(403, "bff_csrf_rejected");
  }

  return accept({
    sessionCookieValue: sessionCookie.value,
    csrfCookieValue: csrfCookie.value,
  });
}

/**
 * Gives a BFF handler its already-validated transport selectors without
 * making them enumerable on a result that might be passed to a logger.
 * The callback must still treat its argument as confidential request data.
 */
export function useAcceptedBffTransportSecrets<Result>(
  decision: BffRequestPreflight,
  useSecrets: (secrets: BffAcceptedTransportSecrets) => Result,
): Result | undefined {
  if (decision.kind !== "accepted") return undefined;
  const secrets = acceptedBffTransportSecrets.get(decision);
  return secrets === undefined ? undefined : useSecrets(secrets);
}

function rejectedCanonicalOrigin(): CanonicalBffOriginParseResult {
  return Object.freeze({ kind: "rejected" as const, code: "bff_canonical_origin_invalid" });
}

function reject(
  status: 401 | 403,
  code: Extract<BffRequestPreflight, { readonly kind: "rejected" }> ["code"],
): BffRequestPreflight {
  return Object.freeze({ kind: "rejected" as const, status, code });
}

function accept(secrets: BffAcceptedTransportSecrets): BffRequestPreflightAccepted {
  const decision = Object.freeze({ kind: "accepted" as const });
  acceptedBffTransportSecrets.set(decision, Object.freeze({ ...secrets }));
  return decision;
}

function isBffProtectedRequestMethod(value: unknown): value is BffProtectedRequestMethod {
  return value === "GET"
    || value === "HEAD"
    || value === "POST"
    || value === "PUT"
    || value === "PATCH"
    || value === "DELETE";
}

function isSafeBffReadMethod(method: BffProtectedRequestMethod): boolean {
  return method === "GET" || method === "HEAD";
}

function parseRawHeaders(value: readonly unknown[]): readonly RawHeader[] | undefined {
  if (!Array.isArray(value) || value.length % 2 !== 0 || value.length / 2 > MAX_RAW_HEADER_PAIRS) return undefined;

  const headers: RawHeader[] = [];
  for (let index = 0; index < value.length; index += 2) {
    const name = value[index];
    const headerValue = value[index + 1];
    if (typeof name !== "string"
      || typeof headerValue !== "string"
      || !isHeaderName(name)
      || /[\r\n\0]/u.test(headerValue)) {
      return undefined;
    }
    headers.push(Object.freeze({ normalizedName: name.toLowerCase(), value: headerValue }));
  }
  return Object.freeze(headers);
}

function isHeaderName(value: string): boolean {
  return value.length > 0 && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(value);
}

function isForbiddenAuthorityHeader(normalizedName: string): boolean {
  if (normalizedName === "authorization" || normalizedName === "proxy-authorization") return true;
  const compactName = normalizedName.replace(/[-_]/gu, "");
  // BFF-only routes reserve every spelling containing an authority fragment,
  // including separator-free aliases such as X-DoorstarTenant. The policy is
  // intentionally stricter than today's legacy header vocabulary: future
  // BFF headers can use a non-authority name, but browser input can never pick
  // tenant, role, station, principal, or consumer state.
  return forbiddenAuthorityHeaderFragments.some((fragment) => compactName.includes(fragment));
}

function headerValues(headers: readonly RawHeader[], normalizedName: string): readonly string[] {
  return Object.freeze(
    headers
      .filter((header) => header.normalizedName === normalizedName)
      .map((header) => header.value),
  );
}

function parseCookies(cookieHeaders: readonly string[]): ReadonlyMap<string, ParsedCookie> | undefined {
  const cookies = new Map<string, ParsedCookie>();
  let pairCount = 0;

  for (const header of cookieHeaders) {
    if (header.length === 0 || header.length > MAX_COOKIE_HEADER_LENGTH) return undefined;
    for (const [segmentIndex, rawSegment] of header.split(";").entries()) {
      // Browser Cookie syntax permits one SP after a semicolon. No other
      // leading/trailing whitespace is accepted because it creates a second
      // parser interpretation at this security boundary.
      const segment = segmentIndex > 0 && rawSegment.startsWith(" ") ? rawSegment.slice(1) : rawSegment;
      const separator = segment.indexOf("=");
      if (segment.length === 0 || segment.trim() !== segment || separator <= 0) return undefined;

      const name = segment.slice(0, separator);
      const value = segment.slice(separator + 1);
      if (!isCookieName(name) || !isSafeCookieValue(value) || ++pairCount > MAX_COOKIE_PAIRS) return undefined;

      const normalizedName = name.toLowerCase();
      if (cookies.has(normalizedName)) return undefined;
      cookies.set(normalizedName, Object.freeze({ name, value }));
    }
  }

  return cookies;
}

function isCookieName(value: string): boolean {
  return value.length > 0 && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(value);
}

function isSafeCookieValue(value: string): boolean {
  if (value.length === 0 || value.length > MAX_COOKIE_VALUE_LENGTH) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x21 || code > 0x7e || character === '"' || character === "," || character === ";" || character === "\\" || character === "%") {
      return false;
    }
  }
  return true;
}

function exactCookie(cookies: ReadonlyMap<string, ParsedCookie>, expectedName: string): ParsedCookie | undefined {
  const cookie = cookies.get(expectedName.toLowerCase());
  return cookie?.name === expectedName ? cookie : undefined;
}

function sameOpaqueValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "ascii");
  const rightBuffer = Buffer.from(right, "ascii");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
