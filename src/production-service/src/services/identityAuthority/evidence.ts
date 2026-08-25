import { resolveIdentityAuthorityClient, type IdentityAuthorityResolution, type IdentityAuthorityResolverClient } from "./client.js";
import {
  compareCanonicalUtcInstants,
  IDENTITY_AUTHORITY_SCHEMA_VERSION,
  isAllowedCanonicalTenantId,
  type CanonicalUtcInstant,
  type IdentityAuthorityState,
} from "./contract.js";
import {
  resolveActiveDoorstarTenantBinding,
  type ActiveDoorstarInstanceTenantBinding,
  type DoorstarInstanceTenantBindingSnapshot,
} from "./controlPlane.js";
import { evaluateIdentityAuthorityEvidencePolicy, isCanonicalIdentityAuthorityGrantSequence } from "./evidencePolicy.js";
import { hasExactFieldKeys, readExactOwnDataFields, readOwnDataFields, snapshotCanonicalStringArray, snapshotCanonicalUtcInstant } from "./safeSnapshot.js";
import {
  exchangeDoorstarHumanOidcCodeAndConsume,
  type DoorstarHumanOidcCodeExchangeSource,
} from "./bff/humanOidcCodeExchangePort.js";
import {
  verifyDoorstarHumanJwtAndConsume,
  type DoorstarHumanJwtVerifier,
  type DoorstarValidatedHumanOidcFacts,
} from "./bff/humanJwtVerifier.js";
import {
  doorstarMacSpecifications,
  type DoorstarMacField,
  type DoorstarMacService,
  type VersionedDoorstarMac,
} from "./bff/mac.js";
import type { DoorstarOidcClaimedCallbackDelivery } from "./bff/pkceTransaction.js";
import {
  createDoorstarSessionCookieHeaders,
  createDoorstarSessionSecrets,
  selectDoorstarSessionExpiry,
  type DoorstarRandomBytes,
  type DoorstarSessionCookieHeaders,
  type DoorstarSessionSecrets,
} from "./bff/session.js";

const DOORSTAR_MODULE = "joinerytech.door";
const DOORSTAR_CAPABILITIES = Object.freeze(["view", "edit", "admin"] as const);
const VERIFIED_HUMAN_IDENTITY_PROOF = Symbol("verifiedHumanIdentityProof");
const PROOF_FIELDS = Object.freeze([
  "subject",
  "tenantId",
  "membershipVersion",
  "projectionVersion",
  "enabledModules",
  "permissions",
  "tokenIssuedAt",
  "tokenExpiresAt",
  VERIFIED_HUMAN_IDENTITY_PROOF,
] as const);
const STATE_FIELDS = Object.freeze([
  "schemaVersion",
  "subject",
  "tenantId",
  "tenantStatus",
  "membershipStatus",
  "membershipVersion",
  "projectionVersion",
  "acceptTokensIssuedAtOrAfter",
  "permissions",
  "enabledModules",
] as const);
const VALIDATED_HUMAN_FACT_FIELDS = Object.freeze([
  "subject",
  "tenantId",
  "membershipVersion",
  "projectionVersion",
  "enabledModules",
  "permissions",
  "accessTokenIssuedAt",
  "accessTokenExpiresAt",
  "idTokenExpiresAt",
] as const);
const BOUNDARY_DEPENDENCY_FIELDS = Object.freeze([
  "codeExchangeSource",
  "humanJwtVerifier",
  "resolver",
  "controlPlaneRepositoryFactory",
  "mac",
  "now",
  "maximumSessionLifetimeSeconds",
  "randomBytes",
  "randomUuid",
] as const);
const BOUNDARY_COMPLETION_FIELDS = Object.freeze(["claimedDelivery", "onIssued"] as const);
const CONTROL_PLANE_REPOSITORY_FACTORY_FIELDS = Object.freeze(["create"] as const);
const CONTROL_PLANE_REPOSITORY_FIELDS = Object.freeze([
  "loadIdentityAuthorityBinding",
  "persistAcceptedEvidenceAndSession",
] as const);
const MAC_SERVICE_FIELDS = Object.freeze(["signCurrent", "derive", "verify"] as const);
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SESSION_MAXIMUM_LIFETIME_SECONDS = 3_600;

declare const doorstarTrustedIdentityAuthorityIssuanceCommitBrand: unique symbol;
declare const doorstarTrustedIdentityAuthorityIssuanceCommitConsumerBrand: unique symbol;

const trustedIssuanceCommitConsumers = new WeakMap<object, (
  commit: unknown,
  consumer: (snapshot: DoorstarTrustedIdentityAuthorityIssuanceSnapshot) => Promise<void> | void,
) => Promise<boolean>>();

export type DoorstarCapability = (typeof DOORSTAR_CAPABILITIES)[number];

/**
 * Trusted, server-only result of M2 human-JWT validation. This module accepts
 * no raw JWT, bearer token, browser input, role, station, or consumer selector.
 */
export interface VerifiedHumanIdentityProofInput {
  readonly subject: string;
  readonly tenantId: string;
  readonly membershipVersion: bigint;
  readonly projectionVersion: bigint;
  readonly enabledModules: readonly string[];
  readonly permissions: readonly string[];
  readonly tokenIssuedAt: CanonicalUtcInstant;
  readonly tokenExpiresAt: CanonicalUtcInstant;
}

/** Opaque proof type; M1 deliberately exposes no production-side minting API. */
export type VerifiedHumanIdentityProof = Readonly<VerifiedHumanIdentityProofInput & {
  readonly [VERIFIED_HUMAN_IDENTITY_PROOF]: true;
}>;

export interface DoorstarTenantBindingProvider {
  loadIdentityAuthorityBinding(): Promise<DoorstarInstanceTenantBindingSnapshot | null>;
}

export interface IdentityAuthorityEvidenceAssembler {
  assembleForVerifiedHumanIdentity(proof: VerifiedHumanIdentityProof): Promise<ResolvedIdentityAuthorityEvidenceAssembly>;
}

interface IdentityAuthorityEvidenceAssemblerDependencies {
  readonly resolver: IdentityAuthorityResolverClient;
  readonly bindingProvider: DoorstarTenantBindingProvider;
  readonly now: () => CanonicalUtcInstant;
}

export interface ResolvedIdentityAuthorityEvidence {
  readonly evidenceVersion: 1;
  readonly tenantBindingId: string;
  readonly tenantId: string;
  readonly bindingVersion: bigint;
  readonly subject: string;
  readonly schemaVersion: IdentityAuthorityState["schemaVersion"];
  readonly membershipVersion: bigint;
  readonly projectionVersion: bigint;
  readonly enabledModules: readonly string[];
  readonly permissions: readonly string[];
  readonly acceptTokensIssuedAtOrAfter: CanonicalUtcInstant;
  readonly tokenIssuedAt: CanonicalUtcInstant;
  readonly tokenExpiresAt: CanonicalUtcInstant;
  readonly capability: DoorstarCapability;
}

interface AssembleResolvedIdentityAuthorityEvidenceInput {
  readonly binding: DoorstarInstanceTenantBindingSnapshot;
  readonly proof: VerifiedHumanIdentityProof;
  readonly resolution: IdentityAuthorityResolution;
  readonly now: CanonicalUtcInstant;
}

export type ResolvedIdentityAuthorityEvidenceAssembly =
  | { readonly kind: "accepted"; readonly evidence: ResolvedIdentityAuthorityEvidence }
  | { readonly kind: "denied"; readonly reason: EvidenceDenialReason }
  | { readonly kind: "unavailable"; readonly reason: EvidenceUnavailableReason };

export type EvidenceUnavailableReason = Extract<IdentityAuthorityResolution, { readonly kind: "unavailable" }>["reason"]
  | "binding_unavailable"
  | "authority_clock_unavailable";

export type EvidenceDenialReason =
  | "binding_invalid"
  | "binding_inactive"
  | "binding_missing"
  | "resolver_denied"
  | "proof_invalid"
  | "state_inactive"
  | "identity_mismatch"
  | "version_mismatch"
  | "grant_mismatch"
  | "doorstar_grant_invalid"
  | "token_before_cutoff"
  | "token_not_yet_valid"
  | "token_expired";

/**
 * One-use, boundary-minted persistence capability. It has no structural
 * evidence, session, token, code, verifier or CSRF fields at runtime. The
 * high-level boundary below is its only creator.
 */
export interface DoorstarTrustedIdentityAuthorityIssuanceCommit {
  readonly [doorstarTrustedIdentityAuthorityIssuanceCommitBrand]: never;
}

/**
 * Token-free snapshot visible only while a genuine trusted commit is being
 * consumed by the repository factory that the boundary chose at construction.
 */
export interface DoorstarTrustedIdentityAuthorityIssuanceSnapshot {
  readonly evidence: {
    readonly id: string;
    readonly tenantBindingId: string;
    readonly tenantId: string;
    readonly bindingVersion: bigint;
    readonly subject: string;
    readonly schemaVersion: IdentityAuthorityState["schemaVersion"];
    readonly membershipVersion: bigint;
    readonly projectionVersion: bigint;
    readonly enabledModules: readonly string[];
    readonly permissions: readonly string[];
    readonly acceptTokensIssuedAtOrAfter: CanonicalUtcInstant;
    readonly tokenIssuedAt: CanonicalUtcInstant;
    readonly tokenExpiresAt: CanonicalUtcInstant;
    readonly stateMacKeyVersion: number;
    readonly stateMac: Uint8Array;
    readonly correlationId: string;
    readonly capability: DoorstarCapability;
  };
  readonly session: {
    readonly selector: string;
    readonly verifierMacKeyVersion: number;
    readonly verifierMac: Uint8Array;
    readonly csrfMacKeyVersion: number;
    readonly csrfMac: Uint8Array;
    readonly stateMacKeyVersion: number;
    readonly stateMac: Uint8Array;
    readonly issuedAt: CanonicalUtcInstant;
    readonly expiresAt: CanonicalUtcInstant;
    /** Required to re-check the exact boundary-owned expiry minimum. */
    readonly idTokenExpiresAt: CanonicalUtcInstant;
    readonly maximumLifetimeSeconds: number;
  };
}

/**
 * This consumer is closure-scoped by createDoorstarIdentityBoundary. A Prisma
 * adapter can consume a genuine commit, but it cannot mint one or obtain a
 * generic structural write DTO.
 */
export interface DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer {
  readonly [doorstarTrustedIdentityAuthorityIssuanceCommitConsumerBrand]: never;
}

/**
 * @internal The only bridge a separately compiled typed Prisma adapter may
 * use. It recognises a consumer only when the same evidence-boundary factory
 * created it; a structural `{ consume() {} }` value cannot unlock a write.
 */
export async function consumeDoorstarTrustedIdentityAuthorityIssuanceCommit(
  commitConsumer: unknown,
  commit: unknown,
  consumer: (snapshot: DoorstarTrustedIdentityAuthorityIssuanceSnapshot) => Promise<void> | void,
): Promise<boolean> {
  if (typeof commitConsumer !== "object" || commitConsumer === null || typeof consumer !== "function") return false;
  const consume = trustedIssuanceCommitConsumers.get(commitConsumer);
  return consume === undefined ? false : await consume(commit, consumer);
}

/** Only the binding read and atomic accepted-evidence/session issuance exist in this slice. */
export interface DoorstarIdentityAuthorityControlPlaneRepository extends DoorstarTenantBindingProvider {
  persistAcceptedEvidenceAndSession(
    commit: DoorstarTrustedIdentityAuthorityIssuanceCommit,
  ): Promise<"persisted" | "not_persisted">;
}

/**
 * The boundary gives the selected adapter its private commit consumer during
 * construction. This avoids a public, structurally forgeable writer API.
 */
export interface DoorstarIdentityAuthorityControlPlaneRepositoryFactory {
  create(
    commitConsumer: DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer,
  ): DoorstarIdentityAuthorityControlPlaneRepository;
}

export interface DoorstarIdentityBoundary {
  /**
   * The only authority-bearing input is a genuine post-CAS PKCE delivery. On
   * accepted issuance, headers are handed directly to the future HTTP
   * Set-Cookie boundary; no secrets appear in this completion value.
   */
  completeClaimedLogin(input: {
    readonly claimedDelivery: DoorstarOidcClaimedCallbackDelivery;
    readonly onIssued: (headers: DoorstarSessionCookieHeaders) => Promise<void> | void;
  }): Promise<DoorstarIdentityBoundaryCompletion>;
}

export type DoorstarIdentityBoundaryCompletion =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "denied";
      readonly code: "doorstar_identity_human_jwt_denied" | "doorstar_identity_evidence_denied";
    }
  | {
      readonly kind: "unavailable";
      readonly code:
        | "doorstar_identity_input_invalid"
        | "doorstar_identity_code_exchange_unavailable"
        | "doorstar_identity_human_jwt_unavailable"
        | "doorstar_identity_evidence_unavailable"
        | "doorstar_identity_session_time_unavailable"
        | "doorstar_identity_session_mac_unavailable"
        | "doorstar_identity_session_random_unavailable"
        | "doorstar_identity_persistence_unavailable"
        | "doorstar_identity_session_delivery_failed";
    };

interface IdentityBoundaryDependencies {
  readonly codeExchangeSource: DoorstarHumanOidcCodeExchangeSource;
  readonly humanJwtVerifier: DoorstarHumanJwtVerifier;
  readonly resolver: IdentityAuthorityResolverClient;
  readonly controlPlaneRepositoryFactory: DoorstarIdentityAuthorityControlPlaneRepositoryFactory;
  readonly mac: DoorstarMacService;
  readonly now: () => unknown;
  readonly maximumSessionLifetimeSeconds: number;
  readonly randomBytes: DoorstarRandomBytes;
  readonly randomUuid: () => string;
}

/**
 * The sole production runtime export from this module. It composes the
 * existing opaque PKCE/code-exchange/JWT deliveries with the private proof and
 * evidence assembler below. It still opens no connection, route, cookie or
 * environment configuration by itself.
 */
export function createDoorstarIdentityBoundary(value: unknown): DoorstarIdentityBoundary | undefined {
  const dependencies = snapshotIdentityBoundaryDependencies(value);
  if (dependencies === undefined) return undefined;

  const commitGate = createTrustedIssuanceCommitGate();
  let repository: DoorstarIdentityAuthorityControlPlaneRepository;
  try {
    repository = dependencies.controlPlaneRepositoryFactory.create(commitGate.consumer);
  } catch {
    return undefined;
  }
  if (!isIdentityAuthorityControlPlaneRepository(repository)) return undefined;

  const assembler = createIdentityAuthorityEvidenceAssemblerWithDependencies({
    resolver: Object.freeze({
      async resolve(input: unknown): Promise<IdentityAuthorityResolution> {
        return await resolveIdentityAuthorityClient(dependencies.resolver, input);
      },
    }),
    bindingProvider: repository,
    now: () => {
      const now = readBoundaryClock(dependencies.now);
      if (now === undefined) throw new Error("doorstar_identity_clock_invalid");
      return now;
    },
  });

  return Object.freeze({
    async completeClaimedLogin(input: Parameters<DoorstarIdentityBoundary["completeClaimedLogin"]>[0]) {
      const completionInput = snapshotBoundaryCompletionInput(input);
      if (completionInput === undefined) return unavailableIdentityBoundary("doorstar_identity_input_invalid");

      let outcome: DoorstarIdentityBoundaryCompletion | undefined;
      try {
        const codeExchange = await exchangeDoorstarHumanOidcCodeAndConsume(
          dependencies.codeExchangeSource,
          completionInput.claimedDelivery,
          async (tokenDelivery) => {
            const tokenConsumed = await tokenDelivery.consume(async (tokens) => {
              const verification = await verifyDoorstarHumanJwtAndConsume(dependencies.humanJwtVerifier, tokens, async (validatedDelivery) => {
                await validatedDelivery.consume(async (facts) => {
                  outcome = await issueAcceptedEvidenceAndSession({
                    dependencies,
                    assembler,
                    repository,
                    commitGate,
                    facts,
                    onIssued: completionInput.onIssued,
                  });
                });
              });

              if (verification.kind === "denied") {
                outcome = deniedIdentityBoundary("doorstar_identity_human_jwt_denied");
              } else if (verification.kind === "unavailable") {
                outcome = unavailableIdentityBoundary("doorstar_identity_human_jwt_unavailable");
              } else if (verification.kind !== "accepted" || outcome === undefined) {
                outcome = unavailableIdentityBoundary("doorstar_identity_human_jwt_unavailable");
              }
            });
            if (!tokenConsumed && outcome === undefined) {
              outcome = unavailableIdentityBoundary("doorstar_identity_code_exchange_unavailable");
            }
          },
        );
        if (outcome !== undefined) return outcome;
        return codeExchange.kind === "accepted"
          ? unavailableIdentityBoundary("doorstar_identity_human_jwt_unavailable")
          : unavailableIdentityBoundary("doorstar_identity_code_exchange_unavailable");
      } catch {
        return unavailableIdentityBoundary("doorstar_identity_code_exchange_unavailable");
      }
    },
  });
}

async function issueAcceptedEvidenceAndSession(input: {
  readonly dependencies: IdentityBoundaryDependencies;
  readonly assembler: IdentityAuthorityEvidenceAssembler;
  readonly repository: DoorstarIdentityAuthorityControlPlaneRepository;
  readonly commitGate: TrustedIssuanceCommitGate;
  readonly facts: DoorstarValidatedHumanOidcFacts;
  readonly onIssued: (headers: DoorstarSessionCookieHeaders) => Promise<void> | void;
}): Promise<DoorstarIdentityBoundaryCompletion> {
  const facts = snapshotValidatedHumanFacts(input.facts);
  if (facts === undefined) return unavailableIdentityBoundary("doorstar_identity_human_jwt_unavailable");

  let assembly: ResolvedIdentityAuthorityEvidenceAssembly;
  try {
    assembly = await input.assembler.assembleForVerifiedHumanIdentity(facts.proof);
  } catch {
    return unavailableIdentityBoundary("doorstar_identity_evidence_unavailable");
  }
  if (assembly.kind === "denied") return deniedIdentityBoundary("doorstar_identity_evidence_denied");
  if (assembly.kind !== "accepted") return unavailableIdentityBoundary("doorstar_identity_evidence_unavailable");

  const issuedAt = readBoundaryClock(input.dependencies.now);
  if (issuedAt === undefined || compareCanonicalUtcInstants(issuedAt, assembly.evidence.tokenIssuedAt) < 0) {
    return unavailableIdentityBoundary("doorstar_identity_session_time_unavailable");
  }
  const expiry = selectDoorstarSessionExpiry({
    now: issuedAt,
    humanAccessTokenExpiresAt: assembly.evidence.tokenExpiresAt,
    humanIdTokenExpiresAt: facts.idTokenExpiresAt,
    maximumLifetimeSeconds: input.dependencies.maximumSessionLifetimeSeconds,
  });
  if (expiry.kind === "rejected") return unavailableIdentityBoundary("doorstar_identity_session_time_unavailable");

  let sessionSecrets: DoorstarSessionSecrets;
  let ids: { readonly evidenceId: string; readonly correlationId: string };
  try {
    sessionSecrets = createDoorstarSessionSecrets(input.dependencies.randomBytes);
    ids = createDistinctServerIdentifiers(input.dependencies.randomUuid);
  } catch {
    return unavailableIdentityBoundary("doorstar_identity_session_random_unavailable");
  }

  let evidenceState: VersionedDoorstarMac;
  let verifierState: VersionedDoorstarMac;
  let csrfState: VersionedDoorstarMac;
  let sessionState: VersionedDoorstarMac;
  try {
    evidenceState = await input.dependencies.mac.signCurrent({
      specification: doorstarMacSpecifications.evidenceState,
      fields: evidenceStateMacFields(assembly.evidence, ids),
    });
    verifierState = await input.dependencies.mac.signCurrent({
      specification: doorstarMacSpecifications.sessionVerifier,
      fields: sessionVerifierMacFields(sessionSecrets),
    });
    csrfState = await input.dependencies.mac.signCurrent({
      specification: doorstarMacSpecifications.sessionCsrf,
      fields: sessionCsrfMacFields(sessionSecrets),
    });
    sessionState = await input.dependencies.mac.signCurrent({
      specification: doorstarMacSpecifications.sessionState,
      fields: sessionStateMacFields({
        evidence: assembly.evidence,
        evidenceId: ids.evidenceId,
        evidenceState,
        selector: sessionSecrets.selector,
        issuedAt,
        expiresAt: expiry.expiresAt,
      }),
    });
  } catch {
    return unavailableIdentityBoundary("doorstar_identity_session_mac_unavailable");
  }

  const commitSnapshot = snapshotTrustedIssuanceSnapshot({
    evidence: {
      id: ids.evidenceId,
      ...assembly.evidence,
      stateMacKeyVersion: evidenceState.keyVersion,
      stateMac: evidenceState.mac,
      correlationId: ids.correlationId,
    },
    session: {
      selector: sessionSecrets.selector,
      verifierMacKeyVersion: verifierState.keyVersion,
      verifierMac: verifierState.mac,
      csrfMacKeyVersion: csrfState.keyVersion,
      csrfMac: csrfState.mac,
      stateMacKeyVersion: sessionState.keyVersion,
      stateMac: sessionState.mac,
      issuedAt,
      expiresAt: expiry.expiresAt,
      idTokenExpiresAt: facts.idTokenExpiresAt,
      maximumLifetimeSeconds: input.dependencies.maximumSessionLifetimeSeconds,
    },
  });
  if (commitSnapshot === undefined) return unavailableIdentityBoundary("doorstar_identity_session_mac_unavailable");

  let persistence: "persisted" | "not_persisted";
  try {
    persistence = await input.repository.persistAcceptedEvidenceAndSession(input.commitGate.create(commitSnapshot));
  } catch {
    return unavailableIdentityBoundary("doorstar_identity_persistence_unavailable");
  }
  if (persistence !== "persisted") return unavailableIdentityBoundary("doorstar_identity_persistence_unavailable");

  try {
    await input.onIssued(createDoorstarSessionCookieHeaders(sessionSecrets, expiry.cookieMaxAgeSeconds));
    return acceptedIdentityBoundary();
  } catch {
    // The immutable evidence/session pair remains auditable, but a failed
    // transport handoff must never be reported as a successful browser login.
    return unavailableIdentityBoundary("doorstar_identity_session_delivery_failed");
  }
}

function createIdentityAuthorityEvidenceAssemblerWithDependencies(
  dependencies: IdentityAuthorityEvidenceAssemblerDependencies,
): IdentityAuthorityEvidenceAssembler {
  return Object.freeze({
    async assembleForVerifiedHumanIdentity(candidate: VerifiedHumanIdentityProof): Promise<ResolvedIdentityAuthorityEvidenceAssembly> {
      const proof = snapshotProof(candidate);
      if (proof === undefined) return { kind: "denied", reason: "proof_invalid" };

      let binding: DoorstarInstanceTenantBindingSnapshot | null;
      try {
        binding = await dependencies.bindingProvider.loadIdentityAuthorityBinding();
      } catch {
        return { kind: "unavailable", reason: "binding_unavailable" };
      }
      if (binding === null) return { kind: "denied", reason: "binding_missing" };

      let resolution: IdentityAuthorityResolution;
      try {
        resolution = await dependencies.resolver.resolve({ subject: proof.subject, tenantId: proof.tenantId });
      } catch {
        return { kind: "unavailable", reason: "resolver_unavailable" };
      }
      let now: CanonicalUtcInstant;
      try {
        now = dependencies.now();
      } catch {
        return { kind: "unavailable", reason: "authority_clock_unavailable" };
      }
      return assembleResolvedIdentityAuthorityEvidence({ binding, proof, resolution, now });
    },
  });
}

/** Produces immutable, token-free evidence only after every authority input agrees exactly. */
function assembleResolvedIdentityAuthorityEvidence(
  input: AssembleResolvedIdentityAuthorityEvidenceInput,
): ResolvedIdentityAuthorityEvidenceAssembly {
  const activeBinding = resolveActiveDoorstarTenantBinding(input.binding);
  if (activeBinding.kind === "denied") return activeBinding;
  const proof = snapshotProof(input.proof);
  const now = snapshotCanonicalUtcInstant(input.now);
  if (proof === undefined || now === undefined) return { kind: "denied", reason: "proof_invalid" };

  const resolution = snapshotResolution(input.resolution);
  if (resolution === undefined) return { kind: "unavailable", reason: "resolver_contract_invalid" };
  if (resolution.kind === "unavailable") {
    return { kind: "unavailable", reason: resolution.reason };
  }
  if (resolution.kind === "denied") return { kind: "denied", reason: "resolver_denied" };

  const state = snapshotState(resolution.state);
  if (state === undefined) return { kind: "denied", reason: "proof_invalid" };
  const policy = evaluateIdentityAuthorityEvidencePolicy({
    bindingTenantId: activeBinding.binding.tenantId,
    proof,
    state,
    now,
  });
  if (policy.kind === "denied") return policy;
  const capability = resolveDoorstarCapability(state.enabledModules, state.permissions);
  if (capability === undefined) return { kind: "denied", reason: "doorstar_grant_invalid" };

  return {
    kind: "accepted",
    evidence: freezeEvidence(activeBinding.binding, proof, state, capability),
  };
}

function snapshotProof(value: unknown): VerifiedHumanIdentityProof | undefined {
  const fields = readExactOwnDataFields(value, PROOF_FIELDS);
  if (fields === undefined || fields.get(VERIFIED_HUMAN_IDENTITY_PROOF) !== true) return undefined;
  const subject = fields.get("subject");
  const tenantId = fields.get("tenantId");
  const membershipVersion = fields.get("membershipVersion");
  const projectionVersion = fields.get("projectionVersion");
  const enabledModules = snapshotCanonicalStringArray(fields.get("enabledModules"), 10);
  const permissions = snapshotCanonicalStringArray(fields.get("permissions"), 10);
  const tokenIssuedAt = snapshotCanonicalUtcInstant(fields.get("tokenIssuedAt"));
  const tokenExpiresAt = snapshotCanonicalUtcInstant(fields.get("tokenExpiresAt"));
  if (typeof subject !== "string"
    || typeof tenantId !== "string"
    || typeof membershipVersion !== "bigint"
    || typeof projectionVersion !== "bigint"
    || enabledModules === undefined
    || permissions === undefined
    || tokenIssuedAt === undefined
    || tokenExpiresAt === undefined
    || !isCanonicalSubject(subject)
    || !isAllowedCanonicalTenantId(tenantId)
    || !isPositiveBigInt(membershipVersion)
    || !isPositiveBigInt(projectionVersion)
    || !isCanonicalIdentityAuthorityGrantSequence(enabledModules, permissions)) {
    return undefined;
  }
  return Object.freeze({
    subject,
    tenantId,
    membershipVersion,
    projectionVersion,
    enabledModules,
    permissions,
    tokenIssuedAt,
    tokenExpiresAt,
    [VERIFIED_HUMAN_IDENTITY_PROOF]: true as const,
  });
}

function snapshotState(value: unknown): IdentityAuthorityState | undefined {
  const fields = readExactOwnDataFields(value, STATE_FIELDS);
  if (fields === undefined) return undefined;
  const schemaVersion = fields.get("schemaVersion");
  const subject = fields.get("subject");
  const tenantId = fields.get("tenantId");
  const tenantStatus = fields.get("tenantStatus");
  const membershipStatus = fields.get("membershipStatus");
  const membershipVersion = fields.get("membershipVersion");
  const projectionVersion = fields.get("projectionVersion");
  const enabledModules = snapshotCanonicalStringArray(fields.get("enabledModules"), 10);
  const permissions = snapshotCanonicalStringArray(fields.get("permissions"), 10);
  const cutoff = snapshotCanonicalUtcInstant(fields.get("acceptTokensIssuedAtOrAfter"));
  if (schemaVersion !== IDENTITY_AUTHORITY_SCHEMA_VERSION
    || typeof subject !== "string"
    || typeof tenantId !== "string"
    || (tenantStatus !== "active" && tenantStatus !== "deactivated")
    || (membershipStatus !== "active" && membershipStatus !== "deactivated" && membershipStatus !== "revoked")
    || typeof membershipVersion !== "number"
    || typeof projectionVersion !== "number"
    || enabledModules === undefined
    || permissions === undefined
    || cutoff === undefined
    || !isCanonicalSubject(subject)
    || !isAllowedCanonicalTenantId(tenantId)
    || !isSafePositiveNumber(membershipVersion)
    || !isSafePositiveNumber(projectionVersion)
    || !isCanonicalIdentityAuthorityGrantSequence(enabledModules, permissions)) {
    return undefined;
  }
  return Object.freeze({
    schemaVersion,
    subject,
    tenantId,
    tenantStatus,
    membershipStatus,
    membershipVersion,
    projectionVersion,
    acceptTokensIssuedAtOrAfter: cutoff,
    enabledModules,
    permissions,
  });
}

type IdentityAuthorityResolutionSnapshot =
  | { readonly kind: "resolved"; readonly state: unknown }
  | { readonly kind: "denied" }
  | { readonly kind: "unavailable"; readonly reason: Extract<IdentityAuthorityResolution, { readonly kind: "unavailable" }>["reason"] };

function snapshotResolution(value: unknown): IdentityAuthorityResolutionSnapshot | undefined {
  const fields = readOwnDataFields(value);
  if (fields === undefined) return undefined;
  const kind = fields.get("kind");
  if (kind === "resolved" && hasExactFieldKeys(fields, ["kind", "state"])) {
    return Object.freeze({ kind, state: fields.get("state") });
  }
  if (kind === "denied" && hasExactFieldKeys(fields, ["kind"])) return Object.freeze({ kind });
  const reason = fields.get("reason");
  if (kind === "unavailable" && hasExactFieldKeys(fields, ["kind", "reason"])
    && isResolverUnavailableReason(reason)) {
    return Object.freeze({ kind, reason });
  }
  return undefined;
}

function isResolverUnavailableReason(
  value: unknown,
): value is Extract<IdentityAuthorityResolution, { readonly kind: "unavailable" }>["reason"] {
  return value === "disabled"
    || value === "invalid_request"
    || value === "token_exchange_failed"
    || value === "resolver_unavailable"
    || value === "resolver_contract_invalid";
}

function freezeEvidence(
  binding: ActiveDoorstarInstanceTenantBinding,
  proof: VerifiedHumanIdentityProof,
  state: IdentityAuthorityState,
  capability: DoorstarCapability,
): ResolvedIdentityAuthorityEvidence {
  return Object.freeze({
    evidenceVersion: 1 as const,
    tenantBindingId: binding.id,
    tenantId: binding.tenantId,
    bindingVersion: binding.bindingVersion,
    subject: proof.subject,
    schemaVersion: state.schemaVersion,
    membershipVersion: proof.membershipVersion,
    projectionVersion: proof.projectionVersion,
    enabledModules: Object.freeze([...state.enabledModules]),
    permissions: Object.freeze([...state.permissions]),
    acceptTokensIssuedAtOrAfter: state.acceptTokensIssuedAtOrAfter,
    tokenIssuedAt: proof.tokenIssuedAt,
    tokenExpiresAt: proof.tokenExpiresAt,
    capability,
  });
}

function resolveDoorstarCapability(modules: readonly string[], permissions: readonly string[]): DoorstarCapability | undefined {
  const pairs = modules.flatMap((moduleId, index) => moduleId === DOORSTAR_MODULE
    ? [[moduleId, permissions[index] ?? ""]] as const
    : []);
  if (pairs.length !== 1) return undefined;
  const permission = pairs[0]![1];
  const capability = permission.slice(`${DOORSTAR_MODULE}.`.length);
  return (DOORSTAR_CAPABILITIES as readonly string[]).includes(capability)
    && permission === `${DOORSTAR_MODULE}.${capability}`
    ? capability as DoorstarCapability
    : undefined;
}

function isCanonicalSubject(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function isPositiveBigInt(value: bigint): boolean {
  return typeof value === "bigint" && value >= 1n;
}

function isSafePositiveNumber(value: number): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

interface TrustedIssuanceCommitGate {
  readonly create: (snapshot: DoorstarTrustedIdentityAuthorityIssuanceSnapshot) => DoorstarTrustedIdentityAuthorityIssuanceCommit;
  readonly consumer: DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer;
}

interface ValidatedHumanFactsSnapshot {
  readonly proof: VerifiedHumanIdentityProof;
  readonly idTokenExpiresAt: CanonicalUtcInstant;
}

function snapshotIdentityBoundaryDependencies(value: unknown): IdentityBoundaryDependencies | undefined {
  const fields = readExactOwnDataFields(value, BOUNDARY_DEPENDENCY_FIELDS);
  if (fields === undefined) return undefined;
  const codeExchangeSource = fields.get("codeExchangeSource");
  const humanJwtVerifier = fields.get("humanJwtVerifier");
  const resolver = fields.get("resolver");
  const controlPlaneRepositoryFactory = snapshotControlPlaneRepositoryFactory(fields.get("controlPlaneRepositoryFactory"));
  const mac = snapshotMacService(fields.get("mac"));
  const now = fields.get("now");
  const maximumSessionLifetimeSeconds = fields.get("maximumSessionLifetimeSeconds");
  const randomBytes = fields.get("randomBytes");
  const randomUuid = fields.get("randomUuid");
  if (typeof codeExchangeSource !== "object" || codeExchangeSource === null
    || typeof humanJwtVerifier !== "object" || humanJwtVerifier === null
    || typeof resolver !== "object" || resolver === null
    || controlPlaneRepositoryFactory === undefined
    || mac === undefined
    || typeof now !== "function"
    || !isSessionMaximumLifetime(maximumSessionLifetimeSeconds)
    || typeof randomBytes !== "function"
    || typeof randomUuid !== "function") {
    return undefined;
  }
  return Object.freeze({
    codeExchangeSource: codeExchangeSource as DoorstarHumanOidcCodeExchangeSource,
    humanJwtVerifier: humanJwtVerifier as DoorstarHumanJwtVerifier,
    resolver: resolver as IdentityAuthorityResolverClient,
    controlPlaneRepositoryFactory,
    mac,
    now: now as () => unknown,
    maximumSessionLifetimeSeconds,
    randomBytes: randomBytes as DoorstarRandomBytes,
    randomUuid: randomUuid as () => string,
  });
}

function snapshotBoundaryCompletionInput(value: unknown): {
  readonly claimedDelivery: DoorstarOidcClaimedCallbackDelivery;
  readonly onIssued: (headers: DoorstarSessionCookieHeaders) => Promise<void> | void;
} | undefined {
  const fields = readExactOwnDataFields(value, BOUNDARY_COMPLETION_FIELDS);
  if (fields === undefined) return undefined;
  const claimedDelivery = fields.get("claimedDelivery");
  const onIssued = fields.get("onIssued");
  if (typeof claimedDelivery !== "object" || claimedDelivery === null || typeof onIssued !== "function") return undefined;
  return Object.freeze({
    claimedDelivery: claimedDelivery as DoorstarOidcClaimedCallbackDelivery,
    onIssued: onIssued as (headers: DoorstarSessionCookieHeaders) => Promise<void> | void,
  });
}

function snapshotControlPlaneRepositoryFactory(
  value: unknown,
): DoorstarIdentityAuthorityControlPlaneRepositoryFactory | undefined {
  const fields = readExactOwnDataFields(value, CONTROL_PLANE_REPOSITORY_FACTORY_FIELDS);
  const create = fields?.get("create");
  if (typeof create !== "function") return undefined;
  return Object.freeze({
    create: create as DoorstarIdentityAuthorityControlPlaneRepositoryFactory["create"],
  });
}

function snapshotMacService(value: unknown): DoorstarMacService | undefined {
  const fields = readExactOwnDataFields(value, MAC_SERVICE_FIELDS);
  const signCurrent = fields?.get("signCurrent");
  const derive = fields?.get("derive");
  const verify = fields?.get("verify");
  if (typeof signCurrent !== "function" || typeof derive !== "function" || typeof verify !== "function") return undefined;
  return Object.freeze({
    signCurrent: signCurrent as DoorstarMacService["signCurrent"],
    derive: derive as DoorstarMacService["derive"],
    verify: verify as DoorstarMacService["verify"],
  });
}

function isIdentityAuthorityControlPlaneRepository(value: unknown): value is DoorstarIdentityAuthorityControlPlaneRepository {
  const fields = readExactOwnDataFields(value, CONTROL_PLANE_REPOSITORY_FIELDS);
  return typeof fields?.get("loadIdentityAuthorityBinding") === "function"
    && typeof fields.get("persistAcceptedEvidenceAndSession") === "function";
}

function snapshotValidatedHumanFacts(value: unknown): ValidatedHumanFactsSnapshot | undefined {
  const fields = readExactOwnDataFields(value, VALIDATED_HUMAN_FACT_FIELDS);
  if (fields === undefined) return undefined;
  const subject = fields.get("subject");
  const tenantId = fields.get("tenantId");
  const membershipVersion = fields.get("membershipVersion");
  const projectionVersion = fields.get("projectionVersion");
  const enabledModules = snapshotCanonicalStringArray(fields.get("enabledModules"), 10);
  const permissions = snapshotCanonicalStringArray(fields.get("permissions"), 10);
  const tokenIssuedAt = snapshotCanonicalUtcInstant(fields.get("accessTokenIssuedAt"));
  const tokenExpiresAt = snapshotCanonicalUtcInstant(fields.get("accessTokenExpiresAt"));
  const idTokenExpiresAt = snapshotCanonicalUtcInstant(fields.get("idTokenExpiresAt"));
  if (typeof subject !== "string"
    || typeof tenantId !== "string"
    || typeof membershipVersion !== "bigint"
    || typeof projectionVersion !== "bigint"
    || enabledModules === undefined
    || permissions === undefined
    || tokenIssuedAt === undefined
    || tokenExpiresAt === undefined
    || idTokenExpiresAt === undefined
    || !isCanonicalSubject(subject)
    || !isAllowedCanonicalTenantId(tenantId)
    || !isPositiveBigInt(membershipVersion)
    || !isPositiveBigInt(projectionVersion)
    || !isCanonicalIdentityAuthorityGrantSequence(enabledModules, permissions)
    || compareCanonicalUtcInstants(tokenExpiresAt, tokenIssuedAt) <= 0
    || compareCanonicalUtcInstants(idTokenExpiresAt, tokenIssuedAt) <= 0) {
    return undefined;
  }
  return Object.freeze({
    proof: Object.freeze({
      subject,
      tenantId,
      membershipVersion,
      projectionVersion,
      enabledModules,
      permissions,
      tokenIssuedAt,
      tokenExpiresAt,
      [VERIFIED_HUMAN_IDENTITY_PROOF]: true as const,
    }),
    idTokenExpiresAt,
  });
}

function readBoundaryClock(clock: () => unknown): CanonicalUtcInstant | undefined {
  try {
    return snapshotCanonicalUtcInstant(clock());
  } catch {
    return undefined;
  }
}

function createDistinctServerIdentifiers(randomUuid: () => string): {
  readonly evidenceId: string;
  readonly correlationId: string;
} {
  const evidenceId = randomUuid();
  const correlationId = randomUuid();
  if (!isCanonicalServerIdentifier(evidenceId)
    || !isCanonicalServerIdentifier(correlationId)
    || evidenceId === correlationId) {
    throw new Error("doorstar_identity_random_uuid_invalid");
  }
  return Object.freeze({ evidenceId, correlationId });
}

function isCanonicalServerIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && CANONICAL_UUID.test(value)
    && value !== "00000000-0000-0000-0000-000000000000";
}

function evidenceStateMacFields(
  evidence: ResolvedIdentityAuthorityEvidence,
  ids: { readonly evidenceId: string; readonly correlationId: string },
): readonly DoorstarMacField[] {
  return Object.freeze([
    { kind: "utf8" as const, value: "doorstar-evidence-row-v1" },
    { kind: "utf8" as const, value: ids.evidenceId },
    { kind: "utf8" as const, value: evidence.tenantBindingId },
    { kind: "utf8" as const, value: evidence.tenantId },
    { kind: "decimal" as const, value: evidence.bindingVersion },
    { kind: "utf8" as const, value: evidence.subject },
    { kind: "utf8" as const, value: evidence.schemaVersion },
    { kind: "decimal" as const, value: evidence.membershipVersion },
    { kind: "decimal" as const, value: evidence.projectionVersion },
    ...grantMacFields(evidence.enabledModules, evidence.permissions),
    ...instantMacFields("accept_tokens_issued_at_or_after", evidence.acceptTokensIssuedAtOrAfter),
    ...instantMacFields("token_issued_at", evidence.tokenIssuedAt),
    ...instantMacFields("token_expires_at", evidence.tokenExpiresAt),
    { kind: "utf8" as const, value: evidence.capability },
    { kind: "utf8" as const, value: ids.correlationId },
  ]);
}

function sessionVerifierMacFields(secrets: DoorstarSessionSecrets): readonly DoorstarMacField[] {
  return Object.freeze([
    { kind: "utf8" as const, value: "doorstar-session-verifier-row-v1" },
    { kind: "utf8" as const, value: secrets.selector },
    { kind: "utf8" as const, value: secrets.verifier },
  ]);
}

function sessionCsrfMacFields(secrets: DoorstarSessionSecrets): readonly DoorstarMacField[] {
  return Object.freeze([
    { kind: "utf8" as const, value: "doorstar-session-csrf-row-v1" },
    { kind: "utf8" as const, value: secrets.selector },
    { kind: "utf8" as const, value: secrets.csrf },
  ]);
}

function sessionStateMacFields(value: {
  readonly evidence: ResolvedIdentityAuthorityEvidence;
  readonly evidenceId: string;
  readonly evidenceState: VersionedDoorstarMac;
  readonly selector: string;
  readonly issuedAt: CanonicalUtcInstant;
  readonly expiresAt: CanonicalUtcInstant;
}): readonly DoorstarMacField[] {
  return Object.freeze([
    { kind: "utf8" as const, value: "doorstar-session-state-row-v1" },
    { kind: "utf8" as const, value: value.selector },
    { kind: "utf8" as const, value: value.evidenceId },
    { kind: "decimal" as const, value: value.evidenceState.keyVersion },
    { kind: "bytes" as const, value: value.evidenceState.mac },
    { kind: "utf8" as const, value: value.evidence.tenantBindingId },
    { kind: "utf8" as const, value: value.evidence.subject },
    { kind: "utf8" as const, value: value.evidence.capability },
    { kind: "decimal" as const, value: value.evidence.bindingVersion },
    ...instantMacFields("issued_at", value.issuedAt),
    ...instantMacFields("expires_at", value.expiresAt),
  ]);
}

function grantMacFields(enabledModules: readonly string[], permissions: readonly string[]): readonly DoorstarMacField[] {
  const fields: DoorstarMacField[] = [{ kind: "decimal", value: enabledModules.length }];
  for (let index = 0; index < enabledModules.length; index += 1) {
    fields.push(
      { kind: "utf8", value: enabledModules[index]! },
      { kind: "utf8", value: permissions[index]! },
    );
  }
  return Object.freeze(fields);
}

function instantMacFields(label: string, instant: CanonicalUtcInstant): readonly DoorstarMacField[] {
  return Object.freeze([
    { kind: "utf8" as const, value: label },
    { kind: "utf8" as const, value: instant.wireValue },
    { kind: "decimal" as const, value: instant.epochSeconds },
    { kind: "decimal" as const, value: instant.nanoseconds },
  ]);
}

function createTrustedIssuanceCommitGate(): TrustedIssuanceCommitGate {
  const commits = new WeakMap<object, DoorstarTrustedIdentityAuthorityIssuanceSnapshot>();
  const consumer = Object.freeze({}) as DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer;
  trustedIssuanceCommitConsumers.set(consumer, async (commit, consumeSnapshot) => {
    if (typeof commit !== "object" || commit === null || typeof consumeSnapshot !== "function") return false;
    const snapshot = commits.get(commit);
    if (snapshot === undefined) return false;
    commits.delete(commit);
    await consumeSnapshot(cloneTrustedIssuanceSnapshot(snapshot));
    return true;
  });
  return Object.freeze({
    create(snapshot: DoorstarTrustedIdentityAuthorityIssuanceSnapshot): DoorstarTrustedIdentityAuthorityIssuanceCommit {
      const commit = Object.freeze({}) as DoorstarTrustedIdentityAuthorityIssuanceCommit;
      commits.set(commit, cloneTrustedIssuanceSnapshot(snapshot));
      return commit;
    },
    consumer,
  });
}

function snapshotTrustedIssuanceSnapshot(value: unknown): DoorstarTrustedIdentityAuthorityIssuanceSnapshot | undefined {
  const root = readExactOwnDataFields(value, ["evidence", "session"]);
  if (root === undefined) return undefined;
  const evidence = snapshotTrustedEvidence(root.get("evidence"));
  const session = snapshotTrustedSession(root.get("session"), evidence);
  if (evidence === undefined || session === undefined) return undefined;
  return Object.freeze({ evidence, session });
}

function snapshotTrustedEvidence(
  value: unknown,
): DoorstarTrustedIdentityAuthorityIssuanceSnapshot["evidence"] | undefined {
  const fields = readExactOwnDataFields(value, [
    "id",
    "evidenceVersion",
    "tenantBindingId",
    "tenantId",
    "bindingVersion",
    "subject",
    "schemaVersion",
    "membershipVersion",
    "projectionVersion",
    "enabledModules",
    "permissions",
    "acceptTokensIssuedAtOrAfter",
    "tokenIssuedAt",
    "tokenExpiresAt",
    "capability",
    "stateMacKeyVersion",
    "stateMac",
    "correlationId",
  ]);
  if (fields === undefined) return undefined;
  const id = fields.get("id");
  const tenantBindingId = fields.get("tenantBindingId");
  const tenantId = fields.get("tenantId");
  const bindingVersion = fields.get("bindingVersion");
  const subject = fields.get("subject");
  const schemaVersion = fields.get("schemaVersion");
  const membershipVersion = fields.get("membershipVersion");
  const projectionVersion = fields.get("projectionVersion");
  const enabledModules = snapshotCanonicalStringArray(fields.get("enabledModules"), 10);
  const permissions = snapshotCanonicalStringArray(fields.get("permissions"), 10);
  const acceptTokensIssuedAtOrAfter = snapshotCanonicalUtcInstant(fields.get("acceptTokensIssuedAtOrAfter"));
  const tokenIssuedAt = snapshotCanonicalUtcInstant(fields.get("tokenIssuedAt"));
  const tokenExpiresAt = snapshotCanonicalUtcInstant(fields.get("tokenExpiresAt"));
  const capability = fields.get("capability");
  const stateMacKeyVersion = fields.get("stateMacKeyVersion");
  const stateMac = snapshotMac(fields.get("stateMac"));
  const correlationId = fields.get("correlationId");
  if (!isCanonicalServerIdentifier(id)
    || typeof tenantBindingId !== "string"
    || tenantBindingId.length === 0
    || tenantBindingId.length > 128
    || !isAllowedCanonicalTenantId(tenantId as string)
    || typeof bindingVersion !== "bigint"
    || !isPositiveBigInt(bindingVersion)
    || typeof subject !== "string"
    || !isCanonicalSubject(subject)
    || schemaVersion !== IDENTITY_AUTHORITY_SCHEMA_VERSION
    || typeof membershipVersion !== "bigint"
    || !isPositiveBigInt(membershipVersion)
    || typeof projectionVersion !== "bigint"
    || !isPositiveBigInt(projectionVersion)
    || enabledModules === undefined
    || permissions === undefined
    || !isCanonicalIdentityAuthorityGrantSequence(enabledModules, permissions)
    || acceptTokensIssuedAtOrAfter === undefined
    || tokenIssuedAt === undefined
    || tokenExpiresAt === undefined
    || compareCanonicalUtcInstants(tokenIssuedAt, acceptTokensIssuedAtOrAfter) < 0
    || compareCanonicalUtcInstants(tokenExpiresAt, tokenIssuedAt) <= 0
    || !isDoorstarCapability(capability)
    || resolveDoorstarCapability(enabledModules, permissions) !== capability
    || !isMacKeyVersion(stateMacKeyVersion)
    || stateMac === undefined
    || !isCanonicalServerIdentifier(correlationId)) {
    return undefined;
  }
  return Object.freeze({
    id,
    tenantBindingId,
    tenantId: tenantId as string,
    bindingVersion,
    subject,
    schemaVersion,
    membershipVersion,
    projectionVersion,
    enabledModules,
    permissions,
    acceptTokensIssuedAtOrAfter,
    tokenIssuedAt,
    tokenExpiresAt,
    stateMacKeyVersion,
    stateMac,
    correlationId,
    capability,
  });
}

function snapshotTrustedSession(
  value: unknown,
  evidence: DoorstarTrustedIdentityAuthorityIssuanceSnapshot["evidence"] | undefined,
): DoorstarTrustedIdentityAuthorityIssuanceSnapshot["session"] | undefined {
  if (evidence === undefined) return undefined;
  const fields = readExactOwnDataFields(value, [
    "selector",
    "verifierMacKeyVersion",
    "verifierMac",
    "csrfMacKeyVersion",
    "csrfMac",
    "stateMacKeyVersion",
    "stateMac",
    "issuedAt",
    "expiresAt",
    "idTokenExpiresAt",
    "maximumLifetimeSeconds",
  ]);
  if (fields === undefined) return undefined;
  const selector = fields.get("selector");
  const verifierMacKeyVersion = fields.get("verifierMacKeyVersion");
  const verifierMac = snapshotMac(fields.get("verifierMac"));
  const csrfMacKeyVersion = fields.get("csrfMacKeyVersion");
  const csrfMac = snapshotMac(fields.get("csrfMac"));
  const stateMacKeyVersion = fields.get("stateMacKeyVersion");
  const stateMac = snapshotMac(fields.get("stateMac"));
  const issuedAt = snapshotCanonicalUtcInstant(fields.get("issuedAt"));
  const expiresAt = snapshotCanonicalUtcInstant(fields.get("expiresAt"));
  const idTokenExpiresAt = snapshotCanonicalUtcInstant(fields.get("idTokenExpiresAt"));
  const maximumLifetimeSeconds = fields.get("maximumLifetimeSeconds");
  if (!isCanonicalOpaqueSelector(selector)
    || !isMacKeyVersion(verifierMacKeyVersion)
    || verifierMac === undefined
    || !isMacKeyVersion(csrfMacKeyVersion)
    || csrfMac === undefined
    || !isMacKeyVersion(stateMacKeyVersion)
    || stateMac === undefined
    || issuedAt === undefined
    || expiresAt === undefined
    || idTokenExpiresAt === undefined
    || !isSessionMaximumLifetime(maximumLifetimeSeconds)
    || compareCanonicalUtcInstants(issuedAt, evidence.tokenIssuedAt) < 0) {
    return undefined;
  }
  const expectedExpiry = selectDoorstarSessionExpiry({
    now: issuedAt,
    humanAccessTokenExpiresAt: evidence.tokenExpiresAt,
    humanIdTokenExpiresAt: idTokenExpiresAt,
    maximumLifetimeSeconds,
  });
  if (expectedExpiry.kind !== "accepted" || !sameInstant(expectedExpiry.expiresAt, expiresAt)) return undefined;
  return Object.freeze({
    selector,
    verifierMacKeyVersion,
    verifierMac,
    csrfMacKeyVersion,
    csrfMac,
    stateMacKeyVersion,
    stateMac,
    issuedAt,
    expiresAt,
    idTokenExpiresAt,
    maximumLifetimeSeconds,
  });
}

function cloneTrustedIssuanceSnapshot(
  value: DoorstarTrustedIdentityAuthorityIssuanceSnapshot,
): DoorstarTrustedIdentityAuthorityIssuanceSnapshot {
  return Object.freeze({
    evidence: Object.freeze({
      ...value.evidence,
      enabledModules: Object.freeze([...value.evidence.enabledModules]),
      permissions: Object.freeze([...value.evidence.permissions]),
      acceptTokensIssuedAtOrAfter: freezeInstant(value.evidence.acceptTokensIssuedAtOrAfter),
      tokenIssuedAt: freezeInstant(value.evidence.tokenIssuedAt),
      tokenExpiresAt: freezeInstant(value.evidence.tokenExpiresAt),
      stateMac: Buffer.from(value.evidence.stateMac),
    }),
    session: Object.freeze({
      ...value.session,
      verifierMac: Buffer.from(value.session.verifierMac),
      csrfMac: Buffer.from(value.session.csrfMac),
      stateMac: Buffer.from(value.session.stateMac),
      issuedAt: freezeInstant(value.session.issuedAt),
      expiresAt: freezeInstant(value.session.expiresAt),
      idTokenExpiresAt: freezeInstant(value.session.idTokenExpiresAt),
    }),
  });
}

function snapshotMac(value: unknown): Uint8Array | undefined {
  return value instanceof Uint8Array && value.byteLength === 32 ? Buffer.from(value) : undefined;
}

function isMacKeyVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function isSessionMaximumLifetime(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= SESSION_MAXIMUM_LIFETIME_SECONDS;
}

function isCanonicalOpaqueSelector(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === 32 && decoded.toString("base64url") === value;
}

function isDoorstarCapability(value: unknown): value is DoorstarCapability {
  return typeof value === "string" && (DOORSTAR_CAPABILITIES as readonly string[]).includes(value);
}

function sameInstant(left: CanonicalUtcInstant, right: CanonicalUtcInstant): boolean {
  return left.wireValue === right.wireValue
    && left.epochSeconds === right.epochSeconds
    && left.nanoseconds === right.nanoseconds;
}

function freezeInstant(value: CanonicalUtcInstant): CanonicalUtcInstant {
  return Object.freeze({ ...value });
}

function acceptedIdentityBoundary(): DoorstarIdentityBoundaryCompletion {
  return Object.freeze({ kind: "accepted" as const });
}

function deniedIdentityBoundary(
  code: Extract<DoorstarIdentityBoundaryCompletion, { readonly kind: "denied" }>["code"],
): DoorstarIdentityBoundaryCompletion {
  return Object.freeze({ kind: "denied" as const, code });
}

function unavailableIdentityBoundary(
  code: Extract<DoorstarIdentityBoundaryCompletion, { readonly kind: "unavailable" }>["code"],
): DoorstarIdentityBoundaryCompletion {
  return Object.freeze({ kind: "unavailable" as const, code });
}
