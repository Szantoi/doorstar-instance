import { describe, expect, it } from "vitest";
import {
  flowLabFamilies,
  flowLabStationMappingFingerprint,
  flowLabStationMappingVersion,
  resolveFlowLabStation,
} from "../src/config/flowLabStations.js";
import {
  addFlowLabManualStepSchema,
  flowLabDeviationInputSchema,
  flowLabPlanProjectionSchema,
  updateFlowLabMaterializedStepSchema,
} from "../src/domain/flowLabSchemas.js";

const summaryIndexes = new Set([0, 7, 14, 21, 28, 35]);
const sourceStations = ["Gyártás Iroda", "Műszaki tervezés", "Asztalos", "CNC", "Összeszerelő", "Fóliázó"];

function representativePlanProjection() {
  const familyCounts = [12, 13, 12, 12];
  let sequence = 0;
  const operations = flowLabFamilies.flatMap((family, familyIndex) => Array.from({ length: familyCounts[familyIndex]! }, (_, withinFamily) => {
    const index = sequence++;
    const summary = summaryIndexes.has(index);
    const correlationKey = `26133/${family.key}/OP-${String(withinFamily + 1).padStart(2, "0")}`;
    return {
      correlationKey,
      familyKey: family.key,
      operationKey: `OP-${String(withinFamily + 1).padStart(2, "0")}`,
      description: `${family.name} ${withinFamily + 1}`,
      operationType: summary ? "Summary" : "ActiveWork",
       station: summary ? (index === 0 ? "Gyártás Iroda" : null) : sourceStations[index % sourceStations.length]!,
      department: null,
      quantity: { value: summary ? 1 : 2, unit: "db", resolved: true },
      time: summary
        ? { setupMinutes: 0, cycleMinutesPerUnit: 0, passiveWaitMinutes: 0, activeMinutes: 0, elapsedMinutes: 0, requiredWorkers: 0, workloadPersonMinutes: 0 }
        : { setupMinutes: 2, cycleMinutesPerUnit: 3, passiveWaitMinutes: 1, activeMinutes: 8, elapsedMinutes: 9, requiredWorkers: 1, workloadPersonMinutes: 8 },
      boardProjection: summary ? { quantity: 0, unitHours: 0 } : { quantity: 2, unitHours: 0.05 },
    };
  }));
  const relativeSchedule = operations.map((operation, index) => ({
    correlationKey: operation.correlationKey,
    startElapsedMinute: index * 10,
    finishElapsedMinute: summaryIndexes.has(index) ? index * 10 : index * 10 + 9,
  }));
  return { operations, relativeSchedule };
}

describe("Flow Lab workflow boundary unit schemas", () => {
  it("accepts the four-family, 49-step projection and preserves six explicit zero-time Summary gates", () => {
    const projection = representativePlanProjection();
    const parsed = flowLabPlanProjectionSchema.parse(projection);

    expect(parsed.operations).toHaveLength(49);
    expect(new Set(parsed.operations.map((operation) => operation.familyKey))).toEqual(new Set(flowLabFamilies.map((family) => family.key)));
    const summaries = parsed.operations.filter((operation) => operation.operationType === "Summary");
    expect(summaries).toHaveLength(6);
    expect(summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ correlationKey: "26133/PREPARATION/OP-01", boardProjection: { quantity: 0, unitHours: 0 } }),
    ]));
    expect(parsed.relativeSchedule).toHaveLength(49);
  });

  it("fails closed for malformed projection evidence instead of inventing a schedule or hiding a Summary", () => {
    const projection = representativePlanProjection();
    const badSummary = structuredClone(projection);
    badSummary.operations[0]!.boardProjection.unitHours = 0.25;
    expect(flowLabPlanProjectionSchema.safeParse(badSummary).success).toBe(false);

    const missingSchedule = structuredClone(projection);
    missingSchedule.relativeSchedule.pop();
    expect(flowLabPlanProjectionSchema.safeParse(missingSchedule).success).toBe(false);

    const unexpectedOperationMember = structuredClone(projection);
    (unexpectedOperationMember.operations[1] as Record<string, unknown>).inventedBoardAuthority = true;
    expect(flowLabPlanProjectionSchema.safeParse(unexpectedOperationMember).success).toBe(false);
  });

  it("uses a versioned explicit station map and leaves unknown source stations unresolved", () => {
    expect(flowLabStationMappingVersion).toBe("doorstar.flow-lab.station-mapping/v1");
    expect(flowLabStationMappingFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveFlowLabStation("CNC")).toBe("CNC");
    expect(resolveFlowLabStation("Fóliázó")).toBe("Csiszoló");
    expect(resolveFlowLabStation("Összeszerelő")).toBe("Asztalos");
    expect(resolveFlowLabStation("ismeretlen állomás")).toBeUndefined();
  });

  it("accepts only closed, append-only deviation shapes and reserves null correlation for hand-added work", () => {
    expect(flowLabDeviationInputSchema.safeParse({
      kind: "QUANTITY_CHANGED",
      correlationKey: "26133/DOOR_LEAF/OP-01",
      payload: { quantityBefore: 2, quantityAfter: 3, quantityUnit: "db" },
    }).success).toBe(true);
    expect(flowLabDeviationInputSchema.safeParse({
      kind: "STEP_ADDED_BY_HAND",
      correlationKey: null,
       payload: { handAddedName: "Helyszíni utómunka", handAddedStation: "CNC", handAddedPosition: 49 },
    }).success).toBe(true);
    expect(flowLabDeviationInputSchema.safeParse({
      kind: "STEP_ADDED_BY_HAND",
      correlationKey: "26133/DOOR_LEAF/OP-01",
       payload: { handAddedName: "Helyszíni utómunka", handAddedStation: null, handAddedPosition: 49 },
    }).success).toBe(false);
    expect(flowLabDeviationInputSchema.safeParse({
      kind: "STEP_DISABLED",
      correlationKey: "26133/DOOR_LEAF/OP-01",
      payload: { disabled: false },
    }).success).toBe(false);
    expect(flowLabDeviationInputSchema.safeParse({
      kind: "UNIT_HOURS_CHANGED",
      correlationKey: "26133/DOOR_LEAF/OP-01",
      payload: { unitHoursBefore: 0.05, unitHoursAfter: 0.1, setupMinutes: 4 },
    }).success).toBe(false);
  });

  it("keeps materialized-row edits bounded and requires an explicit manual-step shape", () => {
    expect(updateFlowLabMaterializedStepSchema.safeParse({}).success).toBe(false);
    expect(updateFlowLabMaterializedStepSchema.safeParse({ quantity: 3, planLocked: true }).success).toBe(true);
    expect(updateFlowLabMaterializedStepSchema.safeParse({ planDate: "2026-08-07" }).success).toBe(true);
    expect(updateFlowLabMaterializedStepSchema.safeParse({ planDate: "2026-02-30" }).success).toBe(false);
    expect(updateFlowLabMaterializedStepSchema.safeParse({ quantity: -1 }).success).toBe(false);
     expect(addFlowLabManualStepSchema.safeParse({ name: "Kézi pótmunka", station: "CNC", quantity: 1, unitHours: 0.25, planDate: "2026-08-07" }).success).toBe(true);
     expect(addFlowLabManualStepSchema.safeParse({ name: "Kézi pótmunka", ambientCatalogChange: true }).success).toBe(false);
  });
});
