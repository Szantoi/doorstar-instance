import { describe, expect, it } from "vitest";
import { NodePilotCrypto } from "../src/index.js";

describe("NodePilotCrypto", () => {
  const crypto = new NodePilotCrypto({
    encryptionKey: Buffer.alloc(32, 11),
    subjectDigestKey: Buffer.alloc(32, 22),
  });

  it("creates unpadded opaque base64url values and standards-compliant SHA-256 PKCE", () => {
    const first = crypto.createOpaqueSecret("session");
    const second = crypto.createOpaqueSecret("session");

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(crypto.hash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(crypto.derivePkceS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("encrypts the short-lived verifier with versioned AES-256-GCM and detects tampering", () => {
    const ciphertext = crypto.encrypt("pkce_verifier_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

    expect(ciphertext[0]).toBe(1);
    expect(crypto.decrypt(ciphertext)).toBe("pkce_verifier_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    const tampered = Uint8Array.from(ciphertext);
    tampered[tampered.length - 1] ^= 1;
    expect(() => crypto.decrypt(tampered)).toThrow("pilot_crypto_ciphertext_invalid");
  });

  it("uses a keyed, non-reversible subject digest instead of a raw OIDC subject", () => {
    const first = crypto.digestOidcSubject("https://issuer.example.invalid", "person-123");
    const second = crypto.digestOidcSubject("https://issuer.example.invalid", "person-124");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("person-123");
    expect(first).not.toBe(second);
  });
});
