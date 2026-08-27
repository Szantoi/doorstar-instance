import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { Buffer } from "node:buffer";
import type { PilotCrypto } from "../../ports/crypto.js";

const ciphertextVersion = 1;
const nonceLength = 12;
const authenticationTagLength = 16;
const keyLength = 32;

export type NodePilotCryptoOptions = Readonly<{
  encryptionKey: Uint8Array;
  subjectDigestKey: Uint8Array;
}>;

/**
 * Node's CSPRNG plus AES-256-GCM for the one short-lived callback secret.
 * The opaque values are unpadded base64url random bytes and therefore never
 * need URL escaping when passed to OIDC or stored as cookie values.
 */
export class NodePilotCrypto implements PilotCrypto {
  private readonly encryptionKey: Buffer;
  private readonly subjectDigestKey: Buffer;

  public constructor(options: NodePilotCryptoOptions) {
    this.encryptionKey = copyExactKey(options.encryptionKey, "pilot_crypto_encryption_key_invalid");
    this.subjectDigestKey = copyExactKey(
      options.subjectDigestKey,
      "pilot_crypto_subject_digest_key_invalid",
    );
  }

  public createOpaqueSecret(
    _purpose: "transaction" | "state" | "nonce" | "pkce_verifier" | "browser_binding" | "session",
  ): string {
    return randomBytes(32).toString("base64url");
  }

  public hash(value: string): string {
    return createHash("sha256").update(requireText(value)).digest("hex");
  }

  public encrypt(value: string): Uint8Array {
    const plaintext = Buffer.from(requireText(value), "utf8");
    const nonce = randomBytes(nonceLength);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce, {
      authTagLength: authenticationTagLength,
    });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    return Uint8Array.from(Buffer.concat([
      Buffer.from([ciphertextVersion]),
      nonce,
      authenticationTag,
      ciphertext,
    ]));
  }

  public decrypt(ciphertext: Uint8Array): string {
    const encoded = Buffer.from(ciphertext);
    if (
      encoded.byteLength < 1 + nonceLength + authenticationTagLength
      || encoded[0] !== ciphertextVersion
    ) {
      throw new Error("pilot_crypto_ciphertext_invalid");
    }
    const nonce = encoded.subarray(1, 1 + nonceLength);
    const authenticationTag = encoded.subarray(1 + nonceLength, 1 + nonceLength + authenticationTagLength);
    const encrypted = encoded.subarray(1 + nonceLength + authenticationTagLength);
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, nonce, {
        authTagLength: authenticationTagLength,
      });
      decipher.setAuthTag(authenticationTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("pilot_crypto_ciphertext_invalid");
    }
  }

  public derivePkceS256(verifier: string): string {
    return createHash("sha256").update(requireText(verifier)).digest("base64url");
  }

  public digestOidcSubject(issuer: string, subject: string): string {
    const canonicalIssuer = requireText(issuer);
    const verifiedSubject = requireText(subject);
    return createHmac("sha256", this.subjectDigestKey)
      .update(canonicalIssuer, "utf8")
      .update("\u0000", "utf8")
      .update(verifiedSubject, "utf8")
      .digest("hex");
  }
}

function copyExactKey(value: Uint8Array, errorCode: string): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength !== keyLength) {
    throw new Error(errorCode);
  }
  return Buffer.from(value);
}

function requireText(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 8_192) {
    throw new Error("pilot_crypto_text_invalid");
  }
  return value;
}
