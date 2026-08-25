import { createPrivateKey, createSign, randomUUID, type KeyObject } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IdentityAuthorityEnabledConfig } from "./config.js";

/** A short assertion lifetime bounds replay exposure independently of access-token lifetime. */
export const CLIENT_ASSERTION_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 5;

export interface PrivateKeyJwtDependencies {
  readonly now?: () => Date;
  readonly randomUuid?: () => string;
}

/** Reads one deployment-mounted RSA private key without exposing its PEM contents. */
export async function loadIdentityAuthorityPrivateKey(privateKeyPath: string): Promise<KeyObject> {
  let pem: string;
  try {
    pem = await readFile(privateKeyPath, "utf8");
  } catch {
    throw new Error("identity_authority_private_key_unavailable");
  }

  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new Error("identity_authority_private_key_invalid");
  }

  requireRsaPrivateKey(key);
  return key;
}

/** Creates the client assertion sent to Keycloak; it is never sent to the Kernel. */
export function createPrivateKeyJwt(
  config: IdentityAuthorityEnabledConfig,
  privateKey: KeyObject,
  dependencies: PrivateKeyJwtDependencies = {},
): string {
  requireRsaPrivateKey(privateKey);

  const now = dependencies.now?.() ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1_000);
  if (!Number.isSafeInteger(issuedAt)) throw new Error("identity_authority_clock_invalid");

  const jti = dependencies.randomUuid?.() ?? randomUUID();
  if (!isCanonicalUuid(jti)) throw new Error("identity_authority_jti_invalid");

  const header = base64UrlJson({ alg: "RS256", typ: "JWT", kid: config.privateKeyKid });
  const payload = base64UrlJson({
    iss: config.clientId,
    sub: config.clientId,
    aud: config.tokenEndpoint,
    iat: issuedAt,
    nbf: issuedAt - CLOCK_SKEW_SECONDS,
    exp: issuedAt + CLIENT_ASSERTION_LIFETIME_SECONDS,
    jti,
  });
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput, "utf8");
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");

  return `${signingInput}.${signature}`;
}

/** Rejects non-RSA and short RSA keys before any network request can be made. */
export function requireRsaPrivateKey(privateKey: KeyObject): void {
  const modulusLength = privateKey.asymmetricKeyDetails?.modulusLength;
  if (privateKey.type !== "private"
    || privateKey.asymmetricKeyType !== "rsa"
    || modulusLength === undefined
    || modulusLength < 2_048) {
    throw new Error("identity_authority_private_key_must_be_rsa_2048_or_stronger");
  }
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function isCanonicalUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
