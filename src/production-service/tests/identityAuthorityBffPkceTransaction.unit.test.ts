import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import { createDoorstarHumanOidcProfile } from "../src/services/identityAuthority/bff/humanOidcProfile.js";
import * as pkceTransaction from "../src/services/identityAuthority/bff/pkceTransaction.js";
import {
  createDoorstarOidcTransactionBoundary,
  createDoorstarOidcTransactionCookieClearHeader,
  type DoorstarOidcLoginTransaction,
  type DoorstarOidcTransactionRepository,
} from "../src/services/identityAuthority/bff/pkceTransaction.js";
import { createDoorstarMacService, type DoorstarMacKeyName } from "../src/services/identityAuthority/bff/mac.js";

describe("Doorstar M2B PKCE transaction boundary", () => {
  it("persists before it supplies an exact S256 host-only authorization plan", async () => {
    const fixture = createFixture();
    let plan: Parameters<Parameters<typeof fixture.boundary.begin>[0]["onStarted"]>[0] | undefined;

    const result = await fixture.boundary.begin({
      repository: fixture.repository,
      now: instant("2026-08-25T12:00:00Z"),
      maximumLifetimeSeconds: 300,
      randomBytes: () => Buffer.alloc(32, 7),
      onStarted(value) {
        expect(fixture.repository.started).toHaveLength(1);
        plan = value;
      },
    });

    if (plan === undefined) throw new Error("expected authorization plan");
    expect(result).toEqual({ kind: "accepted" });
    expect(JSON.stringify(result)).toBe('{"kind":"accepted"}');
    expect(plan.transactionCookie).toBe(
      "__Host-doorstar-oidc-tx=" + fixture.repository.started[0]!.selector
      + "; Path=/; Max-Age=300; Secure; HttpOnly; SameSite=Lax",
    );
    expect(plan.transactionCookie).not.toContain("Domain=");
    const authorizationRequest = new URL(plan.authorizationRequestUri);
    expect(authorizationRequest.origin + authorizationRequest.pathname).toBe(
      "https://identity.example.test/realms/doorstar/protocol/openid-connect/auth",
    );
    expect(authorizationRequest.searchParams.get("response_type")).toBe("code");
    expect(authorizationRequest.searchParams.get("client_id")).toBe("doorstar-bff");
    expect(authorizationRequest.searchParams.get("redirect_uri")).toBe("https://doorstar.example.test/auth/callback");
    expect(authorizationRequest.searchParams.get("scope")).toBe("doorstar-api openid");
    expect(stateOf(plan)).toHaveLength(43);
    expect(nonceOf(plan)).toHaveLength(43);
    expect(challengeOf(plan)).toHaveLength(43);
    expect(new Set([stateOf(plan), nonceOf(plan), challengeOf(plan)])).toHaveLength(3);
    expect(authorizationRequest.searchParams.get("code_challenge_method")).toBe("S256");
    expect(fixture.repository.started[0]!.keyVersion).toBe(2);
    expect(fixture.repository.started[0]!.stateMacKeyVersion).toBe(2);
    expect(fixture.repository.started[0]!.expiresAt.wireValue).toBe("2026-08-25T12:05:00Z");
  });

  it("releases code, verifier, and nonce only after the one-time CAS claim", async () => {
    const fixture = createFixture();
    const plan = await begin(fixture);
    const transaction = fixture.repository.started[0]!;
    const observed: Array<{ authorizationCode: string; codeVerifier: string; nonce: string }> = [];

    const first = await fixture.boundary.complete({
      repository: fixture.repository,
      rawQuery: "code=authorization-code-123&state=" + stateOf(plan),
      transactionCookieSelector: transaction.selector,
      now: instant("2026-08-25T12:01:00Z"),
      onClaimed(secrets) {
        expect(fixture.repository.claims).toHaveLength(1);
        observed.push({
          authorizationCode: secrets.authorizationCode,
          codeVerifier: secrets.codeVerifier,
          nonce: secrets.nonce,
        });
        expect(secrets.profile.profileDigest).toBe(transaction.profileDigest);
        expect(secrets.profile.tokenEndpoint).toBe(
          "https://identity.example.test/realms/doorstar/protocol/openid-connect/token",
        );
      },
    });
    const replay = await fixture.boundary.complete({
      repository: fixture.repository,
      rawQuery: "code=authorization-code-123&state=" + stateOf(plan),
      transactionCookieSelector: transaction.selector,
      now: instant("2026-08-25T12:01:01Z"),
      onClaimed() {
        throw new Error("a replay must not release any secret");
      },
    });

    expect(first).toEqual({ kind: "accepted" });
    expect(JSON.stringify(first)).toBe('{"kind":"accepted"}');
    expect(observed).toEqual([{
      authorizationCode: "authorization-code-123",
      codeVerifier: expect.any(String),
      nonce: nonceOf(plan),
    }]);
    expect(observed[0]!.codeVerifier).toHaveLength(43);
    expect(observed[0]!.codeVerifier).not.toBe(challengeOf(plan));
    expect(replay).toEqual({ kind: "rejected", code: "doorstar_oidc_transaction_not_claimed" });
    expect(fixture.repository.claims).toHaveLength(2);
  });

  it.each([
    "code=one&code=two&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "code=one&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "error=access_denied&code=one&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "code=one&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&unexpected=value",
    "code=one&state=not-a-canonical-state",
    "?code=one&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "code=%ZZ&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ])("rejects malformed or ambiguous callback query %# before repository access", async (rawQuery) => {
    const fixture = createFixture();
    const plan = await begin(fixture);
    const result = await fixture.boundary.complete({
      repository: fixture.repository,
      rawQuery,
      transactionCookieSelector: fixture.repository.started[0]!.selector,
      now: instant("2026-08-25T12:01:00Z"),
      onClaimed() {
        throw new Error("must not receive secrets");
      },
    });

    expect(result.kind).toBe("rejected");
    expect(fixture.repository.finds).toHaveLength(0);
    expect(fixture.repository.claims).toHaveLength(0);
    expect(stateOf(plan)).toHaveLength(43);
  });

  it.each([
    ["wrong state", (plan: { readonly authorizationRequestUri: string }, transaction: DoorstarOidcLoginTransaction) => ({ rawQuery: "code=authorization-code-123&state=" + different(stateOf(plan)), selector: transaction.selector })],
    ["wrong cookie", (plan: { readonly authorizationRequestUri: string }, transaction: DoorstarOidcLoginTransaction) => ({ rawQuery: "code=authorization-code-123&state=" + stateOf(plan), selector: different(transaction.selector) })],
  ] as const)("rejects %s before a repository claim", async (_name, input) => {
    const fixture = createFixture();
    const plan = await begin(fixture);
    const transaction = fixture.repository.started[0]!;
    const callback = input(plan, transaction);
    const result = await fixture.boundary.complete({
      repository: fixture.repository,
      rawQuery: callback.rawQuery,
      transactionCookieSelector: callback.selector,
      now: instant("2026-08-25T12:01:00Z"),
      onClaimed() {
        throw new Error("must not receive secrets");
      },
    });

    expect(result.kind).toBe("rejected");
    expect(fixture.repository.claims).toHaveLength(0);
  });

  it("rejects tampered transaction state, profile change, expired rows, and retired transaction keys", async () => {
    const fixture = createFixture();
    const plan = await begin(fixture);
    const transaction = fixture.repository.started[0]!;
    const base = {
      repository: fixture.repository,
      rawQuery: "code=authorization-code-123&state=" + stateOf(plan),
      transactionCookieSelector: transaction.selector,
      now: instant("2026-08-25T12:01:00Z"),
      onClaimed() {
        throw new Error("must not receive secrets");
      },
    };

    fixture.repository.replace({ ...transaction, stateMac: Buffer.alloc(32, 9) });
    expect((await fixture.boundary.complete(base)).kind).toBe("rejected");

    fixture.repository.replace(transaction);
    const changedProfile = createDoorstarHumanOidcProfile({ ...profileInput(), releaseId: "doorstar-trial-2026-08-26" });
    if (changedProfile === undefined) throw new Error("expected changed profile");
    const changedBoundary = createDoorstarOidcTransactionBoundary({ mac: fixture.mac, profile: changedProfile });
    if (changedBoundary === undefined) throw new Error("expected changed boundary");
    expect((await changedBoundary.complete(base)).kind).toBe("rejected");

    expect(await fixture.boundary.complete({
      ...base,
      now: instant("2026-08-25T12:06:00Z"),
    })).toEqual({ kind: "rejected", code: "doorstar_oidc_transaction_expired" });

    fixture.provider.keys.delete(2);
    expect(await fixture.boundary.complete(base)).toEqual({
      kind: "rejected",
      code: "doorstar_oidc_transaction_key_unavailable",
    });
  });

  it("rejects invalid boundary profiles, invalid start inputs, repository failure, and delivers no header itself", async () => {
    const fixture = createFixture();
    expect(createDoorstarOidcTransactionBoundary({ mac: fixture.mac, profile: {} as never })).toBeUndefined();
    await expect(fixture.boundary.begin({
      repository: fixture.repository,
      now: instant("2026-08-25T12:00:00Z"),
      maximumLifetimeSeconds: 601,
      onStarted() {
        throw new Error("must not run");
      },
    })).resolves.toEqual({ kind: "rejected", code: "doorstar_oidc_lifetime_invalid" });
    await expect(fixture.boundary.begin({
      repository: fixture.repository,
      now: instant("2026-08-25T12:00:00Z"),
      maximumLifetimeSeconds: 300,
      randomBytes: () => Buffer.alloc(31),
      onStarted() {
        throw new Error("must not run");
      },
    })).resolves.toEqual({ kind: "rejected", code: "doorstar_oidc_random_source_invalid" });

    const unavailableRepository = {
      ...fixture.repository,
      async begin(): Promise<"started"> {
        throw new Error("database unavailable");
      },
    } satisfies DoorstarOidcTransactionRepository;
    await expect(fixture.boundary.begin({
      repository: unavailableRepository,
      now: instant("2026-08-25T12:00:00Z"),
      maximumLifetimeSeconds: 300,
      onStarted() {
        throw new Error("must not run");
      },
    })).resolves.toEqual({ kind: "rejected", code: "doorstar_oidc_transaction_repository_unavailable" });
  });

  it("clears the transaction cookie with the same exact host-only attributes", () => {
    expect(createDoorstarOidcTransactionCookieClearHeader()).toBe(
      "__Host-doorstar-oidc-tx=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
    );
  });

  it("exports no decision-to-secret accessor outside the one PKCE boundary", () => {
    expect(Object.keys(pkceTransaction).sort()).toEqual([
      "MAXIMUM_DOORSTAR_OIDC_TRANSACTION_LIFETIME_SECONDS",
      "createDoorstarOidcTransactionBoundary",
      "createDoorstarOidcTransactionCookieClearHeader",
      "doorstarBffOidcTransactionCookieName",
    ]);
  });
});

async function begin(fixture: ReturnType<typeof createFixture>) {
  let plan: Parameters<Parameters<typeof fixture.boundary.begin>[0]["onStarted"]>[0] | undefined;
  const result = await fixture.boundary.begin({
    repository: fixture.repository,
    now: instant("2026-08-25T12:00:00Z"),
    maximumLifetimeSeconds: 300,
    randomBytes: () => Buffer.alloc(32, 7),
    onStarted(value) {
      plan = value;
    },
  });
  if (result.kind !== "accepted" || plan === undefined) throw new Error("expected an accepted authorization start");
  return plan;
}

function createFixture() {
  const provider = keyProvider({ currentVersion: 2, keys: { 1: "previous-key", 2: "current-key" } });
  const mac = createDoorstarMacService(provider);
  const profile = createDoorstarHumanOidcProfile(profileInput());
  if (profile === undefined) throw new Error("expected OIDC profile");
  const boundary = createDoorstarOidcTransactionBoundary({ mac, profile });
  if (boundary === undefined) throw new Error("expected OIDC boundary");
  return { provider, mac, boundary, repository: transactionRepository() };
}

function profileInput() {
  const issuer = "https://identity.example.test/realms/doorstar";
  return {
    releaseId: "doorstar-trial-2026-08-25",
    issuer,
    authorizationEndpoint: issuer + "/protocol/openid-connect/auth",
    tokenEndpoint: issuer + "/protocol/openid-connect/token",
    jwksUri: issuer + "/protocol/openid-connect/certs",
    clientId: "doorstar-bff",
    redirectUri: "https://doorstar.example.test/auth/callback",
    productScope: "doorstar-api",
    accessTokenAudiences: ["doorstar-api"],
    accessTokenAuthorizedParty: "doorstar-bff",
    idTokenAudiences: ["doorstar-bff"],
    idTokenAuthorizedParty: "doorstar-bff",
    accessTokenJoseType: "JWT",
    accessTokenPayloadType: "Bearer",
    idTokenJoseType: "JWT",
    accessTokenMaximumLifetimeSeconds: 300,
    idTokenMaximumLifetimeSeconds: 300,
    authorityProjectionContract: "spaceos-v1-nested-single-tenant",
    idTokenAuthorityClaims: "forbidden",
    clockSkewSeconds: 60,
  };
}

function transactionRepository() {
  const started: DoorstarOidcLoginTransaction[] = [];
  const claims: DoorstarOidcTransactionRepository["claimMatching"] extends (input: infer Input) => unknown ? Input[] : never[] = [];
  const bySelector = new Map<string, DoorstarOidcLoginTransaction>();
  const claimedSelectors = new Set<string>();
  const finds: string[] = [];
  return {
    started,
    claims,
    finds,
    replace(transaction: DoorstarOidcLoginTransaction) {
      bySelector.set(transaction.selector, transaction);
    },
    async begin(transaction: DoorstarOidcLoginTransaction): Promise<"started" | "not_started"> {
      if (bySelector.has(transaction.selector)) return "not_started";
      started.push(transaction);
      bySelector.set(transaction.selector, transaction);
      return "started";
    },
    async findUnconsumedBySelector(selector: string): Promise<DoorstarOidcLoginTransaction | undefined> {
      finds.push(selector);
      return bySelector.get(selector);
    },
    async claimMatching(input: {
      readonly selector: string;
      readonly stateMacKeyVersion: number;
      readonly stateMac: Uint8Array;
      readonly profileDigest: string;
      readonly now: ReturnType<typeof instant>;
    }): Promise<"claimed" | "not_claimed"> {
      claims.push(input);
      const transaction = bySelector.get(input.selector);
      if (transaction === undefined
        || claimedSelectors.has(input.selector)
        || transaction.stateMacKeyVersion !== input.stateMacKeyVersion
        || transaction.profileDigest !== input.profileDigest
        || !Buffer.from(transaction.stateMac).equals(Buffer.from(input.stateMac))) {
        return "not_claimed";
      }
      claimedSelectors.add(input.selector);
      return "claimed";
    },
  } satisfies DoorstarOidcTransactionRepository & {
    readonly started: DoorstarOidcLoginTransaction[];
    readonly claims: Array<{
      readonly selector: string;
      readonly stateMacKeyVersion: number;
      readonly stateMac: Uint8Array;
      readonly profileDigest: string;
      readonly now: ReturnType<typeof instant>;
    }>;
    readonly finds: string[];
    replace(transaction: DoorstarOidcLoginTransaction): void;
  };
}

function instant(value: string) {
  return parseCanonicalUtcInstant(value);
}

function different(value: string): string {
  const replacement = value.startsWith("A") ? "B" : "A";
  return replacement + value.slice(1);
}

function stateOf(plan: { readonly authorizationRequestUri: string }): string {
  return requiredAuthorizationParameter(plan, "state");
}

function nonceOf(plan: { readonly authorizationRequestUri: string }): string {
  return requiredAuthorizationParameter(plan, "nonce");
}

function challengeOf(plan: { readonly authorizationRequestUri: string }): string {
  return requiredAuthorizationParameter(plan, "code_challenge");
}

function requiredAuthorizationParameter(plan: { readonly authorizationRequestUri: string }, name: string): string {
  const value = new URL(plan.authorizationRequestUri).searchParams.get(name);
  if (value === null) throw new Error("missing authorization request parameter: " + name);
  return value;
}

function keyProvider(input: {
  readonly currentVersion: number;
  readonly keys: Record<number, string>;
}) {
  const keys = new Map(Object.entries(input.keys).map(([version, value]) => [Number(version), Buffer.from(value, "utf8")]));
  return {
    keys,
    async currentKeyVersion(_keyName: DoorstarMacKeyName): Promise<number> {
      return input.currentVersion;
    },
    async signHmacSha256(request: {
      readonly keyName: DoorstarMacKeyName;
      readonly keyVersion: number;
      readonly preimage: Uint8Array;
    }): Promise<Uint8Array | null> {
      const key = keys.get(request.keyVersion);
      return key === undefined ? null : createHmac("sha256", key).update(request.preimage).digest();
    },
  };
}
