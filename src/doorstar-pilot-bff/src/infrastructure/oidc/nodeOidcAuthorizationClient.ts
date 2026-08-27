import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { PilotBffConfig } from "../../config/pilotBffConfig.js";
import type {
  OidcAuthorizationClient,
  OidcAuthorizationRequest,
  OidcCodeExchangeRequest,
  VerifiedOidcIdentity,
} from "../../ports/oidc.js";

export type OidcTokenEndpointResponse = Readonly<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type OidcTokenEndpointFetch = (
  url: string,
  init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
    redirect: "error";
  }>,
) => Promise<OidcTokenEndpointResponse>;

export type NodeOidcAuthorizationClientOptions = Readonly<{
  /** Test seam for the token request; production defaults to global fetch. */
  fetch?: OidcTokenEndpointFetch;
  /** Test seam for a local JWK resolver; production defaults to remote JWKS. */
  jwks?: JWTVerifyGetKey;
  now?: () => Date;
}>;

/**
 * Confidential-client authorization-code adapter. It intentionally returns
 * only the verified issuer and subject; access, refresh and ID tokens never
 * cross into the BFF application layer or its repository ports.
 */
export class NodeOidcAuthorizationClient implements OidcAuthorizationClient {
  private readonly tokenFetch: OidcTokenEndpointFetch;
  private readonly jwks: JWTVerifyGetKey;
  private readonly now: () => Date;

  public constructor(
    private readonly config: PilotBffConfig,
    options: NodeOidcAuthorizationClientOptions = {},
  ) {
    this.tokenFetch = options.fetch ?? defaultTokenEndpointFetch;
    this.jwks = options.jwks ?? createRemoteJWKSet(new URL(config.oidc.jwksUrl));
    this.now = options.now ?? (() => new Date());
  }

  public async createAuthorizationUrl(input: OidcAuthorizationRequest): Promise<string> {
    assertAuthorizationRequestMatchesConfig(input, this.config);
    const url = new URL(this.config.oidc.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", input.requestedScopes.join(" "));
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.pkceChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  public async redeemAuthorizationCode(
    input: OidcCodeExchangeRequest,
  ): Promise<VerifiedOidcIdentity> {
    assertCodeExchangeRequestMatchesConfig(input, this.config);
    const tokenResponse = await this.tokenFetch(this.config.oidc.tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: basicAuthorization(this.config.oidc.clientId, this.config.oidc.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }).toString(),
      redirect: "error",
    });
    if (!tokenResponse.ok) {
      throw new Error("pilot_oidc_token_exchange_rejected");
    }

    const tokenPayload = await tokenResponse.json();
    const idToken = readIdToken(tokenPayload);
    const verification = await jwtVerify(idToken, this.jwks, {
      issuer: this.config.oidc.issuer,
      audience: this.config.oidc.clientId,
      algorithms: [...this.config.oidc.idTokenAlgorithms],
      currentDate: validNow(this.now()),
      clockTolerance: 0,
      requiredClaims: ["exp", "iat", "sub", "nonce"],
    });

    assertAuthorizedParty(verification.payload.aud, verification.payload.azp, this.config.oidc.clientId);
    assertNonceHashMatches(verification.payload.nonce, input.expectedNonceHash);
    const issuer = readVerifiedText(verification.payload.iss, "pilot_oidc_issuer_invalid");
    const subject = readVerifiedText(verification.payload.sub, "pilot_oidc_subject_invalid");
    return { issuer, subject };
  }
}

function defaultTokenEndpointFetch(
  url: string,
  init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
    redirect: "error";
  }>,
): Promise<OidcTokenEndpointResponse> {
  return globalThis.fetch(url, init);
}

function assertAuthorizationRequestMatchesConfig(
  input: OidcAuthorizationRequest,
  config: PilotBffConfig,
): void {
  if (
    input.clientId !== config.oidc.clientId
    || input.redirectUri !== config.oidc.redirectUri
    || input.requestedScopes.join(" ") !== config.oidc.requestedScopes.join(" ")
  ) {
    throw new Error("pilot_oidc_authorization_request_invalid");
  }
  assertOpaque(input.state, "pilot_oidc_state_invalid");
  assertOpaque(input.nonce, "pilot_oidc_nonce_invalid");
  assertOpaque(input.pkceChallenge, "pilot_oidc_pkce_challenge_invalid");
}

function assertCodeExchangeRequestMatchesConfig(
  input: OidcCodeExchangeRequest,
  config: PilotBffConfig,
): void {
  if (
    input.redirectUri !== config.oidc.redirectUri
    || !/^[a-f0-9]{64}$/.test(input.expectedNonceHash)
    || !isCode(input.code)
    || !isOpaque(input.codeVerifier)
  ) {
    throw new Error("pilot_oidc_code_exchange_request_invalid");
  }
}

function basicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

function readIdToken(value: unknown): string {
  if (!isRecord(value) || typeof value.id_token !== "string" || value.id_token.length > 16_384) {
    throw new Error("pilot_oidc_id_token_missing");
  }
  return value.id_token;
}

function assertAuthorizedParty(
  audience: unknown,
  authorizedParty: unknown,
  expectedClientId: string,
): void {
  if (Array.isArray(audience) && audience.length > 1 && authorizedParty !== expectedClientId) {
    throw new Error("pilot_oidc_authorized_party_invalid");
  }
}

function assertNonceHashMatches(nonce: unknown, expectedNonceHash: string): void {
  const verifiedNonce = readVerifiedText(nonce, "pilot_oidc_nonce_claim_invalid");
  const actualHash = createHash("sha256").update(verifiedNonce, "utf8").digest();
  const expectedHash = Buffer.from(expectedNonceHash, "hex");
  if (expectedHash.byteLength !== actualHash.byteLength || !timingSafeEqual(actualHash, expectedHash)) {
    throw new Error("pilot_oidc_nonce_mismatch");
  }
}

function validNow(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new Error("pilot_oidc_clock_invalid");
  }
  return value;
}

function assertOpaque(value: string, errorCode: string): void {
  if (!isOpaque(value)) {
    throw new Error(errorCode);
  }
}

function isOpaque(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,512}$/.test(value);
}

function isCode(value: string): boolean {
  return value.length > 0 && value.length <= 4_096 && !/[\r\n\u0000]/.test(value);
}

function readVerifiedText(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048 || /[\r\n\u0000]/.test(value)) {
    throw new Error(errorCode);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
