import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createIdentityAuthorityResolverClient, type IdentityAuthorityResolverClient } from "../src/services/identityAuthority/client.js";
import { loadIdentityAuthorityConfig } from "../src/services/identityAuthority/config.js";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import {
  consumeDoorstarTrustedIdentityAuthorityIssuanceCommit,
  createDoorstarIdentityBoundary,
} from "../src/services/identityAuthority/evidence.js";
import type {
  DoorstarIdentityAuthorityControlPlaneRepository,
  DoorstarIdentityAuthorityControlPlaneRepositoryFactory,
  DoorstarTrustedIdentityAuthorityIssuanceCommit,
  DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer,
  DoorstarTrustedIdentityAuthorityIssuanceSnapshot,
} from "../src/services/identityAuthority/evidence.js";
import { createDoorstarHumanJwksTextSource } from "../src/services/identityAuthority/bff/humanJwksPort.js";
import { createDoorstarHumanJwtVerifier } from "../src/services/identityAuthority/bff/humanJwtVerifier.js";
import { createDoorstarHumanOidcCodeExchangeSource } from "../src/services/identityAuthority/bff/humanOidcCodeExchangePort.js";
import { createDoorstarHumanOidcProfile } from "../src/services/identityAuthority/bff/humanOidcProfile.js";
import { createDoorstarMacService, type DoorstarMacKeyName } from "../src/services/identityAuthority/bff/mac.js";
import { createDoorstarIdentityAuthorityControlPlaneRepositoryFactory } from "../src/services/identityAuthority/bff/controlPlaneRepository.js";
import type {
  DoorstarIdentityAuthorityControlPlanePrisma,
  DoorstarIdentityAuthorityControlPlaneTransactionPrisma,
} from "../src/services/identityAuthority/bff/controlPlaneRepository.js";
import {
  createDoorstarOidcTransactionBoundary,
  type DoorstarOidcLoginTransaction,
  type DoorstarOidcTransactionRepository,
} from "../src/services/identityAuthority/bff/pkceTransaction.js";

const tenantId = "11111111-1111-1111-1111-111111111111";
const subject = "oidc|doorstar-worker-001";
const now = instant("2026-08-25T12:00:00Z");
const issuer = "https://identity.example.test/realms/doorstar";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const publicJwk = publicKey.export({ format: "jwk" });
const resolverKeyDirectory = mkdtempSync(join(tmpdir(), "doorstar-boundary-resolver-"));
const resolverKeyPath = join(resolverKeyDirectory, "resolver.pem");
writeFileSync(resolverKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8");

afterAll(() => {
  rmSync(resolverKeyDirectory, { recursive: true, force: true });
});

describe("Doorstar M2B identity boundary", () => {
  it("accepts only a genuine PKCE delivery, factory-registered JWT verifier and factory-registered fresh resolver before it hands an opaque commit to storage", async () => {
    const fixture = await createFixture();
    const headers: unknown[] = [];

    const result = await completeThroughPkce(fixture, async (claimedDelivery) => await fixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued(value) {
        headers.push(value);
      },
    }));

    expect(result.pkce).toEqual({ kind: "accepted" });
    expect(result.boundary).toEqual({ kind: "accepted" });
    expect(headers).toHaveLength(1);
    expect(headers[0]).toMatchObject({
      session: expect.stringMatching(/^__Host-doorstar-session=[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43};/u),
      csrf: expect.stringMatching(/^__Host-doorstar-csrf=[A-Za-z0-9_-]{43};/u),
    });
    expect(fixture.persisted).toHaveLength(1);
    const persisted = fixture.persisted[0]!;
    expect(persisted.evidence).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      tenantBindingId: "doorstar-instance-binding",
      tenantId,
      subject,
      capability: "edit",
    });
    expect(persisted.session).toMatchObject({
      issuedAt: now,
      expiresAt: instant("2026-08-25T12:03:00Z"),
      idTokenExpiresAt: instant("2026-08-25T12:03:00Z"),
      maximumLifetimeSeconds: 3_600,
    });
    expect(Object.keys(persisted.session).sort()).not.toContain("verifier");
    expect(Object.keys(persisted.session).sort()).not.toContain("csrf");
    expect(fixture.resolverCalls()).toBe(2);

    await expect(fixture.boundary.completeClaimedLogin({
      claimedDelivery: Object.freeze({}) as never,
      onIssued: () => undefined,
    })).resolves.toEqual({ kind: "unavailable", code: "doorstar_identity_code_exchange_unavailable" });
    expect(fixture.persisted).toHaveLength(1);
  });

  it("consumes the upstream delivery chain but persists nothing when the registered M0 client receives a denial", async () => {
    const fixture = await createFixture({ resolverMode: "denied" });
    let issued = false;

    const result = await completeThroughPkce(fixture, async (claimedDelivery) => await fixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued() {
        issued = true;
      },
    }));

    expect(result.pkce).toEqual({ kind: "accepted" });
    expect(result.boundary).toEqual({ kind: "denied", code: "doorstar_identity_evidence_denied" });
    expect(fixture.persisted).toEqual([]);
    expect(issued).toBe(false);
  });

  it("writes the genuine one-use commit through one interactive transaction with exact token-free evidence/session fields", async () => {
    const prisma = createIssuancePrisma();
    const fixture = await createFixture({
      controlPlaneRepositoryFactory: createDoorstarIdentityAuthorityControlPlaneRepositoryFactory(prisma.adapter),
    });

    const result = await completeThroughPkce(fixture, async (claimedDelivery) => await fixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued: () => undefined,
    }));

    expect(result.boundary).toEqual({ kind: "accepted" });
    expect(prisma.transactionCalls).toBe(1);
    expect(prisma.evidences).toHaveLength(1);
    expect(prisma.sessions).toHaveLength(1);
    const evidence = prisma.evidences[0]!.data as Record<string, unknown>;
    const session = prisma.sessions[0]!.data as Record<string, unknown>;
    expect(evidence).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantBindingId: "doorstar-instance-binding",
      tenantId,
      subject,
      enabledModules: ["joinerytech.door"],
      permissions: ["joinerytech.door.edit"],
    });
    expect(session).toMatchObject({
      evidenceId: evidence.id,
      tenantBindingId: evidence.tenantBindingId,
      subject: evidence.subject,
      capability: "edit",
      bindingVersion: 3n,
    });
    expect(Object.keys(evidence).sort()).not.toContain("createdAt");
    expect(Object.keys(session).sort()).not.toContain("lastValidatedAt");
    expect(Object.keys(session).sort()).not.toContain("revokedAt");
    const writeText = JSON.stringify({ evidence, session }, (_key, value) => typeof value === "bigint" ? value.toString(10) : value);
    expect(writeText).not.toMatch(/accessToken|idToken|refreshToken|authorizationCode|verifier"|csrf"/u);
  });

  it("rolls the evidence back when the real session insert fails and reports no issued login", async () => {
    const prisma = createIssuancePrisma({ failSessionCreate: true });
    const fixture = await createFixture({
      controlPlaneRepositoryFactory: createDoorstarIdentityAuthorityControlPlaneRepositoryFactory(prisma.adapter),
    });

    const result = await completeThroughPkce(fixture, async (claimedDelivery) => await fixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued: () => undefined,
    }));

    expect(result.boundary).toEqual({ kind: "unavailable", code: "doorstar_identity_persistence_unavailable" });
    expect(prisma.transactionCalls).toBe(1);
    expect(prisma.evidences).toEqual([]);
    expect(prisma.sessions).toEqual([]);
  });

  it("rejects a structural verifier or resolver look-alike before either can cause a session write", async () => {
    const fakeVerifier = Object.freeze({
      async verifyAndConsume() {
        throw new Error("must not run");
      },
    });
    const fixture = await createFixture({ humanJwtVerifier: fakeVerifier as never });
    const verifierResult = await completeThroughPkce(fixture, async (claimedDelivery) => await fixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued: () => undefined,
    }));
    expect(verifierResult.boundary).toEqual({ kind: "denied", code: "doorstar_identity_human_jwt_denied" });
    expect(fixture.persisted).toEqual([]);

    const fakeResolver = Object.freeze({
      async resolve() {
        throw new Error("must not run");
      },
    });
    const resolverFixture = await createFixture({ resolver: fakeResolver as never });
    const resolverResult = await completeThroughPkce(resolverFixture, async (claimedDelivery) => await resolverFixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued: () => undefined,
    }));
    expect(resolverResult.boundary).toEqual({ kind: "unavailable", code: "doorstar_identity_evidence_unavailable" });
    expect(resolverFixture.persisted).toEqual([]);
  });

  it("reports storage failure without issuing a browser cookie and does not turn an accepted code-exchange handoff into acceptance", async () => {
    const fixture = await createFixture({ persistFailure: new Error("database detail") });
    let issued = false;

    const result = await completeThroughPkce(fixture, async (claimedDelivery) => await fixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued() {
        issued = true;
      },
    }));

    expect(result.pkce).toEqual({ kind: "accepted" });
    expect(result.boundary).toEqual({ kind: "unavailable", code: "doorstar_identity_persistence_unavailable" });
    expect(issued).toBe(false);
  });

  it("does not report accepted when the post-persistence cookie handoff fails", async () => {
    const fixture = await createFixture();

    const result = await completeThroughPkce(fixture, async (claimedDelivery) => await fixture.boundary.completeClaimedLogin({
      claimedDelivery,
      onIssued() {
        throw new Error("response write failed");
      },
    }));

    expect(result.pkce).toEqual({ kind: "accepted" });
    expect(result.boundary).toEqual({ kind: "unavailable", code: "doorstar_identity_session_delivery_failed" });
    expect(fixture.persisted).toHaveLength(1);
  });
});

async function createFixture(options: {
  readonly resolverMode?: "resolved" | "denied";
  readonly persistFailure?: Error;
  readonly humanJwtVerifier?: unknown;
  readonly resolver?: unknown;
  readonly controlPlaneRepositoryFactory?: DoorstarIdentityAuthorityControlPlaneRepositoryFactory;
} = {}) {
  const profile = createProfile();
  let nonce: string | undefined;
  const codeExchangeSource = createDoorstarHumanOidcCodeExchangeSource({
    profile,
    loader: Object.freeze({
      async exchange() {
        if (nonce === undefined) throw new Error("missing OIDC nonce");
        return Object.freeze({ accessToken: accessToken(), idToken: idToken(nonce) });
      },
    }),
  });
  if (codeExchangeSource === undefined) throw new Error("expected code source");
  const jwksTextSource = createDoorstarHumanJwksTextSource({
    profile,
    loader: Object.freeze({ async load() { return Buffer.from(jwksText(), "utf8"); } }),
  });
  const actualVerifier = createDoorstarHumanJwtVerifier({ profile, jwksTextSource, now: () => now });
  if (actualVerifier === undefined) throw new Error("expected JWT verifier");
  const actualResolver = await createRegisteredResolver(options.resolverMode ?? "resolved");
  const mac = createDoorstarMacService(keyProvider());
  const persisted: DoorstarTrustedIdentityAuthorityIssuanceSnapshot[] = [];
  const controlPlaneRepositoryFactory = options.controlPlaneRepositoryFactory
    ?? createControlPlaneRepositoryFactory(persisted, options.persistFailure);
  const boundary = createDoorstarIdentityBoundary({
    codeExchangeSource,
    humanJwtVerifier: options.humanJwtVerifier ?? actualVerifier,
    resolver: options.resolver ?? actualResolver.client,
    controlPlaneRepositoryFactory,
    mac,
    now: () => now,
    maximumSessionLifetimeSeconds: 3_600,
    randomBytes: sequentialRandomBytes(),
    randomUuid: sequentialUuids(),
  });
  if (boundary === undefined) throw new Error("expected boundary");
  const pkceBoundary = createDoorstarOidcTransactionBoundary({ mac, profile });
  if (pkceBoundary === undefined) throw new Error("expected PKCE boundary");
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
    pkceBoundary,
    repository,
    persisted,
    resolverCalls: actualResolver.calls,
    setNonce(value: string): void {
      nonce = value;
    },
    transactionSelector(): string {
      const [transaction] = rows.values();
      if (transaction === undefined) throw new Error("expected transaction");
      return transaction.selector;
    },
  });
}

async function createRegisteredResolver(mode: "resolved" | "denied"): Promise<{
  readonly client: IdentityAuthorityResolverClient;
  readonly calls: () => number;
}> {
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ access_token: "m2m-access-token", token_type: "Bearer", expires_in: 300 });
    if (calls === 2 && mode === "denied") return new Response(null, { status: 404 });
    if (calls === 2) return jsonResponse({
      schemaVersion: "spaceos.online-identity-authority/v1",
      subject,
      tenantId,
      tenantStatus: "active",
      membershipStatus: "active",
      membershipVersion: 7,
      projectionVersion: 11,
      acceptTokensIssuedAtOrAfter: "2026-08-25T11:59:00Z",
      enabledModules: ["joinerytech.door"],
      permissions: ["joinerytech.door.edit"],
    });
    throw new Error("unexpected resolver fetch");
  };
  const config = loadIdentityAuthorityConfig({
    SPACEOS_IDENTITY_AUTHORITY_ISSUER: issuer,
    SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN: "https://kernel.example.test",
    SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH: resolverKeyPath,
    SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID: "doorstar-identity-authority-2026-08",
  });
  if (config.mode !== "enabled") throw new Error("expected resolver config");
  const originalFetch = globalThis.fetch;
  let client: IdentityAuthorityResolverClient;
  try {
    globalThis.fetch = fetch;
    client = await createIdentityAuthorityResolverClient(config);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return Object.freeze({ client, calls: () => calls });
}

function createControlPlaneRepositoryFactory(
  persisted: DoorstarTrustedIdentityAuthorityIssuanceSnapshot[],
  persistFailure: Error | undefined,
): DoorstarIdentityAuthorityControlPlaneRepositoryFactory {
  return Object.freeze({
    create(commitConsumer: DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer): DoorstarIdentityAuthorityControlPlaneRepository {
      return Object.freeze({
        async loadIdentityAuthorityBinding() {
          return Object.freeze({
            id: "doorstar-instance-binding",
            tenantId,
            status: "ACTIVE" as const,
            bindingVersion: 3n,
            disabledAt: null,
            disabledReason: null,
          });
        },
        async persistAcceptedEvidenceAndSession(commit: DoorstarTrustedIdentityAuthorityIssuanceCommit) {
          const consumed = await consumeDoorstarTrustedIdentityAuthorityIssuanceCommit(commitConsumer, commit, async (snapshot) => {
            if (persistFailure !== undefined) throw persistFailure;
            persisted.push(snapshot);
          });
          return consumed ? "persisted" as const : "not_persisted" as const;
        },
      });
    },
  });
}

function createIssuancePrisma(options: { readonly failSessionCreate?: boolean } = {}) {
  const evidences: { readonly data: unknown; readonly select: unknown }[] = [];
  const sessions: { readonly data: unknown }[] = [];
  let transactionCalls = 0;
  const adapter: DoorstarIdentityAuthorityControlPlanePrisma = {
    doorstarInstanceTenantBinding: {
      async findFirst() {
        return Object.freeze({
          id: "doorstar-instance-binding",
          tenantId,
          status: "ACTIVE",
          bindingVersion: 3n,
          disabledAt: null,
          disabledReason: null,
        });
      },
    },
    async $transaction<T>(operation: (transaction: DoorstarIdentityAuthorityControlPlaneTransactionPrisma) => Promise<T>): Promise<T> {
      transactionCalls += 1;
      const stagedEvidence: { readonly data: unknown; readonly select: unknown }[] = [];
      const stagedSessions: { readonly data: unknown }[] = [];
      const transaction: DoorstarIdentityAuthorityControlPlaneTransactionPrisma = {
        identityAuthorityEvidence: {
          async create(input) {
            stagedEvidence.push(input);
            const data = input.data as { readonly id: string; readonly tenantBindingId: string };
            return Object.freeze({ id: data.id, tenantBindingId: data.tenantBindingId });
          },
        },
        doorstarSession: {
          async create(input) {
            if (options.failSessionCreate) throw new Error("session insert failed");
            stagedSessions.push(input);
            return Object.freeze({});
          },
        },
      };
      const result = await operation(transaction);
      evidences.push(...stagedEvidence);
      sessions.push(...stagedSessions);
      return result;
    },
  };
  return Object.freeze({
    adapter,
    evidences,
    sessions,
    get transactionCalls(): number {
      return transactionCalls;
    },
  });
}

async function completeThroughPkce(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  complete: (delivery: Parameters<Parameters<typeof fixture.pkceBoundary.complete>[0]["onClaimed"]>[0]) => Promise<unknown>,
) {
  let plan: { readonly authorizationRequestUri: string } | undefined;
  const start = await fixture.pkceBoundary.begin({
    repository: fixture.repository,
    now,
    maximumLifetimeSeconds: 300,
    randomBytes: () => Buffer.alloc(32, 9),
    onStarted(candidate) {
      plan = candidate;
    },
  });
  if (start.kind !== "accepted" || plan === undefined) throw new Error("expected PKCE plan");
  const authorizationRequest = new URL(plan.authorizationRequestUri);
  const state = authorizationRequest.searchParams.get("state");
  const nonce = authorizationRequest.searchParams.get("nonce");
  if (state === null || nonce === null) throw new Error("expected PKCE state and nonce");
  fixture.setNonce(nonce);
  let boundary: unknown;
  const pkce = await fixture.pkceBoundary.complete({
    repository: fixture.repository,
    rawQuery: "code=authorization-code-123&state=" + state,
    transactionCookieSelector: fixture.transactionSelector(),
    now: instant("2026-08-25T12:01:00Z"),
    async onClaimed(delivery) {
      boundary = await complete(delivery);
    },
  });
  return Object.freeze({ pkce, boundary });
}

function sequentialRandomBytes() {
  let value = 0;
  return (size: number): Uint8Array => Buffer.alloc(size, ++value);
}

function sequentialUuids() {
  const values = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ];
  let index = 0;
  return (): string => values[index++] ?? "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
}

function keyProvider() {
  const key = Buffer.from("current-key", "utf8");
  return Object.freeze({
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
  });
}

function createProfile() {
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
  });
  if (profile === undefined) throw new Error("expected profile");
  return profile;
}

function accessToken(): string {
  return signCompact({
    iss: issuer,
    sub: subject,
    aud: "doorstar-api",
    azp: "doorstar-bff",
    iat: now.epochSeconds - 60,
    nbf: now.epochSeconds - 60,
    exp: now.epochSeconds + 240,
    typ: "Bearer",
    spaceos_tenants: [{
      tenant_id: tenantId,
      permissions: ["joinerytech.door.edit"],
      enabled_modules: ["joinerytech.door"],
    }],
    spaceos_membership_version: 7,
    spaceos_projection_version: 11,
  });
}

function idToken(nonce: string): string {
  return signCompact({
    iss: issuer,
    sub: subject,
    aud: "doorstar-bff",
    azp: "doorstar-bff",
    iat: now.epochSeconds - 60,
    nbf: now.epochSeconds - 60,
    exp: now.epochSeconds + 180,
    nonce,
  });
}

function signCompact(payload: unknown): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "doorstar-rs256-1" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const input = header + "." + body;
  return input + "." + sign("RSA-SHA256", Buffer.from(input, "ascii"), privateKey).toString("base64url");
}

function jwksText(): string {
  return JSON.stringify({
    keys: [{ kid: "doorstar-rs256-1", kty: "RSA", use: "sig", alg: "RS256", n: publicJwk.n, e: publicJwk.e }],
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function instant(value: string) {
  return parseCanonicalUtcInstant(value);
}
