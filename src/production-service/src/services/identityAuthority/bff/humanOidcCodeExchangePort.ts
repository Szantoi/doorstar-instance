import { readExactOwnDataFields } from "../safeSnapshot.js";
import {
  matchesDoorstarHumanOidcValidationProfileSnapshot,
  snapshotDoorstarHumanOidcValidationProfile,
  type DoorstarHumanOidcProfile,
  type DoorstarHumanOidcValidationProfileSnapshot,
} from "./humanOidcProfile.js";
import {
  consumeDoorstarOidcClaimedCallbackDelivery,
  type DoorstarOidcClaimedCallbackSecrets,
} from "./pkceTransaction.js";

const SOURCE_FACTORY_FIELDS = Object.freeze(["profile", "loader"] as const);
const LOADER_FIELDS = Object.freeze(["exchange"] as const);
const CLAIMED_SECRET_FIELDS = Object.freeze(["authorizationCode", "codeVerifier", "nonce", "profile"] as const);
const TOKEN_PAIR_FIELDS = Object.freeze(["accessToken", "idToken"] as const);
const CANONICAL_OPAQUE_SECRET = /^[A-Za-z0-9_-]{43}$/u;
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const MAXIMUM_AUTHORIZATION_CODE_LENGTH = 4_096;
const MAXIMUM_TOKEN_BYTES = 16 * 1_024;

/** Shared upper bound for a future strict HTTP adapter before it materializes a token response. */
export const DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_MAXIMUM_RESPONSE_BYTES = 64 * 1_024;
/** The complete code-exchange attempt, including a future response read, has one deadline. */
export const DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_DEADLINE_MILLISECONDS = 2_000;

const sourceSnapshots = new WeakMap<object, DoorstarHumanOidcCodeExchangeSourceSnapshot>();

declare const doorstarHumanOidcCodeExchangeSourceBrand: unique symbol;

/** Opaque transport capability permanently bound to one factory-issued OIDC profile. */
export interface DoorstarHumanOidcCodeExchangeSource {
  readonly [doorstarHumanOidcCodeExchangeSourceBrand]: never;
}

interface DoorstarHumanOidcCodeExchangeProfileBinding {
  readonly releaseId: string;
  readonly issuer: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly profileDigest: string;
}

/**
 * The only data a future HTTP adapter may use to form the authorization-code
 * request. It intentionally has no nonce, state, scope, token, secret or
 * caller-selected endpoint field.
 */
export interface DoorstarHumanOidcCodeExchangeRequest extends DoorstarHumanOidcCodeExchangeProfileBinding {
  readonly grantType: "authorization_code";
  readonly authorizationCode: string;
  readonly codeVerifier: string;
  readonly signal: AbortSignal;
  readonly maximumResponseBytes: number;
}

/**
 * A future strict HTTP/JSON adapter receives only the canonical request. Its
 * result remains `unknown` here because the release-pinned token-response
 * grammar and client-authentication method are not approved yet.
 */
export interface DoorstarHumanOidcCodeExchangeLoader {
  exchange(input: DoorstarHumanOidcCodeExchangeRequest): Promise<unknown>;
}

/** A one-use callback-local delivery; raw access/ID tokens never appear in a completion value. */
export interface DoorstarHumanOidcCodeExchangeTokenDelivery {
  consume(consumer: (tokens: {
    readonly accessToken: string;
    readonly idToken: string;
    readonly expectedNonce: string;
    readonly claimedProfile: DoorstarHumanOidcValidationProfileSnapshot;
  }) => Promise<void> | void): Promise<boolean>;
}

export type DoorstarHumanOidcCodeExchangeCompletion =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "unavailable";
      readonly code:
        | "doorstar_oidc_code_exchange_source_invalid"
        | "doorstar_oidc_code_exchange_input_invalid"
        | "doorstar_oidc_code_exchange_profile_mismatch"
        | "doorstar_oidc_code_exchange_transport_unavailable"
        | "doorstar_oidc_code_exchange_response_invalid"
        | "doorstar_oidc_code_exchange_delivery_failed"
        | "doorstar_oidc_code_exchange_delivery_unconsumed";
    };

/** Binds an injected loader to the exact complete profile; this function opens no network connection. */
export function createDoorstarHumanOidcCodeExchangeSource(value: unknown): DoorstarHumanOidcCodeExchangeSource | undefined {
  const fields = readExactOwnDataFields(value, SOURCE_FACTORY_FIELDS);
  if (fields === undefined) return undefined;
  const profileCapability = fields.get("profile");
  const profile = snapshotDoorstarHumanOidcValidationProfile(profileCapability);
  const loaderFields = readExactOwnDataFields(fields.get("loader"), LOADER_FIELDS);
  const exchange = loaderFields?.get("exchange");
  if (profile === undefined || typeof exchange !== "function") return undefined;

  const source = Object.freeze({}) as DoorstarHumanOidcCodeExchangeSource;
  sourceSnapshots.set(source, Object.freeze({
    profileCapability,
    profile: cloneProfile(profile),
    binding: snapshotProfileBinding(profile),
    loader: Object.freeze({ exchange: exchange as DoorstarHumanOidcCodeExchangeLoader["exchange"] }),
  }));
  return source;
}

/**
 * Makes precisely one bounded handoff to a profile-bound loader and exposes a
 * successful raw token pair only through a one-use callback-local delivery.
 * This is not an HTTP client and deliberately has no retry path.
 */
export async function exchangeDoorstarHumanOidcCodeAndConsume(
  source: unknown,
  claimedDelivery: unknown,
  onTokens: (delivery: DoorstarHumanOidcCodeExchangeTokenDelivery) => Promise<void> | void,
): Promise<DoorstarHumanOidcCodeExchangeCompletion> {
  if (typeof source !== "object" || source === null || typeof onTokens !== "function") {
    return unavailable("doorstar_oidc_code_exchange_source_invalid");
  }
  const snapshot = sourceSnapshots.get(source);
  if (snapshot === undefined) return unavailable("doorstar_oidc_code_exchange_source_invalid");

  let completion: DoorstarHumanOidcCodeExchangeCompletion | undefined;
  try {
    const consumed = await consumeDoorstarOidcClaimedCallbackDelivery(claimedDelivery, async (claimedSecrets) => {
      completion = await exchangeClaimedSecrets(snapshot, claimedSecrets, onTokens);
    });
    return consumed && completion !== undefined
      ? completion
      : unavailable("doorstar_oidc_code_exchange_input_invalid");
  } catch {
    return unavailable("doorstar_oidc_code_exchange_delivery_failed");
  }
}

async function exchangeClaimedSecrets(
  snapshot: DoorstarHumanOidcCodeExchangeSourceSnapshot,
  claimedSecrets: DoorstarOidcClaimedCallbackSecrets,
  onTokens: (delivery: DoorstarHumanOidcCodeExchangeTokenDelivery) => Promise<void> | void,
): Promise<DoorstarHumanOidcCodeExchangeCompletion> {
  const secrets = snapshotClaimedSecrets(claimedSecrets, snapshot.profileCapability);
  if (secrets.kind === "profile_mismatch") return unavailable("doorstar_oidc_code_exchange_profile_mismatch");
  if (secrets.kind !== "accepted") return unavailable("doorstar_oidc_code_exchange_input_invalid");

  const controller = new AbortController();
  const timeoutMarker = Symbol("doorstar_oidc_code_exchange_timeout");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<typeof timeoutMarker>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve(timeoutMarker);
    }, DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_DEADLINE_MILLISECONDS);
  });

  try {
    let result: unknown | typeof timeoutMarker;
    try {
      result = await Promise.race([
        snapshot.loader.exchange(Object.freeze({
          ...snapshot.binding,
          grantType: "authorization_code" as const,
          authorizationCode: secrets.authorizationCode,
          codeVerifier: secrets.codeVerifier,
          signal: controller.signal,
          maximumResponseBytes: DOORSTAR_HUMAN_OIDC_CODE_EXCHANGE_MAXIMUM_RESPONSE_BYTES,
        })),
        timeoutResult,
      ]);
    } catch {
      return unavailable("doorstar_oidc_code_exchange_transport_unavailable");
    }
    if (result === timeoutMarker) return unavailable("doorstar_oidc_code_exchange_transport_unavailable");

    const tokenPair = snapshotTokenPair(result);
    if (tokenPair === undefined) return unavailable("doorstar_oidc_code_exchange_response_invalid");

    const delivery = createTokenDelivery({
      ...tokenPair,
      expectedNonce: secrets.nonce,
      claimedProfile: snapshot.profile,
    });
    let callbackFailed = false;
    try {
      await onTokens(delivery.delivery);
    } catch {
      callbackFailed = true;
    }
    try {
      const consumption = await delivery.awaitConsumption();
      if (consumption === undefined) {
        return unavailable(callbackFailed
          ? "doorstar_oidc_code_exchange_delivery_failed"
          : "doorstar_oidc_code_exchange_delivery_unconsumed");
      }
      return !callbackFailed && consumption
        ? accepted()
        : unavailable("doorstar_oidc_code_exchange_delivery_failed");
    } finally {
      delivery.close();
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    controller.abort();
  }
}

function snapshotClaimedSecrets(
  value: unknown,
  expectedProfile: unknown,
): { readonly kind: "accepted"; readonly authorizationCode: string; readonly codeVerifier: string; readonly nonce: string }
  | { readonly kind: "profile_mismatch" }
  | { readonly kind: "invalid" } {
  const fields = readExactOwnDataFields(value, CLAIMED_SECRET_FIELDS);
  if (fields === undefined) return Object.freeze({ kind: "invalid" as const });
  const authorizationCode = fields.get("authorizationCode");
  const codeVerifier = fields.get("codeVerifier");
  const nonce = fields.get("nonce");
  const profile = fields.get("profile");
  if (!matchesDoorstarHumanOidcValidationProfileSnapshot(profile, expectedProfile)) {
    return Object.freeze({ kind: "profile_mismatch" as const });
  }
  if (!isAuthorizationCode(authorizationCode)
    || !isCanonicalOpaqueSecret(codeVerifier)
    || !isCanonicalOpaqueSecret(nonce)) {
    return Object.freeze({ kind: "invalid" as const });
  }
  return Object.freeze({ kind: "accepted" as const, authorizationCode, codeVerifier, nonce });
}

function snapshotTokenPair(value: unknown): { readonly accessToken: string; readonly idToken: string } | undefined {
  const fields = readExactOwnDataFields(value, TOKEN_PAIR_FIELDS);
  if (fields === undefined) return undefined;
  const accessToken = fields.get("accessToken");
  const idToken = fields.get("idToken");
  if (!isBoundedCompactJws(accessToken) || !isBoundedCompactJws(idToken)) return undefined;
  return Object.freeze({ accessToken, idToken });
}

function createTokenDelivery(value: {
  readonly accessToken: string;
  readonly idToken: string;
  readonly expectedNonce: string;
  readonly claimedProfile: DoorstarHumanOidcValidationProfileSnapshot;
}): {
  readonly delivery: DoorstarHumanOidcCodeExchangeTokenDelivery;
  readonly awaitConsumption: () => Promise<boolean | undefined>;
  readonly close: () => void;
} {
  let active = true;
  let tokens: typeof value | undefined = Object.freeze({
    accessToken: value.accessToken,
    idToken: value.idToken,
    expectedNonce: value.expectedNonce,
    claimedProfile: cloneProfile(value.claimedProfile),
  });
  let consumption: Promise<boolean> | undefined;
  return Object.freeze({
    delivery: Object.freeze({
      async consume(consumer: (candidate: NonNullable<typeof tokens>) => Promise<void> | void): Promise<boolean> {
        if (!active || consumption !== undefined || tokens === undefined || typeof consumer !== "function") return false;
        const candidate = tokens;
        tokens = undefined;
        consumption = Promise.resolve()
          .then(() => consumer(candidate))
          .then(() => true, () => false);
        return await consumption;
      },
    }),
    awaitConsumption: async () => consumption === undefined ? undefined : await consumption,
    close: () => {
      active = false;
      tokens = undefined;
    },
  });
}

function snapshotProfileBinding(
  profile: DoorstarHumanOidcValidationProfileSnapshot,
): DoorstarHumanOidcCodeExchangeProfileBinding {
  return Object.freeze({
    releaseId: profile.releaseId,
    issuer: profile.issuer,
    tokenEndpoint: profile.tokenEndpoint,
    clientId: profile.clientId,
    redirectUri: profile.redirectUri,
    profileDigest: profile.profileDigest,
  });
}

function cloneProfile(value: DoorstarHumanOidcValidationProfileSnapshot): DoorstarHumanOidcValidationProfileSnapshot {
  return Object.freeze({
    releaseId: value.releaseId,
    issuer: value.issuer,
    authorizationEndpoint: value.authorizationEndpoint,
    tokenEndpoint: value.tokenEndpoint,
    jwksUri: value.jwksUri,
    clientId: value.clientId,
    redirectUri: value.redirectUri,
    productScope: value.productScope,
    scopes: Object.freeze([...value.scopes]),
    accessTokenAudiences: Object.freeze([...value.accessTokenAudiences]),
    accessTokenAuthorizedParty: value.accessTokenAuthorizedParty,
    idTokenAudiences: Object.freeze([...value.idTokenAudiences]),
    idTokenAuthorizedParty: value.idTokenAuthorizedParty,
    accessTokenJoseType: value.accessTokenJoseType,
    accessTokenPayloadType: value.accessTokenPayloadType,
    idTokenJoseType: value.idTokenJoseType,
    accessTokenMaximumLifetimeSeconds: value.accessTokenMaximumLifetimeSeconds,
    idTokenMaximumLifetimeSeconds: value.idTokenMaximumLifetimeSeconds,
    authorityProjectionContract: value.authorityProjectionContract,
    idTokenAuthorityClaims: value.idTokenAuthorityClaims,
    clockSkewSeconds: value.clockSkewSeconds,
    profileDigest: value.profileDigest,
  });
}

function isAuthorizationCode(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= MAXIMUM_AUTHORIZATION_CODE_LENGTH
    && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function isCanonicalOpaqueSecret(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_OPAQUE_SECRET.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === 32 && decoded.toString("base64url") === value;
}

function isBoundedCompactJws(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 5
    && Buffer.byteLength(value, "utf8") <= MAXIMUM_TOKEN_BYTES
    && COMPACT_JWS.test(value);
}

function accepted(): DoorstarHumanOidcCodeExchangeCompletion {
  return Object.freeze({ kind: "accepted" as const });
}

function unavailable(
  code: Extract<DoorstarHumanOidcCodeExchangeCompletion, { readonly kind: "unavailable" }>["code"],
): DoorstarHumanOidcCodeExchangeCompletion {
  return Object.freeze({ kind: "unavailable" as const, code });
}

interface DoorstarHumanOidcCodeExchangeSourceSnapshot {
  readonly profileCapability: unknown;
  readonly profile: DoorstarHumanOidcValidationProfileSnapshot;
  readonly binding: DoorstarHumanOidcCodeExchangeProfileBinding;
  readonly loader: DoorstarHumanOidcCodeExchangeLoader;
}
