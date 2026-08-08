import { afterEach, describe, expect, it, vi } from "vitest";
import { productionApi } from "./api";

const hash = (letter: string) => letter.repeat(64);
const materializationKey = "flm-v1-" + hash("a");

const snapshotResponse = {
  snapshots: [{
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
    materializationKey,
    pins: {
      catalogRevision: "catalog/v1",
      catalogHash: hash("b"),
      planHash: hash("c"),
      engineIdentity: "flow-lab/v1",
    },
    operations: [{
      id: "26133/DOOR_LEAF/GyV-L.08",
      correlationKey: "26133/DOOR_LEAF/GyV-L.08",
      operationType: "Summary",
      station: null,
      boardProjection: { quantity: 0, unitHours: 0 },
      relativePosition: 8,
      predecessors: [],
    }],
    readiness: { ready: true, blockers: [], allowedActions: [] },
    createdAt: "2026-08-08T08:00:00.000Z",
    reviewResolution: "verified",
    reviewedByRole: "order_approver",
    reviewedByPrincipal: "reviewer-1",
    reviewedAt: "2026-08-08T08:15:00.000Z",
    reviewNote: "Imported plan evidence.",
    createdByRole: "technical_preparation",
    createdByPrincipal: "import-service",
    orderContentHash: hash("d"),
    componentOutputHash: hash("e"),
    inputHash: hash("f"),
    outputHash: hash("1"),
    resourceMappingVersion: "doorstar/v1",
    resourceMappingFingerprint: hash("2"),
    evidence: { findings: [], unresolved: [], absentMembers: [], productionAuthority: false },
  }],
};

const deviationResponse = {
  records: [{
    id: "a7f2f8d5-34aa-4cbb-8dd6-3f4ac6dc61be",
    occurredAt: "2026-08-08T09:00:00.000Z",
    kind: "STEP_DISABLED",
    correlationKey: "26133/DOOR_LEAF/GyV-L.08",
    actor: { role: "shop_floor", principal: "operator-1" },
    payload: { disabled: true },
    materializationId: "materialization-1",
    pins: {
      sourceSetKey: "26133",
      materializationKey,
      catalogRevision: "catalog/v1",
      catalogHash: hash("b"),
      planHash: hash("c"),
      engineIdentity: "flow-lab/v1",
    },
  }],
  nextCursor: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Flow Lab read-only API", () => {
  it("uses GET-only endpoints without browser-generated identity headers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshotResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(deviationResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(productionApi.getFlowLabPlanSnapshots("DSMR / 1")).resolves.toMatchObject({
      snapshots: [{ origin: "FLOW_LAB" }],
    });
    await expect(productionApi.getFlowLabDeviations("DSMR / 1", "opaque-cursor")).resolves.toMatchObject({
      records: [{ kind: "STEP_DISABLED" }],
    });
    await expect(productionApi.getFlowLabMaterializedWorksheet("DSMR / 1")).resolves.toEqual({});

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/production/flow-lab/projects/DSMR%20%2F%201/plan-snapshots",
      "/api/production/flow-lab/projects/DSMR%20%2F%201/deviations?cursor=opaque-cursor&limit=50",
      "/api/production/projects/DSMR%20%2F%201",
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      const request = options as RequestInit;
      const headers = request.headers as Record<string, string>;
      expect(request.method).toBe("GET");
      expect(request.cache).toBe("no-store");
      expect(request.body).toBeUndefined();
      expect(headers).not.toHaveProperty("X-Role");
      expect(headers).not.toHaveProperty("X-Principal");
      expect(headers).not.toHaveProperty("X-Station");
    }
  });
});
