import { randomBytes as nodeRandomBytes } from "node:crypto";
import { compareCanonicalUtcInstants, parseCanonicalUtcInstant, type CanonicalUtcInstant } from "../contract.js";
import { doorstarBffCsrfCookieName, doorstarBffSessionCookieName } from "../httpSecurity.js";
import { readExactOwnDataFields, snapshotCanonicalUtcInstant } from "../safeSnapshot.js";

export const DOORSTAR_OPAQUE_SECRET_BYTES = 32;
export const DOORSTAR_OPAQUE_SECRET_BASE64URL_LENGTH = 43;
export const MAXIMUM_DOORSTAR_SESSION_LIFETIME_SECONDS = 3_600;

const canonicalOpaqueSecret = /^[A-Za-z0-9_-]{43}$/u;

export interface DoorstarSessionHandle {
  readonly selector: string;
  readonly verifier: string;
}

export interface DoorstarSessionSecrets extends DoorstarSessionHandle {
  /** Never log or serialize this raw browser value outside the Set-Cookie boundary. */
  readonly csrf: string;
}

export type DoorstarSessionSecretsValidation =
  | { readonly kind: "accepted"; readonly secrets: DoorstarSessionSecrets }
  | { readonly kind: "rejected"; readonly code: "doorstar_session_secrets_invalid" };

export type DoorstarSessionHandleParseResult =
  | { readonly kind: "accepted"; readonly handle: DoorstarSessionHandle }
  | { readonly kind: "rejected"; readonly code: "doorstar_session_handle_invalid" };

export type DoorstarCsrfParseResult =
  | { readonly kind: "accepted"; readonly csrf: string }
  | { readonly kind: "rejected"; readonly code: "doorstar_csrf_invalid" };

export interface DoorstarSessionCookieHeaders {
  readonly session: string;
  readonly csrf: string;
}

export type DoorstarSessionExpiryDecision =
  | {
      readonly kind: "accepted";
      readonly expiresAt: CanonicalUtcInstant;
      /** Floor to avoid a browser cookie outliving the exact server-side expiry. */
      readonly cookieMaxAgeSeconds: number;
    }
  | {
      readonly kind: "rejected";
      readonly code:
        | "doorstar_session_time_invalid"
        | "doorstar_session_access_token_expired"
        | "doorstar_session_id_token_expired"
        | "doorstar_session_maximum_invalid"
        | "doorstar_session_duration_too_short";
    };

export type DoorstarRandomBytes = (size: number) => Uint8Array;

/**
 * Generates independent selector, verifier and CSRF values. This pure
 * source-only function does not emit Set-Cookie, touch a route, or persist a
 * secret; the future boundary owns each returned value only long enough to
 * write its HMAC or an HTTP cookie.
 */
export function createDoorstarSessionSecrets(randomBytes: DoorstarRandomBytes = nodeRandomBytes): DoorstarSessionSecrets {
  const selector = randomOpaqueSecret(randomBytes);
  const verifier = randomOpaqueSecret(randomBytes);
  const csrf = randomOpaqueSecret(randomBytes);
  const validation = validateDoorstarSessionSecrets({ selector, verifier, csrf });
  if (validation.kind === "rejected") throw new Error("doorstar_session_random_source_invalid");
  return validation.secrets;
}

/**
 * The future session repository must validate this exact three-secret shape
 * before it derives or persists any MAC. Pairwise distinction matters because
 * CSRF is intentionally readable by browser JavaScript while the selector and
 * verifier are not.
 */
export function validateDoorstarSessionSecrets(value: unknown): DoorstarSessionSecretsValidation {
  const fields = readExactOwnDataFields(value, ["selector", "verifier", "csrf"]);
  if (fields === undefined) return rejectedSessionSecrets();
  const selector = fields.get("selector");
  const verifier = fields.get("verifier");
  const csrf = fields.get("csrf");
  if (!isCanonicalOpaqueSecret(selector)
    || !isCanonicalOpaqueSecret(verifier)
    || !isCanonicalOpaqueSecret(csrf)
    || selector === verifier
    || selector === csrf
    || verifier === csrf) {
    return rejectedSessionSecrets();
  }
  return Object.freeze({
    kind: "accepted" as const,
    secrets: Object.freeze({ selector, verifier, csrf }),
  });
}

/** Parses only the exact selector.verifier wire shape required by the M1 schema. */
export function parseDoorstarSessionHandle(value: unknown): DoorstarSessionHandleParseResult {
  if (typeof value !== "string") return rejectedSessionHandle();
  const parts = value.split(".");
  if (parts.length !== 2
    || !isCanonicalOpaqueSecret(parts[0])
    || !isCanonicalOpaqueSecret(parts[1])
    || parts[0] === parts[1]) {
    return rejectedSessionHandle();
  }
  return Object.freeze({
    kind: "accepted" as const,
    handle: Object.freeze({ selector: parts[0]!, verifier: parts[1]! }),
  });
}

/** Parses the separate double-submit CSRF secret without accepting percent or padded aliases. */
export function parseDoorstarCsrfValue(value: unknown): DoorstarCsrfParseResult {
  return isCanonicalOpaqueSecret(value)
    ? Object.freeze({ kind: "accepted" as const, csrf: value })
    : Object.freeze({ kind: "rejected" as const, code: "doorstar_csrf_invalid" });
}

export function formatDoorstarSessionHandle(handle: unknown): string {
  const completeSecrets = validateDoorstarSessionSecrets(handle);
  if (completeSecrets.kind === "accepted") {
    return completeSecrets.secrets.selector + "." + completeSecrets.secrets.verifier;
  }
  const fields = readExactOwnDataFields(handle, ["selector", "verifier"]);
  if (fields === undefined) throw new Error("doorstar_session_handle_invalid");
  const selector = fields.get("selector");
  const verifier = fields.get("verifier");
  const parsed = parseDoorstarSessionHandle(typeof selector === "string" && typeof verifier === "string"
    ? selector + "." + verifier
    : "");
  if (parsed.kind === "rejected") throw new Error("doorstar_session_handle_invalid");
  return parsed.handle.selector + "." + parsed.handle.verifier;
}

/**
 * Calculates min(human expiry, server-owned configured maximum) without
 * converting exact instants through JavaScript millisecond precision.
 */
export function selectDoorstarSessionExpiry(input: {
  readonly now: unknown;
  /** Authority-bearing access token expiry. */
  readonly humanAccessTokenExpiresAt: unknown;
  /** Nonce-bound ID-token expiry, required by the exact human OIDC profile. */
  readonly humanIdTokenExpiresAt: unknown;
  readonly maximumLifetimeSeconds: unknown;
}): DoorstarSessionExpiryDecision {
  const now = snapshotCanonicalUtcInstant(input.now);
  const humanAccessTokenExpiresAt = snapshotCanonicalUtcInstant(input.humanAccessTokenExpiresAt);
  const humanIdTokenExpiresAt = snapshotCanonicalUtcInstant(input.humanIdTokenExpiresAt);
  if (now === undefined || humanAccessTokenExpiresAt === undefined || humanIdTokenExpiresAt === undefined) {
    return rejectedSessionExpiry("doorstar_session_time_invalid");
  }
  if (compareCanonicalUtcInstants(humanAccessTokenExpiresAt, now) <= 0) {
    return rejectedSessionExpiry("doorstar_session_access_token_expired");
  }
  if (compareCanonicalUtcInstants(humanIdTokenExpiresAt, now) <= 0) {
    return rejectedSessionExpiry("doorstar_session_id_token_expired");
  }
  if (!isMaximumLifetime(input.maximumLifetimeSeconds)) {
    return rejectedSessionExpiry("doorstar_session_maximum_invalid");
  }

  const configuredExpiry = addWholeSeconds(now, input.maximumLifetimeSeconds);
  if (configuredExpiry === undefined) return rejectedSessionExpiry("doorstar_session_time_invalid");
  const humanExpiry = compareCanonicalUtcInstants(humanAccessTokenExpiresAt, humanIdTokenExpiresAt) <= 0
    ? humanAccessTokenExpiresAt
    : humanIdTokenExpiresAt;
  const expiresAt = compareCanonicalUtcInstants(humanExpiry, configuredExpiry) <= 0
    ? humanExpiry
    : configuredExpiry;
  const cookieMaxAgeSeconds = wholeSecondsBetween(now, expiresAt);
  if (cookieMaxAgeSeconds < 1) return rejectedSessionExpiry("doorstar_session_duration_too_short");

  return Object.freeze({
    kind: "accepted" as const,
    expiresAt: Object.freeze({ ...expiresAt }),
    cookieMaxAgeSeconds,
  });
}

/**
 * Renders the only allowed session/CSRF Set-Cookie attributes. It deliberately
 * has no Domain, CORS, SameSite override, or caller-selected cookie name.
 */
export function createDoorstarSessionCookieHeaders(
  secrets: unknown,
  cookieMaxAgeSeconds: unknown,
): DoorstarSessionCookieHeaders {
  const validation = validateDoorstarSessionSecrets(secrets);
  if (validation.kind === "rejected" || !isMaximumLifetime(cookieMaxAgeSeconds)) {
    throw new Error("doorstar_session_cookie_input_invalid");
  }
  const sessionValue = formatDoorstarSessionHandle(validation.secrets);

  return Object.freeze({
    session: doorstarBffSessionCookieName + "=" + sessionValue
      + "; Path=/; Max-Age=" + cookieMaxAgeSeconds + "; Secure; HttpOnly; SameSite=Strict",
    csrf: doorstarBffCsrfCookieName + "=" + validation.secrets.csrf
      + "; Path=/; Max-Age=" + cookieMaxAgeSeconds + "; Secure; SameSite=Strict",
  });
}

/** Clears both cookies using the same exact host-only path and security attributes. */
export function createDoorstarSessionCookieClearHeaders(): DoorstarSessionCookieHeaders {
  return Object.freeze({
    session: doorstarBffSessionCookieName + "=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
    csrf: doorstarBffCsrfCookieName + "=; Path=/; Max-Age=0; Secure; SameSite=Strict",
  });
}

function randomOpaqueSecret(randomBytes: DoorstarRandomBytes): string {
  const value = randomBytes(DOORSTAR_OPAQUE_SECRET_BYTES);
  if (!(value instanceof Uint8Array) || value.byteLength !== DOORSTAR_OPAQUE_SECRET_BYTES) {
    throw new Error("doorstar_session_random_source_invalid");
  }
  return Buffer.from(value).toString("base64url");
}

function isCanonicalOpaqueSecret(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalOpaqueSecret.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === DOORSTAR_OPAQUE_SECRET_BYTES && decoded.toString("base64url") === value;
}

function rejectedSessionHandle(): DoorstarSessionHandleParseResult {
  return Object.freeze({ kind: "rejected" as const, code: "doorstar_session_handle_invalid" });
}

function rejectedSessionSecrets(): DoorstarSessionSecretsValidation {
  return Object.freeze({ kind: "rejected" as const, code: "doorstar_session_secrets_invalid" });
}

function rejectedSessionExpiry(
  code: Extract<DoorstarSessionExpiryDecision, { readonly kind: "rejected" }>["code"],
): DoorstarSessionExpiryDecision {
  return Object.freeze({ kind: "rejected" as const, code });
}

function isMaximumLifetime(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAXIMUM_DOORSTAR_SESSION_LIFETIME_SECONDS;
}

function addWholeSeconds(value: CanonicalUtcInstant, seconds: number): CanonicalUtcInstant | undefined {
  const epochSeconds = value.epochSeconds + seconds;
  if (!Number.isSafeInteger(epochSeconds)) return undefined;

  const date = new Date(epochSeconds * 1_000);
  if (!Number.isFinite(date.getTime())) return undefined;
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9_999) return undefined;

  const fraction = value.nanoseconds === 0
    ? ""
    : "." + value.nanoseconds.toString(10).padStart(9, "0").replace(/0+$/u, "");
  const wireValue = [
    year.toString(10).padStart(4, "0"),
    (date.getUTCMonth() + 1).toString(10).padStart(2, "0"),
    date.getUTCDate().toString(10).padStart(2, "0"),
  ].join("-")
    + "T" + date.getUTCHours().toString(10).padStart(2, "0")
    + ":" + date.getUTCMinutes().toString(10).padStart(2, "0")
    + ":" + date.getUTCSeconds().toString(10).padStart(2, "0") + fraction + "Z";

  try {
    return Object.freeze(parseCanonicalUtcInstant(wireValue));
  } catch {
    return undefined;
  }
}

function wholeSecondsBetween(start: CanonicalUtcInstant, end: CanonicalUtcInstant): number {
  let seconds = end.epochSeconds - start.epochSeconds;
  if (end.nanoseconds < start.nanoseconds) seconds -= 1;
  return seconds;
}
