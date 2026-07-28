import { describe, expect, it } from "vitest";
import {
  preflightDoorstarFolyamatOperationImport,
  type DoorstarFolyamatOperationCandidate,
} from "../src/services/planning/folyamatOperationPreflight.js";
import type { DoorstarStandardCandidate } from "../src/services/planning/standardImportPreflight.js";

const standard: DoorstarStandardCandidate = {
  sourceStandardKey: "NORM-CNC-01",
  operationType: "CNC megmunkálás",
  minutesPerUnit: 12.5,
  workforce: 1,
  resourceKey: "CNC",
  unit: "piece",
  sourceRevision: "standards:00.0.01:row-18",
  qualifiers: [{ key: "component", value: "door_leaf" }],
};

const candidate: DoorstarFolyamatOperationCandidate = {
  sourceOperationKey: "folyamat:work-17:row-3",
  sourceWorkOrderKey: "work-17",
  sourceOrderRevision: "order:work-17:revision-4",
  sourceComponentKey: "calculator:work-17:leaf-1",
  sourceCalculatorRevision: "calculator:work-17:revision-4",
  sourceStandardKey: "NORM-CNC-01",
  operationType: "CNC megmunkálás",
  quantity: 4,
  quantityUnit: "piece",
  sourceRevision: "folyamat:00.0.01:row-3",
  qualifiers: [{ key: "component", value: "door_leaf" }],
  extraDays: 1,
  dependency: {
    predecessorSourceOperationKey: "folyamat:work-17:row-2",
    type: "FS",
    lagWorkingDays: 1,
  },
};

describe("preflightDoorstarFolyamatOperationImport", () => {
  it("creates an auditable operation draft from a Power Query materialised row", () => {
    expect(preflightDoorstarFolyamatOperationImport([candidate], [standard])).toEqual({
      ready: [{
        sourceOperationKey: "folyamat:work-17:row-3",
        sourceWorkOrderKey: "work-17",
        sourceOrderRevision: "order:work-17:revision-4",
        sourceComponentKey: "calculator:work-17:leaf-1",
        sourceCalculatorRevision: "calculator:work-17:revision-4",
        sourceStandardKey: "NORM-CNC-01",
        operationType: "CNC megmunkálás",
        quantity: 4,
        quantityUnit: "piece",
        sourceRevision: "folyamat:00.0.01:row-3",
        qualifiers: [{ key: "component", value: "door_leaf" }],
        extraDays: 1,
        dependency: {
          predecessorSourceOperationKey: "folyamat:work-17:row-2",
          type: "FS",
          lagWorkingDays: 1,
        },
      }],
      quarantined: [],
    });
  });

  it("quarantines an operation when its qualified standard was not approved", () => {
    const mismatchedContext = { ...candidate, qualifiers: [{ key: "component", value: "frame" }] };
    expect(preflightDoorstarFolyamatOperationImport([mismatchedContext], [standard]).quarantined[0]?.reasons)
      .toEqual(["unknown_or_unapproved_standard"]);
  });

  it("does not guess malformed dependency inputs", () => {
    const malformedDependency = {
      ...candidate,
      dependency: { predecessorSourceOperationKey: "", type: "later", lagWorkingDays: -1, releaseThresholdPercent: 1.2 },
    };
    expect(preflightDoorstarFolyamatOperationImport([malformedDependency], [standard]).quarantined[0]?.reasons).toEqual([
      "missing_dependency_predecessor",
      "invalid_dependency_type",
      "invalid_dependency_lag",
      "invalid_release_threshold",
    ]);
  });

  it("quarantines every duplicate source operation identity", () => {
    const result = preflightDoorstarFolyamatOperationImport([candidate, { ...candidate }], [standard]);
    expect(result.ready).toEqual([]);
    expect(result.quarantined.map(({ reasons }) => reasons)).toEqual([
      ["duplicate_source_operation_key"],
      ["duplicate_source_operation_key"],
    ]);
  });

  it("does not disconnect a Folyamat operation from its order and calculator lineage", () => {
    const withoutLineage = {
      ...candidate,
      sourceOrderRevision: " ",
      sourceComponentKey: null,
      sourceCalculatorRevision: undefined,
    };

    expect(preflightDoorstarFolyamatOperationImport([withoutLineage], [standard]).quarantined[0]?.reasons).toEqual([
      "missing_source_order_revision",
      "missing_source_component_key",
      "missing_source_calculator_revision",
    ]);
  });
});
