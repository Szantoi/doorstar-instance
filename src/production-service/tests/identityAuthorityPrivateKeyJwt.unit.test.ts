import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadIdentityAuthorityConfig, type IdentityAuthorityEnabledConfig } from "../src/services/identityAuthority/config.js";
import { CLIENT_ASSERTION_LIFETIME_SECONDS, createPrivateKeyJwt, requireRsaPrivateKey } from "../src/services/identityAuthority/privateKeyJwt.js";

const fixedNow = new Date("2026-08-25T12:34:56.000Z");
const fixedJti = "123e4567-e89b-42d3-a456-426614174000";

describe("createPrivateKeyJwt", () => {
  it("creates a verifiable short-lived RS256 Keycloak assertion", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
    const assertion = createPrivateKeyJwt(enabledConfig(), privateKey, {
      now: () => fixedNow,
      randomUuid: () => fixedJti,
    });
    const [encodedHeader, encodedPayload, encodedSignature] = assertion.split(".");
    const header = decodeJson(encodedHeader!);
    const payload = decodeJson(encodedPayload!);

    expect(header).toEqual({ alg: "RS256", typ: "JWT", kid: "doorstar-identity-authority-2026-08" });
    expect(payload).toEqual({
      iss: "doorstar-identity-authority",
      sub: "doorstar-identity-authority",
      aud: "https://identity.example.test/realms/doorstar/protocol/openid-connect/token",
      iat: 1_787_661_296,
      nbf: 1_787_661_291,
      exp: 1_787_661_296 + CLIENT_ASSERTION_LIFETIME_SECONDS,
      jti: fixedJti,
    });
    expect(verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
      publicKey,
      Buffer.from(encodedSignature!, "base64url"),
    )).toBe(true);
  });

  it("rejects a non-RSA client key before it can be used", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(() => requireRsaPrivateKey(privateKey)).toThrow("identity_authority_private_key_must_be_rsa_2048_or_stronger");
  });
});

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

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}
