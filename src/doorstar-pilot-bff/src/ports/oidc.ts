export type OidcAuthorizationRequest = Readonly<{
  clientId: string;
  redirectUri: string;
  requestedScopes: readonly string[];
  state: string;
  nonce: string;
  pkceChallenge: string;
}>;

export type OidcCodeExchangeRequest = Readonly<{
  code: string;
  redirectUri: string;
  codeVerifier: string;
  expectedNonceHash: string;
}>;

/**
 * The adapter verifies signature, issuer, audience and expiry, then computes
 * SHA-256 over the verified ID-token nonce claim and compares it with
 * `expectedNonceHash` in constant time. It must not return raw
 * ID/access/refresh tokens to the BFF application layer.
 */
export type VerifiedOidcIdentity = Readonly<{
  issuer: string;
  subject: string;
}>;

export interface OidcAuthorizationClient {
  createAuthorizationUrl(input: OidcAuthorizationRequest): Promise<string>;
  redeemAuthorizationCode(input: OidcCodeExchangeRequest): Promise<VerifiedOidcIdentity>;
}
