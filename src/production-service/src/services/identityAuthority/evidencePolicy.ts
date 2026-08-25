import { compareCanonicalUtcInstants, type CanonicalUtcInstant } from "./contract.js";

const DOORSTAR_MODULE = "joinerytech.door";
const V1_AUTHORITY_MODULES = Object.freeze(new Set([
  "spaceos.crm",
  "spaceos.controlling",
  "spaceos.hr",
  "spaceos.maintenance",
  "spaceos.qa",
  "spaceos.ehs",
  "spaceos.dms",
  "joinerytech.door",
  "joinerytech.plant",
]));
const V1_GRANTED_ACTIONS = Object.freeze(new Set(["view", "edit", "admin"]));

/**
 * A pure comparison input. It carries no opaque proof, I/O dependency, token,
 * session state, or evidence artifact, so an accepted result is not authority.
 */
export interface IdentityAuthorityEvidencePolicyInput {
  readonly bindingTenantId: string;
  readonly proof: IdentityAuthorityEvidencePolicyProof;
  readonly state: IdentityAuthorityEvidencePolicyState;
  readonly now: CanonicalUtcInstant;
}

export interface IdentityAuthorityEvidencePolicyProof {
  readonly subject: string;
  readonly tenantId: string;
  readonly membershipVersion: bigint;
  readonly projectionVersion: bigint;
  readonly enabledModules: readonly string[];
  readonly permissions: readonly string[];
  readonly tokenIssuedAt: CanonicalUtcInstant;
  readonly tokenExpiresAt: CanonicalUtcInstant;
}

export interface IdentityAuthorityEvidencePolicyState {
  readonly subject: string;
  readonly tenantId: string;
  readonly tenantStatus: "active" | "deactivated";
  readonly membershipStatus: "active" | "deactivated" | "revoked";
  readonly membershipVersion: number;
  readonly projectionVersion: number;
  readonly acceptTokensIssuedAtOrAfter: CanonicalUtcInstant;
  readonly enabledModules: readonly string[];
  readonly permissions: readonly string[];
}

export type IdentityAuthorityEvidencePolicyDecision =
  | { readonly kind: "accepted" }
  | { readonly kind: "denied"; readonly reason: IdentityAuthorityEvidencePolicyDenialReason };

export type IdentityAuthorityEvidencePolicyDenialReason =
  | "state_inactive"
  | "identity_mismatch"
  | "version_mismatch"
  | "grant_mismatch"
  | "doorstar_grant_invalid"
  | "token_before_cutoff"
  | "token_not_yet_valid"
  | "token_expired";

/**
 * Evaluates normalized authority facts only. This function never creates
 * evidence or capabilities; evidence.ts retains the proof-brand boundary and
 * the only accepted-evidence construction path.
 */
export function evaluateIdentityAuthorityEvidencePolicy(
  input: IdentityAuthorityEvidencePolicyInput,
): IdentityAuthorityEvidencePolicyDecision {
  const { bindingTenantId, proof, state, now } = input;
  if (state.tenantStatus !== "active" || state.membershipStatus !== "active") {
    return { kind: "denied", reason: "state_inactive" };
  }
  if (bindingTenantId !== proof.tenantId || proof.tenantId !== state.tenantId
    || proof.subject !== state.subject) {
    return { kind: "denied", reason: "identity_mismatch" };
  }
  if (proof.membershipVersion !== BigInt(state.membershipVersion)
    || proof.projectionVersion !== BigInt(state.projectionVersion)) {
    return { kind: "denied", reason: "version_mismatch" };
  }
  if (!sameGrantPairs(proof.enabledModules, proof.permissions, state.enabledModules, state.permissions)) {
    return { kind: "denied", reason: "grant_mismatch" };
  }
  if (!isCanonicalIdentityAuthorityGrantSequence(proof.enabledModules, proof.permissions)
    || !hasExactlyOneDoorstarGrant(state.enabledModules, state.permissions)) {
    return { kind: "denied", reason: "doorstar_grant_invalid" };
  }
  if (compareCanonicalUtcInstants(proof.tokenIssuedAt, state.acceptTokensIssuedAtOrAfter) < 0) {
    return { kind: "denied", reason: "token_before_cutoff" };
  }
  if (compareCanonicalUtcInstants(proof.tokenIssuedAt, now) > 0) {
    return { kind: "denied", reason: "token_not_yet_valid" };
  }
  if (compareCanonicalUtcInstants(proof.tokenExpiresAt, proof.tokenIssuedAt) <= 0
    || compareCanonicalUtcInstants(proof.tokenExpiresAt, now) <= 0) {
    return { kind: "denied", reason: "token_expired" };
  }
  return { kind: "accepted" };
}

function sameGrantPairs(
  proofModules: readonly string[],
  proofPermissions: readonly string[],
  stateModules: readonly string[],
  statePermissions: readonly string[],
): boolean {
  if (proofModules.length !== stateModules.length || proofPermissions.length !== statePermissions.length) return false;
  for (let index = 0; index < proofModules.length; index += 1) {
    if (proofModules[index] !== stateModules[index] || proofPermissions[index] !== statePermissions[index]) return false;
  }
  return true;
}

function hasExactlyOneDoorstarGrant(modules: readonly string[], permissions: readonly string[]): boolean {
  const doorstarPermissions = modules.flatMap((moduleId, index) => moduleId === DOORSTAR_MODULE
    ? [permissions[index] ?? ""]
    : []);
  if (doorstarPermissions.length !== 1) return false;
  const permission = doorstarPermissions[0]!;
  const action = permission.slice(`${DOORSTAR_MODULE}.`.length);
  return V1_GRANTED_ACTIONS.has(action) && permission === `${DOORSTAR_MODULE}.${action}`;
}

/**
 * Validates the bounded v1 grant wire format. It is a normalizer only: callers
 * still need the private proof-brand and evidence construction boundary.
 */
export function isCanonicalIdentityAuthorityGrantSequence(
  modules: readonly string[],
  permissions: readonly string[],
): boolean {
  if (modules.length === 0 || modules.length !== permissions.length || modules.length > 10) return false;
  for (let index = 0; index < modules.length; index += 1) {
    const moduleId = modules[index];
    const permission = permissions[index];
    const action = moduleId !== undefined && permission?.startsWith(`${moduleId}.`)
      ? permission.slice(moduleId.length + 1)
      : "";
    if (!isCanonicalGrant(moduleId) || !isCanonicalGrant(permission)
      || !V1_AUTHORITY_MODULES.has(moduleId)
      || !V1_GRANTED_ACTIONS.has(action)
      || (index > 0 && (modules[index - 1]! >= moduleId! || permissions[index - 1]! >= permission!))) {
      return false;
    }
  }
  return true;
}

function isCanonicalGrant(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}
