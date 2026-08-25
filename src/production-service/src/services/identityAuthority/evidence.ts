import type { IdentityAuthorityResolution, IdentityAuthorityResolverClient } from "./client.js";
import {
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
