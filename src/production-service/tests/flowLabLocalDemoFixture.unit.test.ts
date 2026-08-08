import { describe, expect, it } from "vitest";
import {
  createFlowLabLocalDemoArtifact,
  flowLabLocalDemoConfirmationFlag,
  flowLabLocalDemoSourceSetKey,
  requireFlowLabLocalDemoSeedConfirmation,
} from "../scripts/flowLabLocalDemoFixture.js";

describe("local Flow Lab UX demo fixture", () => {
  it("creates a canonical synthetic four-family artifact without real-project identifiers", () => {
    const fixture = createFlowLabLocalDemoArtifact();

    expect(fixture.artifact).toMatchObject({
      sourceSetKey: flowLabLocalDemoSourceSetKey,
      productionAuthority: false,
      findings: [{ code: "SYNTHETIC_LOCAL_DEMO", severity: "Information", count: 1 }],
    });
    expect(fixture.artifact.operations).toHaveLength(8);
    expect(new Set(fixture.artifact.operations.map((operation) => operation.familyKey))).toEqual(new Set([
      "PREPARATION", "DOOR_LEAF", "JAMB_CORE", "CASING",
    ]));
    expect(fixture.artifact.operations.filter((operation) => operation.operationType === "Summary")).toHaveLength(4);
    expect(fixture.fileName).not.toContain("26133");
  });

  it("requires exactly the UX and local-demo confirmations before a database can be used", () => {
    expect(() => requireFlowLabLocalDemoSeedConfirmation([])).toThrow("Explicit confirmations required");
    expect(() => requireFlowLabLocalDemoSeedConfirmation([flowLabLocalDemoConfirmationFlag])).toThrow("Explicit confirmations required");
    expect(() => requireFlowLabLocalDemoSeedConfirmation([
      "--confirm-ux-reference-seed",
      flowLabLocalDemoConfirmationFlag,
    ])).not.toThrow();
  });
});
