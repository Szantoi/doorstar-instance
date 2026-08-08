import { describe, expect, it } from "vitest";
import {
  parseStoredFlowLabPlan,
  projectFlowLabArtifactEvidence,
  projectFlowLabStep,
} from "../src/services/flowLabReadProjection.js";

const snapshot = {
  id: "flow_lab_snapshot_1",
  projectId: "project_1",
  orderRevisionId: "revision_1",
  componentSnapshotId: "component_1",
  state: "VERIFIED",
  schemaVersion: "doorstar.flow-lab.plan-materialization/v1",
  sourceSetKey: "26133",
  materializationKey: `flm-v1-${"1".repeat(64)}`,
  contentHash: "2".repeat(64),
  fileSha256: "3".repeat(64),
  fileName: `doorstar-flow-lab-plan-materialization.26133.${"b".repeat(64)}.v1.json`,
  catalogRevision: "review-2026-08-07.1",
  catalogHash: "a".repeat(64),
  planHash: "b".repeat(64),
  engineIdentity: "doorstar.process-plan/v5",
  resourceMappingVersion: "doorstar.flow-lab.station-mapping/v1",
  resourceMappingFingerprint: "c".repeat(64),
  boundOrderContentHash: "d".repeat(64),
  boundComponentOutputHash: "e".repeat(64),
  operations: [
    {
      correlationKey: "26133/DOOR_LEAF/CUT",
      familyKey: "DOOR_LEAF",
      operationKey: "CUT",
      description: "Cut panel",
      operationType: "ActiveWork",
      station: "CNC",
      department: null,
      quantity: { value: 4, unit: "piece", resolved: true },
      time: { setupMinutes: 2, cycleMinutesPerUnit: 3, passiveWaitMinutes: 1, activeMinutes: 14, elapsedMinutes: 15, requiredWorkers: 2, workloadPersonMinutes: 28 },
      boardProjection: { quantity: 4, unitHours: 0.05 },
    },
    {
      correlationKey: "26133/DOOR_LEAF/GATE",
      familyKey: "DOOR_LEAF",
      operationKey: "GATE",
      description: "Cutting complete",
      operationType: "Summary",
      station: null,
      department: null,
      quantity: { value: 1, unit: "piece", resolved: true },
      time: { setupMinutes: 0, cycleMinutesPerUnit: 0, passiveWaitMinutes: 0, activeMinutes: 0, elapsedMinutes: 0, requiredWorkers: 0, workloadPersonMinutes: 0 },
      boardProjection: { quantity: 0, unitHours: 0 },
    },
  ],
  dependencies: [{
    successor: "26133/DOOR_LEAF/GATE",
    predecessor: "26133/DOOR_LEAF/CUT",
    type: "FS",
    lagMinutes: 0,
    partialRelease: null,
  }],
  relativeSchedule: [
    { correlationKey: "26133/DOOR_LEAF/CUT", startElapsedMinute: 0, finishElapsedMinute: 15 },
    { correlationKey: "26133/DOOR_LEAF/GATE", startElapsedMinute: 15, finishElapsedMinute: 15 },
  ],
  unresolved: [],
  absentMembers: [
    { name: "operations[].boardProjection.setupMinutes", reason: "Not represented." },
    { name: "operations[].boardProjection.passiveWaitMinutes", reason: "Not represented." },
    { name: "operations[].boardProjection.requiredWorkers", reason: "Not represented." },
    { name: "relativeSchedule[].absoluteDate", reason: "Not represented." },
    { name: "operations[].assignedPeople", reason: "Not represented." },
  ],
  findings: [],
  productionAuthority: false,
  reviewNote: "Ready for independent review.",
  createdByRole: "technical_preparation",
  createdByPrincipal: "doorstar:test:creator",
  reviewResolution: "Reviewed.",
  reviewedByRole: "order_approver",
  reviewedByPrincipal: "doorstar:test:reviewer",
  reviewedAt: new Date("2026-08-07T12:00:00.000Z"),
  createdAt: new Date("2026-08-07T11:00:00.000Z"),
} as never;

describe("Flow Lab read projection", () => {
  it("keeps a stored Summary and its graph predecessor visible without using Task dependencies", () => {
    const projection = projectFlowLabStep(snapshot, "26133/DOOR_LEAF/GATE");

    expect(projection).toEqual({
      origin: "FLOW_LAB",
      sourceSetKey: "26133",
      materializationKey: `flm-v1-${"1".repeat(64)}`,
      pins: {
        catalogRevision: "review-2026-08-07.1",
        catalogHash: "a".repeat(64),
        planHash: "b".repeat(64),
        engineIdentity: "doorstar.process-plan/v5",
      },
      correlationKey: "26133/DOOR_LEAF/GATE",
      operationType: "Summary",
      relativePosition: 2,
      predecessors: [{ correlationKey: "26133/DOOR_LEAF/CUT", type: "FS", lagMinutes: 0, partialRelease: null }],
    });
  });

  it("fails closed when persisted JSON no longer satisfies the handoff schema", () => {
    expect(parseStoredFlowLabPlan({ ...snapshot, productionAuthority: true } as never)).toBeNull();
    expect(projectFlowLabStep({ ...snapshot, operations: [] } as never, "26133/DOOR_LEAF/CUT")).toBeNull();
  });

  it("projects immutable findings and declared representation boundaries without granting authority", () => {
    const evidence = projectFlowLabArtifactEvidence({
      ...snapshot,
      unresolved: [{ code: "UNRESOLVED_STATION", field: "operations[0].station", count: 1 }],
      findings: [{ code: "MAPPING_WARNING", severity: "Warning", count: 2 }],
    } as never);

    expect(evidence).toEqual({
      findings: [{ code: "MAPPING_WARNING", severity: "Warning", count: 2 }],
      unresolved: [{ code: "UNRESOLVED_STATION", field: "operations[0].station", count: 1 }],
      absentMembers: snapshot.absentMembers,
      productionAuthority: false,
    });
  });

  it("withholds malformed persisted evidence rather than forwarding raw JSON", () => {
    expect(projectFlowLabArtifactEvidence({ ...snapshot, productionAuthority: true } as never)).toEqual({
      findings: [],
      unresolved: [],
      absentMembers: [],
      productionAuthority: false,
    });
  });
});
