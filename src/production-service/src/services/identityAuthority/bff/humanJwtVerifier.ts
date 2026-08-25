import { createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";
import { isAllowedCanonicalTenantId, parseCanonicalUtcInstant, type CanonicalUtcInstant } from "../contract.js";
import { isCanonicalIdentityAuthorityGrantSequence } from "../evidencePolicy.js";
import {
  readExactOwnDataFields,
  snapshotCanonicalStringArray,
  snapshotCanonicalUtcInstant,
  snapshotDenseArray,
} from "../safeSnapshot.js";
import {
  matchesDoorstarHumanOidcValidationProfileSnapshot,
  snapshotDoorstarHumanOidcValidationProfile,
  type DoorstarHumanOidcValidationProfileSnapshot,
} from "./humanOidcProfile.js";
import {
  loadDoorstarHumanJwksText,
  snapshotDoorstarHumanJwksTextSource,
  type DoorstarHumanJwksTextSource,
} from "./humanJwksPort.js";
import {
  parseDoorstarFullDepthStrictJsonObject,
  parseDoorstarFullDepthStrictJsonObjectWithMetadata,
} from "./strictJson.js";

const VERIFIER_DEPENDENCY_FIELDS = Object.freeze(["profile", "jwksTextSource", "now"] as const);
const TOKEN_INPUT_FIELDS = Object.freeze(["accessToken", "idToken", "expectedNonce", "claimedProfile"] as const);
const CANONICAL_OPAQUE_SECRET = /^[A-Za-z0-9_-]{43}$/u;
const COMPACT_JWS_MAXIMUM_BYTES = 16 * 1_024;
const COMPACT_JWS_MAXIMUM_HEADER_BYTES = 2 * 1_024;
const COMPACT_JWS_MAXIMUM_PAYLOAD_BYTES = 8 * 1_024;
const COMPACT_JWS_MAXIMUM_SIGNATURE_BYTES = 1 * 1_024;
const JWKS_MAXIMUM_KEYS = 8;
const MAXIMUM_AUDIENCES = 8;
const CANONICAL_KID = /^[A-Za-z0-9._-]{1,128}$/u;
const CANONICAL_AUDIENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const MAXIMUM_NUMERIC_DATE = 253_402_300_799;
const ACCESS_TOKEN_FIELDS = Object.freeze([
  "iss",
  "sub",
  "aud",
  "azp",
  "iat",
  "nbf",
  "exp",
  "typ",
  "spaceos_tenants",
  "spaceos_membership_version",
  "spaceos_projection_version",
] as const);
const ID_TOKEN_FIELDS = Object.freeze([
  "iss",
  "sub",
  "aud",
  "azp",
  "iat",
  "nbf",
  "exp",
  "nonce",
] as const);
const JWK_FIELDS = Object.freeze(["kid", "kty", "use", "alg", "n", "e"] as const);
const MINIMUM_RSA_MODULUS_LENGTH = 2_048;
const MAXIMUM_RSA_MODULUS_LENGTH = 8_192;
const RSA_PUBLIC_EXPONENT = 65_537n;
const verifiedFacts = new WeakMap<object, DoorstarValidatedHumanOidcFacts>();
const verifierInstances = new WeakSet<object>();

declare const doorstarValidatedHumanOidcIdentityBrand: unique symbol;

/** Opaque, callback-scoped capability for a successfully verified human identity. */
export interface DoorstarValidatedHumanOidcIdentity {
  readonly [doorstarValidatedHumanOidcIdentityBrand]: never;
}

/** Token-free facts available only through one accepted verifier delivery. */
export interface DoorstarValidatedHumanOidcFacts {
  readonly subject: string;
  readonly tenantId: string;
  readonly membershipVersion: bigint;
  readonly projectionVersion: bigint;
  readonly enabledModules: readonly string[];
  readonly permissions: readonly string[];
  readonly accessTokenIssuedAt: CanonicalUtcInstant;
  readonly accessTokenExpiresAt: CanonicalUtcInstant;
  /** ID expiry is a session-minimum companion, never an authority source. */
  readonly idTokenExpiresAt: CanonicalUtcInstant;
}

/** A callback-local capability that can deliver one defensive facts snapshot. */
export interface DoorstarValidatedHumanOidcDelivery {
  readonly identity: DoorstarValidatedHumanOidcIdentity;
  consume(consumer: (facts: DoorstarValidatedHumanOidcFacts) => Promise<void> | void): Promise<void>;
}

export type DoorstarHumanJwtVerificationCompletion =
  | { readonly kind: "accepted" }
  | { readonly kind: "denied"; readonly code: DoorstarHumanJwtDenialCode }
  | { readonly kind: "unavailable"; readonly code: DoorstarHumanJwtUnavailableCode };

export type DoorstarHumanJwtDenialCode =
  | "doorstar_human_jwt_input_invalid"
  | "doorstar_human_jwt_profile_mismatch"
  | "doorstar_human_jwt_compact_invalid"
  | "doorstar_human_jwt_header_invalid"
  | "doorstar_human_jwt_key_unknown"
  | "doorstar_human_jwt_signature_invalid"
  | "doorstar_human_jwt_claims_invalid"
  | "doorstar_human_jwt_binding_invalid";

export type DoorstarHumanJwtUnavailableCode =
  | "doorstar_human_jwt_jwks_unavailable"
  | "doorstar_human_jwt_clock_unavailable"
  | "doorstar_human_jwt_delivery_failed"
  | "doorstar_human_jwt_delivery_unconsumed";

/** Internal BFF verifier; it is not a route, code-exchange client, or session issuer. */
export interface DoorstarHumanJwtVerifier {
  verifyAndConsume(
    input: unknown,
    onValidated: (delivery: DoorstarValidatedHumanOidcDelivery) => Promise<void> | void,
  ): Promise<DoorstarHumanJwtVerificationCompletion>;
}

/**
 * Creates a profile-pinned verifier with no caller-selectable issuer, JWKS
 * URI, algorithm, profile digest, network client, or persistence dependency.
 */
export function createDoorstarHumanJwtVerifier(value: unknown): DoorstarHumanJwtVerifier | undefined {
  const dependencies = snapshotDependencies(value);
  if (dependencies === undefined) return undefined;

  const verifier: DoorstarHumanJwtVerifier = Object.freeze({
    async verifyAndConsume(input: unknown, onValidated: (delivery: DoorstarValidatedHumanOidcDelivery) => Promise<void> | void) {
      const tokens = snapshotTokenInput(input);
      if (tokens === undefined || typeof onValidated !== "function") return denied("doorstar_human_jwt_input_invalid");
      if (!matchesDoorstarHumanOidcValidationProfileSnapshot(tokens.claimedProfile, dependencies.profileCapability)) {
        return denied("doorstar_human_jwt_profile_mismatch");
      }

      const accessToken = parseDoorstarHumanCompactJwt(tokens.accessToken);
      const idToken = parseDoorstarHumanCompactJwt(tokens.idToken);
      if (accessToken === undefined || idToken === undefined) return denied("doorstar_human_jwt_compact_invalid");
      if (accessToken.joseType !== dependencies.profile.accessTokenJoseType
        || idToken.joseType !== dependencies.profile.idTokenJoseType) {
        return denied("doorstar_human_jwt_header_invalid");
      }

      const keys = await loadVerificationKeys(dependencies.jwksTextSource, dependencies.profile);
      if (keys === undefined) return unavailable("doorstar_human_jwt_jwks_unavailable");
      const accessKey = keys.get(accessToken.kid);
      const idKey = keys.get(idToken.kid);
      if (accessKey === undefined || idKey === undefined) return denied("doorstar_human_jwt_key_unknown");
      if (!isValidRs256Signature(accessToken.signingInput, accessKey, accessToken.signature)
        || !isValidRs256Signature(idToken.signingInput, idKey, idToken.signature)) {
        return denied("doorstar_human_jwt_signature_invalid");
      }

      const now = readClock(dependencies.now);
      if (now === undefined) return unavailable("doorstar_human_jwt_clock_unavailable");
      const accessClaims = parseDoorstarHumanAccessClaims(accessToken, dependencies.profile, now);
      const idClaims = parseDoorstarHumanIdClaims(idToken, dependencies.profile, now);
      if (accessClaims === undefined || idClaims === undefined) return denied("doorstar_human_jwt_claims_invalid");
      if (accessClaims.issuer !== idClaims.issuer
        || accessClaims.subject !== idClaims.subject
        || !sameOpaqueSecret(tokens.expectedNonce, idClaims.nonce)) {
        return denied("doorstar_human_jwt_binding_invalid");
      }

      const identity = Object.freeze({}) as DoorstarValidatedHumanOidcIdentity;
      verifiedFacts.set(identity, factsFromAccessClaims(accessClaims, idClaims.expiresAt));
      const delivery = createDelivery(identity);
      try {
        await onValidated(delivery.delivery);
        if (!delivery.wasConsumed()) return unavailable("doorstar_human_jwt_delivery_unconsumed");
        return accepted();
      } catch {
        return unavailable("doorstar_human_jwt_delivery_failed");
      } finally {
        verifiedFacts.delete(identity);
      }
    },
  });
  verifierInstances.add(verifier);
  return verifier;
}

/**
 * Consumes only a verifier created by this module. The evidence composition
 * root must call this bridge instead of invoking a structurally supplied
 * `verifyAndConsume` method, so a caller cannot mint validated facts with a
 * look-alike object.
 */
export async function verifyDoorstarHumanJwtAndConsume(
  verifier: unknown,
  input: unknown,
  onValidated: (delivery: DoorstarValidatedHumanOidcDelivery) => Promise<void> | void,
): Promise<DoorstarHumanJwtVerificationCompletion> {
  if (typeof verifier !== "object" || verifier === null || !verifierInstances.has(verifier) || typeof onValidated !== "function") {
    return denied("doorstar_human_jwt_input_invalid");
  }
  try {
    return await (verifier as DoorstarHumanJwtVerifier).verifyAndConsume(input, onValidated);
  } catch {
    return unavailable("doorstar_human_jwt_delivery_failed");
  }
}

function snapshotDependencies(value: unknown): VerifierDependencies | undefined {
  const fields = readExactOwnDataFields(value, VERIFIER_DEPENDENCY_FIELDS);
  if (fields === undefined) return undefined;
  const profile = snapshotDoorstarHumanOidcValidationProfile(fields.get("profile"));
  const now = fields.get("now");
  if (profile === undefined || typeof now !== "function") return undefined;
  const jwksTextSource = snapshotDoorstarHumanJwksTextSource(fields.get("jwksTextSource"), profile);
  if (jwksTextSource === undefined) return undefined;
  return Object.freeze({
    profile,
    profileCapability: fields.get("profile"),
    jwksTextSource,
    now: now as () => unknown,
  });
}

function snapshotTokenInput(value: unknown): {
  readonly accessToken: unknown;
  readonly idToken: unknown;
  readonly expectedNonce: unknown;
  readonly claimedProfile: unknown;
} | undefined {
  const fields = readExactOwnDataFields(value, TOKEN_INPUT_FIELDS);
  if (fields === undefined) return undefined;
  return Object.freeze({
    accessToken: fields.get("accessToken"),
    idToken: fields.get("idToken"),
    expectedNonce: fields.get("expectedNonce"),
    claimedProfile: fields.get("claimedProfile"),
  });
}

async function loadVerificationKeys(
  source: DoorstarHumanJwksTextSource,
  profile: DoorstarHumanOidcValidationProfileSnapshot,
): Promise<ReadonlyMap<string, KeyObject> | undefined> {
  const text = await loadDoorstarHumanJwksText(source, profile);
  if (text === undefined) return undefined;
  const jwks = parseDoorstarHumanJwksDocument(text);
  if (jwks === undefined) return undefined;
  const keys = new Map<string, KeyObject>();
  for (const jwk of jwks) {
    const key = createRs256PublicKey(jwk);
    if (key === undefined) return undefined;
    keys.set(jwk.kid, key);
  }
  return keys;
}

function createRs256PublicKey(jwk: { readonly n: string; readonly e: string }): KeyObject | undefined {
  try {
    const key = createPublicKey({
      key: Object.freeze({ kty: "RSA", n: jwk.n, e: jwk.e }),
      format: "jwk",
    });
    const details = key.asymmetricKeyDetails;
    if (key.type !== "public"
      || key.asymmetricKeyType !== "rsa"
      || details === undefined
      || details.modulusLength === undefined
      || details.modulusLength < MINIMUM_RSA_MODULUS_LENGTH
      || details.modulusLength > MAXIMUM_RSA_MODULUS_LENGTH
      || details.publicExponent !== RSA_PUBLIC_EXPONENT) {
      return undefined;
    }
    return key;
  } catch {
    return undefined;
  }
}

function isValidRs256Signature(signingInput: Uint8Array, key: KeyObject, signature: Uint8Array): boolean {
  try {
    return verify("RSA-SHA256", signingInput, key, signature);
  } catch {
    return false;
  }
}

function readClock(clock: () => unknown): CanonicalUtcInstant | undefined {
  try {
    return snapshotCanonicalUtcInstant(clock());
  } catch {
    return undefined;
  }
}

function factsFromAccessClaims(
  access: ParsedDoorstarHumanAccessClaims,
  idTokenExpiresAt: CanonicalUtcInstant,
): DoorstarValidatedHumanOidcFacts {
  return Object.freeze({
    subject: access.subject,
    tenantId: access.tenantId,
    membershipVersion: access.membershipVersion,
    projectionVersion: access.projectionVersion,
    enabledModules: Object.freeze([...access.enabledModules]),
    permissions: Object.freeze([...access.permissions]),
    accessTokenIssuedAt: freezeInstant(access.issuedAt),
    accessTokenExpiresAt: freezeInstant(access.expiresAt),
    idTokenExpiresAt: freezeInstant(idTokenExpiresAt),
  });
}

function createDelivery(identity: DoorstarValidatedHumanOidcIdentity): DeliveryState {
  let consumed = false;
  return Object.freeze({
    delivery: Object.freeze({
      identity,
      async consume(consumer: (facts: DoorstarValidatedHumanOidcFacts) => Promise<void> | void): Promise<void> {
        if (consumed || typeof consumer !== "function") throw new Error("doorstar_human_jwt_delivery_invalid");
        const facts = verifiedFacts.get(identity);
        if (facts === undefined) throw new Error("doorstar_human_jwt_delivery_invalid");
        consumed = true;
        verifiedFacts.delete(identity);
        await consumer(cloneFacts(facts));
      },
    }),
    wasConsumed: () => consumed,
  });
}

function cloneFacts(value: DoorstarValidatedHumanOidcFacts): DoorstarValidatedHumanOidcFacts {
  return Object.freeze({
    subject: value.subject,
    tenantId: value.tenantId,
    membershipVersion: value.membershipVersion,
    projectionVersion: value.projectionVersion,
    enabledModules: Object.freeze([...value.enabledModules]),
    permissions: Object.freeze([...value.permissions]),
    accessTokenIssuedAt: freezeInstant(value.accessTokenIssuedAt),
    accessTokenExpiresAt: freezeInstant(value.accessTokenExpiresAt),
    idTokenExpiresAt: freezeInstant(value.idTokenExpiresAt),
  });
}

function sameOpaqueSecret(expected: unknown, actual: string): boolean {
  if (!isCanonicalOpaqueSecret(expected) || !isCanonicalOpaqueSecret(actual)) return false;
  const expectedBytes = Buffer.from(expected, "base64url");
  const actualBytes = Buffer.from(actual, "base64url");
  return expectedBytes.byteLength === actualBytes.byteLength && timingSafeEqual(expectedBytes, actualBytes);
}

function isCanonicalOpaqueSecret(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_OPAQUE_SECRET.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === 32 && decoded.toString("base64url") === value;
}

function freezeInstant(value: CanonicalUtcInstant): CanonicalUtcInstant {
  return Object.freeze({ ...value });
}

function accepted(): DoorstarHumanJwtVerificationCompletion {
  return Object.freeze({ kind: "accepted" as const });
}

function denied(code: DoorstarHumanJwtDenialCode): DoorstarHumanJwtVerificationCompletion {
  return Object.freeze({ kind: "denied" as const, code });
}

function unavailable(code: DoorstarHumanJwtUnavailableCode): DoorstarHumanJwtVerificationCompletion {
  return Object.freeze({ kind: "unavailable" as const, code });
}

interface VerifierDependencies {
  readonly profile: DoorstarHumanOidcValidationProfileSnapshot;
  readonly profileCapability: unknown;
  readonly jwksTextSource: DoorstarHumanJwksTextSource;
  readonly now: () => unknown;
}

interface DeliveryState {
  readonly delivery: DoorstarValidatedHumanOidcDelivery;
  readonly wasConsumed: () => boolean;
}

/** Internal, already duplicate-safe representation of one compact RS256 JWS. */
interface ParsedDoorstarHumanJwt {
  readonly kid: string;
  readonly joseType: string;
  readonly payload: Record<string, unknown>;
  readonly rootPrimitiveLexemes: ReadonlyMap<string, string>;
  readonly signingInput: Uint8Array;
  readonly signature: Uint8Array;
}

/** Internal sanitized JWK input; only `n` and `e` may reach Node crypto. */
interface ParsedDoorstarHumanJwk {
  readonly kid: string;
  readonly n: string;
  readonly e: string;
}

/** Normalized access-token authority facts before the opaque verifier boundary. */
interface ParsedDoorstarHumanAccessClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly tenantId: string;
  readonly membershipVersion: bigint;
  readonly projectionVersion: bigint;
  readonly enabledModules: readonly string[];
  readonly permissions: readonly string[];
  readonly issuedAt: CanonicalUtcInstant;
  readonly expiresAt: CanonicalUtcInstant;
}

/** Normalized ID-token companion facts; it intentionally contains no authority. */
interface ParsedDoorstarHumanIdClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly nonce: string;
  readonly expiresAt: CanonicalUtcInstant;
}

/** Parses a canonical compact JWS without trusting its signature or claims. */
function parseDoorstarHumanCompactJwt(value: unknown): ParsedDoorstarHumanJwt | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > COMPACT_JWS_MAXIMUM_BYTES || Buffer.byteLength(value, "utf8") !== value.length) {
    return undefined;
  }
  const segments = value.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) return undefined;

  const headerBytes = decodeCanonicalBase64Url(segments[0], COMPACT_JWS_MAXIMUM_HEADER_BYTES);
  const payloadBytes = decodeCanonicalBase64Url(segments[1], COMPACT_JWS_MAXIMUM_PAYLOAD_BYTES);
  const signature = decodeCanonicalBase64Url(segments[2], COMPACT_JWS_MAXIMUM_SIGNATURE_BYTES);
  if (headerBytes === undefined || payloadBytes === undefined || signature === undefined) return undefined;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  let rootPrimitiveLexemes: ReadonlyMap<string, string>;
  try {
    header = parseDoorstarFullDepthStrictJsonObject(headerBytes, { maximumBytes: COMPACT_JWS_MAXIMUM_HEADER_BYTES });
    const parsedPayload = parseDoorstarFullDepthStrictJsonObjectWithMetadata(payloadBytes, { maximumBytes: COMPACT_JWS_MAXIMUM_PAYLOAD_BYTES });
    payload = parsedPayload.value;
    rootPrimitiveLexemes = parsedPayload.rootPrimitiveLexemes;
  } catch {
    return undefined;
  }
  const fields = readExactOwnDataFields(header, ["alg", "typ", "kid"]);
  if (fields === undefined) return undefined;
  const alg = fields.get("alg");
  const joseType = fields.get("typ");
  const kid = fields.get("kid");
  if (alg !== "RS256" || typeof joseType !== "string" || typeof kid !== "string" || !CANONICAL_KID.test(kid)) return undefined;

  return Object.freeze({
    kid,
    joseType,
    payload,
    rootPrimitiveLexemes,
    signingInput: Buffer.from(segments[0] + "." + segments[1], "ascii"),
    signature: Buffer.from(signature),
  });
}

/** Parses the exact initial Doorstar RS256 JWKS grammar from raw source text. */
function parseDoorstarHumanJwksDocument(value: unknown): readonly ParsedDoorstarHumanJwk[] | undefined {
  let root: Record<string, unknown>;
  try {
    root = parseDoorstarFullDepthStrictJsonObject(value);
  } catch {
    return undefined;
  }
  const rootFields = readExactOwnDataFields(root, ["keys"]);
  if (rootFields === undefined) return undefined;
  const values = snapshotDenseArray(rootFields.get("keys"), JWKS_MAXIMUM_KEYS);
  if (values === undefined || values.length === 0) return undefined;

  const keys: ParsedDoorstarHumanJwk[] = [];
  const knownKids = new Set<string>();
  for (const value of values) {
    const fields = readExactOwnDataFields(value, JWK_FIELDS);
    if (fields === undefined) return undefined;
    const kid = fields.get("kid");
    const kty = fields.get("kty");
    const use = fields.get("use");
    const alg = fields.get("alg");
    const n = fields.get("n");
    const e = fields.get("e");
    if (typeof kid !== "string"
      || typeof n !== "string"
      || typeof e !== "string"
      || !CANONICAL_KID.test(kid)
      || kty !== "RSA"
      || use !== "sig"
      || alg !== "RS256"
      || !isCanonicalUnsignedBase64Url(n, 1_024)
      || !isCanonicalExponent65537(e)
      || knownKids.has(kid)) {
      return undefined;
    }
    knownKids.add(kid);
    keys.push(Object.freeze({ kid, n, e }));
  }
  return Object.freeze(keys);
}

/** Validates access-only authority claims after signature verification. */
function parseDoorstarHumanAccessClaims(
  token: ParsedDoorstarHumanJwt,
  profile: DoorstarHumanOidcValidationProfileSnapshot,
  now: CanonicalUtcInstant,
): ParsedDoorstarHumanAccessClaims | undefined {
  const fields = readExactOwnDataFields(token.payload, ACCESS_TOKEN_FIELDS);
  if (fields === undefined) return undefined;
  const common = parseCommonClaims(fields, token.rootPrimitiveLexemes, profile.issuer, profile.accessTokenAudiences,
    profile.accessTokenAuthorizedParty, profile.accessTokenMaximumLifetimeSeconds, profile.clockSkewSeconds, now);
  const payloadType = fields.get("typ");
  const tenantEntries = snapshotDenseArray(fields.get("spaceos_tenants"), 1);
  const membershipVersion = fields.get("spaceos_membership_version");
  const projectionVersion = fields.get("spaceos_projection_version");
  if (common === undefined
    || payloadType !== profile.accessTokenPayloadType
    || tenantEntries === undefined
    || tenantEntries.length !== 1
    || !isCanonicalPositiveSafeInteger(membershipVersion, token.rootPrimitiveLexemes.get("spaceos_membership_version"))
    || !isCanonicalPositiveSafeInteger(projectionVersion, token.rootPrimitiveLexemes.get("spaceos_projection_version"))) {
    return undefined;
  }
  const tenantFields = readExactOwnDataFields(tenantEntries[0], ["tenant_id", "permissions", "enabled_modules"]);
  if (tenantFields === undefined) return undefined;
  const tenantId = tenantFields.get("tenant_id");
  const permissions = snapshotCanonicalStringArray(tenantFields.get("permissions"), 10);
  const enabledModules = snapshotCanonicalStringArray(tenantFields.get("enabled_modules"), 10);
  if (typeof tenantId !== "string"
    || !isAllowedCanonicalTenantId(tenantId)
    || permissions === undefined
    || enabledModules === undefined
    || !isCanonicalIdentityAuthorityGrantSequence(enabledModules, permissions)) {
    return undefined;
  }
  return Object.freeze({
    issuer: common.issuer,
    subject: common.subject,
    tenantId,
    membershipVersion: BigInt(membershipVersion),
    projectionVersion: BigInt(projectionVersion),
    enabledModules: Object.freeze([...enabledModules]),
    permissions: Object.freeze([...permissions]),
    issuedAt: freezeInstant(common.issuedAt),
    expiresAt: freezeInstant(common.expiresAt),
  });
}

/** Validates the nonce-bearing, authority-free ID-token companion. */
function parseDoorstarHumanIdClaims(
  token: ParsedDoorstarHumanJwt,
  profile: DoorstarHumanOidcValidationProfileSnapshot,
  now: CanonicalUtcInstant,
): ParsedDoorstarHumanIdClaims | undefined {
  const fields = readExactOwnDataFields(token.payload, ID_TOKEN_FIELDS);
  if (fields === undefined) return undefined;
  const common = parseCommonClaims(fields, token.rootPrimitiveLexemes, profile.issuer, profile.idTokenAudiences,
    profile.idTokenAuthorizedParty, profile.idTokenMaximumLifetimeSeconds, profile.clockSkewSeconds, now);
  const nonce = fields.get("nonce");
  if (common === undefined || !isCanonicalOpaqueSecret(nonce)) return undefined;
  return Object.freeze({
    issuer: common.issuer,
    subject: common.subject,
    nonce,
    expiresAt: freezeInstant(common.expiresAt),
  });
}

function parseCommonClaims(
  fields: ReadonlyMap<PropertyKey, unknown>,
  rootPrimitiveLexemes: ReadonlyMap<string, string>,
  expectedIssuer: string,
  expectedAudiences: readonly string[],
  expectedAuthorizedParty: string,
  maximumLifetimeSeconds: number,
  clockSkewSeconds: number,
  now: CanonicalUtcInstant,
): ParsedCommonClaims | undefined {
  const issuer = fields.get("iss");
  const subject = fields.get("sub");
  const audiences = normalizeAudience(fields.get("aud"));
  const authorizedParty = fields.get("azp");
  const issuedAt = fromCanonicalNumericDate(fields.get("iat"), rootPrimitiveLexemes.get("iat"));
  const notBefore = fromCanonicalNumericDate(fields.get("nbf"), rootPrimitiveLexemes.get("nbf"));
  const expiresAt = fromCanonicalNumericDate(fields.get("exp"), rootPrimitiveLexemes.get("exp"));
  if (issuer !== expectedIssuer
    || typeof subject !== "string"
    || !isCanonicalSubject(subject)
    || audiences === undefined
    || !sameStringSequence(audiences, expectedAudiences)
    || authorizedParty !== expectedAuthorizedParty
    || issuedAt === undefined
    || notBefore === undefined
    || expiresAt === undefined
    || !isValidTokenTimeWindow(issuedAt, notBefore, expiresAt, now, clockSkewSeconds, maximumLifetimeSeconds)) {
    return undefined;
  }
  return Object.freeze({ issuer, subject, issuedAt, notBefore, expiresAt });
}

function normalizeAudience(value: unknown): readonly string[] | undefined {
  if (typeof value === "string") {
    return CANONICAL_AUDIENCE.test(value) ? Object.freeze([value]) : undefined;
  }
  const values = snapshotCanonicalStringArray(value, MAXIMUM_AUDIENCES);
  if (values === undefined || values.length === 0 || !values.every((item) => CANONICAL_AUDIENCE.test(item)) || !isSortedUnique(values)) {
    return undefined;
  }
  return Object.freeze([...values]);
}

function fromCanonicalNumericDate(value: unknown, lexeme: string | undefined): CanonicalUtcInstant | undefined {
  if (typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAXIMUM_NUMERIC_DATE
    || !isCanonicalDecimalLexeme(lexeme, value, true)) return undefined;
  const date = new Date(value * 1_000);
  if (!Number.isFinite(date.getTime()) || date.getTime() !== value * 1_000) return undefined;
  try {
    return freezeInstant(parseCanonicalUtcInstant(date.toISOString().slice(0, 19) + "Z"));
  } catch {
    return undefined;
  }
}

function isValidTokenTimeWindow(
  issuedAt: CanonicalUtcInstant,
  notBefore: CanonicalUtcInstant,
  expiresAt: CanonicalUtcInstant,
  now: CanonicalUtcInstant,
  clockSkewSeconds: number,
  maximumLifetimeSeconds: number,
): boolean {
  return issuedAt.epochSeconds <= now.epochSeconds + clockSkewSeconds
    && notBefore.epochSeconds <= now.epochSeconds + clockSkewSeconds
    && expiresAt.epochSeconds > now.epochSeconds - clockSkewSeconds
    && issuedAt.epochSeconds <= expiresAt.epochSeconds
    && notBefore.epochSeconds <= expiresAt.epochSeconds
    && expiresAt.epochSeconds - issuedAt.epochSeconds <= maximumLifetimeSeconds;
}

function decodeCanonicalBase64Url(value: string | undefined, maximumBytes: number): Uint8Array | undefined {
  if (value === undefined || !/^[A-Za-z0-9_-]+$/u.test(value)) return undefined;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength > 0 && decoded.byteLength <= maximumBytes && decoded.toString("base64url") === value
    ? Buffer.from(decoded)
    : undefined;
}

function isCanonicalUnsignedBase64Url(value: string, maximumBytes: number): boolean {
  const decoded = decodeCanonicalBase64Url(value, maximumBytes);
  return decoded !== undefined && decoded[0] !== 0;
}

function isCanonicalExponent65537(value: string): boolean {
  const decoded = decodeCanonicalBase64Url(value, 8);
  return decoded !== undefined
    && decoded.byteLength === 3
    && decoded[0] === 0x01
    && decoded[1] === 0x00
    && decoded[2] === 0x01;
}

function isCanonicalSubject(value: string): boolean {
  return value.length >= 1 && value.length <= 256 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function isCanonicalPositiveSafeInteger(value: unknown, lexeme: string | undefined): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && isCanonicalDecimalLexeme(lexeme, value, false);
}

function isCanonicalDecimalLexeme(lexeme: string | undefined, value: number, permitsZero: boolean): boolean {
  const pattern = permitsZero ? /^(?:0|[1-9][0-9]*)$/u : /^[1-9][0-9]*$/u;
  return lexeme !== undefined && pattern.test(lexeme) && Number(lexeme) === value;
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function sameStringSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

interface ParsedCommonClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly issuedAt: CanonicalUtcInstant;
  readonly notBefore: CanonicalUtcInstant;
  readonly expiresAt: CanonicalUtcInstant;
}
