import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant, type CanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import {
  evaluateIdentityAuthorityEvidencePolicy,
  type IdentityAuthorityEvidencePolicyInput,
} from "../src/services/identityAuthority/evidencePolicy.js";

const tenantId = "40000000-0000-0000-0000-000000000004";
const otherTenantId = "50000000-0000-0000-0000-000000000005";
const subject = "oidc|doorstar-worker-001";
const now = instant("2026-08-25T12:35:00.000000000Z");

describe("identity-authority evidence policy", () => {
  it("accepts exact normalized facts without creating an evidence artifact", () => {
    const decision = evaluateIdentityAuthorityEvidencePolicy(input());

    expect(decision).toEqual({ kind: "accepted" });
    expect(decision).not.toHaveProperty("evidence");
    expect(decision).not.toHaveProperty("capability");
    expect(decision).not.toHaveProperty("accessToken");
    expect(decision).not.toHaveProperty("refreshToken");
  });

  it.each([
    ["inactive tenant", { state: state({ tenantStatus: "deactivated" }) }, "state_inactive"],
    ["revoked membership", { state: state({ membershipStatus: "revoked" }) }, "state_inactive"],
    ["binding tenant", { bindingTenantId: otherTenantId }, "identity_mismatch"],
    ["proof tenant", { proof: proof({ tenantId: otherTenantId }) }, "identity_mismatch"],
    ["proof subject", { proof: proof({ subject: "oidc|other" }) }, "identity_mismatch"],
    ["membership version", { proof: proof({ membershipVersion: 4n }) }, "version_mismatch"],
    ["projection version", { proof: proof({ projectionVersion: 5n }) }, "version_mismatch"],
    ["grant list differs", { proof: proof({ permissions: ["joinerytech.door.view"] }) }, "grant_mismatch"],
  ] as const)("denies %s", (_name, overrides, reason) => {
    expect(evaluateIdentityAuthorityEvidencePolicy(input(overrides))).toEqual({ kind: "denied", reason });
  });

  it.each([
    [
      "unsorted grant list",
      proof({ enabledModules: ["spaceos.crm", "joinerytech.door"], permissions: ["spaceos.crm.view", "joinerytech.door.edit"] }),
      state({ enabledModules: ["spaceos.crm", "joinerytech.door"], permissions: ["spaceos.crm.view", "joinerytech.door.edit"] }),
    ],
    [
      "duplicate Doorstar grant",
      proof({ enabledModules: ["joinerytech.door", "joinerytech.door"], permissions: ["joinerytech.door.edit", "joinerytech.door.edit"] }),
      state({ enabledModules: ["joinerytech.door", "joinerytech.door"], permissions: ["joinerytech.door.edit", "joinerytech.door.edit"] }),
    ],
    [
      "unknown Doorstar-like module",
      proof({ enabledModules: ["joinerytech.door", "joinerytech.door.extra"], permissions: ["joinerytech.door.edit", "joinerytech.door.extra.view"] }),
      state({ enabledModules: ["joinerytech.door", "joinerytech.door.extra"], permissions: ["joinerytech.door.edit", "joinerytech.door.extra.view"] }),
    ],
  ] as const)("denies a %s", (_name, forgedProof, forgedState) => {
    expect(evaluateIdentityAuthorityEvidencePolicy(input({ proof: forgedProof, state: forgedState }))).toEqual({
      kind: "denied",
      reason: "doorstar_grant_invalid",
    });
  });

  it("does not infer Doorstar admin from another module", () => {
    const modules = ["joinerytech.door", "spaceos.crm"];
    const permissions = ["joinerytech.door.view", "spaceos.crm.admin"];

    expect(evaluateIdentityAuthorityEvidencePolicy(input({
      proof: proof({ enabledModules: modules, permissions }),
      state: state({ enabledModules: modules, permissions }),
    }))).toEqual({ kind: "accepted" });
  });

  it.each([
    ["before cutoff", proof({ tokenIssuedAt: instant("2026-08-25T12:34:56.123456788Z") }), "token_before_cutoff"],
    ["one nanosecond in the future", proof({ tokenIssuedAt: instant("2026-08-25T12:35:00.000000001Z") }), "token_not_yet_valid"],
    ["already expired", proof({ tokenExpiresAt: instant("2026-08-25T12:35:00.000000000Z") }), "token_expired"],
    ["expires before issuance", proof({ tokenExpiresAt: instant("2026-08-25T12:34:55.000000000Z") }), "token_expired"],
  ] as const)("denies a proof %s", (_name, forgedProof, reason) => {
    expect(evaluateIdentityAuthorityEvidencePolicy(input({ proof: forgedProof }))).toEqual({ kind: "denied", reason });
  });
});

function input(overrides: Partial<IdentityAuthorityEvidencePolicyInput> = {}): IdentityAuthorityEvidencePolicyInput {
  return {
    bindingTenantId: tenantId,
    proof: proof(),
    state: state(),
    now,
    ...overrides,
  };
}

function proof(overrides: Partial<IdentityAuthorityEvidencePolicyInput["proof"]> = {}): IdentityAuthorityEvidencePolicyInput["proof"] {
  return {
    subject,
    tenantId,
    membershipVersion: 3n,
    projectionVersion: 4n,
    enabledModules: ["joinerytech.door"],
    permissions: ["joinerytech.door.edit"],
    tokenIssuedAt: instant("2026-08-25T12:34:56.123456789Z"),
    tokenExpiresAt: instant("2026-08-25T12:40:00.000000000Z"),
    ...overrides,
  };
}

function state(overrides: Partial<IdentityAuthorityEvidencePolicyInput["state"]> = {}): IdentityAuthorityEvidencePolicyInput["state"] {
  return {
    subject,
    tenantId,
    tenantStatus: "active",
    membershipStatus: "active",
    membershipVersion: 3,
    projectionVersion: 4,
    acceptTokensIssuedAtOrAfter: instant("2026-08-25T12:34:56.123456789Z"),
    enabledModules: ["joinerytech.door"],
    permissions: ["joinerytech.door.edit"],
    ...overrides,
  };
}

function instant(value: string): CanonicalUtcInstant {
  return parseCanonicalUtcInstant(value);
}
