import { createHash } from "node:crypto";
import { readExactOwnDataFields, snapshotCanonicalStringArray } from "../safeSnapshot.js";

export const DOORSTAR_HUMAN_OIDC_PROFILE_VERSION = "doorstar-human-oidc-v1";

const PROFILE_FIELDS = Object.freeze([
  "releaseId",
  "issuer",
  "authorizationEndpoint",
  "tokenEndpoint",
  "jwksUri",
  "clientId",
  "redirectUri",
  "productScope",
  "accessTokenAudiences",
  "accessTokenAuthorizedParty",
  "idTokenAudiences",
  "idTokenAuthorizedParty",
  "clockSkewSeconds",
] as const);

const canonicalReleaseId = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const canonicalClientId = /^[A-Za-z0-9._-]{1,128}$/u;
const canonicalScope = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const canonicalAudience = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const forbiddenNonProductScopes = new Set(["offline_access", "profile", "email", "address", "phone"]);
const MAXIMUM_URL_LENGTH = 2_048;
const profileSnapshots = new WeakMap<object, DoorstarHumanOidcProfileSnapshot>();

declare const doorstarHumanOidcProfileBrand: unique symbol;

/**
 * Opaque capability returned only by createDoorstarHumanOidcProfile. The
 * PKCE layer cannot be handed a caller-invented profileDigest or partial
 * profile object.
 */
export interface DoorstarHumanOidcProfile {
  readonly [doorstarHumanOidcProfileBrand]: never;
}

export interface DoorstarOidcTransactionProfileSnapshot {
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  /** SHA-256 base64url of every canonical release-pinned profile field. */
  readonly profileDigest: string;
}

/** Exact non-secret fields needed to form the single permitted authorization request. */
export interface DoorstarOidcAuthorizationProfileSnapshot extends DoorstarOidcTransactionProfileSnapshot {
  readonly authorizationEndpoint: string;
  readonly productScope: string;
  readonly scopes: readonly string[];
}

/** Exact non-secret profile supplied to the future code-exchange and JWT validators. */
export interface DoorstarHumanOidcValidationProfileSnapshot extends DoorstarOidcAuthorizationProfileSnapshot {
  readonly releaseId: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  readonly accessTokenAudiences: readonly string[];
  readonly accessTokenAuthorizedParty: string;
  readonly idTokenAudiences: readonly string[];
  readonly idTokenAuthorizedParty: string;
  readonly clockSkewSeconds: number;
}

type DoorstarHumanOidcProfileSnapshot = DoorstarHumanOidcValidationProfileSnapshot;

/**
 * Validates and fingerprints the complete static human OIDC profile. Runtime
 * configuration loading must still pin this input to a reviewed release
 * artifact; this source-only factory prevents a caller from supplying an
 * unrelated precomputed digest or silently omitting a verifier-relevant field.
 */
export function createDoorstarHumanOidcProfile(value: unknown): DoorstarHumanOidcProfile | undefined {
  const fields = readExactOwnDataFields(value, PROFILE_FIELDS);
  if (fields === undefined) return undefined;

  const releaseId = fields.get("releaseId");
  const issuer = fields.get("issuer");
  const authorizationEndpoint = fields.get("authorizationEndpoint");
  const tokenEndpoint = fields.get("tokenEndpoint");
  const jwksUri = fields.get("jwksUri");
  const clientId = fields.get("clientId");
  const redirectUri = fields.get("redirectUri");
  const productScope = fields.get("productScope");
  const accessTokenAudiences = snapshotCanonicalStringArray(fields.get("accessTokenAudiences"), 8);
  const accessTokenAuthorizedParty = fields.get("accessTokenAuthorizedParty");
  const idTokenAudiences = snapshotCanonicalStringArray(fields.get("idTokenAudiences"), 8);
  const idTokenAuthorizedParty = fields.get("idTokenAuthorizedParty");
  const clockSkewSeconds = fields.get("clockSkewSeconds");

  if (typeof releaseId !== "string"
    || typeof issuer !== "string"
    || typeof authorizationEndpoint !== "string"
    || typeof tokenEndpoint !== "string"
    || typeof jwksUri !== "string"
    || typeof clientId !== "string"
    || typeof redirectUri !== "string"
    || typeof productScope !== "string"
    || typeof accessTokenAuthorizedParty !== "string"
    || typeof idTokenAuthorizedParty !== "string"
    || typeof clockSkewSeconds !== "number"
    || !canonicalReleaseId.test(releaseId)
    || !isCanonicalIssuer(issuer)
    || !isCanonicalOidcEndpoint(authorizationEndpoint, issuer)
    || !isCanonicalOidcEndpoint(tokenEndpoint, issuer)
    || !isCanonicalOidcEndpoint(jwksUri, issuer)
    || !canonicalClientId.test(clientId)
    || !isCanonicalCallbackUri(redirectUri)
    || !isCanonicalProductScope(productScope)
    || !isCanonicalAudienceSet(accessTokenAudiences)
    || !isCanonicalAudienceSet(idTokenAudiences)
    || !canonicalClientId.test(accessTokenAuthorizedParty)
    || !canonicalClientId.test(idTokenAuthorizedParty)
    || accessTokenAuthorizedParty !== clientId
    || idTokenAuthorizedParty !== clientId
    || !idTokenAudiences.includes(clientId)
    || !Number.isSafeInteger(clockSkewSeconds)
    || clockSkewSeconds < 0
    || clockSkewSeconds > 300) {
    return undefined;
  }
  const scopes = createCanonicalScopeSet(productScope);

  const snapshotWithoutDigest = {
    releaseId,
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    clientId,
    redirectUri,
    productScope,
    scopes,
    accessTokenAudiences,
    accessTokenAuthorizedParty,
    idTokenAudiences,
    idTokenAuthorizedParty,
    clockSkewSeconds,
  };
  const profileDigest = createProfileDigest(snapshotWithoutDigest);
  const profile = Object.freeze({}) as DoorstarHumanOidcProfile;
  profileSnapshots.set(profile, Object.freeze({
    ...snapshotWithoutDigest,
    scopes: Object.freeze([...scopes]),
    accessTokenAudiences: Object.freeze([...accessTokenAudiences]),
    idTokenAudiences: Object.freeze([...idTokenAudiences]),
    profileDigest,
  }));
  return profile;
}

/** Returns a defensive, transaction-relevant slice only for a factory-issued capability. */
export function snapshotDoorstarHumanOidcTransactionProfile(value: unknown): DoorstarOidcTransactionProfileSnapshot | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const snapshot = profileSnapshots.get(value);
  if (snapshot === undefined) return undefined;
  return Object.freeze({
    issuer: snapshot.issuer,
    clientId: snapshot.clientId,
    redirectUri: snapshot.redirectUri,
    profileDigest: snapshot.profileDigest,
  });
}

/** Returns a defensive authorization slice only for a factory-issued capability. */
export function snapshotDoorstarHumanOidcAuthorizationProfile(value: unknown): DoorstarOidcAuthorizationProfileSnapshot | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const snapshot = profileSnapshots.get(value);
  if (snapshot === undefined) return undefined;
  return Object.freeze({
    issuer: snapshot.issuer,
    authorizationEndpoint: snapshot.authorizationEndpoint,
    clientId: snapshot.clientId,
    redirectUri: snapshot.redirectUri,
    productScope: snapshot.productScope,
    scopes: Object.freeze([...snapshot.scopes]),
    profileDigest: snapshot.profileDigest,
  });
}

/** Returns the complete defensive profile only for a factory-issued capability. */
export function snapshotDoorstarHumanOidcValidationProfile(value: unknown): DoorstarHumanOidcValidationProfileSnapshot | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const snapshot = profileSnapshots.get(value);
  if (snapshot === undefined) return undefined;
  return Object.freeze({
    releaseId: snapshot.releaseId,
    issuer: snapshot.issuer,
    authorizationEndpoint: snapshot.authorizationEndpoint,
    tokenEndpoint: snapshot.tokenEndpoint,
    jwksUri: snapshot.jwksUri,
    clientId: snapshot.clientId,
    redirectUri: snapshot.redirectUri,
    productScope: snapshot.productScope,
    scopes: Object.freeze([...snapshot.scopes]),
    accessTokenAudiences: Object.freeze([...snapshot.accessTokenAudiences]),
    accessTokenAuthorizedParty: snapshot.accessTokenAuthorizedParty,
    idTokenAudiences: Object.freeze([...snapshot.idTokenAudiences]),
    idTokenAuthorizedParty: snapshot.idTokenAuthorizedParty,
    clockSkewSeconds: snapshot.clockSkewSeconds,
    profileDigest: snapshot.profileDigest,
  });
}

function createProfileDigest(value: Omit<DoorstarHumanOidcProfileSnapshot, "profileDigest">): string {
  const fields = [
    DOORSTAR_HUMAN_OIDC_PROFILE_VERSION,
    value.releaseId,
    value.issuer,
    value.authorizationEndpoint,
    value.tokenEndpoint,
    value.jwksUri,
    value.clientId,
    value.redirectUri,
    value.productScope,
    ...lengthPrefixedArray(value.scopes),
    ...lengthPrefixedArray(value.accessTokenAudiences),
    value.accessTokenAuthorizedParty,
    ...lengthPrefixedArray(value.idTokenAudiences),
    value.idTokenAuthorizedParty,
    value.clockSkewSeconds.toString(10),
  ];
  const encoded = fields.map(encodeLengthPrefixedUtf8);
  return createHash("sha256").update(Buffer.concat(encoded)).digest("base64url");
}

function lengthPrefixedArray(values: readonly string[]): readonly string[] {
  return [values.length.toString(10), ...values];
}

function encodeLengthPrefixedUtf8(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.byteLength, 0);
  return Buffer.concat([length, bytes]);
}

function isCanonicalProductScope(value: string): boolean {
  return canonicalScope.test(value)
    && value !== "openid"
    && !forbiddenNonProductScopes.has(value);
}

function createCanonicalScopeSet(productScope: string): readonly string[] {
  return Object.freeze(["openid", productScope].sort());
}

function isCanonicalAudienceSet(value: readonly string[] | undefined): value is readonly string[] {
  return value !== undefined
    && value.length >= 1
    && value.every((item) => canonicalAudience.test(item))
    && isSortedUnique(value);
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function isCanonicalIssuer(value: string): boolean {
  if (value.length === 0 || value.length > MAXIMUM_URL_LENGTH || value !== value.trim() || value.endsWith("/")) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.search === ""
      && parsed.hash === ""
      && parsed.pathname !== "/"
      && !parsed.pathname.includes("//")
      && value === parsed.origin + parsed.pathname;
  } catch {
    return false;
  }
}

function isCanonicalOidcEndpoint(value: string, issuer: string): boolean {
  if (value.length === 0 || value.length > MAXIMUM_URL_LENGTH || value !== value.trim()) return false;
  try {
    const endpoint = new URL(value);
    const canonicalIssuer = new URL(issuer);
    return endpoint.protocol === "https:"
      && endpoint.username === ""
      && endpoint.password === ""
      && endpoint.search === ""
      && endpoint.hash === ""
      && endpoint.origin === canonicalIssuer.origin
      && endpoint.pathname.startsWith(canonicalIssuer.pathname + "/")
      && !endpoint.pathname.includes("//")
      && value === endpoint.origin + endpoint.pathname;
  } catch {
    return false;
  }
}

function isCanonicalCallbackUri(value: string): boolean {
  if (value.length === 0 || value.length > MAXIMUM_URL_LENGTH || value !== value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/auth/callback"
      && parsed.search === ""
      && parsed.hash === ""
      && value === parsed.origin + "/auth/callback";
  } catch {
    return false;
  }
}
