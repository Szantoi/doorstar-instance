import { describe, expect, it, vi } from "vitest";
import { createDoorstarHumanOidcProfile, snapshotDoorstarHumanOidcValidationProfile } from "../src/services/identityAuthority/bff/humanOidcProfile.js";
import {
  createDoorstarHumanJwksTextSource,
  DOORSTAR_HUMAN_JWKS_DEADLINE_MILLISECONDS,
  DOORSTAR_HUMAN_JWKS_MAXIMUM_RESPONSE_BYTES,
  loadDoorstarHumanJwksText,
  type DoorstarHumanJwksLoadRequest,
} from "../src/services/identityAuthority/bff/humanJwksPort.js";

describe("Doorstar M2B profile-bound JWKS source port", () => {
  it("passes only the exact profile-derived URI binding, abort signal and pre-materialization byte cap", async () => {
    const profile = createProfile();
    const snapshot = snapshotDoorstarHumanOidcValidationProfile(profile);
    if (snapshot === undefined) throw new Error("expected profile snapshot");
    let request: DoorstarHumanJwksLoadRequest | undefined;
    const source = createDoorstarHumanJwksTextSource({
      profile,
      loader: createLoader(async (input) => {
        request = input;
        return Buffer.from('{"keys":[]}', "utf8");
      }),
    });
    if (source === undefined) throw new Error("expected source");

    await expect(loadDoorstarHumanJwksText(source, snapshot)).resolves.toEqual(Buffer.from('{"keys":[]}', "utf8"));
    expect(request).toMatchObject({
      releaseId: snapshot.releaseId,
      issuer: snapshot.issuer,
      jwksUri: snapshot.jwksUri,
      profileDigest: snapshot.profileDigest,
      maximumResponseBytes: DOORSTAR_HUMAN_JWKS_MAXIMUM_RESPONSE_BYTES,
    });
    expect(request?.signal.aborted).toBe(true);
  });

  it("fails closed for a foreign profile binding and an oversized completed body", async () => {
    const profile = createProfile();
    const foreignProfile = createProfile({ releaseId: "doorstar-trial-2026-08-26" });
    const snapshot = snapshotDoorstarHumanOidcValidationProfile(profile);
    if (snapshot === undefined) throw new Error("expected profile snapshot");
    let calls = 0;
    const foreignSource = createDoorstarHumanJwksTextSource({
      profile: foreignProfile,
      loader: createLoader(async () => {
        calls += 1;
        return Buffer.from('{"keys":[]}', "utf8");
      }),
    });
    if (foreignSource === undefined) throw new Error("expected source");
    await expect(loadDoorstarHumanJwksText(foreignSource, snapshot)).resolves.toBeUndefined();
    expect(calls).toBe(0);

    const oversizedSource = createDoorstarHumanJwksTextSource({
      profile,
      loader: createLoader(async () => new Uint8Array(DOORSTAR_HUMAN_JWKS_MAXIMUM_RESPONSE_BYTES + 1)),
    });
    if (oversizedSource === undefined) throw new Error("expected source");
    await expect(loadDoorstarHumanJwksText(oversizedSource, snapshot)).resolves.toBeUndefined();
  });

  it("times out and aborts a hanging loader instead of waiting indefinitely", async () => {
    vi.useFakeTimers();
    try {
      const profile = createProfile();
      const snapshot = snapshotDoorstarHumanOidcValidationProfile(profile);
      if (snapshot === undefined) throw new Error("expected profile snapshot");
      let signal: AbortSignal | undefined;
      const source = createDoorstarHumanJwksTextSource({
        profile,
        loader: createLoader(async (input) => {
          signal = input.signal;
          return await new Promise<Uint8Array>(() => undefined);
        }),
      });
      if (source === undefined) throw new Error("expected source");

      const pending = loadDoorstarHumanJwksText(source, snapshot);
      await vi.advanceTimersByTimeAsync(DOORSTAR_HUMAN_JWKS_DEADLINE_MILLISECONDS);
      await expect(pending).resolves.toBeUndefined();
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

function createLoader(
  load: (input: DoorstarHumanJwksLoadRequest) => Promise<Uint8Array>,
) {
  return Object.freeze({ load });
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
