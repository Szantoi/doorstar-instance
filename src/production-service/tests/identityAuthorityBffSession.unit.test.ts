import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import {
  createDoorstarSessionCookieClearHeaders,
  createDoorstarSessionCookieHeaders,
  createDoorstarSessionSecrets,
  DOORSTAR_OPAQUE_SECRET_BASE64URL_LENGTH,
  formatDoorstarSessionHandle,
  parseDoorstarCsrfValue,
  parseDoorstarSessionHandle,
  selectDoorstarSessionExpiry,
  validateDoorstarSessionSecrets,
} from "../src/services/identityAuthority/bff/session.js";

describe("Doorstar M2B opaque session contract", () => {
  it("creates three independent canonical 256-bit opaque browser values", () => {
    const secrets = createDoorstarSessionSecrets(deterministicRandom([1, 2, 3]));

    expect(secrets.selector).toHaveLength(DOORSTAR_OPAQUE_SECRET_BASE64URL_LENGTH);
    expect(secrets.verifier).toHaveLength(DOORSTAR_OPAQUE_SECRET_BASE64URL_LENGTH);
    expect(secrets.csrf).toHaveLength(DOORSTAR_OPAQUE_SECRET_BASE64URL_LENGTH);
    expect(new Set([secrets.selector, secrets.verifier, secrets.csrf])).toHaveLength(3);
    expect(parseDoorstarSessionHandle(formatDoorstarSessionHandle(secrets))).toEqual({
      kind: "accepted",
      handle: { selector: secrets.selector, verifier: secrets.verifier },
    });
    expect(parseDoorstarCsrfValue(secrets.csrf)).toEqual({ kind: "accepted", csrf: secrets.csrf });
  });

  it.each([
    "",
    "only-one-part",
    "." + opaque("a"),
    opaque("a") + ".",
    opaque("a") + "." + opaque("b") + ".extra",
    opaque("a").slice(0, -1) + "." + opaque("b"),
    opaque("a") + "=" + "." + opaque("b"),
    opaque("a") + "." + opaque("b").slice(0, -1) + "%",
    opaque("same") + "." + opaque("same"),
  ])("rejects malformed selector.verifier input %#", (value) => {
    expect(parseDoorstarSessionHandle(value)).toEqual({
      kind: "rejected",
      code: "doorstar_session_handle_invalid",
    });
  });

  it.each([
    "",
    opaque("a").slice(0, -1),
    opaque("a") + "=",
    opaque("a").slice(0, -1) + "%",
  ])("rejects malformed CSRF input %#", (value) => {
    expect(parseDoorstarCsrfValue(value)).toEqual({
      kind: "rejected",
      code: "doorstar_csrf_invalid",
    });
  });

  it("renders exact host-only Secure session and CSRF cookies", () => {
    const secrets = createDoorstarSessionSecrets(deterministicRandom([10, 11, 12]));
    const headers = createDoorstarSessionCookieHeaders(secrets, 600);

    expect(headers.session).toBe(
      "__Host-doorstar-session=" + secrets.selector + "." + secrets.verifier
      + "; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Strict",
    );
    expect(headers.csrf).toBe(
      "__Host-doorstar-csrf=" + secrets.csrf
      + "; Path=/; Max-Age=600; Secure; SameSite=Strict",
    );
    expect(headers.session).not.toContain("Domain=");
    expect(headers.csrf).not.toContain("Domain=");
    expect(headers.csrf).not.toContain("HttpOnly");
  });

  it("rejects colliding random values and every pairwise-colliding session secret shape", () => {
    expect(() => createDoorstarSessionSecrets(() => Buffer.alloc(32, 7)))
      .toThrow("doorstar_session_random_source_invalid");

    const selector = opaque("selector");
    const verifier = opaque("verifier");
    const csrf = opaque("csrf");
    for (const secrets of [
      { selector, verifier: selector, csrf },
      { selector, verifier, csrf: selector },
      { selector, verifier, csrf: verifier },
    ]) {
      expect(validateDoorstarSessionSecrets(secrets)).toEqual({
        kind: "rejected",
        code: "doorstar_session_secrets_invalid",
      });
      expect(() => createDoorstarSessionCookieHeaders(secrets, 600))
        .toThrow("doorstar_session_cookie_input_invalid");
    }
  });

  it("clears both cookies with the same exact host-only attributes", () => {
    expect(createDoorstarSessionCookieClearHeaders()).toEqual({
      session: "__Host-doorstar-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
      csrf: "__Host-doorstar-csrf=; Path=/; Max-Age=0; Secure; SameSite=Strict",
    });
  });

  it("uses the exact minimum of access-token expiry, ID-token expiry, and configured maximum", () => {
    const now = instant("2026-08-25T12:00:00.500000000Z");
    const accessSoon = instant("2026-08-25T12:00:10.250000000Z");
    const idSooner = instant("2026-08-25T12:00:09.750000000Z");
    const humanLater = instant("2026-08-25T14:00:00.500000000Z");

    expect(selectDoorstarSessionExpiry({
      now,
      humanAccessTokenExpiresAt: accessSoon,
      humanIdTokenExpiresAt: idSooner,
      maximumLifetimeSeconds: 60,
    })).toEqual({
      kind: "accepted",
      expiresAt: idSooner,
      cookieMaxAgeSeconds: 9,
    });
    expect(selectDoorstarSessionExpiry({
      now,
      humanAccessTokenExpiresAt: humanLater,
      humanIdTokenExpiresAt: humanLater,
      maximumLifetimeSeconds: 1_800,
    })).toEqual({
      kind: "accepted",
      expiresAt: instant("2026-08-25T12:30:00.5Z"),
      cookieMaxAgeSeconds: 1_800,
    });
  });

  it.each([
    ["expired access token", instant("2026-08-25T12:00:00.500000000Z"), instant("2026-08-25T12:01:00Z"), 60, "doorstar_session_access_token_expired"],
    ["expired ID token", instant("2026-08-25T12:01:00Z"), instant("2026-08-25T12:00:00.500000000Z"), 60, "doorstar_session_id_token_expired"],
    ["zero maximum", instant("2026-08-25T12:01:00Z"), instant("2026-08-25T12:01:00Z"), 0, "doorstar_session_maximum_invalid"],
    ["unsafe maximum", instant("2026-08-25T12:01:00Z"), instant("2026-08-25T12:01:00Z"), 3_601, "doorstar_session_maximum_invalid"],
    ["sub-second remainder", instant("2026-08-25T12:00:00.900000000Z"), instant("2026-08-25T12:01:00Z"), 60, "doorstar_session_duration_too_short"],
  ] as const)("fails closed for %s", (_name, humanAccessTokenExpiresAt, humanIdTokenExpiresAt, maximumLifetimeSeconds, code) => {
    expect(selectDoorstarSessionExpiry({
      now: instant("2026-08-25T12:00:00.500000000Z"),
      humanAccessTokenExpiresAt,
      humanIdTokenExpiresAt,
      maximumLifetimeSeconds,
    })).toEqual({ kind: "rejected", code });
  });

  it("rejects getter-backed time input instead of re-reading it", () => {
    const time = Object.defineProperties({}, {
      wireValue: { enumerable: true, get: () => "2026-08-25T12:01:00Z" },
      epochSeconds: { enumerable: true, value: 1_756_123_260 },
      nanoseconds: { enumerable: true, value: 0 },
    });

    expect(selectDoorstarSessionExpiry({
      now: instant("2026-08-25T12:00:00Z"),
      humanAccessTokenExpiresAt: time,
      humanIdTokenExpiresAt: instant("2026-08-25T12:01:00Z"),
      maximumLifetimeSeconds: 60,
    })).toEqual({ kind: "rejected", code: "doorstar_session_time_invalid" });
  });
});

function deterministicRandom(values: readonly number[]) {
  const remaining = [...values];
  return (size: number): Uint8Array => {
    const next = remaining.shift();
    if (next === undefined) throw new Error("unexpected random read");
    return Buffer.alloc(size, next);
  };
}

function opaque(character: string): string {
  return Buffer.alloc(32, character).toString("base64url");
}

function instant(value: string) {
  return parseCanonicalUtcInstant(value);
}
