import { describe, expect, it } from "vitest";
import {
  FlowLabContractError,
  parseFlowLabDeviationList,
  parseFlowLabPlanSnapshotList,
} from "./flowLab";

const hash = (letter: string) => letter.repeat(64);

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "snapshot-1",
    origin: "FLOW_LAB",
    orderRevisionId: "revision-1",
    componentSnapshotId: "component-1",
    state: "VERIFIED",
    schemaVersion: "doorstar.flow-lab.plan-materialization/v1",
    generatorProfileVersion: "flow-lab",
    generatorProfileFingerprint: "flow-lab/v1",
    standardCatalogVersion: "catalog/v1",
    standardCatalogFingerprint: hash("b"),
    sourceSetKey: "26133",
    materializationKey: `flm-v1-${hash("a")}`,
    pins: {
      catalogRevision: "catalog/v1",
      catalogHash: hash("b"),
      planHash: hash("c"),
      engineIdentity: "flow-lab/v1",
    },
    operations: [{
      id: "26133/DOOR_LEAF/GyV-L.08",
      correlationKey: "26133/DOOR_LEAF/GyV-L.08",
      workflowGroup: "Ajtólap összegző kapu",
      sourceOperationKey: "GyV-L.08",
      operationType: "Summary",
      station: null,
      boardProjection: { quantity: 0, unitHours: 0 },
      quantityUnit: "db",
      relativePosition: 8,
      predecessors: [{
        correlationKey: "26133/DOOR_LEAF/GyV-L.07",
        type: "FS",
        lagMinutes: 0,
        partialRelease: null,
      }],
    }],
    readiness: { ready: true, blockers: [], allowedActions: [] },
    createdAt: "2026-08-08T08:00:00.000Z",
    createdByRole: "technical_preparation",
    createdByPrincipal: "import-service",
    reviewNote: "Importált terv evidence.",
    reviewResolution: "Kötés ellenőrizve.",
    reviewedByRole: "order_approver",
    reviewedByPrincipal: "reviewer-1",
    reviewedAt: "2026-08-08T08:10:00.000Z",
    orderContentHash: hash("d"),
    componentOutputHash: hash("e"),
    inputHash: hash("f"),
    outputHash: hash("1"),
    resourceMappingVersion: "doorstar/v1",
    resourceMappingFingerprint: hash("2"),
    evidence: {
      findings: [{ code: "CATALOG_INFO", severity: "Information", count: 1 }],
      unresolved: [{ code: "OPEN_FIELD", field: "operations[1].station", count: 1 }],
      absentMembers: [{ name: "operations[].assignedPeople", reason: "A terv nem rendel személyt művelethez." }],
      productionAuthority: false,
    },
    ...overrides,
  };
}

describe("Flow Lab read contract", () => {
  it("accepts immutable pins, evidence and a zero/zero Summary operation", () => {
    const parsed = parseFlowLabPlanSnapshotList({ snapshots: [snapshot()] });
    const result = parsed.snapshots[0]!;

    expect(result.evidence.findings).toEqual([{ code: "CATALOG_INFO", severity: "Information", count: 1 }]);
    expect(result.operations[0]).toMatchObject({ operationType: "Summary", boardProjection: { quantity: 0, unitHours: 0 } });
    expect(result.operations[0]!.predecessors[0]).toMatchObject({ type: "FS", correlationKey: "26133/DOOR_LEAF/GyV-L.07" });
  });

  it("fails closed when the formal artifact-evidence envelope is absent or widened", () => {
    expect(() => parseFlowLabPlanSnapshotList({ snapshots: [snapshot({ evidence: undefined })] })).toThrow(FlowLabContractError);
    expect(() => parseFlowLabPlanSnapshotList({ snapshots: [snapshot({
      evidence: { findings: [], unresolved: [], absentMembers: [], productionAuthority: true },
    })] })).toThrow(FlowLabContractError);
    expect(() => parseFlowLabPlanSnapshotList({ snapshots: [snapshot({ standardCatalogFingerprint: "not-a-hash" })] })).toThrow(FlowLabContractError);
    expect(() => parseFlowLabPlanSnapshotList({ snapshots: [snapshot({
      evidence: { findings: [], unresolved: [], absentMembers: [], productionAuthority: false, unexpected: true },
    })] })).toThrow(FlowLabContractError);
    expect(() => parseFlowLabPlanSnapshotList({ snapshots: [snapshot({
      evidence: {
        findings: [{ code: "CATALOG_INFO", severity: "Information", count: 1, unexpected: true }],
        unresolved: [],
        absentMembers: [],
        productionAuthority: false,
      },
    })] })).toThrow(FlowLabContractError);
  });

  it("requires every audit field and accepts the Flow Lab-specific readiness blocker shape", () => {
    for (const auditField of ["reviewResolution", "reviewedByRole", "reviewedByPrincipal", "reviewedAt"]) {
      const malformed = snapshot() as Record<string, unknown>;
      delete malformed[auditField];
      expect(() => parseFlowLabPlanSnapshotList({ snapshots: [malformed] })).toThrow(FlowLabContractError);
    }

    expect(parseFlowLabPlanSnapshotList({ snapshots: [snapshot({
      readiness: {
        ready: false,
        blockers: [{ code: "flow_lab_plan_snapshot_not_verified", message: "Review required.", entityId: "snapshot-1" }],
        allowedActions: ["VERIFY_FLOW_LAB_PLAN"],
      },
    })] }).snapshots[0]?.readiness.blockers).toEqual([
      { code: "flow_lab_plan_snapshot_not_verified", message: "Review required.", entityId: "snapshot-1" },
    ]);
    expect(() => parseFlowLabPlanSnapshotList({ snapshots: [snapshot({
      readiness: {
        ready: false,
        blockers: [{ code: "flow_lab_plan_snapshot_not_verified", message: "Review required.", ownerRole: "production_planner" }],
        allowedActions: [],
      },
    })] })).toThrow(FlowLabContractError);
  });

  it("accepts the cursor feed's typed payload and its snapshot provenance", () => {
    const parsed = parseFlowLabDeviationList({
      records: [{
        id: "a7f2f8d5-34aa-4cbb-8dd6-3f4ac6dc61be",
        occurredAt: "2026-08-08T09:00:00.000Z",
        kind: "QUANTITY_CHANGED",
        correlationKey: "26133/DOOR_LEAF/GyV-L.08",
        actor: { role: "shop_floor", principal: "operator-1" },
        payload: { quantityBefore: 0, quantityAfter: 2, quantityUnit: "db" },
        materializationId: "materialization-1",
        pins: {
          sourceSetKey: "26133",
          materializationKey: `flm-v1-${hash("a")}`,
          catalogRevision: "catalog/v1",
          catalogHash: hash("b"),
          planHash: hash("c"),
          engineIdentity: "flow-lab/v1",
        },
      }],
      nextCursor: "opaque-cursor",
    });

    expect(parsed.records[0]).toMatchObject({ kind: "QUANTITY_CHANGED", pins: { sourceSetKey: "26133" } });
    expect(parsed.nextCursor).toBe("opaque-cursor");
  });
});
