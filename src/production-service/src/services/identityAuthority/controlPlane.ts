import { isAllowedCanonicalTenantId, type CanonicalUtcInstant } from "./contract.js";
import { readExactOwnDataFields, snapshotCanonicalUtcInstant } from "./safeSnapshot.js";

const BINDING_FIELDS = Object.freeze([
  "id",
  "tenantId",
  "status",
  "bindingVersion",
  "disabledAt",
  "disabledReason",
] as const);

export type DoorstarTenantBindingStatus = "ACTIVE" | "DISABLED";

/**
 * Server-side snapshot only. It is never populated from a cookie, request
 * header, query parameter, or browser-controlled state.
 */
export interface DoorstarInstanceTenantBindingSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly status: DoorstarTenantBindingStatus;
  readonly bindingVersion: bigint;
  readonly disabledAt: CanonicalUtcInstant | null;
  readonly disabledReason: string | null;
}

export type ActiveDoorstarInstanceTenantBinding = Readonly<DoorstarInstanceTenantBindingSnapshot & {
  readonly status: "ACTIVE";
  readonly disabledAt: null;
  readonly disabledReason: null;
}>;

export type DoorstarTenantBindingResolution =
  | { readonly kind: "active"; readonly binding: ActiveDoorstarInstanceTenantBinding }
  | { readonly kind: "denied"; readonly reason: "binding_invalid" | "binding_inactive" };

export type DoorstarTenantBindingTransitionValidation =
  | { readonly kind: "unchanged" }
  | { readonly kind: "disable_allowed" }
  | { readonly kind: "invalid"; readonly reason: "binding_invalid" | "binding_identity_immutable" | "binding_reactivation_forbidden" | "binding_transition_forbidden" };

export type DoorstarTenantBindingInsertValidation =
  | { readonly kind: "insert_allowed" }
  | { readonly kind: "invalid"; readonly reason: "binding_invalid" | "binding_initial_state_invalid" | "binding_singleton_violation" };

/** Fails closed unless a persisted binding is structurally valid and active. */
export function resolveActiveDoorstarTenantBinding(
  value: unknown,
): DoorstarTenantBindingResolution {
  const binding = snapshotBinding(value);
  if (binding === undefined) return { kind: "denied", reason: "binding_invalid" };
  if (binding.status !== "ACTIVE") return { kind: "denied", reason: "binding_inactive" };

  return {
    kind: "active",
    binding: Object.freeze({
      id: binding.id,
      tenantId: binding.tenantId,
      status: "ACTIVE" as const,
      bindingVersion: binding.bindingVersion,
      disabledAt: null,
      disabledReason: null,
    }),
  };
}

/**
 * Pure expression of the database lifecycle invariant. Persistence must still
 * enforce this independently with PostgreSQL constraints and triggers.
 */
export function validateDoorstarTenantBindingTransition(
  currentValue: unknown,
  nextValue: unknown,
): DoorstarTenantBindingTransitionValidation {
  const current = snapshotBinding(currentValue);
  const next = snapshotBinding(nextValue);
  if (current === undefined || next === undefined) return { kind: "invalid", reason: "binding_invalid" };
  if (current.id !== next.id || current.tenantId !== next.tenantId) {
    return { kind: "invalid", reason: "binding_identity_immutable" };
  }
  if (sameBinding(current, next)) return { kind: "unchanged" };
  if (current.status === "DISABLED" && next.status === "ACTIVE") {
    return { kind: "invalid", reason: "binding_reactivation_forbidden" };
  }
  if (current.status !== "ACTIVE" || next.status !== "DISABLED"
    || next.bindingVersion !== current.bindingVersion + 1n) {
    return { kind: "invalid", reason: "binding_transition_forbidden" };
  }
  return { kind: "disable_allowed" };
}

/**
 * Models the one-binding-per-instance registry guard. The eventual migration
 * repeats it with a singleton expression index and INSERT/UPDATE/DELETE guard.
 */
export function validateDoorstarTenantBindingInsert(
  existingValue: unknown | null,
  candidateValue: unknown,
): DoorstarTenantBindingInsertValidation {
  const candidate = snapshotBinding(candidateValue);
  if (candidate === undefined) return { kind: "invalid", reason: "binding_invalid" };
  if (existingValue !== null) {
    return snapshotBinding(existingValue) === undefined
      ? { kind: "invalid", reason: "binding_invalid" }
      : { kind: "invalid", reason: "binding_singleton_violation" };
  }
  return candidate.status === "ACTIVE" && candidate.bindingVersion === 1n
    ? { kind: "insert_allowed" }
    : { kind: "invalid", reason: "binding_initial_state_invalid" };
}

function snapshotBinding(value: unknown): Readonly<DoorstarInstanceTenantBindingSnapshot> | undefined {
  const fields = readExactOwnDataFields(value, BINDING_FIELDS);
  if (fields === undefined) return undefined;
  const id = fields.get("id");
  const tenantId = fields.get("tenantId");
  const status = fields.get("status");
  const bindingVersion = fields.get("bindingVersion");
  const rawDisabledAt = fields.get("disabledAt");
  const disabledReason = fields.get("disabledReason");
  const disabledAt = rawDisabledAt === null ? null : snapshotCanonicalUtcInstant(rawDisabledAt);
  if (disabledAt === undefined
    || typeof id !== "string"
    || typeof tenantId !== "string"
    || (status !== "ACTIVE" && status !== "DISABLED")
    || typeof bindingVersion !== "bigint"
    || (disabledReason !== null && typeof disabledReason !== "string")) {
    return undefined;
  }
  const snapshot = Object.freeze({ id, tenantId, status, bindingVersion, disabledAt, disabledReason });
  return isStructurallyValidBinding(snapshot) ? snapshot : undefined;
}

function isStructurallyValidBinding(value: Readonly<DoorstarInstanceTenantBindingSnapshot>): boolean {
  if (!isBindingId(value.id)
    || !isAllowedCanonicalTenantId(value.tenantId)
    || value.bindingVersion < 1n) {
    return false;
  }
  if (value.status === "ACTIVE") return value.disabledAt === null && value.disabledReason === null;
  return value.disabledAt !== null && isDisableReason(value.disabledReason);
}

function isBindingId(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function isDisableReason(value: string | null): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value;
}

function sameBinding(
  left: Readonly<DoorstarInstanceTenantBindingSnapshot>,
  right: Readonly<DoorstarInstanceTenantBindingSnapshot>,
): boolean {
  return left.id === right.id
    && left.tenantId === right.tenantId
    && left.status === right.status
    && left.bindingVersion === right.bindingVersion
    && sameOptionalInstant(left.disabledAt, right.disabledAt)
    && left.disabledReason === right.disabledReason;
}

function sameOptionalInstant(left: CanonicalUtcInstant | null, right: CanonicalUtcInstant | null): boolean {
  return left === null || right === null
    ? left === right
    : left.wireValue === right.wireValue
      && left.epochSeconds === right.epochSeconds
      && left.nanoseconds === right.nanoseconds;
}
