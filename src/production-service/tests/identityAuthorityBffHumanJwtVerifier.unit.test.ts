import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import {
  createDoorstarHumanOidcProfile,
  snapshotDoorstarHumanOidcValidationProfile,
} from "../src/services/identityAuthority/bff/humanOidcProfile.js";
import { createDoorstarHumanJwksTextSource } from "../src/services/identityAuthority/bff/humanJwksPort.js";
import { createDoorstarHumanJwtVerifier } from "../src/services/identityAuthority/bff/humanJwtVerifier.js";

const issuer = "https://identity.example.test/realms/doorstar";
const tenantId = "11111111-1111-1111-1111-111111111111";
const subject = "doorstar.operator";
const now = parseCanonicalUtcInstant("2026-08-25T12:00:00Z");
const expectedNonce = Buffer.alloc(32, 7).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const publicJwk = publicKey.export({ format: "jwk" });

describe("Doorstar M2B strict human JWT/JWKS verifier", () => {
  it("has no runtime decoder, JWK, raw-token or proof-mint export", async () => {
    const module = await import("../src/services/identityAuthority/bff/humanJwtVerifier.js");

    expect(Object.keys(module)).toEqual(["createDoorstarHumanJwtVerifier"]);
  });

  it("accepts a release-pinned RS256 access/ID pair and delivers only token-free access authority facts", async () => {
    const verifier = createVerifier();
    if (verifier === undefined) throw new Error("expected verifier");
    let delivered: unknown;
    let identityJson = "not-called";

    const result = await verifier.verifyAndConsume(tokenInput(), async (delivery) => {
      identityJson = JSON.stringify(delivery.identity);
      await delivery.consume((facts) => {
        delivered = facts;
      });
    });

    expect(result).toEqual({ kind: "accepted" });
    expect(JSON.stringify(result)).toBe('{"kind":"accepted"}');
    expect(identityJson).toBe("{}");
    expect(delivered).toMatchObject({
      subject,
      tenantId,
      membershipVersion: 7n,
      projectionVersion: 11n,
      enabledModules: ["joinerytech.door"],
      permissions: ["joinerytech.door.admin"],
      accessTokenIssuedAt: parseCanonicalUtcInstant("2026-08-25T11:59:00Z"),
      accessTokenExpiresAt: parseCanonicalUtcInstant("2026-08-25T12:04:00Z"),
      idTokenExpiresAt: parseCanonicalUtcInstant("2026-08-25T12:03:00Z"),
    });
  });

  it("requires the callback to consume the opaque identity inside the validation closure", async () => {
    const verifier = createVerifier();
    if (verifier === undefined) throw new Error("expected verifier");
    let captured: { consume: (consumer: (facts: unknown) => void) => Promise<void> } | undefined;

    await expect(verifier.verifyAndConsume(tokenInput(), (delivery) => {
      captured = delivery;
    })).resolves.toEqual({ kind: "unavailable", code: "doorstar_human_jwt_delivery_unconsumed" });
    await expect(captured?.consume(() => undefined)).rejects.toThrow("doorstar_human_jwt_delivery_invalid");
  });

  it.each([
    ["wrong nonce", tokenInput({ expectedNonce: Buffer.alloc(32, 8).toString("base64url") }), "doorstar_human_jwt_binding_invalid"],
    ["different ID subject", tokenInput({ idToken: idToken({ sub: "other.user" }) }), "doorstar_human_jwt_binding_invalid"],
    ["wrong access audience", tokenInput({ accessToken: accessToken({ aud: "other-api" }) }), "doorstar_human_jwt_claims_invalid"],
    ["authority claim in ID token", tokenInput({ idToken: idToken({ spaceos_tenants: [] }) }), "doorstar_human_jwt_claims_invalid"],
    ["too-long access lifetime", tokenInput({ accessToken: accessToken({ exp: now.epochSeconds + 301 }) }), "doorstar_human_jwt_claims_invalid"],
    ["future issue outside clock skew", tokenInput({ accessToken: accessToken({ iat: now.epochSeconds + 61 }) }), "doorstar_human_jwt_claims_invalid"],
    ["expired ID at the skew boundary", tokenInput({ idToken: idToken({ exp: now.epochSeconds - 60 }) }), "doorstar_human_jwt_claims_invalid"],
    ["wrong profile-pinned access payload type", tokenInput({ accessToken: accessToken({ typ: "Other" }) }), "doorstar_human_jwt_claims_invalid"],
  ])("rejects a token binding or claim drift: %s", async (_name, input, code) => {
    const verifier = createVerifier();
    if (verifier === undefined) throw new Error("expected verifier");
    let called = false;

    await expect(verifier.verifyAndConsume(input, () => {
      called = true;
    })).resolves.toEqual({ kind: "denied", code });
    expect(called).toBe(false);
  });

  it("rejects a noncanonical NumericDate wire representation before it can become a number", async () => {
    const verifier = createVerifier();
    if (verifier === undefined) throw new Error("expected verifier");
    const malformedAccessPayload = JSON.stringify(accessPayload()).replace(`"iat":${now.epochSeconds - 60}`, `"iat":${now.epochSeconds - 60}.0`);
    const input = tokenInput({ accessToken: signCompactJson({ alg: "RS256", typ: "JWT", kid: "doorstar-rs256-1" }, malformedAccessPayload) });

    await expect(verifier.verifyAndConsume(input, async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "denied", code: "doorstar_human_jwt_claims_invalid" });
  });

  it("rejects full-depth duplicate JSON keys in both a JWT payload and JWKS source", async () => {
    const duplicateTenantPayload = JSON.stringify(accessPayload()).replace(
      '"enabled_modules":["joinerytech.door"]',
      '"enabled_modules":["joinerytech.door"],"enabled_modules":["joinerytech.door"]',
    );
    const verifier = createVerifier();
    if (verifier === undefined) throw new Error("expected verifier");
    await expect(verifier.verifyAndConsume(tokenInput({
      accessToken: signCompactJson({ alg: "RS256", typ: "JWT", kid: "doorstar-rs256-1" }, duplicateTenantPayload),
    }), async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "denied", code: "doorstar_human_jwt_compact_invalid" });

    const duplicateJwks = jwksText().replace('"n":"' + publicJwk.n + '"', '"n":"' + publicJwk.n + '","n":"' + publicJwk.n + '"');
    const jwksVerifier = createVerifier({ jwksText: duplicateJwks });
    if (jwksVerifier === undefined) throw new Error("expected verifier");
    await expect(jwksVerifier.verifyAndConsume(tokenInput(), async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "unavailable", code: "doorstar_human_jwt_jwks_unavailable" });
  });

  it.each([
    ["padded segment", tokenInput({ accessToken: accessToken() + "=" }), "doorstar_human_jwt_compact_invalid"],
    ["none algorithm", tokenInput({ accessToken: signCompactJson({ alg: "none", typ: "JWT", kid: "doorstar-rs256-1" }, JSON.stringify(accessPayload())) }), "doorstar_human_jwt_compact_invalid"],
    ["forbidden JOSE jku", tokenInput({ accessToken: signCompactJson({ alg: "RS256", typ: "JWT", kid: "doorstar-rs256-1", jku: "https://attacker.example/jwks" }, JSON.stringify(accessPayload())) }), "doorstar_human_jwt_compact_invalid"],
    ["unknown kid", tokenInput({ accessToken: accessToken({}, "unknown-kid") }), "doorstar_human_jwt_key_unknown"],
    ["wrong RSA signature", tokenInput({ accessToken: signCompact(accessPayload(), "doorstar-rs256-1", generateKeyPairSync("rsa", { modulusLength: 2_048 }).privateKey) }), "doorstar_human_jwt_signature_invalid"],
  ])("fails closed for JWT or key selection attacks: %s", async (_name, input, code) => {
    const verifier = createVerifier();
    if (verifier === undefined) throw new Error("expected verifier");
    await expect(verifier.verifyAndConsume(input, async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "denied", code });
  });

  it("rejects a weak or malformed pinned JWKS instead of selecting a fallback key", async () => {
    const weakPair = generateKeyPairSync("rsa", { modulusLength: 1_024 });
    const weakJwk = weakPair.publicKey.export({ format: "jwk" });
    const verifier = createVerifier({
      jwksText: JSON.stringify({
        keys: [{ kid: "doorstar-rs256-1", kty: "RSA", use: "sig", alg: "RS256", n: weakJwk.n, e: weakJwk.e }],
      }),
    });
    if (verifier === undefined) throw new Error("expected verifier");

    await expect(verifier.verifyAndConsume(tokenInput(), async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "unavailable", code: "doorstar_human_jwt_jwks_unavailable" });
  });

  it("rejects a globally duplicated JWKS kid even when one matching key is otherwise valid", async () => {
    const duplicateKidJwks = JSON.stringify({
      keys: [
        { kid: "doorstar-rs256-1", kty: "RSA", use: "sig", alg: "RS256", n: publicJwk.n, e: publicJwk.e },
        { kid: "doorstar-rs256-1", kty: "RSA", use: "sig", alg: "RS256", n: publicJwk.n, e: publicJwk.e },
      ],
    });
    const verifier = createVerifier({ jwksText: duplicateKidJwks });
    if (verifier === undefined) throw new Error("expected verifier");

    await expect(verifier.verifyAndConsume(tokenInput(), async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "unavailable", code: "doorstar_human_jwt_jwks_unavailable" });
  });

  it("rejects private or non-RSA JWKS fields instead of accepting a provider-specific variant", async () => {
    const privateShape = JSON.stringify({
      keys: [{ kid: "doorstar-rs256-1", kty: "RSA", use: "sig", alg: "RS256", n: publicJwk.n, e: publicJwk.e, d: "private" }],
    });
    const ecShape = JSON.stringify({
      keys: [{ kid: "doorstar-rs256-1", kty: "EC", use: "sig", alg: "RS256", n: publicJwk.n, e: publicJwk.e }],
    });
    for (const jwksText of [privateShape, ecShape]) {
      const verifier = createVerifier({ jwksText });
      if (verifier === undefined) throw new Error("expected verifier");
      await expect(verifier.verifyAndConsume(tokenInput(), async (delivery) => {
        await delivery.consume(() => undefined);
      })).resolves.toEqual({ kind: "unavailable", code: "doorstar_human_jwt_jwks_unavailable" });
    }
  });

  it("keeps a JWKS transport failure separate from identity denial", async () => {
    const profile = createProfile();
    const jwksTextSource = createDoorstarHumanJwksTextSource({
      profile,
      loader: Object.freeze({ load: async () => { throw new Error("offline"); } }),
    });
    const verifier = createDoorstarHumanJwtVerifier({
      profile,
      jwksTextSource,
      now: () => now,
    });
    if (verifier === undefined) throw new Error("expected verifier");

    await expect(verifier.verifyAndConsume(tokenInput(), async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "unavailable", code: "doorstar_human_jwt_jwks_unavailable" });
  });

  it("requires the opaque JWKS source and claimed callback snapshot to match the verifier profile", async () => {
    const profile = createProfile({ releaseId: "doorstar-trial-2026-08-26" });
    const foreignProfile = createProfile();
    const foreignSource = createDoorstarHumanJwksTextSource({
      profile: foreignProfile,
      loader: Object.freeze({ load: async () => Buffer.from(jwksText(), "utf8") }),
    });
    expect(createDoorstarHumanJwtVerifier({
      profile,
      jwksTextSource: foreignSource,
      now: () => now,
    })).toBeUndefined();

    const source = createDoorstarHumanJwksTextSource({
      profile,
      loader: Object.freeze({ load: async () => Buffer.from(jwksText(), "utf8") }),
    });
    const verifier = createDoorstarHumanJwtVerifier({ profile, jwksTextSource: source, now: () => now });
    if (verifier === undefined) throw new Error("expected verifier");
    await expect(verifier.verifyAndConsume(tokenInput({ claimedProfile: claimedProfile() }), async (delivery) => {
      await delivery.consume(() => undefined);
    })).resolves.toEqual({ kind: "denied", code: "doorstar_human_jwt_profile_mismatch" });
  });
});

function createVerifier(options: { readonly jwksText?: string } = {}) {
  const profile = createProfile();
  const jwksTextSource = createDoorstarHumanJwksTextSource({
    profile,
    loader: Object.freeze({ load: async () => Buffer.from(options.jwksText ?? jwksText(), "utf8") }),
  });
  return createDoorstarHumanJwtVerifier({
    profile,
    jwksTextSource,
    now: () => now,
  });
}

function createProfile(change: Record<string, unknown> = {}) {
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
  if (profile === undefined) throw new Error("expected valid profile");
  return profile;
}

function tokenInput(change: Partial<{
  accessToken: string;
  idToken: string;
  expectedNonce: string;
  claimedProfile: unknown;
}> = {}) {
  return {
    accessToken: change.accessToken ?? accessToken(),
    idToken: change.idToken ?? idToken(),
    expectedNonce: change.expectedNonce ?? expectedNonce,
    claimedProfile: change.claimedProfile ?? claimedProfile(),
  };
}

function claimedProfile() {
  const snapshot = snapshotDoorstarHumanOidcValidationProfile(createProfile());
  if (snapshot === undefined) throw new Error("expected profile snapshot");
  return snapshot;
}

function accessToken(change: Record<string, unknown> = {}, kid = "doorstar-rs256-1", signingKey: KeyObject = privateKey): string {
  return signCompact({ ...accessPayload(), ...change }, kid, signingKey);
}

function idToken(change: Record<string, unknown> = {}, kid = "doorstar-rs256-1", signingKey: KeyObject = privateKey): string {
  return signCompact({ ...idPayload(), ...change }, kid, signingKey);
}

function accessPayload() {
  return {
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
      permissions: ["joinerytech.door.admin"],
      enabled_modules: ["joinerytech.door"],
    }],
    spaceos_membership_version: 7,
    spaceos_projection_version: 11,
  };
}

function idPayload() {
  return {
    iss: issuer,
    sub: subject,
    aud: "doorstar-bff",
    azp: "doorstar-bff",
    iat: now.epochSeconds - 60,
    nbf: now.epochSeconds - 60,
    exp: now.epochSeconds + 180,
    nonce: expectedNonce,
  };
}

function signCompact(payload: unknown, kid: string, signingKey: KeyObject): string {
  return signCompactJson({ alg: "RS256", typ: "JWT", kid }, JSON.stringify(payload), signingKey);
}

function signCompactJson(header: unknown, payloadJson: string, signingKey: KeyObject = privateKey): string {
  const encodedHeader = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
  const encodedPayload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signingInput = encodedHeader + "." + encodedPayload;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput, "ascii"), signingKey).toString("base64url");
  return signingInput + "." + signature;
}

function jwksText(): string {
  return JSON.stringify({
    keys: [{ kid: "doorstar-rs256-1", kty: "RSA", use: "sig", alg: "RS256", n: publicJwk.n, e: publicJwk.e }],
  });
}
