import { describe, expect, it } from "vitest";
import {
  createDoorstarHumanOidcProfile,
  matchesDoorstarHumanOidcValidationProfileSnapshot,
  snapshotDoorstarHumanOidcTransactionProfile,
  snapshotDoorstarHumanOidcValidationProfile,
} from "../src/services/identityAuthority/bff/humanOidcProfile.js";

describe("Doorstar M2B complete human OIDC profile", () => {
  it("creates an opaque factory capability with a deterministic complete-profile fingerprint", () => {
    const first = createDoorstarHumanOidcProfile(profileInput());
    const second = createDoorstarHumanOidcProfile(profileInput());
    if (first === undefined || second === undefined) throw new Error("expected valid profiles");

    const firstSnapshot = snapshotDoorstarHumanOidcTransactionProfile(first);
    const secondSnapshot = snapshotDoorstarHumanOidcTransactionProfile(second);
    expect(firstSnapshot).toEqual(secondSnapshot);
    expect(firstSnapshot?.profileDigest).toHaveLength(43);
    expect(JSON.stringify(first)).toBe("{}");
  });

  it.each([
    ["different release", { releaseId: "doorstar-trial-2026-08-26" }],
    ["different token endpoint", { tokenEndpoint: "https://identity.example.test/realms/doorstar/protocol/openid-connect/token-next" }],
    ["different JWKS endpoint", { jwksUri: "https://identity.example.test/realms/doorstar/protocol/openid-connect/certs-next" }],
    ["different product scope", { productScope: "doorstar-api-next" }],
    ["different access audience", { accessTokenAudiences: ["doorstar-api-next"] }],
    ["different access maximum lifetime", { accessTokenMaximumLifetimeSeconds: 301 }],
    ["different access payload type", { accessTokenPayloadType: "DoorstarBearer" }],
    ["different clock skew", { clockSkewSeconds: 61 }],
  ])("changes the fingerprint when the complete profile changes: %s", (_name, change) => {
    const baseline = createDoorstarHumanOidcProfile(profileInput());
    const changed = createDoorstarHumanOidcProfile({ ...profileInput(), ...change });
    if (baseline === undefined || changed === undefined) throw new Error("expected valid profiles");

    expect(snapshotDoorstarHumanOidcTransactionProfile(changed)?.profileDigest)
      .not.toBe(snapshotDoorstarHumanOidcTransactionProfile(baseline)?.profileDigest);
  });

  it.each([
    ["caller-supplied digest", { profileDigest: "A".repeat(43) }],
    ["openid is not a product scope", { productScope: "openid" }],
    ["offline access is forbidden", { productScope: "offline_access" }],
    ["caller-injected scope list", { scopes: ["doorstar-api", "openid"] }],
    ["foreign endpoint origin", { tokenEndpoint: "https://other.example.test/token" }],
    ["wrong authorized party", { accessTokenAuthorizedParty: "other-client" }],
    ["ID audience lacks client", { idTokenAudiences: ["other-client"] }],
    ["unsafe access token lifetime", { accessTokenMaximumLifetimeSeconds: 3_601 }],
    ["unknown authority projection contract", { authorityProjectionContract: "flat-v1" }],
    ["ID authority claims must be forbidden", { idTokenAuthorityClaims: "allowed" }],
  ])("fails closed for an incomplete or noncanonical profile: %s", (_name, change) => {
    expect(createDoorstarHumanOidcProfile({ ...profileInput(), ...change })).toBeUndefined();
  });

  it("does not accept an object that imitates a factory capability", () => {
    expect(snapshotDoorstarHumanOidcTransactionProfile({
      issuer: "https://identity.example.test/realms/doorstar",
      clientId: "doorstar-bff",
      redirectUri: "https://doorstar.example.test/auth/callback",
      profileDigest: "A".repeat(43),
    })).toBeUndefined();
  });

  it("binds a claimed PKCE validation snapshot to the exact factory profile fingerprint", () => {
    const profile = createDoorstarHumanOidcProfile(profileInput());
    if (profile === undefined) throw new Error("expected profile");
    const snapshot = snapshotDoorstarHumanOidcValidationProfile(profile);
    if (snapshot === undefined) throw new Error("expected profile snapshot");

    expect(matchesDoorstarHumanOidcValidationProfileSnapshot(snapshot, profile)).toBe(true);
    expect(matchesDoorstarHumanOidcValidationProfileSnapshot({
      ...snapshot,
      jwksUri: "https://identity.example.test/realms/doorstar/protocol/openid-connect/certs-next",
    }, profile)).toBe(false);
  });
});

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
