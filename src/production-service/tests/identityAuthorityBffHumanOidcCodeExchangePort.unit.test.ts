import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import { createDoorstarMacService, type DoorstarMacKeyName } from "../src/services/identityAuthority/bff/mac.js";
import { createDoorstarHumanOidcProfile, snapshotDoorstarHumanOidcValidationProfile } from "../src/services/identityAuthority/bff/humanOidcProfile.js";
import * as codeExchangePort from "../src/services/identityAuthority/bff/humanOidcCodeExchangePort.js";
import {
  createDoorstarHumanOidcCodeExchangeSource,
  DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_DEADLINE_MILLISECONDS,
  DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_MAXIMUM_RESPONSE_BYTES,
  exchangeDoorstarHumanOidcCodeAndConsume,
  type DoorstarHumanOidcCodeExchangeLoader,
  type DoorstarHumanOidcCodeExchangeRequest,
  type DoorstarHumanOidcCodeExchangeSource,
  type DoorstarHumanOidcCodeExchangeTokenDelivery,
} from "../src/services/identityAuthority/bff/humanOidcCodeExchangePort.js";
import {
  createDoorstarOidcTransactionBoundary,
  type DoorstarOidcLoginTransaction,
  type DoorstarOidcTransactionRepository,
} from "../src/services/identityAuthority/bff/pkceTransaction.js";

describe("Doorstar M2B profile-bound OIDC code-exchange source port", () => {
  it("consumes one genuine post-CAS delivery, hands exactly one nonce-free canonical request to its loader, and exposes tokens only through the one-use delivery", async () => {
    const profile = createProfile();
    const snapshot = snapshotDoorstarHumanOidcValidationProfile(profile);
    if (snapshot === undefined) throw new Error("expected profile snapshot");
    let request: DoorstarHumanOidcCodeExchangeRequest | undefined;
    const source = createSource(profile, async (input) => {
      request = input;
      return tokenPair();
    });

    let received: {
      readonly accessToken: string;
      readonly idToken: string;
      readonly expectedNonce: string;
      readonly claimedProfile: unknown;
    } | undefined;
    let delivery: DoorstarHumanOidcCodeExchangeTokenDelivery | undefined;
    const invocation = await invokeThroughPkce(profile, source, async (candidate) => {
      delivery = candidate;
      await candidate.consume((tokens) => {
        received = tokens;
      });
    });

    expect(invocation.callbackCompletion).toEqual({ kind: "accepted" });
    expect(invocation.exchangeCompletion).toEqual({ kind: "accepted" });
    expect(Object.keys(request ?? {}).sort()).toEqual([
      "authorizationCode",
      "clientId",
      "codeVerifier",
      "grantType",
      "issuer",
      "maximumResponseBytes",
      "profileDigest",
      "redirectUri",
      "releaseId",
      "signal",
      "tokenEndpoint",
    ]);
    expect(request).toMatchObject({
      releaseId: snapshot.releaseId,
      issuer: snapshot.issuer,
      tokenEndpoint: snapshot.tokenEndpoint,
      clientId: snapshot.clientId,
      redirectUri: snapshot.redirectUri,
      profileDigest: snapshot.profileDigest,
      grantType: "authorization_code",
      authorizationCode: "authorization-code-123",
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
      maximumResponseBytes: DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_MAXIMUM_RESPONSE_BYTES,
    });
    expect(request?.signal.aborted).toBe(true);
    expect(received).toEqual({
      ...tokenPair(),
      expectedNonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
      claimedProfile: snapshot,
    });
    await expect(delivery?.consume(() => undefined)).resolves.toBe(false);
  });

  it("fails before the loader for a foreign profile and never accepts a fabricated claimed delivery", async () => {
    const profile = createProfile();
    const foreignProfile = createProfile({ releaseId: "doorstar-trial-2026-08-26" });
    let calls = 0;
    const foreignSource = createSource(foreignProfile, async () => {
      calls += 1;
      return tokenPair();
    });

    const invocation = await invokeThroughPkce(profile, foreignSource, async () => undefined);
    expect(invocation.exchangeCompletion).toEqual({
      kind: "unavailable",
      code: "doorstar_oidc_code_exchange_profile_mismatch",
    });
    expect(invocation.callbackCompletion).toEqual({ kind: "accepted" });
    expect(calls).toBe(0);
    await expect(exchangeDoorstarHumanOidcCodeAndConsume(foreignSource, Object.freeze({}), async () => undefined)).resolves.toEqual({
      kind: "unavailable",
      code: "doorstar_oidc_code_exchange_input_invalid",
    });
    expect(calls).toBe(0);
  });

  it("maps transport exceptions and malformed, expanded, or oversized token pairs to static unavailable outcomes", async () => {
    const profile = createProfile();
    const responses: readonly [string, () => Promise<unknown>, "doorstar_oidc_code_exchange_transport_unavailable" | "doorstar_oidc_code_exchange_response_invalid"][] = [
      ["throw", async () => { throw new Error("upstream detail must not escape"); }, "doorstar_oidc_code_exchange_transport_unavailable"],
      ["missing pair field", async () => ({ accessToken: tokenPair().accessToken }), "doorstar_oidc_code_exchange_response_invalid"],
      ["extra pair field", async () => ({ ...tokenPair(), refreshToken: "must-not-be-accepted" }), "doorstar_oidc_code_exchange_response_invalid"],
      ["non-JWS", async () => ({ ...tokenPair(), idToken: "opaque-upstream-value" }), "doorstar_oidc_code_exchange_response_invalid"],
      ["oversized", async () => ({ ...tokenPair(), accessToken: oversizedCompactJws() }), "doorstar_oidc_code_exchange_response_invalid"],
    ];

    for (const [_name, response, code] of responses) {
      const source = createSource(profile, async () => await response());
      const onTokens = vi.fn(async () => undefined);
      const invocation = await invokeThroughPkce(profile, source, onTokens);
      expect(invocation.exchangeCompletion).toEqual({ kind: "unavailable", code });
      expect(onTokens).not.toHaveBeenCalled();
    }
  });

  it("has one bounded attempt, aborts a hanging loader, and does not retry", async () => {
    vi.useFakeTimers();
    try {
      const profile = createProfile();
      let signal: AbortSignal | undefined;
      const loader = vi.fn<DoorstarHumanOidcCodeExchangeLoader["exchange"]>(async (input) => {
        signal = input.signal;
        return await new Promise<unknown>(() => undefined);
      });
      const source = createSource(profile, loader);
      const pending = invokeThroughPkce(profile, source, async () => undefined);
      await vi.advanceTimersByTimeAsync(DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_DEADLINE_MILLISECONDS);
      const invocation = await pending;

      expect(invocation.exchangeCompletion).toEqual({
        kind: "unavailable",
        code: "doorstar_oidc_code_exchange_transport_unavailable",
      });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a genuine claimed delivery at most once even when two exchanges race from the same CAS callback", async () => {
    const profile = createProfile();
    let loaderCalls = 0;
    const source = createSource(profile, async () => {
      loaderCalls += 1;
      return tokenPair();
    });
    const fixture = createPkceFixture(profile);
    const plan = await begin(fixture);
    let completions: readonly unknown[] = [];
    const callbackCompletion = await fixture.boundary.complete({
      repository: fixture.repository,
      rawQuery: "code=authorization-code-123&state=" + stateOf(plan),
      transactionCookieSelector: fixture.transactionSelector(),
      now: instant("2026-08-25T12:01:00Z"),
      async onClaimed(claimedDelivery) {
        completions = await Promise.all([
          exchangeDoorstarHumanOidcCodeAndConsume(source, claimedDelivery, consumeTokens),
          exchangeDoorstarHumanOidcCodeAndConsume(source, claimedDelivery, consumeTokens),
        ]);
      },
    });

    expect(callbackCompletion).toEqual({ kind: "accepted" });
    expect(completions).toEqual([
      { kind: "accepted" },
      { kind: "unavailable", code: "doorstar_oidc_code_exchange_input_invalid" },
    ]);
    expect(loaderCalls).toBe(1);
  });

  it("requires exactly one successful token delivery consumption and contains callback failures", async () => {
    const profile = createProfile();
    const source = createSource(profile, async () => tokenPair());

    const unconsumed = await invokeThroughPkce(profile, source, async () => undefined);
    expect(unconsumed.exchangeCompletion).toEqual({
      kind: "unavailable",
      code: "doorstar_oidc_code_exchange_delivery_unconsumed",
    });
    const failed = await invokeThroughPkce(profile, source, async (delivery) => {
      await delivery.consume(() => {
        throw new Error("validator failure");
      });
    });
    expect(failed.exchangeCompletion).toEqual({
      kind: "unavailable",
      code: "doorstar_oidc_code_exchange_delivery_failed",
    });
  });

  it("awaits a started fire-and-forget token consumption before returning accepted", async () => {
    const profile = createProfile();
    const source = createSource(profile, async () => tokenPair());
    let signalConsumerStarted: (() => void) | undefined;
    const consumerStarted = new Promise<void>((resolve) => {
      signalConsumerStarted = resolve;
    });
    let releaseConsumer: (() => void) | undefined;
    const consumerRelease = new Promise<void>((resolve) => {
      releaseConsumer = resolve;
    });

    const pending = invokeThroughPkce(profile, source, (delivery) => {
      void delivery.consume(async () => {
        signalConsumerStarted?.();
        await consumerRelease;
      });
    });
    await consumerStarted;
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseConsumer?.();
    await expect(pending).resolves.toMatchObject({ exchangeCompletion: { kind: "accepted" } });
  });

  it("contains a fire-and-forget token consumer failure as a static result", async () => {
    const profile = createProfile();
    const source = createSource(profile, async () => tokenPair());
    let consumption: Promise<boolean> | undefined;

    const result = await invokeThroughPkce(profile, source, (delivery) => {
      consumption = delivery.consume(() => {
        throw new Error("validator failure must remain contained");
      });
    });

    expect(result.exchangeCompletion).toEqual({
      kind: "unavailable",
      code: "doorstar_oidc_code_exchange_delivery_failed",
    });
    await expect(consumption).resolves.toBe(false);
  });

  it("waits for a started token consumption even when its callback throws", async () => {
    const profile = createProfile();
    const source = createSource(profile, async () => tokenPair());
    let signalConsumerStarted: (() => void) | undefined;
    const consumerStarted = new Promise<void>((resolve) => {
      signalConsumerStarted = resolve;
    });
    let releaseConsumer: (() => void) | undefined;
    const consumerRelease = new Promise<void>((resolve) => {
      releaseConsumer = resolve;
    });

    const pending = invokeThroughPkce(profile, source, (delivery) => {
      void delivery.consume(async () => {
        signalConsumerStarted?.();
        await consumerRelease;
      });
      throw new Error("callback failure must wait for started token consumer");
    });
    await consumerStarted;
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseConsumer?.();
    await expect(pending).resolves.toMatchObject({
      exchangeCompletion: {
        kind: "unavailable",
        code: "doorstar_oidc_code_exchange_delivery_failed",
      },
    });
  });

  it("keeps the runtime surface and import boundary narrow: no HTTP client, Express, Prisma, session or route dependency", () => {
    expect(Object.keys(codeExchangePort).sort()).toEqual([
      "DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_DEADLINE_MILLISECONDS",
      "DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_MAXIMUM_RESPONSE_BYTES",
      "createDoorstarHumanOidcCodeExchangeSource",
      "exchangeDoorstarHumanOidcCodeAndConsume",
    ]);
    const source = readFileSync(resolve(process.cwd(), "src/services/identityAuthority/bff/humanOidcCodeExchangePort.ts"), "utf8");
    expect(source).not.toMatch(/\b(fetch|Prisma|express|Router|createDoorstarSession)\b/u);
  });
});

async function consumeTokens(delivery: DoorstarHumanOidcCodeExchangeTokenDelivery): Promise<void> {
  await delivery.consume(() => undefined);
}

function createSource(
  profile: ReturnType<typeof createProfile>,
  exchange: DoorstarHumanOidcCodeExchangeLoader["exchange"],
): DoorstarHumanOidcCodeExchangeSource {
  const source = createDoorstarHumanOidcCodeExchangeSource({ profile, loader: Object.freeze({ exchange }) });
  if (source === undefined) throw new Error("expected source");
  return source;
}

async function invokeThroughPkce(
  profile: ReturnType<typeof createProfile>,
  source: DoorstarHumanOidcCodeExchangeSource,
  onTokens: (delivery: DoorstarHumanOidcCodeExchangeTokenDelivery) => Promise<void> | void,
) {
  const fixture = createPkceFixture(profile);
  const plan = await begin(fixture);
  let exchangeCompletion: Awaited<ReturnType<typeof exchangeDoorstarHumanOidcCodeAndConsume>> | undefined;
  const callbackCompletion = await fixture.boundary.complete({
    repository: fixture.repository,
    rawQuery: "code=authorization-code-123&state=" + stateOf(plan),
    transactionCookieSelector: fixture.transactionSelector(),
    now: instant("2026-08-25T12:01:00Z"),
    async onClaimed(claimedDelivery) {
      exchangeCompletion = await exchangeDoorstarHumanOidcCodeAndConsume(source, claimedDelivery, onTokens);
    },
  });
  if (exchangeCompletion === undefined) throw new Error("expected code-exchange completion");
  return Object.freeze({ callbackCompletion, exchangeCompletion });
}

function createPkceFixture(profile: ReturnType<typeof createProfile>) {
  const mac = createDoorstarMacService(keyProvider());
  const boundary = createDoorstarOidcTransactionBoundary({ mac, profile });
  if (boundary === undefined) throw new Error("expected PKCE boundary");
  const rows = new Map<string, DoorstarOidcLoginTransaction>();
  const claimed = new Set<string>();
  const repository: DoorstarOidcTransactionRepository = {
    async begin(transaction) {
      if (rows.has(transaction.selector)) return "not_started";
      rows.set(transaction.selector, transaction);
      return "started";
    },
    async findUnconsumedBySelector(selector) {
      return claimed.has(selector) ? undefined : rows.get(selector);
    },
    async claimMatching(input) {
      const transaction = rows.get(input.selector);
      if (transaction === undefined
        || claimed.has(input.selector)
        || transaction.stateMacKeyVersion !== input.stateMacKeyVersion
        || transaction.profileDigest !== input.profileDigest
        || !Buffer.from(transaction.stateMac).equals(Buffer.from(input.stateMac))) {
        return "not_claimed";
      }
      claimed.add(input.selector);
      return "claimed";
    },
  };
  return Object.freeze({
    boundary,
    repository,
    transactionSelector(): string {
      const [transaction] = rows.values();
      if (transaction === undefined) throw new Error("expected PKCE transaction");
      return transaction.selector;
    },
  });
}

async function begin(fixture: ReturnType<typeof createPkceFixture>) {
  let plan: Parameters<Parameters<typeof fixture.boundary.begin>[0]["onStarted"]>[0] | undefined;
  const result = await fixture.boundary.begin({
    repository: fixture.repository,
    now: instant("2026-08-25T12:00:00Z"),
    maximumLifetimeSeconds: 300,
    randomBytes: () => Buffer.alloc(32, 7),
    onStarted(candidate) {
      plan = candidate;
    },
  });
  if (result.kind !== "accepted" || plan === undefined) throw new Error("expected authorization plan");
  return plan;
}

function keyProvider() {
  const key = Buffer.from("current-key", "utf8");
  return {
    async currentKeyVersion(_keyName: DoorstarMacKeyName): Promise<number> {
      return 1;
    },
    async signHmacSha256(request: {
      readonly keyName: DoorstarMacKeyName;
      readonly keyVersion: number;
      readonly preimage: Uint8Array;
    }): Promise<Uint8Array | null> {
      return request.keyVersion === 1
        ? createHmac("sha256", key).update(request.preimage).digest()
        : null;
    },
  };
}

function stateOf(plan: { readonly authorizationRequestUri: string }): string {
  const state = new URL(plan.authorizationRequestUri).searchParams.get("state");
  if (state === null) throw new Error("missing state");
  return state;
}

function instant(value: string) {
  return parseCanonicalUtcInstant(value);
}

function tokenPair() {
  return Object.freeze({
    accessToken: "access.header.signature",
    idToken: "id.header.signature",
  });
}

function oversizedCompactJws(): string {
  return "a." + "b".repeat(16 * 1_024) + ".c";
}

function createProfile(change: Record<string, unknown> = {}) {
  const issuer = "https://identity.example.test/realms/doorstar";
  const profile = createDoorstarHumanOidcProfile({
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
    ...change,
  });
  if (profile === undefined) throw new Error("expected profile");
  return profile;
}
