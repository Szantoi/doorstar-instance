import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadIdentityAuthorityConfig, type IdentityAuthorityEnabledConfig } from "../src/services/identityAuthority/config.js";
import { createIdentityAuthorityResolverClient, createIdentityAuthorityResolverClientForTest } from "../src/services/identityAuthority/client.js";
import { compareCanonicalUtcInstants, parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";

const subject = "oidc|doorstar-worker-001";
const tenantId = "40000000-0000-0000-0000-000000000004";
const m2mAccessToken = "m2m-access-token-value";

describe("IdentityAuthorityResolverClient", () => {
  it("stays default-off without reading a key or making a network request", async () => {
    const transport = queuedFetch([]);
    let keyRead = false;
    const client = await createIdentityAuthorityResolverClientForTest({ mode: "disabled" }, {
      fetch: transport.fetch,
      environment: {},
      loadPrivateKey: async () => {
        keyRead = true;
        return generateKeyPairSync("rsa", { modulusLength: 2_048 }).privateKey;
      },
    });

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({ kind: "unavailable", reason: "disabled" });
    expect(keyRead).toBe(false);
    expect(transport.calls).toEqual([]);

    const productionClient = await createIdentityAuthorityResolverClient({ mode: "disabled" });
    await expect(productionClient.resolve({ subject, tenantId })).resolves.toEqual({ kind: "unavailable", reason: "disabled" });
  });

  it("uses only a service token for the exact resolver request", async () => {
    const transport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
      jsonResponse(activeState()),
    ]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toMatchObject({ kind: "resolved" });
    expect(transport.calls).toHaveLength(2);

    const tokenRequest = transport.calls[0]!;
    expect(tokenRequest.input).toBe("https://identity.example.test/realms/doorstar/protocol/openid-connect/token");
    expect(tokenRequest.init?.redirect).toBe("error");
    expect(new Headers(tokenRequest.init?.headers).get("authorization")).toBeNull();
    const form = new URLSearchParams(String(tokenRequest.init?.body));
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("client_id")).toBe("doorstar-identity-authority");
    expect(form.get("scope")).toBe("identity-authority.resolve");
    expect(form.get("client_assertion_type")).toBe("urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    const assertionPayload = decodeJwtPayload(form.get("client_assertion")!);
    expect(assertionPayload).not.toHaveProperty("subject");
    expect(assertionPayload).not.toHaveProperty("tenantId");
    expect(assertionPayload).not.toHaveProperty("bearerToken");

    const resolverRequest = transport.calls[1]!;
    expect(resolverRequest.input).toBe("https://kernel.example.test/api/internal/identity-authority/resolve");
    expect(resolverRequest.init?.redirect).toBe("error");
    expect(new Headers(resolverRequest.init?.headers).get("authorization")).toBe(`Bearer ${m2mAccessToken}`);
    expect(resolverRequest.init?.body).toBe(`{"subject":"${subject}","tenantId":"${tenantId}"}`);
  });

  it("does not accept a caller-supplied human bearer token or make a network request", async () => {
    const transport = queuedFetch([]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId, bearerToken: "human-token" })).resolves.toEqual({
      kind: "unavailable",
      reason: "invalid_request",
    });
    expect(transport.calls).toEqual([]);
  });

  it("rejects forged transport URLs before it reads a private key", async () => {
    const forgedConfig = { ...enabledConfig(), resolverUrl: "https://attacker.example.test/resolve" } as IdentityAuthorityEnabledConfig;
    let keyRead = false;

    await expect(createIdentityAuthorityResolverClientForTest(forgedConfig, {
      environment: {},
      loadPrivateKey: async () => {
        keyRead = true;
        return generateKeyPairSync("rsa", { modulusLength: 2_048 }).privateKey;
      },
    })).rejects.toThrow("identity_authority_config_invalid");
    expect(keyRead).toBe(false);
  });

  it("uses a copied config snapshot after construction", async () => {
    const transport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
      jsonResponse(activeState()),
    ]);
    const config = enabledConfig();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
    const client = await createIdentityAuthorityResolverClientForTest(config, {
      fetch: transport.fetch,
      environment: {},
      loadPrivateKey: async (): Promise<KeyObject> => privateKey,
      now: () => new Date("2026-08-25T12:34:56.000Z"),
      randomUuid: () => "123e4567-e89b-42d3-a456-426614174000",
    });
    (config as unknown as { resolverUrl: string }).resolverUrl = "https://attacker.example.test/resolve";

    await expect(client.resolve({ subject, tenantId })).resolves.toMatchObject({ kind: "resolved" });
    expect(transport.calls[1]?.input).toBe("https://kernel.example.test/api/internal/identity-authority/resolve");
  });

  it.each([
    [{ NODE_TLS_REJECT_UNAUTHORIZED: "0" }, [], "identity_authority_insecure_tls_forbidden"],
    [{ NODE_USE_ENV_PROXY: "true" }, [], "identity_authority_implicit_proxy_forbidden"],
    [{ NODE_OPTIONS: "--trace-warnings --use-env-proxy" }, [], "identity_authority_implicit_proxy_forbidden"],
    [{ NODE_OPTIONS: '"--use-env-proxy"' }, [], "identity_authority_implicit_proxy_forbidden"],
    [{}, ["--use-env-proxy"], "identity_authority_implicit_proxy_forbidden"],
  ] as const)("rejects unsafe process transport settings", async (environment, execArguments, errorCode) => {
    await expect(createIdentityAuthorityResolverClientForTest(enabledConfig(), {
      environment,
      execArguments,
      loadPrivateKey: async () => generateKeyPairSync("rsa", { modulusLength: 2_048 }).privateKey,
    })).rejects.toThrow(errorCode);
  });

  it("rejects a reserved tenant locally without making a network request", async () => {
    const transport = queuedFetch([]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId: "00000000-0000-0000-0000-000000000001" })).resolves.toEqual({
      kind: "unavailable",
      reason: "invalid_request",
    });
    expect(transport.calls).toEqual([]);
  });

  it("maps a resolver 404 and inactive lifecycle states to authorization denial", async () => {
    const notFoundTransport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
      new Response(null, { status: 404 }),
    ]);
    const notFoundClient = await createClient(notFoundTransport.fetch);
    await expect(notFoundClient.resolve({ subject, tenantId })).resolves.toEqual({ kind: "denied" });
    expect(notFoundTransport.calls[1]?.init?.signal?.aborted).toBe(true);

    const revokedTransport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
      jsonResponse({ ...activeState(), membershipStatus: "revoked" }),
    ]);
    const revokedClient = await createClient(revokedTransport.fetch);
    await expect(revokedClient.resolve({ subject, tenantId })).resolves.toEqual({ kind: "denied" });
  });

  it("keeps the deadline active while reading a slow resolver body", async () => {
    let resolverSignal: AbortSignal | null | undefined;
    let requestCount = 0;
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      requestCount += 1;
      if (requestCount === 1) return jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 });
      resolverSignal = init?.signal;
      return abortAwarePendingJsonResponse(resolverSignal!);
    };
    const client = await createClient(fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "resolver_unavailable",
    });
    expect(resolverSignal?.aborted).toBe(true);
  });

  it("does not start the resolver request after token exchange consumes the shared deadline", async () => {
    const transport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
    ]);
    // The token phase checks the shared budget before/after transport and
    // response parsing. Only the next, resolver-start check sees expiry.
    const client = await createClient(transport.fetch, scriptedMonotonicNow([0, 0, 0, 0, 0, 2_000]));

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "resolver_unavailable",
    });
    expect(transport.calls).toHaveLength(1);
  });

  it("uses only the resolver phase's remaining shared deadline", async () => {
    vi.useFakeTimers();
    try {
      let resolverSignal: AbortSignal | null | undefined;
      let resolveResolverStarted: (() => void) | undefined;
      const resolverStarted = new Promise<void>((resolve) => {
        resolveResolverStarted = resolve;
      });
      let requestCount = 0;
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        requestCount += 1;
        if (requestCount === 1) return jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 });
        resolverSignal = init?.signal;
        resolveResolverStarted?.();
        return abortAwarePendingJsonResponse(resolverSignal!);
      };
      const client = await createClient(fetch, scriptedMonotonicNow([0, 0, 1_500]));
      const result = client.resolve({ subject, tenantId });

      await resolverStarted;
      expect(resolverSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(499);
      expect(resolverSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({
        kind: "unavailable",
        reason: "resolver_unavailable",
      });
      expect(resolverSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed when a resolver transport returns only after the shared deadline", async () => {
    let monotonicTime = 0;
    let requestCount = 0;
    const fetch: typeof globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) return jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 });
      monotonicTime = 2_000;
      return jsonResponse(activeState());
    };
    const client = await createClient(fetch, () => monotonicTime);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "resolver_unavailable",
    });
  });

  it("fails closed when a resolver response body crosses the shared deadline", async () => {
    let monotonicTime = 0;
    let requestCount = 0;
    const fetch: typeof globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) return jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 });
      return jsonResponseAfter(() => {
        monotonicTime = 2_000;
      }, activeState());
    };
    const client = await createClient(fetch, () => monotonicTime);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "resolver_unavailable",
    });
  });

  it.each([
    ["bad request", new Response(null, { status: 400 })],
    ["unauthorized", new Response(null, { status: 401 })],
    ["rate limit", new Response(null, { status: 429 })],
    ["server error", new Response(null, { status: 500 })],
    ["redirect", new Response(null, { status: 302, headers: { location: "https://attacker.example.test" } })],
    ["wrong content type", new Response(JSON.stringify(activeState()), { status: 200, headers: { "content-type": "text/plain" } })],
    ["duplicate state field", jsonResponse(`{"schemaVersion":"spaceos.online-identity-authority/v1","schemaVersion":"spaceos.online-identity-authority/v1"}`)],
    ["extra state field", jsonResponse({ ...activeState(), consumerId: "attacker-selected" })],
    ["unknown module grant", jsonResponse({ ...activeState(), permissions: ["custom.evil.view"], enabledModules: ["custom.evil"] })],
    ["unknown grant action", jsonResponse({ ...activeState(), permissions: ["spaceos.crm.delete"], enabledModules: ["spaceos.crm"] })],
    ["reflected tenant mismatch", jsonResponse({ ...activeState(), tenantId: "50000000-0000-0000-0000-000000000005" })],
    ["oversized state", jsonResponse("x".repeat(65_537))],
  ])("fails closed for %s", async (_name, resolverResponse) => {
    const transport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
      resolverResponse,
    ]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("classifies malformed UTF-8 as a resolver contract failure", async () => {
    const transport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
      new Response(new Uint8Array([0xff]), { status: 200, headers: { "content-type": "application/json" } }),
    ]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "resolver_contract_invalid",
    });
  });

  it("classifies resolver transport failure as unavailable", async () => {
    const transport = queuedFetch([
      jsonResponse({ access_token: m2mAccessToken, token_type: "Bearer", expires_in: 300 }),
      new Error("tls connection failed"),
    ]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "resolver_unavailable",
    });
  });

  it.each([
    ["bad request", new Response(null, { status: 400 })],
    ["unauthorized", new Response(null, { status: 401 })],
    ["server error", new Response(null, { status: 500 })],
    ["wrong content type", new Response("not json", { status: 200, headers: { "content-type": "text/plain" } })],
    ["malformed JSON", jsonResponse("{not-json")],
  ])("fails closed for token exchange %s", async (_name, tokenResponse) => {
    const transport = queuedFetch([tokenResponse]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "token_exchange_failed",
    });
    expect(transport.calls).toHaveLength(1);
  });

  it("enforces the deadline while reading a slow token response body", async () => {
    const fetch: typeof globalThis.fetch = async (_input, init) => abortAwarePendingJsonResponse(init?.signal!);
    const client = await createClient(fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "token_exchange_failed",
    });
  });

  it("fails closed when the service-token request fails and never retries", async () => {
    const transport = queuedFetch([new Error("network unavailable")]);
    const client = await createClient(transport.fetch);

    await expect(client.resolve({ subject, tenantId })).resolves.toEqual({
      kind: "unavailable",
      reason: "token_exchange_failed",
    });
    expect(transport.calls).toHaveLength(1);
  });

  it("keeps fractional-second cutoff comparison exact", () => {
    const older = parseCanonicalUtcInstant("2026-08-25T12:34:56.1234567Z");
    const newer = parseCanonicalUtcInstant("2026-08-25T12:34:56.1234568Z");
    expect(compareCanonicalUtcInstants(older, newer)).toBe(-1);
    expect(compareCanonicalUtcInstants(newer, older)).toBe(1);
    expect(parseCanonicalUtcInstant("0001-01-01T00:00:00Z").wireValue).toBe("0001-01-01T00:00:00Z");
  });
});

function activeState(): Record<string, unknown> {
  return {
    schemaVersion: "spaceos.online-identity-authority/v1",
    subject,
    tenantId,
    tenantStatus: "active",
    membershipStatus: "active",
    membershipVersion: 3,
    projectionVersion: 4,
    acceptTokensIssuedAtOrAfter: "2026-08-25T12:34:56.1234567Z",
    permissions: ["spaceos.crm.view"],
    enabledModules: ["spaceos.crm"],
  };
}

function enabledConfig(): IdentityAuthorityEnabledConfig {
  const config = loadIdentityAuthorityConfig({
    SPACEOS_IDENTITY_AUTHORITY_ISSUER: "https://identity.example.test/realms/doorstar",
    SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN: "https://kernel.example.test",
    SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH: "/run/secrets/doorstar-identity-authority.pem",
    SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID: "doorstar-identity-authority-2026-08",
  });
  if (config.mode !== "enabled") throw new Error("expected enabled test config");
  return config;
}

async function createClient(fetch: typeof globalThis.fetch, monotonicNow?: () => number) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  return createIdentityAuthorityResolverClientForTest(enabledConfig(), {
    fetch,
    environment: {},
    loadPrivateKey: async (): Promise<KeyObject> => privateKey,
    now: () => new Date("2026-08-25T12:34:56.000Z"),
    randomUuid: () => "123e4567-e89b-42d3-a456-426614174000",
    monotonicNow,
  });
}

function jsonResponse(value: unknown): Response {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

function abortAwarePendingJsonResponse(signal: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

function queuedFetch(responses: Array<Response | Error>): { fetch: typeof globalThis.fetch; calls: Array<{ input: string; init?: RequestInit }> } {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected fetch call");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
}

function decodeJwtPayload(assertion: string): Record<string, unknown> {
  const payload = assertion.split(".")[1];
  return JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as Record<string, unknown>;
}

function jsonResponseAfter(beforeBodyRead: () => void, value: unknown): Response {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  let emitted = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted) {
        controller.close();
        return;
      }
      emitted = true;
      beforeBodyRead();
      controller.enqueue(encoded);
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

function scriptedMonotonicNow(values: readonly number[]): () => number {
  const remainingValues = [...values];
  return () => remainingValues.shift() ?? values.at(-1) ?? 0;
}
