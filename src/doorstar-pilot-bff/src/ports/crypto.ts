/**
 * Key use is injected by the composition root. `hash` produces a lowercase
 * SHA-256 hexadecimal digest. `digestOidcSubject` must be a keyed,
 * rotation-aware digest; a raw OIDC subject must never reach storage.
 */
export interface PilotCrypto {
  createOpaqueSecret(
    purpose: "transaction" | "state" | "nonce" | "pkce_verifier" | "browser_binding" | "session",
  ): string;
  hash(value: string): string;
  encrypt(value: string): Uint8Array;
  decrypt(ciphertext: Uint8Array): string;
  derivePkceS256(verifier: string): string;
  digestOidcSubject(issuer: string, subject: string): string;
}
