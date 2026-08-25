import { describe, expect, it } from "vitest";
import { loadIdentityAuthorityConfig } from "../src/services/identityAuthority/config.js";

const completeEnvironment: NodeJS.ProcessEnv = {
  SPACEOS_IDENTITY_AUTHORITY_ISSUER: "https://identity.example.test/realms/doorstar",
  SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN: "https://kernel.example.test",
  SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH: "/run/secrets/doorstar-identity-authority.pem",
  SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID: "doorstar-identity-authority-2026-08",
};

describe("loadIdentityAuthorityConfig", () => {
  it("is disabled only when every setting is absent", () => {
    expect(loadIdentityAuthorityConfig({})).toEqual({ mode: "disabled" });
    expect(loadIdentityAuthorityConfig({
      SPACEOS_IDENTITY_AUTHORITY_ISSUER: " ",
      SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN: "",
      SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH: "",
      SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID: "",
    })).toEqual({ mode: "disabled" });
  });

  it("rejects partial privileged configuration", () => {
    expect(() => loadIdentityAuthorityConfig({
      SPACEOS_IDENTITY_AUTHORITY_ISSUER: completeEnvironment.SPACEOS_IDENTITY_AUTHORITY_ISSUER,
    })).toThrow("incomplete_identity_authority_configuration");
  });

  it("derives only the pinned token endpoint and resolver URL", () => {
    expect(loadIdentityAuthorityConfig(completeEnvironment)).toEqual({
      mode: "enabled",
      issuer: "https://identity.example.test/realms/doorstar",
      tokenEndpoint: "https://identity.example.test/realms/doorstar/protocol/openid-connect/token",
      kernelOrigin: "https://kernel.example.test",
      resolverUrl: "https://kernel.example.test/api/internal/identity-authority/resolve",
      privateKeyPath: "/run/secrets/doorstar-identity-authority.pem",
      privateKeyKid: "doorstar-identity-authority-2026-08",
      clientId: "doorstar-identity-authority",
      scope: "identity-authority.resolve",
    });
  });

  it.each([
    ["SPACEOS_IDENTITY_AUTHORITY_ISSUER", "http://identity.example.test/realms/doorstar"],
    ["SPACEOS_IDENTITY_AUTHORITY_ISSUER", " https://identity.example.test/realms/doorstar"],
    ["SPACEOS_IDENTITY_AUTHORITY_ISSUER", "https://identity.example.test/realms/doorstar/"],
    ["SPACEOS_IDENTITY_AUTHORITY_ISSUER", "https://identity.example.test/realms/doorstar?next=bad"],
    ["SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN", "https://kernel.example.test/path"],
    ["SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN", "https://kernel.example.test/path/"],
    ["SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN", "https://kernel.example.test/%2f"],
    ["SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID", "bad kid"],
  ] as const)("fails closed for noncanonical %s", (key, value) => {
    expect(() => loadIdentityAuthorityConfig({ ...completeEnvironment, [key]: value })).toThrow("invalid_identity_authority");
  });
});
