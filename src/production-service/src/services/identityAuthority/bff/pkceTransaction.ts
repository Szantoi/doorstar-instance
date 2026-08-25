import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";
import { compareCanonicalUtcInstants, parseCanonicalUtcInstant, type CanonicalUtcInstant } from "../contract.js";
import { readExactOwnDataFields, snapshotCanonicalUtcInstant } from "../safeSnapshot.js";
import {
  snapshotDoorstarHumanOidcValidationProfile,
  type DoorstarHumanOidcProfile,
  type DoorstarHumanOidcValidationProfileSnapshot,
  type DoorstarOidcTransactionProfileSnapshot,
} from "./humanOidcProfile.js";
import {
  doorstarMacSpecifications,
  type DoorstarMacField,
  type DoorstarMacService,
  type VersionedDoorstarMac,
} from "./mac.js";
import {
  DOORSTAR_OPAQUE_SECRET_BASE64URL_LENGTH,
  DOORSTAR_OPAQUE_SECRET_BYTES,
  type DoorstarRandomBytes,
} from "./session.js";

export const doorstarBffOidcTransactionCookieName = "__Host-doorstar-oidc-tx";
export const MAXIMUM_DOORSTAR_OIDC_TRANSACTION_LIFETIME_SECONDS = 600;

const canonicalOpaqueSecret = /^[A-Za-z0-9_-]{43}$/u;
const canonicalClientId = /^[A-Za-z0-9._-]{1,128}$/u;
const TRANSACTION_FIELDS = Object.freeze([
  "selector",
  "keyVersion",
  "stateMacKeyVersion",
  "stateMac",
  "issuer",
  "clientId",
  "redirectUri",
  "profileDigest",
  "issuedAt",
  "expiresAt",
] as const);
const claimedCallbackDeliveries = new WeakMap<object, DoorstarOidcClaimedCallbackDeliveryState>();

export interface DoorstarOidcLoginTransaction {
  readonly selector: string;
  readonly keyVersion: number;
  readonly stateMacKeyVersion: number;
  readonly stateMac: Uint8Array;
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly profileDigest: string;
  readonly issuedAt: CanonicalUtcInstant;
  readonly expiresAt: CanonicalUtcInstant;
}

/**
 * The only future database-facing port for a login transaction. Its concrete
 * implementation is intentionally absent from this source-only foundation.
 * begin must insert immutable data, findUnconsumedBySelector must never return
 * a consumed row, and claimMatching must issue one unconsumed+unexpired CAS.
 */
export interface DoorstarOidcTransactionRepository {
  begin(transaction: DoorstarOidcLoginTransaction): Promise<"started" | "not_started">;
  findUnconsumedBySelector(selector: string): Promise<DoorstarOidcLoginTransaction | undefined>;
  claimMatching(input: {
    readonly selector: string;
    readonly stateMacKeyVersion: number;
    readonly stateMac: Uint8Array;
    readonly profileDigest: string;
    readonly now: CanonicalUtcInstant;
  }): Promise<"claimed" | "not_claimed">;
}

/** Browser-visible values sent only while forming the authorization redirect. */
export interface DoorstarOidcAuthorizationPlan {
  readonly transactionCookie: string;
  /** The complete exact authorization request, including state/nonce/S256 PKCE. */
  readonly authorizationRequestUri: string;
}

/**
 * Secrets are supplied only to an after-CAS callback owned by the future
 * privileged identity boundary. They are never returned from a decision.
 */
export interface DoorstarOidcClaimedCallbackSecrets {
  readonly authorizationCode: string;
  readonly codeVerifier: string;
  readonly nonce: string;
  /** Exact factory-derived profile for the future code exchange and validators. */
  readonly profile: DoorstarHumanOidcValidationProfileSnapshot;
}

declare const doorstarOidcClaimedCallbackDeliveryBrand: unique symbol;

/**
 * Opaque, one-use post-CAS capability. Raw callback secrets are available only
 * to a trusted consumer while it consumes this exact factory-created value.
 */
export interface DoorstarOidcClaimedCallbackDelivery {
  readonly [doorstarOidcClaimedCallbackDeliveryBrand]: never;
}

export type DoorstarOidcAuthorizationStart =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "rejected";
      readonly code:
        | "doorstar_oidc_time_invalid"
        | "doorstar_oidc_lifetime_invalid"
        | "doorstar_oidc_key_unavailable"
        | "doorstar_oidc_random_source_invalid"
        | "doorstar_oidc_transaction_not_started"
        | "doorstar_oidc_transaction_repository_unavailable"
        | "doorstar_oidc_authorization_delivery_failed";
    };

export type DoorstarOidcCallbackCompletion =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "rejected";
      readonly code:
        | "doorstar_oidc_callback_malformed"
        | "doorstar_oidc_callback_error"
        | "doorstar_oidc_callback_parameters_invalid"
        | "doorstar_oidc_transaction_invalid"
        | "doorstar_oidc_transaction_expired"
        | "doorstar_oidc_transaction_key_unavailable"
        | "doorstar_oidc_transaction_state_rejected"
        | "doorstar_oidc_transaction_not_claimed"
        | "doorstar_oidc_transaction_repository_unavailable"
        | "doorstar_oidc_claim_delivery_unconsumed"
        | "doorstar_oidc_claim_delivery_failed";
    };

export interface DoorstarOidcTransactionBoundary {
  /**
   * Persists an immutable transaction before it supplies browser redirect
   * values to the caller. The callback is the future strict HTTP boundary.
   */
  begin(input: {
    readonly repository: DoorstarOidcTransactionRepository;
    readonly now: unknown;
    readonly maximumLifetimeSeconds: unknown;
    readonly randomBytes?: DoorstarRandomBytes;
    readonly onStarted: (plan: DoorstarOidcAuthorizationPlan) => Promise<void> | void;
  }): Promise<DoorstarOidcAuthorizationStart>;

  /**
   * Delivers an opaque one-use code/verifier/nonce capability only after a
   * conditional one-time claim. The callback must be implemented by the later
   * evidence composition root and consume the delivery exactly once.
   */
  complete(input: {
    readonly repository: DoorstarOidcTransactionRepository;
    readonly rawQuery: unknown;
    readonly transactionCookieSelector: unknown;
    readonly now: unknown;
    readonly onClaimed: (delivery: DoorstarOidcClaimedCallbackDelivery) => Promise<void> | void;
  }): Promise<DoorstarOidcCallbackCompletion>;
}

/**
 * Creates the only PKCE raw-secret boundary. A factory-issued complete OIDC
 * profile is mandatory, so this module never trusts a caller-provided digest.
 */
export function createDoorstarOidcTransactionBoundary(input: {
  readonly mac: DoorstarMacService;
  readonly profile: DoorstarHumanOidcProfile;
}): DoorstarOidcTransactionBoundary | undefined {
  const profile = snapshotDoorstarHumanOidcValidationProfile(input.profile);
  if (profile === undefined) return undefined;

  return Object.freeze({
    async begin(beginInput: Parameters<DoorstarOidcTransactionBoundary["begin"]>[0]): Promise<DoorstarOidcAuthorizationStart> {
      const now = snapshotCanonicalUtcInstant(beginInput.now);
      if (now === undefined) return rejectedAuthorizationStart("doorstar_oidc_time_invalid");
      if (!isTransactionLifetime(beginInput.maximumLifetimeSeconds)) {
        return rejectedAuthorizationStart("doorstar_oidc_lifetime_invalid");
      }
      const expiresAt = addWholeSeconds(now, beginInput.maximumLifetimeSeconds);
      if (expiresAt === undefined) return rejectedAuthorizationStart("doorstar_oidc_time_invalid");

      const material = await createAuthorizationMaterial({
        mac: input.mac,
        profile,
        now,
        expiresAt,
        maximumLifetimeSeconds: beginInput.maximumLifetimeSeconds,
        randomBytes: beginInput.randomBytes ?? nodeRandomBytes,
      });
      if (material.kind === "rejected") return material;

      let started: "started" | "not_started";
      try {
        started = await beginInput.repository.begin(material.transaction);
      } catch {
        return rejectedAuthorizationStart("doorstar_oidc_transaction_repository_unavailable");
      }
      if (started !== "started") return rejectedAuthorizationStart("doorstar_oidc_transaction_not_started");

      try {
        await beginInput.onStarted(material.plan);
      } catch {
        return rejectedAuthorizationStart("doorstar_oidc_authorization_delivery_failed");
      }
      return acceptedAuthorizationStart();
    },

    async complete(completeInput: Parameters<DoorstarOidcTransactionBoundary["complete"]>[0]): Promise<DoorstarOidcCallbackCompletion> {
      const callback = parseDoorstarOidcCallbackQuery(completeInput.rawQuery);
      if (callback.kind === "rejected") return callback;
      const selector = parseTransactionSelector(completeInput.transactionCookieSelector);
      const now = snapshotCanonicalUtcInstant(completeInput.now);
      if (selector === undefined || now === undefined) return rejectedCallbackCompletion("doorstar_oidc_transaction_invalid");

      let storedTransaction: DoorstarOidcLoginTransaction | undefined;
      try {
        storedTransaction = await completeInput.repository.findUnconsumedBySelector(selector);
      } catch {
        return rejectedCallbackCompletion("doorstar_oidc_transaction_repository_unavailable");
      }
      const transaction = snapshotTransaction(storedTransaction);
      if (transaction === undefined) return rejectedCallbackCompletion("doorstar_oidc_transaction_invalid");

      const preclaim = await validateCallbackBeforeClaim({
        mac: input.mac,
        profile,
        transaction,
        cookieSelector: selector,
        callback,
        now,
      });
      if (preclaim.kind === "rejected") return preclaim;

      let claimed: "claimed" | "not_claimed";
      try {
        claimed = await completeInput.repository.claimMatching(preclaim.claim);
      } catch {
        return rejectedCallbackCompletion("doorstar_oidc_transaction_repository_unavailable");
      }
      if (claimed !== "claimed") return rejectedCallbackCompletion("doorstar_oidc_transaction_not_claimed");

      const delivery = createClaimedCallbackDelivery({
        authorizationCode: callback.authorizationCode,
        codeVerifier: preclaim.codeVerifier,
        nonce: preclaim.nonce,
        profile: cloneValidationProfile(profile),
      });
      let callbackFailed = false;
      try {
        await completeInput.onClaimed(delivery);
      } catch {
        callbackFailed = true;
      }
      try {
        const deliveryState = claimedCallbackDeliveries.get(delivery);
        if (deliveryState?.consumption === undefined) {
          return rejectedCallbackCompletion(callbackFailed
            ? "doorstar_oidc_claim_delivery_failed"
            : "doorstar_oidc_claim_delivery_unconsumed");
        }
        const consumptionSucceeded = await deliveryState.consumption;
        if (callbackFailed || !consumptionSucceeded) {
          return rejectedCallbackCompletion("doorstar_oidc_claim_delivery_failed");
        }
        return acceptedCallbackCompletion();
      } finally {
        claimedCallbackDeliveries.delete(delivery);
      }
    },
  });
}

export function createDoorstarOidcTransactionCookieClearHeader(): string {
  return doorstarBffOidcTransactionCookieName + "=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";
}

/**
 * Consumes one genuine post-CAS delivery. A foreign, replayed or malformed
 * delivery never invokes the consumer. The secret snapshot is removed before
 * the consumer runs, so a throw cannot re-open the authorization-code path.
 * The boundary also awaits a started consumption if its callback accidentally
 * returns before awaiting it. Consumer failures resolve false rather than
 * leaking a rejected fire-and-forget promise into the Node process.
 */
export async function consumeDoorstarOidcClaimedCallbackDelivery(
  value: unknown,
  consumer: (secrets: DoorstarOidcClaimedCallbackSecrets) => Promise<void> | void,
): Promise<boolean> {
  if (typeof value !== "object" || value === null || typeof consumer !== "function") return false;
  const delivery = claimedCallbackDeliveries.get(value);
  if (delivery === undefined || delivery.secrets === undefined || delivery.consumption !== undefined) return false;
  const secrets = delivery.secrets;
  delivery.secrets = undefined;
  delivery.consumption = Promise.resolve()
    .then(() => consumer(cloneClaimedCallbackSecrets(secrets)))
    .then(() => true, () => false);
  return await delivery.consumption;
}

type AuthorizationMaterial = {
  readonly kind: "accepted";
  readonly transaction: DoorstarOidcLoginTransaction;
  readonly plan: DoorstarOidcAuthorizationPlan;
};

type CallbackQuery =
  | { readonly kind: "accepted"; readonly authorizationCode: string; readonly state: string }
  | Extract<DoorstarOidcCallbackCompletion, { readonly kind: "rejected" }>;

type CallbackPreclaim =
  | {
      readonly kind: "accepted";
      readonly codeVerifier: string;
      readonly nonce: string;
      readonly claim: {
        readonly selector: string;
        readonly stateMacKeyVersion: number;
        readonly stateMac: Uint8Array;
        readonly profileDigest: string;
        readonly now: CanonicalUtcInstant;
      };
    }
  | Extract<DoorstarOidcCallbackCompletion, { readonly kind: "rejected" }>;

async function createAuthorizationMaterial(input: {
  readonly mac: DoorstarMacService;
  readonly profile: DoorstarHumanOidcValidationProfileSnapshot;
  readonly now: CanonicalUtcInstant;
  readonly expiresAt: CanonicalUtcInstant;
  readonly maximumLifetimeSeconds: number;
  readonly randomBytes: DoorstarRandomBytes;
}): Promise<AuthorizationMaterial | Extract<DoorstarOidcAuthorizationStart, { readonly kind: "rejected" }>> {
  let selector: string;
  try {
    selector = randomOpaqueSelector(input.randomBytes);
  } catch {
    return rejectedAuthorizationStart("doorstar_oidc_random_source_invalid");
  }

  let state: VersionedDoorstarMac;
  let nonce: Uint8Array | undefined;
  let verifier: Uint8Array | undefined;
  let stateMac: Uint8Array | undefined;
  try {
    state = await input.mac.signCurrent({
      specification: doorstarMacSpecifications.oidcState,
      fields: selectorFields(selector),
    });
    nonce = await input.mac.derive({
      specification: doorstarMacSpecifications.oidcNonce,
      keyVersion: state.keyVersion,
      fields: selectorFields(selector),
    });
    verifier = await input.mac.derive({
      specification: doorstarMacSpecifications.oidcPkceVerifier,
      keyVersion: state.keyVersion,
      fields: selectorFields(selector),
    });
    if (nonce === undefined || verifier === undefined) return rejectedAuthorizationStart("doorstar_oidc_key_unavailable");

    const transactionWithoutMac = {
      selector,
      keyVersion: state.keyVersion,
      stateMacKeyVersion: state.keyVersion,
      issuer: input.profile.issuer,
      clientId: input.profile.clientId,
      redirectUri: input.profile.redirectUri,
      profileDigest: input.profile.profileDigest,
      issuedAt: input.now,
      expiresAt: input.expiresAt,
    };
    stateMac = await input.mac.derive({
      specification: doorstarMacSpecifications.oidcTransactionState,
      keyVersion: state.keyVersion,
      fields: transactionStateMacFields(transactionWithoutMac),
    });
  } catch {
    return rejectedAuthorizationStart("doorstar_oidc_key_unavailable");
  }
  if (stateMac === undefined) return rejectedAuthorizationStart("doorstar_oidc_key_unavailable");

  const transaction = freezeTransaction({
    selector,
    keyVersion: state.keyVersion,
    stateMacKeyVersion: state.keyVersion,
    stateMac,
    issuer: input.profile.issuer,
    clientId: input.profile.clientId,
    redirectUri: input.profile.redirectUri,
    profileDigest: input.profile.profileDigest,
    issuedAt: input.now,
    expiresAt: input.expiresAt,
  });
  return Object.freeze({
    kind: "accepted" as const,
    transaction,
    plan: Object.freeze({
      transactionCookie: createTransactionCookie(selector, input.maximumLifetimeSeconds),
      authorizationRequestUri: createAuthorizationRequestUri({
        profile: input.profile,
        state: toCanonicalOpaqueSecret(state.mac),
        nonce: toCanonicalOpaqueSecret(nonce),
        codeChallenge: createPkceChallenge(toCanonicalOpaqueSecret(verifier)),
      }),
    }),
  });
}

async function validateCallbackBeforeClaim(input: {
  readonly mac: DoorstarMacService;
  readonly profile: DoorstarOidcTransactionProfileSnapshot;
  readonly transaction: DoorstarOidcLoginTransaction;
  readonly cookieSelector: string;
  readonly callback: Extract<CallbackQuery, { readonly kind: "accepted" }>;
  readonly now: CanonicalUtcInstant;
}): Promise<CallbackPreclaim> {
  if (!sameOpaqueString(input.cookieSelector, input.transaction.selector)
    || !sameProfile(input.profile, input.transaction)
    || compareCanonicalUtcInstants(input.transaction.issuedAt, input.now) > 0
    || compareCanonicalUtcInstants(input.transaction.expiresAt, input.now) <= 0) {
    return rejectedCallbackCompletion(compareCanonicalUtcInstants(input.transaction.expiresAt, input.now) <= 0
      ? "doorstar_oidc_transaction_expired"
      : "doorstar_oidc_transaction_invalid");
  }

  let stateMacVerification: Awaited<ReturnType<DoorstarMacService["verify"]>>;
  let expectedState: Uint8Array | undefined;
  let nonce: Uint8Array | undefined;
  let verifier: Uint8Array | undefined;
  try {
    stateMacVerification = await input.mac.verify({
      specification: doorstarMacSpecifications.oidcTransactionState,
      keyVersion: input.transaction.stateMacKeyVersion,
      mac: input.transaction.stateMac,
      fields: transactionStateMacFields(input.transaction),
    });
    expectedState = await input.mac.derive({
      specification: doorstarMacSpecifications.oidcState,
      keyVersion: input.transaction.keyVersion,
      fields: selectorFields(input.transaction.selector),
    });
    nonce = await input.mac.derive({
      specification: doorstarMacSpecifications.oidcNonce,
      keyVersion: input.transaction.keyVersion,
      fields: selectorFields(input.transaction.selector),
    });
    verifier = await input.mac.derive({
      specification: doorstarMacSpecifications.oidcPkceVerifier,
      keyVersion: input.transaction.keyVersion,
      fields: selectorFields(input.transaction.selector),
    });
  } catch {
    return rejectedCallbackCompletion("doorstar_oidc_transaction_key_unavailable");
  }
  if (stateMacVerification === "unknown_key"
    || expectedState === undefined
    || nonce === undefined
    || verifier === undefined) {
    return rejectedCallbackCompletion("doorstar_oidc_transaction_key_unavailable");
  }
  if (stateMacVerification !== "valid" || !sameOpaqueString(input.callback.state, toCanonicalOpaqueSecret(expectedState))) {
    return rejectedCallbackCompletion("doorstar_oidc_transaction_state_rejected");
  }

  return Object.freeze({
    kind: "accepted" as const,
    codeVerifier: toCanonicalOpaqueSecret(verifier),
    nonce: toCanonicalOpaqueSecret(nonce),
    claim: Object.freeze({
      selector: input.transaction.selector,
      stateMacKeyVersion: input.transaction.stateMacKeyVersion,
      stateMac: Buffer.from(input.transaction.stateMac),
      profileDigest: input.transaction.profileDigest,
      now: Object.freeze({ ...input.now }),
    }),
  });
}

function acceptedAuthorizationStart(): DoorstarOidcAuthorizationStart {
  return Object.freeze({ kind: "accepted" as const });
}

function rejectedAuthorizationStart(
  code: Extract<DoorstarOidcAuthorizationStart, { readonly kind: "rejected" }>["code"],
): Extract<DoorstarOidcAuthorizationStart, { readonly kind: "rejected" }> {
  return Object.freeze({ kind: "rejected" as const, code });
}

function acceptedCallbackCompletion(): DoorstarOidcCallbackCompletion {
  return Object.freeze({ kind: "accepted" as const });
}

function rejectedCallbackCompletion(
  code: Extract<DoorstarOidcCallbackCompletion, { readonly kind: "rejected" }>["code"],
): Extract<DoorstarOidcCallbackCompletion, { readonly kind: "rejected" }> {
  return Object.freeze({ kind: "rejected" as const, code });
}

function parseDoorstarOidcCallbackQuery(rawQuery: unknown): CallbackQuery {
  const pairs = parseRawQueryPairs(rawQuery);
  if (pairs === undefined) return rejectedCallbackCompletion("doorstar_oidc_callback_malformed");
  const byName = new Map<string, string[]>();
  for (const pair of pairs) {
    const values = byName.get(pair.name) ?? [];
    values.push(pair.value);
    byName.set(pair.name, values);
  }
  if (byName.has("error")) return rejectedCallbackCompletion("doorstar_oidc_callback_error");
  if (byName.size !== 2 || !byName.has("code") || !byName.has("state")) {
    return rejectedCallbackCompletion("doorstar_oidc_callback_parameters_invalid");
  }
  const codeValues = byName.get("code")!;
  const stateValues = byName.get("state")!;
  if (codeValues.length !== 1 || stateValues.length !== 1
    || !isAuthorizationCode(codeValues[0])
    || !isCanonicalOpaqueSecret(stateValues[0])) {
    return rejectedCallbackCompletion("doorstar_oidc_callback_parameters_invalid");
  }
  return Object.freeze({
    kind: "accepted" as const,
    authorizationCode: codeValues[0]!,
    state: stateValues[0]!,
  });
}

function snapshotTransaction(value: unknown): DoorstarOidcLoginTransaction | undefined {
  const fields = readExactOwnDataFields(value, TRANSACTION_FIELDS);
  if (fields === undefined) return undefined;
  const selector = fields.get("selector");
  const keyVersion = fields.get("keyVersion");
  const stateMacKeyVersion = fields.get("stateMacKeyVersion");
  const stateMac = fields.get("stateMac");
  const issuer = fields.get("issuer");
  const clientId = fields.get("clientId");
  const redirectUri = fields.get("redirectUri");
  const profileDigest = fields.get("profileDigest");
  const issuedAt = snapshotCanonicalUtcInstant(fields.get("issuedAt"));
  const expiresAt = snapshotCanonicalUtcInstant(fields.get("expiresAt"));
  if (!isCanonicalOpaqueSecret(selector)
    || !isKeyVersion(keyVersion)
    || !isKeyVersion(stateMacKeyVersion)
    || !(stateMac instanceof Uint8Array)
    || stateMac.byteLength !== 32
    || typeof issuer !== "string"
    || typeof clientId !== "string"
    || typeof redirectUri !== "string"
    || typeof profileDigest !== "string"
    || !isCanonicalIssuer(issuer)
    || !canonicalClientId.test(clientId)
    || !isCanonicalCallbackUri(redirectUri)
    || !isCanonicalOpaqueSecret(profileDigest)
    || issuedAt === undefined
    || expiresAt === undefined
    || compareCanonicalUtcInstants(expiresAt, issuedAt) <= 0) {
    return undefined;
  }
  return freezeTransaction({
    selector,
    keyVersion,
    stateMacKeyVersion,
    stateMac,
    issuer,
    clientId,
    redirectUri,
    profileDigest,
    issuedAt,
    expiresAt,
  });
}

function freezeTransaction(value: DoorstarOidcLoginTransaction): DoorstarOidcLoginTransaction {
  return Object.freeze({
    selector: value.selector,
    keyVersion: value.keyVersion,
    stateMacKeyVersion: value.stateMacKeyVersion,
    stateMac: Buffer.from(value.stateMac),
    issuer: value.issuer,
    clientId: value.clientId,
    redirectUri: value.redirectUri,
    profileDigest: value.profileDigest,
    issuedAt: Object.freeze({ ...value.issuedAt }),
    expiresAt: Object.freeze({ ...value.expiresAt }),
  });
}

function transactionStateMacFields(value: {
  readonly selector: string;
  readonly keyVersion: number;
  readonly stateMacKeyVersion: number;
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly profileDigest: string;
  readonly issuedAt: CanonicalUtcInstant;
  readonly expiresAt: CanonicalUtcInstant;
}): readonly DoorstarMacField[] {
  return Object.freeze([
    { kind: "utf8" as const, value: value.selector },
    { kind: "decimal" as const, value: value.keyVersion },
    { kind: "decimal" as const, value: value.stateMacKeyVersion },
    { kind: "utf8" as const, value: value.issuer },
    { kind: "utf8" as const, value: value.clientId },
    { kind: "utf8" as const, value: value.redirectUri },
    { kind: "utf8" as const, value: value.profileDigest },
    ...instantMacFields(value.issuedAt),
    ...instantMacFields(value.expiresAt),
  ]);
}

function instantMacFields(value: CanonicalUtcInstant): readonly DoorstarMacField[] {
  return Object.freeze([
    { kind: "utf8" as const, value: value.wireValue },
    { kind: "decimal" as const, value: value.epochSeconds },
    { kind: "decimal" as const, value: value.nanoseconds },
  ]);
}

function selectorFields(selector: string): readonly DoorstarMacField[] {
  return Object.freeze([{ kind: "utf8" as const, value: selector }]);
}

function createTransactionCookie(selector: string, maximumLifetimeSeconds: number): string {
  return doorstarBffOidcTransactionCookieName + "=" + selector
    + "; Path=/; Max-Age=" + maximumLifetimeSeconds + "; Secure; HttpOnly; SameSite=Lax";
}

function createAuthorizationRequestUri(input: {
  readonly profile: DoorstarHumanOidcValidationProfileSnapshot;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
}): string {
  const uri = new URL(input.profile.authorizationEndpoint);
  uri.search = new URLSearchParams([
    ["response_type", "code"],
    ["client_id", input.profile.clientId],
    ["redirect_uri", input.profile.redirectUri],
    ["scope", input.profile.scopes.join(" ")],
    ["state", input.state],
    ["nonce", input.nonce],
    ["code_challenge", input.codeChallenge],
    ["code_challenge_method", "S256"],
  ]).toString();
  return uri.toString();
}

function cloneValidationProfile(profile: DoorstarHumanOidcValidationProfileSnapshot): DoorstarHumanOidcValidationProfileSnapshot {
  return Object.freeze({
    releaseId: profile.releaseId,
    issuer: profile.issuer,
    authorizationEndpoint: profile.authorizationEndpoint,
    tokenEndpoint: profile.tokenEndpoint,
    jwksUri: profile.jwksUri,
    clientId: profile.clientId,
    redirectUri: profile.redirectUri,
    productScope: profile.productScope,
    scopes: Object.freeze([...profile.scopes]),
    accessTokenAudiences: Object.freeze([...profile.accessTokenAudiences]),
    accessTokenAuthorizedParty: profile.accessTokenAuthorizedParty,
    idTokenAudiences: Object.freeze([...profile.idTokenAudiences]),
    idTokenAuthorizedParty: profile.idTokenAuthorizedParty,
    accessTokenJoseType: profile.accessTokenJoseType,
    accessTokenPayloadType: profile.accessTokenPayloadType,
    idTokenJoseType: profile.idTokenJoseType,
    accessTokenMaximumLifetimeSeconds: profile.accessTokenMaximumLifetimeSeconds,
    idTokenMaximumLifetimeSeconds: profile.idTokenMaximumLifetimeSeconds,
    authorityProjectionContract: profile.authorityProjectionContract,
    idTokenAuthorityClaims: profile.idTokenAuthorityClaims,
    clockSkewSeconds: profile.clockSkewSeconds,
    profileDigest: profile.profileDigest,
  });
}

function createClaimedCallbackDelivery(value: DoorstarOidcClaimedCallbackSecrets): DoorstarOidcClaimedCallbackDelivery {
  const delivery = Object.freeze({}) as DoorstarOidcClaimedCallbackDelivery;
  claimedCallbackDeliveries.set(delivery, {
    secrets: cloneClaimedCallbackSecrets(value),
    consumption: undefined,
  });
  return delivery;
}

function cloneClaimedCallbackSecrets(value: DoorstarOidcClaimedCallbackSecrets): DoorstarOidcClaimedCallbackSecrets {
  return Object.freeze({
    authorizationCode: value.authorizationCode,
    codeVerifier: value.codeVerifier,
    nonce: value.nonce,
    profile: cloneValidationProfile(value.profile),
  });
}

interface DoorstarOidcClaimedCallbackDeliveryState {
  secrets: DoorstarOidcClaimedCallbackSecrets | undefined;
  consumption: Promise<boolean> | undefined;
}

function randomOpaqueSelector(randomBytes: DoorstarRandomBytes): string {
  const bytes = randomBytes(DOORSTAR_OPAQUE_SECRET_BYTES);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== DOORSTAR_OPAQUE_SECRET_BYTES) {
    throw new Error("doorstar_oidc_random_source_invalid");
  }
  return Buffer.from(bytes).toString("base64url");
}

function parseTransactionSelector(value: unknown): string | undefined {
  return isCanonicalOpaqueSecret(value) ? value : undefined;
}

function isCanonicalOpaqueSecret(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== DOORSTAR_OPAQUE_SECRET_BASE64URL_LENGTH || !canonicalOpaqueSecret.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === DOORSTAR_OPAQUE_SECRET_BYTES && decoded.toString("base64url") === value;
}

function toCanonicalOpaqueSecret(value: Uint8Array): string {
  if (!(value instanceof Uint8Array) || value.byteLength !== DOORSTAR_OPAQUE_SECRET_BYTES) {
    throw new Error("doorstar_oidc_derivation_invalid");
  }
  return Buffer.from(value).toString("base64url");
}

function sameOpaqueString(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "ascii");
  const rightBytes = Buffer.from(right, "ascii");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function createPkceChallenge(verifier: string): string {
  if (!isCanonicalOpaqueSecret(verifier)) throw new Error("doorstar_oidc_verifier_invalid");
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function parseRawQueryPairs(value: unknown): readonly { readonly name: string; readonly value: string }[] | undefined {
  if (typeof value !== "string"
    || value.length === 0
    || value.length > 8_192
    || value.startsWith("?")
    || value.includes("#")) {
    return undefined;
  }
  const pairs: Array<{ readonly name: string; readonly value: string }> = [];
  for (const segment of value.split("&")) {
    const separator = segment.indexOf("=");
    if (segment.length === 0 || separator < 1) return undefined;
    const name = decodeFormComponent(segment.slice(0, separator));
    const itemValue = decodeFormComponent(segment.slice(separator + 1));
    if (name === undefined || itemValue === undefined || name.length === 0 || itemValue.length === 0) return undefined;
    pairs.push(Object.freeze({ name, value: itemValue }));
  }
  return Object.freeze(pairs);
}

function decodeFormComponent(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value.replace(/\+/gu, " "));
    return decoded.length <= 4_096 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function isAuthorizationCode(value: string): boolean {
  return value.length >= 1 && value.length <= 4_096 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function sameProfile(profile: DoorstarOidcTransactionProfileSnapshot, transaction: DoorstarOidcLoginTransaction): boolean {
  return profile.issuer === transaction.issuer
    && profile.clientId === transaction.clientId
    && profile.redirectUri === transaction.redirectUri
    && profile.profileDigest === transaction.profileDigest;
}

function isTransactionLifetime(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAXIMUM_DOORSTAR_OIDC_TRANSACTION_LIFETIME_SECONDS;
}

function isKeyVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function isCanonicalIssuer(value: string): boolean {
  if (value.length === 0 || value !== value.trim() || value.endsWith("/")) return false;
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

function isCanonicalCallbackUri(value: string): boolean {
  if (value.length === 0 || value !== value.trim()) return false;
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

function addWholeSeconds(value: CanonicalUtcInstant, seconds: number): CanonicalUtcInstant | undefined {
  const epochSeconds = value.epochSeconds + seconds;
  if (!Number.isSafeInteger(epochSeconds)) return undefined;
  const date = new Date(epochSeconds * 1_000);
  if (!Number.isFinite(date.getTime())) return undefined;
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9_999) return undefined;
  const fraction = value.nanoseconds === 0
    ? ""
    : "." + value.nanoseconds.toString(10).padStart(9, "0").replace(/0+$/u, "");
  const wireValue = [
    year.toString(10).padStart(4, "0"),
    (date.getUTCMonth() + 1).toString(10).padStart(2, "0"),
    date.getUTCDate().toString(10).padStart(2, "0"),
  ].join("-")
    + "T" + date.getUTCHours().toString(10).padStart(2, "0")
    + ":" + date.getUTCMinutes().toString(10).padStart(2, "0")
    + ":" + date.getUTCSeconds().toString(10).padStart(2, "0") + fraction + "Z";
  try {
    return Object.freeze(parseCanonicalUtcInstant(wireValue));
  } catch {
    return undefined;
  }
}
