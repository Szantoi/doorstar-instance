import { describe, expect, it } from "vitest";
import {
  assertFixtureChangedExactlyThreeDefinitions,
  type PolicyFunctionManifest,
} from "../src/runner/databaseSetup.js";

const targetFunctions = [
  'pilot.doorstar_require_pilot_write_context(pilot."BindingAuditSource")',
  "pilot.pilot_runtime_preflight_v1()",
  "pilot.pilot_bootstrap_preflight_v1()",
] as const;

function manifest(definitionPrefix: string, changeHelper = false): PolicyFunctionManifest {
  const entries = [
    ...targetFunctions.map((signature) => [signature, {
      definitionSha256: `${definitionPrefix}-${signature}`,
      ownerSha256: "owner",
      aclSha256: "acl",
      securityDefiner: false,
      configurationSha256: "config",
    }] as const),
    ["pilot.some_security_definer_writer()", {
      definitionSha256: changeHelper ? "changed-helper" : "unchanged-helper",
      ownerSha256: "owner",
      aclSha256: "acl",
      securityDefiner: true,
      configurationSha256: "config",
    }] as const,
  ];
  return Object.fromEntries(entries);
}

describe("fixture function manifest", () => {
  it("accepts only the three approved definition changes", () => {
    expect(() => assertFixtureChangedExactlyThreeDefinitions(
      manifest("before"),
      manifest("after"),
    )).not.toThrow();
  });

  it("rejects a changed helper or changed security metadata", () => {
    expect(() => assertFixtureChangedExactlyThreeDefinitions(
      manifest("before"),
      manifest("after", true),
    )).toThrow("a03_fixture_did_not_change_exactly_three_definitions");
    const after = manifest("after");
    const target = targetFunctions[0];
    after[target] = { ...after[target], aclSha256: "changed-acl" };
    expect(() => assertFixtureChangedExactlyThreeDefinitions(manifest("before"), after))
      .toThrow("a03_fixture_changed_function_security_manifest");
  });
});
