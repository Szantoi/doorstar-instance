import { describe, expect, it } from "vitest";
import {
  doorstarBffCsrfCookieName,
  doorstarBffSessionCookieName,
  parseCanonicalBffOrigin,
  createBffRequestPreflight,
  type BffRequestPreflight,
  type CanonicalBffOrigin,
  useAcceptedBffTransportSecrets,
} from "../src/services/identityAuthority/httpSecurity.js";

const canonicalOrigin = acceptedCanonicalOrigin("https://doorstar.example.test");
const trustedPreflight = acceptedBffPreflight(canonicalOrigin);

describe("M2 BFF HTTP transport security", () => {
  it("accepts only one exact HTTPS canonical origin", () => {
    expect(parseCanonicalBffOrigin("https://doorstar.example.test")).toEqual({
      kind: "accepted",
      canonicalOrigin,
    });
  });

  it.each([
    undefined,
    "",
    " http://doorstar.example.test",
    "http://doorstar.example.test",
    "https://doorstar.example.test/",
    "https://doorstar.example.test/path",
    "https://doorstar.example.test?next=/callback",
    "https://doorstar.example.test#fragment",
    "https://user:password@doorstar.example.test",
    "https://Doorstar.example.test",
    "https://doorstar.example.test:443",
    "https://one.example.test,https://two.example.test",
  ])("rejects non-canonical origin %#", (value) => {
    expect(parseCanonicalBffOrigin(value)).toEqual({ kind: "rejected", code: "bff_canonical_origin_invalid" });
  });

  it("accepts a protected read with one exact session cookie and no Origin or CSRF", () => {
    expect(preflight("GET", readHeaders())).toEqual({ kind: "accepted" });
  });

  it("rejects a protected read without an exact session cookie", () => {
    expectRejected("GET", [], 401, "bff_session_required");
    expectRejected("GET", ["Cookie", "__host-doorstar-session=session-selector"], 401, "bff_session_required");
  });

  it.each([
    ["Authorization", "Bearer ignored"],
    ["Proxy-Authorization", "anything"],
    ["x-role", ""],
    ["X-Station-Id", ""],
    ["X-StationId", ""],
    ["X-Principal-Selector", ""],
    ["X-PrincipalId", ""],
    ["X-SpaceOS-Tenant-Id", ""],
    ["X-TenantFoo", ""],
    ["X-Doorstar-Consumer", ""],
    ["X-DoorstarTenant", ""],
    ["X-DoorstarStation", ""],
    ["X-DoorstarPrincipal", ""],
    ["X-DoorstarRole", ""],
    ["X-ConsumerFoo", ""],
    ["X-RoleId", ""],
    ["X_Tenant_Selector", ""],
    ["TenantID", ""],
    ["AUTHORIZATION", "Bearer ignored"],
    ["X-ROLE", ""],
    ["x-station-id", ""],
  ])("rejects authority header %s before any session decision", (name, value) => {
    expectRejected("GET", [...readHeaders(), name, value], 403, "bff_authority_header_forbidden");
  });

  it("does not mistake CSRF, content, or correlation headers for authority selectors", () => {
    expect(preflight("POST", [
      ...mutationHeaders(),
      "Content-Type", "application/json",
      "X-Request-Id", "request-123",
    ])).toEqual({ kind: "accepted" });
  });

  it.each([
    ["Cookie", `${doorstarBffSessionCookieName}=session-selector; ${doorstarBffSessionCookieName}=again`],
    ["Cookie", `${doorstarBffSessionCookieName}=session-selector; theme=one; theme=two`],
    ["Cookie", `${doorstarBffSessionCookieName}=session-selector; broken`],
    ["Cookie", `${doorstarBffSessionCookieName}=\"quoted\"`],
    ["Cookie", `${doorstarBffSessionCookieName}=percent%20encoded`],
    ["Cookie", `${doorstarBffSessionCookieName}=session-selector;`],
  ])("rejects malformed or ambiguous Cookie input %#", (name, value) => {
    expectRejected("GET", [name, value], 403, "bff_request_malformed");
  });

  it("rejects duplicate cookie names across physical Cookie header lines without echoing values", () => {
    const decision = preflight("GET", [
      "Cookie", `${doorstarBffSessionCookieName}=session-secret`,
      "Cookie", "theme=dark; theme=light",
    ]);
    expect(decision).toEqual({ kind: "rejected", status: 403, code: "bff_request_malformed" });
    expect(JSON.stringify(decision)).not.toContain("session-secret");
  });

  it("rejects a case-lookalike cookie when it would collide with a target name", () => {
    expectRejected("GET", [
      "Cookie", `${doorstarBffSessionCookieName}=session-selector`,
      "Cookie", "__host-doorstar-session=lookalike",
    ], 403, "bff_request_malformed");
  });

  it.each([
    [["Cookie"]],
    [["Cookie", 42]],
    [["Bad Header", "value"]],
    [["Cookie", `${doorstarBffSessionCookieName}=session-selector`, "Origin", "https://doorstar.example.test\r\nevil"]],
  ])("rejects malformed raw header input %#", (pairs) => {
    expectRejected("GET", pairs.flat(), 403, "bff_request_malformed");
  });

  it("accepts a mutation only with exact CSRF and canonical Origin evidence", () => {
    expect(preflight("POST", mutationHeaders())).toEqual({ kind: "accepted" });
  });

  it("normalizes header names but never their security values", () => {
    const rawHeaders = mutationHeaders();
    rawHeaders[2] = "x-doorstar-csrf";
    rawHeaders[4] = "oRiGiN";
    expect(preflight("POST", rawHeaders)).toEqual({ kind: "accepted" });
  });

  it("uses the actual HTTP method, so a mutation cannot be mislabeled as a read", () => {
    expectRejected("POST", [
      "Cookie", `${doorstarBffCsrfCookieName}=csrf-token`,
      "X-Doorstar-CSRF", "csrf-token",
      "Origin", canonicalOrigin,
    ], 403, "bff_csrf_rejected");
    expect(preflight("HEAD", readHeaders())).toEqual({ kind: "accepted" });
  });

  it("rejects unsupported or non-canonical HTTP methods before accepting a session", () => {
    expectRejected("post", mutationHeaders(), 403, "bff_request_malformed");
    expectRejected("OPTIONS", mutationHeaders(), 403, "bff_request_malformed");
  });

  it.each([
    [
      ["Cookie", `${doorstarBffSessionCookieName}=session-selector`],
      "CSRF cookie is absent",
    ],
    [
      ["Cookie", `${doorstarBffSessionCookieName}=session-selector; ${doorstarBffCsrfCookieName}=csrf-token`, "Origin", canonicalOrigin],
      "CSRF header is absent",
    ],
    [
      [...mutationHeaders(), "x-doorstar-csrf", "csrf-token"],
      "CSRF header is duplicated",
    ],
    [
      replaceHeader(mutationHeaders(), "X-Doorstar-CSRF", "different-token"),
      "CSRF cookie and header differ",
    ],
    [
      removeHeader(mutationHeaders(), "Origin"),
      "Origin is absent",
    ],
    [
      replaceHeader(mutationHeaders(), "Origin", "https://evil.example.test"),
      "Origin differs",
    ],
    [
      replaceHeader(mutationHeaders(), "Origin", "https://doorstar.example.test, https://evil.example.test"),
      "Origin has a combined value",
    ],
    [
      replaceHeader(mutationHeaders(), "Origin", "null"),
      "Origin is null",
    ],
    [
      replaceHeader(mutationHeaders(), "Origin", "https://Doorstar.example.test"),
      "Origin changes canonical case",
    ],
    [
      replaceHeader(mutationHeaders(), "Origin", "https://doorstar.example.test:443"),
      "Origin spells the default port",
    ],
    [
      replaceHeader(mutationHeaders(), "Origin", "https://doorstar.example.test/"),
      "Origin has a trailing slash",
    ],
    [
      [...mutationHeaders(), "origin", canonicalOrigin],
      "Origin is duplicated even with the same value",
    ],
  ])("rejects a mutation when %#", (rawHeaders, _label) => {
    expectRejected("POST", rawHeaders, 403, "bff_csrf_rejected");
  });

  it("keeps accepted transport selectors outside the enumerable decision", () => {
    const decision = preflight("POST", mutationHeaders());
    expect(decision).toEqual({ kind: "accepted" });
    expect(JSON.stringify(decision)).toBe('{"kind":"accepted"}');
    expect(Object.getOwnPropertyNames(decision)).toEqual(["kind"]);
    expect(useAcceptedBffTransportSecrets(decision, (secrets) => ({ ...secrets }))).toEqual({
      sessionCookieValue: "session-selector",
      csrfCookieValue: "csrf-token",
    });
    expect(useAcceptedBffTransportSecrets(
      { kind: "rejected", status: 403, code: "bff_csrf_rejected" },
      () => "must-not-run",
    )).toBeUndefined();
  });

  it("accepts the canonical origin only at composition time instead of taking it from a request", () => {
    const forgedOrigin = "http://evil.example.test" as CanonicalBffOrigin;
    expect(createBffRequestPreflight(forgedOrigin)).toEqual({
      kind: "rejected",
      code: "bff_canonical_origin_invalid",
    });
    expect(trustedPreflight({
      rawHeaders: replaceHeader(mutationHeaders(), "Origin", "https://evil.example.test"),
      method: "POST",
    })).toEqual({ kind: "rejected", status: 403, code: "bff_csrf_rejected" });
  });
});

function acceptedCanonicalOrigin(value: string): CanonicalBffOrigin {
  const parsed = parseCanonicalBffOrigin(value);
  if (parsed.kind !== "accepted") throw new Error("test fixture must use a canonical BFF origin");
  return parsed.canonicalOrigin;
}

function acceptedBffPreflight(canonicalOriginConfiguration: unknown) {
  const factory = createBffRequestPreflight(canonicalOriginConfiguration);
  if (factory.kind !== "accepted") throw new Error("test fixture must create a canonical BFF preflight");
  return factory.preflight;
}

function preflight(method: unknown, rawHeaders: readonly unknown[]): BffRequestPreflight {
  return trustedPreflight({ method, rawHeaders });
}

function expectRejected(
  method: unknown,
  rawHeaders: readonly unknown[],
  status: 401 | 403,
  code: Extract<BffRequestPreflight, { readonly kind: "rejected" }>["code"],
): void {
  expect(preflight(method, rawHeaders)).toEqual({ kind: "rejected", status, code });
}

function readHeaders(): string[] {
  return ["Cookie", `${doorstarBffSessionCookieName}=session-selector`];
}

function mutationHeaders(): string[] {
  return [
    "Cookie", `${doorstarBffSessionCookieName}=session-selector; ${doorstarBffCsrfCookieName}=csrf-token`,
    "X-Doorstar-CSRF", "csrf-token",
    "Origin", canonicalOrigin,
  ];
}

function replaceHeader(rawHeaders: readonly string[], targetName: string, replacement: string): string[] {
  const next = [...rawHeaders];
  for (let index = 0; index < next.length; index += 2) {
    if (next[index].toLowerCase() === targetName.toLowerCase()) {
      next[index + 1] = replacement;
      return next;
    }
  }
  throw new Error(`test fixture does not contain ${targetName}`);
}

function removeHeader(rawHeaders: readonly string[], targetName: string): string[] {
  const next: string[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index].toLowerCase() !== targetName.toLowerCase()) {
      next.push(rawHeaders[index], rawHeaders[index + 1]);
    }
  }
  return next;
}
