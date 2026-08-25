import { timingSafeEqual } from "node:crypto";

/**
 * Deployment-held key names. The provider owns raw key material; this module
 * sees only HMAC output and therefore cannot serialize a key accidentally.
 */
export const doorstarMacKeyNames = Object.freeze([
  "doorstar-identity-evidence",
  "doorstar-session-verifier",
  "doorstar-session-csrf",
  "doorstar-session-state",
  "doorstar-oidc-transaction",
] as const);

export type DoorstarMacKeyName = (typeof doorstarMacKeyNames)[number];

export const doorstarMacSpecifications = Object.freeze({
  evidenceState: Object.freeze({
    keyName: "doorstar-identity-evidence" as const,
    domain: "doorstar-identity-evidence-v1",
  }),
  sessionVerifier: Object.freeze({
    keyName: "doorstar-session-verifier" as const,
    domain: "doorstar-session-verifier-v1",
  }),
  sessionCsrf: Object.freeze({
    keyName: "doorstar-session-csrf" as const,
    domain: "doorstar-session-csrf-v1",
  }),
  sessionState: Object.freeze({
    keyName: "doorstar-session-state" as const,
    domain: "doorstar-session-state-v1",
  }),
  oidcState: Object.freeze({
    keyName: "doorstar-oidc-transaction" as const,
    domain: "doorstar-oidc-state-v1",
  }),
  oidcTransactionState: Object.freeze({
    keyName: "doorstar-oidc-transaction" as const,
    domain: "doorstar-oidc-transaction-state-v1",
  }),
  oidcNonce: Object.freeze({
    keyName: "doorstar-oidc-transaction" as const,
    domain: "doorstar-oidc-nonce-v1",
  }),
  oidcPkceVerifier: Object.freeze({
    keyName: "doorstar-oidc-transaction" as const,
    domain: "doorstar-oidc-pkce-verifier-v1",
  }),
});

/** Runtime validation below limits this structural type to the fixed registry. */
export interface DoorstarMacSpecification {
  readonly keyName: DoorstarMacKeyName;
  readonly domain: string;
}

export type DoorstarMacField =
  | { readonly kind: "utf8"; readonly value: string }
  | { readonly kind: "decimal"; readonly value: number | bigint }
  | { readonly kind: "bytes"; readonly value: Uint8Array };

export interface DoorstarMacInput {
  readonly specification: DoorstarMacSpecification;
  readonly fields: readonly DoorstarMacField[];
}

export interface VersionedDoorstarMac {
  readonly keyVersion: number;
  /** A 32-byte HMAC-SHA-256 result; copy before retaining outside this boundary. */
  readonly mac: Uint8Array;
}

/**
 * A named deployment-secret adapter. It intentionally never exposes a raw key:
 * production code can ask it to compute a HMAC for one named/versioned key,
 * while the test adapter may use deterministic test-only key bytes.
 *
 * Returning null means that a key version is unknown, retired, or outside its
 * explicit previous-key rotation window.
 */
export interface DoorstarMacKeyProvider {
  currentKeyVersion(keyName: DoorstarMacKeyName): Promise<number>;
  signHmacSha256(input: {
    readonly keyName: DoorstarMacKeyName;
    readonly keyVersion: number;
    readonly preimage: Uint8Array;
  }): Promise<Uint8Array | null>;
}

export type DoorstarMacVerification = "valid" | "invalid" | "unknown_key";

export interface DoorstarMacService {
  signCurrent(input: DoorstarMacInput): Promise<VersionedDoorstarMac>;
  /**
   * Derives only with the provider's current key or its single immediately
   * previous key. A retained older key is deliberately not a valid fallback.
   */
  derive(input: DoorstarMacInput & { readonly keyVersion: number }): Promise<Uint8Array | undefined>;
  verify(input: DoorstarMacInput & VersionedDoorstarMac): Promise<DoorstarMacVerification>;
}

/**
 * Produces and verifies only domain-separated, length-prefixed HMAC inputs.
 * Callers never concatenate fields or choose a secret key name dynamically.
 */
export function createDoorstarMacService(provider: DoorstarMacKeyProvider): DoorstarMacService {
  return Object.freeze({
    async signCurrent(input: DoorstarMacInput): Promise<VersionedDoorstarMac> {
      const specification = snapshotSpecification(input.specification);
      const keyVersion = await provider.currentKeyVersion(specification.keyName);
      requireKeyVersion(keyVersion);
      const mac = await sign(provider, specification, keyVersion, input.fields);
      if (mac === undefined) throw new Error("doorstar_mac_current_key_unavailable");
      return Object.freeze({ keyVersion, mac });
    },

    async derive(input: DoorstarMacInput & { readonly keyVersion: number }): Promise<Uint8Array | undefined> {
      const specification = snapshotSpecification(input.specification);
      requireKeyVersion(input.keyVersion);
      const currentKeyVersion = await provider.currentKeyVersion(specification.keyName);
      requireKeyVersion(currentKeyVersion);
      if (!isCurrentOrImmediatelyPreviousKeyVersion(input.keyVersion, currentKeyVersion)) return undefined;
      return sign(provider, specification, input.keyVersion, input.fields);
    },

    async verify(input: DoorstarMacInput & VersionedDoorstarMac): Promise<DoorstarMacVerification> {
      const specification = snapshotSpecification(input.specification);
      requireKeyVersion(input.keyVersion);
      const actual = snapshotMac(input.mac);
      if (actual === undefined) return "invalid";

      const currentKeyVersion = await provider.currentKeyVersion(specification.keyName);
      requireKeyVersion(currentKeyVersion);
      if (!isCurrentOrImmediatelyPreviousKeyVersion(input.keyVersion, currentKeyVersion)) return "unknown_key";

      const expected = await sign(provider, specification, input.keyVersion, input.fields);
      if (expected === undefined) return "unknown_key";
      return sameOpaqueBytes(expected, actual) ? "valid" : "invalid";
    },
  });
}

/**
 * Encodes every field as an unsigned 32-bit big-endian byte length plus bytes.
 * The domain is the first encoded field, so an otherwise identical preimage
 * cannot validate in a different authorization purpose.
 */
export function encodeDoorstarMacPreimage(input: DoorstarMacInput): Uint8Array {
  const specification = snapshotSpecification(input.specification);
  if (!Array.isArray(input.fields) || input.fields.length > MAXIMUM_FIELD_COUNT) {
    throw new Error("doorstar_mac_input_invalid");
  }

  const fields = [
    Buffer.from(specification.domain, "ascii"),
    ...input.fields.map(encodeField),
  ];
  const totalLength = fields.reduce((total, field) => total + LENGTH_PREFIX_BYTES + field.byteLength, 0);
  if (!Number.isSafeInteger(totalLength) || totalLength > MAXIMUM_PREIMAGE_BYTES) {
    throw new Error("doorstar_mac_input_too_large");
  }

  const preimage = Buffer.allocUnsafe(totalLength);
  let offset = 0;
  for (const field of fields) {
    preimage.writeUInt32BE(field.byteLength, offset);
    offset += LENGTH_PREFIX_BYTES;
    Buffer.from(field).copy(preimage, offset);
    offset += field.byteLength;
  }
  return Buffer.from(preimage);
}

const LENGTH_PREFIX_BYTES = 4;
const MAXIMUM_FIELD_COUNT = 64;
const MAXIMUM_FIELD_BYTES = 65_536;
const MAXIMUM_PREIMAGE_BYTES = 1_048_576;
const HMAC_SHA256_BYTES = 32;

async function sign(
  provider: DoorstarMacKeyProvider,
  specification: DoorstarMacSpecification,
  keyVersion: number,
  fields: readonly DoorstarMacField[],
): Promise<Uint8Array | undefined> {
  const result = await provider.signHmacSha256({
    keyName: specification.keyName,
    keyVersion,
    preimage: encodeDoorstarMacPreimage({ specification, fields }),
  });
  return result === null ? undefined : requireMac(result);
}

function snapshotSpecification(value: unknown): DoorstarMacSpecification {
  if (value === null || typeof value !== "object") throw new Error("doorstar_mac_specification_invalid");
  const candidate = value as { readonly keyName?: unknown; readonly domain?: unknown };
  if (!isDoorstarMacKeyName(candidate.keyName)
    || typeof candidate.domain !== "string"
    || !Object.values(doorstarMacSpecifications).some((item) => item.keyName === candidate.keyName && item.domain === candidate.domain)) {
    throw new Error("doorstar_mac_specification_invalid");
  }
  return Object.freeze({ keyName: candidate.keyName, domain: candidate.domain });
}

function isDoorstarMacKeyName(value: unknown): value is DoorstarMacKeyName {
  return typeof value === "string" && (doorstarMacKeyNames as readonly string[]).includes(value);
}

function encodeField(field: DoorstarMacField): Buffer {
  if (field === null || typeof field !== "object") throw new Error("doorstar_mac_input_invalid");
  if (field.kind === "utf8") return encodeUtf8(field.value);
  if (field.kind === "decimal") return encodeDecimal(field.value);
  if (field.kind === "bytes") return encodeBytes(field.value);
  throw new Error("doorstar_mac_input_invalid");
}

function encodeUtf8(value: unknown): Buffer {
  if (typeof value !== "string"
    || value.length === 0
    || /[\0\uD800-\uDFFF]/u.test(value)) {
    throw new Error("doorstar_mac_input_invalid");
  }
  const encoded = Buffer.from(value, "utf8");
  if (encoded.byteLength > MAXIMUM_FIELD_BYTES) throw new Error("doorstar_mac_input_too_large");
  return encoded;
}

function encodeDecimal(value: unknown): Buffer {
  if ((typeof value !== "number" && typeof value !== "bigint")
    || (typeof value === "number" && (!Number.isSafeInteger(value) || Object.is(value, -0)))
    || value < 0) {
    throw new Error("doorstar_mac_input_invalid");
  }
  return Buffer.from(value.toString(10), "ascii");
}

function encodeBytes(value: unknown): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > MAXIMUM_FIELD_BYTES) {
    throw new Error("doorstar_mac_input_invalid");
  }
  return Buffer.from(value);
}

function requireKeyVersion(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new Error("doorstar_mac_key_version_invalid");
  }
}

/** The service, not a provider convention, enforces the explicit two-key ring. */
function isCurrentOrImmediatelyPreviousKeyVersion(keyVersion: number, currentKeyVersion: number): boolean {
  return keyVersion === currentKeyVersion
    || (currentKeyVersion > 1 && keyVersion === currentKeyVersion - 1);
}

function requireMac(value: unknown): Uint8Array {
  const mac = snapshotMac(value);
  if (mac === undefined) throw new Error("doorstar_mac_provider_invalid");
  return mac;
}

function snapshotMac(value: unknown): Uint8Array | undefined {
  if (!(value instanceof Uint8Array) || value.byteLength !== HMAC_SHA256_BYTES) return undefined;
  return Buffer.from(value);
}

function sameOpaqueBytes(expected: Uint8Array, actual: Uint8Array): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.byteLength === actualBuffer.byteLength && timingSafeEqual(expectedBuffer, actualBuffer);
}
