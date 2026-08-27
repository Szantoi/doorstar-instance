import { createHash } from "node:crypto";
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { describe, expect, it } from "vitest";
import {
  NodeOidcAuthorizationClient,
  type OidcTokenEndpointFetch,
} from "../src/index.js";
import { testConfig } from "./testDoubles.js";

const now = new Date("2026-08-27T10:00:00.000Z");
const nonce = `nonce_${"n".repeat(40)}`;
const expectedNonceHash = createHash("sha256").update(nonce, "utf8").digest("hex");
const codeVerifier = `verifier_${"v".repeat(40)}`;

describe("NodeOidcAuthorizationClient", () => {
  it("exchanges code and returns only a signed, nonce-bound issuer and subject", async () => {
    const signed = await signedToken();
    const requests: Array<Readonly<{ url: string; body: string; authorization: string }>> = [];
    const client = new NodeOidcAuthorizationClient(testConfig, {
      now: () => now,
      jwks: signed.jwks,
      fetch: successfulTokenFetch(signed.token, requests),
    });

    const identity = await client.redeemAuthorizationCode({
      code: "authorization-code",
      redirectUri: testConfig.oidc.redirectUri,
      codeVerifier,
      expectedNonceHash,
    });

    expect(identity).toEqual({
      issuer: testConfig.oidc.issuer,
      subject: "oidc-subject-001",
    });
    expect(requests).toEqual([
      expect.objectContaining({
        url: testConfig.oidc.tokenEndpoint,
        body: expect.stringContaining("grant_type=authorization_code"),
        authorization: expect.stringMatching(/^Basic /),
      }),
    ]);
    expect(requests[0].body).toContain(`code_verifier=${codeVerifier}`);
    expect(JSON.stringify(identity)).not.toContain("access-token");
  });

  it("rejects a signed ID token whose nonce does not match the persisted hash", async () => {
    const signed = await signedToken({ nonce: `different_${"n".repeat(40)}` });
    const client = new NodeOidcAuthorizationClient(testConfig, {
      now: () => now,
      jwks: signed.jwks,
      fetch: successfulTokenFetch(signed.token),
    });

    await expect(client.redeemAuthorizationCode({
      code: "authorization-code",
      redirectUri: testConfig.oidc.redirectUri,
      codeVerifier,
      expectedNonceHash,
    })).rejects.toThrow("pilot_oidc_nonce_mismatch");
  });

  it("requires azp when a signed ID token carries more than one audience", async () => {
    const signed = await signedToken({ audience: [testConfig.oidc.clientId, "other-client"] });
    const client = new NodeOidcAuthorizationClient(testConfig, {
      now: () => now,
      jwks: signed.jwks,
      fetch: successfulTokenFetch(signed.token),
    });

    await expect(client.redeemAuthorizationCode({
      code: "authorization-code",
      redirectUri: testConfig.oidc.redirectUri,
      codeVerifier,
      expectedNonceHash,
    })).rejects.toThrow("pilot_oidc_authorized_party_invalid");
  });

  it("generates a constrained authorization URL without network access", async () => {
    const client = new NodeOidcAuthorizationClient(testConfig, {
      jwks: async () => {
        throw new Error("not_called");
      },
      fetch: async () => {
        throw new Error("not_called");
      },
    });

    const authorizationUrl = await client.createAuthorizationUrl({
      clientId: testConfig.oidc.clientId,
      redirectUri: testConfig.oidc.redirectUri,
      requestedScopes: testConfig.oidc.requestedScopes,
      state: `state_${"s".repeat(40)}`,
      nonce,
      pkceChallenge: `challenge_${"c".repeat(40)}`,
    });

    expect(new URL(authorizationUrl).searchParams).toMatchObject({});
    expect(new URL(authorizationUrl).searchParams.get("response_type")).toBe("code");
    expect(new URL(authorizationUrl).searchParams.get("code_challenge_method")).toBe("S256");
  });
});

async function signedToken(overrides: Readonly<{
  nonce?: string;
  audience?: string | string[];
  authorizedParty?: string;
}> = {}): Promise<Readonly<{ token: string; jwks: JWTVerifyGetKey }>> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const token = await new SignJWT({
    nonce: overrides.nonce ?? nonce,
    ...(overrides.authorizedParty === undefined ? {} : { azp: overrides.authorizedParty }),
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(testConfig.oidc.issuer)
    .setSubject("oidc-subject-001")
    .setAudience(overrides.audience ?? testConfig.oidc.clientId)
    .setIssuedAt(issuedAt)
    .setNotBefore(issuedAt - 1)
    .setExpirationTime(issuedAt + 300)
    .sign(privateKey);
  return {
    token,
    jwks: async () => publicKey,
  };
}

function successfulTokenFetch(
  idToken: string,
  requests?: Array<Readonly<{ url: string; body: string; authorization: string }>>,
): OidcTokenEndpointFetch {
  return async (url, init) => {
    requests?.push({
      url,
      body: init.body,
      authorization: init.headers.Authorization,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id_token: idToken,
        access_token: "access-token-never-returned-to-application",
      }),
    };
  };
}
