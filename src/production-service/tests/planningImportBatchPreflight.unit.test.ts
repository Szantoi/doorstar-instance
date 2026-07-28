import { describe, expect, it } from "vitest";
import { preflightDoorstarPlanningImportBatch } from "../src/services/planning/planningImportBatchPreflight.js";

const standard = {
  sourceStandardKey: "NORM-CNC-01",
  operationType: "CNC machining",
  minutesPerUnit: 12.5,
  workforce: 1,
  resourceKey: "CNC",
  unit: "piece",
  sourceRevision: "standards:revision-4:row-18",
  qualifiers: [{ key: "component", value: "door_leaf" }],
};

const operation = {
  sourceOperationKey: "folyamat:work-17:row-3",
  sourceWorkOrderKey: "work-17",
  sourceOrderRevision: "order:work-17:revision-4",
  sourceComponentKey: "calculator:work-17:leaf-1",
  sourceCalculatorRevision: "calculator:work-17:revision-4",
  sourceStandardKey: "NORM-CNC-01",
  operationType: "CNC machining",
  quantity: 4,
  quantityUnit: "piece",
  sourceRevision: "folyamat:revision-4:row-3",
  qualifiers: [{ key: "component", value: "door_leaf" }],
};

describe("preflightDoorstarPlanningImportBatch", () => {
  it("hands off only one fully traceable, internally consistent batch", () => {
    const result = preflightDoorstarPlanningImportBatch({
      sourceBatchKey: "folyamat:work-17",
      sourceBatchRevision: "sha256:example",
      standards: [standard],
      operations: [operation],
    });

    expect(result.readyForPlatformHandoff).toBe(true);
    expect(result.readyStandards).toEqual([standard]);
    expect(result.readyOperations).toHaveLength(1);
    expect(result.quarantinedStandards).toEqual([]);
    expect(result.quarantinedOperations).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it("never lets an operation use a standard that failed its own preflight", () => {
    const result = preflightDoorstarPlanningImportBatch({
      sourceBatchKey: "folyamat:work-17",
      sourceBatchRevision: "sha256:example",
      standards: [{ ...standard, resourceKey: " " }],
      operations: [operation],
    });

    expect(result.readyForPlatformHandoff).toBe(false);
    expect(result.readyStandards).toEqual([]);
    expect(result.readyOperations).toEqual([]);
    expect(result.quarantinedStandards[0]?.reasons).toEqual(["missing_resource_mapping"]);
    expect(result.quarantinedOperations[0]?.reasons).toEqual(["unknown_or_unapproved_standard"]);
  });

  it("quarantines an unresolved predecessor and requires immutable batch provenance", () => {
    const result = preflightDoorstarPlanningImportBatch({
      sourceBatchKey: " ",
      sourceBatchRevision: null,
      standards: [standard],
      operations: [{
        ...operation,
        dependency: { predecessorSourceOperationKey: "folyamat:work-17:row-2", type: "FS" },
      }],
    });

    expect(result.readyForPlatformHandoff).toBe(false);
    expect(result.readyOperations).toEqual([]);
    expect(result.quarantinedOperations[0]?.reasons).toEqual(["unknown_dependency_predecessor"]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "missing_source_batch_key",
      "missing_source_batch_revision",
      "unknown_dependency_predecessor",
    ]);
  });

  it("quarantines a successor when its predecessor exists but is itself quarantined", () => {
    const predecessor = { ...operation, sourceOperationKey: "folyamat:work-17:row-2", quantity: 0 };
    const successor = {
      ...operation,
      dependency: { predecessorSourceOperationKey: predecessor.sourceOperationKey, type: "FS" },
    };

    const result = preflightDoorstarPlanningImportBatch({
      sourceBatchKey: "folyamat:work-17",
      sourceBatchRevision: "sha256:example",
      standards: [standard],
      operations: [predecessor, successor],
    });

    expect(result.readyForPlatformHandoff).toBe(false);
    expect(result.readyOperations).toEqual([]);
    expect(result.quarantinedOperations.map(({ reasons }) => reasons)).toEqual([
      ["invalid_quantity"],
      ["unknown_dependency_predecessor"],
    ]);
  });
});
