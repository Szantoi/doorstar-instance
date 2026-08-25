import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import {
  resolveActiveDoorstarTenantBinding,
  validateDoorstarTenantBindingInsert,
  validateDoorstarTenantBindingTransition,
  type DoorstarInstanceTenantBindingSnapshot,
} from "../src/services/identityAuthority/controlPlane.js";

const tenantId = "40000000-0000-0000-0000-000000000004";

describe("Doorstar control-plane tenant binding", () => {
  it("accepts only an active, canonical server-side binding and snapshots it", () => {
    const source = binding();
    const result = resolveActiveDoorstarTenantBinding(source);

    expect(result).toMatchObject({ kind: "active", binding: { tenantId, bindingVersion: 1n } });
    if (result.kind !== "active") throw new Error("expected active binding");
    expect(Object.isFrozen(result.binding)).toBe(true);
    (source as { bindingVersion: bigint }).bindingVersion = 99n;
    expect(result.binding.bindingVersion).toBe(1n);
  });

  it.each([
    ["disabled", binding({ status: "DISABLED", bindingVersion: 2n, disabledAt: instant("2026-08-25T12:00:00Z"), disabledReason: "trial disabled" }), "binding_inactive"],
    ["uppercase tenant", binding({ tenantId: "4000000A-0000-0000-0000-000000000004" }), "binding_invalid"],
    ["reserved tenant", binding({ tenantId: "00000000-0000-0000-0000-000000000001" }), "binding_invalid"],
    ["active binding with disable metadata", binding({ disabledReason: "must be null" }), "binding_invalid"],
    ["zero version", binding({ bindingVersion: 0n }), "binding_invalid"],
  ] as const)("fails closed for %s binding", (_name, value, reason) => {
    expect(resolveActiveDoorstarTenantBinding(value)).toEqual({ kind: "denied", reason });
  });

  it("allows only one audited ACTIVE to DISABLED transition", () => {
    const current = binding();
    const disabled = binding({
      status: "DISABLED",
      bindingVersion: 2n,
      disabledAt: instant("2026-08-25T12:00:00.123456789Z"),
      disabledReason: "trial disabled",
    });

    expect(validateDoorstarTenantBindingTransition(current, current)).toEqual({ kind: "unchanged" });
    expect(validateDoorstarTenantBindingTransition(current, disabled)).toEqual({ kind: "disable_allowed" });
  });

  it.each([
    ["changes tenant", binding({ tenantId: "50000000-0000-0000-0000-000000000005" }), "binding_identity_immutable"],
    ["changes id", binding({ id: "binding-other" }), "binding_identity_immutable"],
    ["increments active version", binding({ bindingVersion: 2n }), "binding_transition_forbidden"],
    ["disables without version increment", binding({ status: "DISABLED", disabledAt: instant("2026-08-25T12:00:00Z"), disabledReason: "trial disabled" }), "binding_transition_forbidden"],
  ] as const)("rejects a transition that %s", (_name, next, reason) => {
    expect(validateDoorstarTenantBindingTransition(binding(), next)).toEqual({ kind: "invalid", reason });
  });

  it("rejects a disabled binding reactivation", () => {
    const disabled = binding({
      status: "DISABLED",
      bindingVersion: 2n,
      disabledAt: instant("2026-08-25T12:00:00Z"),
      disabledReason: "trial disabled",
    });
    const reactivated = binding({ bindingVersion: 3n });

    expect(validateDoorstarTenantBindingTransition(disabled, reactivated)).toEqual({
      kind: "invalid",
      reason: "binding_reactivation_forbidden",
    });
  });

  it("allows only the first ACTIVE version-one binding for an instance lifetime", () => {
    const disabled = binding({
      status: "DISABLED",
      bindingVersion: 2n,
      disabledAt: instant("2026-08-25T12:00:00Z"),
      disabledReason: "trial disabled",
    });

    expect(validateDoorstarTenantBindingInsert(null, binding())).toEqual({ kind: "insert_allowed" });
    expect(validateDoorstarTenantBindingInsert(null, disabled)).toEqual({
      kind: "invalid",
      reason: "binding_initial_state_invalid",
    });
    expect(validateDoorstarTenantBindingInsert(disabled, binding({
      id: "binding-rebind",
      tenantId: "50000000-0000-0000-0000-000000000005",
    }))).toEqual({ kind: "invalid", reason: "binding_singleton_violation" });
  });

  it("rejects getter-backed bindings without re-reading a later tenant value", () => {
    const getterBinding = Object.defineProperties({}, {
      id: { enumerable: true, value: "binding-01" },
      tenantId: { enumerable: true, get: () => tenantId },
      status: { enumerable: true, value: "ACTIVE" },
      bindingVersion: { enumerable: true, value: 1n },
      disabledAt: { enumerable: true, value: null },
      disabledReason: { enumerable: true, value: null },
    });

    expect(resolveActiveDoorstarTenantBinding(getterBinding)).toEqual({
      kind: "denied",
      reason: "binding_invalid",
    });
  });
});

function binding(overrides: Partial<DoorstarInstanceTenantBindingSnapshot> = {}): DoorstarInstanceTenantBindingSnapshot {
  return {
    id: "binding-01",
    tenantId,
    status: "ACTIVE",
    bindingVersion: 1n,
    disabledAt: null,
    disabledReason: null,
    ...overrides,
  };
}

function instant(value: string) {
  return parseCanonicalUtcInstant(value);
}
