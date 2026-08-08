import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FlowLabArtifactError,
  computeFlowLabPlanContentHash,
  computeFlowLabMaterializationKey,
  parseFlowLabBoardBinding,
  parseFlowLabPlanArtifact,
} from "../src/services/flowLabArtifact.js";

const catalogHash = "a".repeat(64);
const planHash = "b".repeat(64);
const materializationKey = "flm-v1-346dbc4af9ee64dcee8fe0cb4d88ef7943f47526366fb59537408e7e43221e36";
const contentHash = "4207bae2bde54e2118f941c8d7892c93987a12c3de29f4bbdd2e2053477d08f8";
const fileName = `doorstar-flow-lab-plan-materialization.26133.${planHash}.v1.json`;

function vector() {
  return {
    schemaVersion: "doorstar.flow-lab.plan-materialization/v1",
    sourceSetKey: "26133",
    materializationKey,
    contentHash,
    pins: {
      catalogRevision: "review-2026-08-07.1",
      catalogHash,
      planHash,
      engineIdentity: "doorstar.process-plan/v5",
    },
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
        time: {
          setupMinutes: 2,
          cycleMinutesPerUnit: 3,
          passiveWaitMinutes: 1,
          activeMinutes: 14,
          elapsedMinutes: 15,
          requiredWorkers: 2,
          workloadPersonMinutes: 28,
        },
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
        time: {
          setupMinutes: 0,
          cycleMinutesPerUnit: 0,
          passiveWaitMinutes: 0,
          activeMinutes: 0,
          elapsedMinutes: 0,
          requiredWorkers: 0,
          workloadPersonMinutes: 0,
        },
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
      { name: "operations[].boardProjection.setupMinutes", reason: "The board has no non-quantity-scaled setup field; folding it into unitHours would misstate a pure rate." },
      { name: "operations[].boardProjection.passiveWaitMinutes", reason: "The board has no passive-wait field, so the elapsed-time component remains only in the full materialization." },
      { name: "operations[].boardProjection.requiredWorkers", reason: "The board has no staffing-demand field; named people are never inferred as a substitute." },
      { name: "relativeSchedule[].absoluteDate", reason: "The materialization carries working-minute offsets only. Calendar anchoring remains the board's responsibility." },
      { name: "operations[].assignedPeople", reason: "The Flow Lab issues station and department labels, never named-person assignments." },
    ],
    findings: [],
    productionAuthority: false,
  };
}

function bytes(document = vector()) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function sidecar(raw: Buffer) {
  return Buffer.from(`${createHash("sha256").update(raw).digest("hex")}  ${fileName}\n`, "ascii");
}

describe("Flow Lab v1 plan artifact", () => {
  it("accepts the language-neutral two-operation contract vector with both independent hashes", () => {
    const raw = bytes();
    expect(createHash("sha256").update(raw).digest("hex"))
      .toBe("8dc72358c3f5886184b54bc53b1c5b92b5e4295037f16e51176eb7ebf3b55d04");
    expect(computeFlowLabPlanContentHash(vector())).toBe(contentHash);
    const validated = parseFlowLabPlanArtifact({ fileName, rawBytes: raw, sidecarBytes: sidecar(raw) });
    expect(validated).toMatchObject({ fileName, fileSha256: "8dc72358c3f5886184b54bc53b1c5b92b5e4295037f16e51176eb7ebf3b55d04" });
    expect(validated.artifact.contentHash).toBe(contentHash);
    expect(computeFlowLabMaterializationKey(validated.artifact)).toBe(materializationKey);
  });

  it("rejects a one-byte transport alteration before JSON parsing", () => {
    const raw = bytes();
    const altered = Buffer.from(raw);
    altered[altered.length - 2] = 0x20;
    expect(() => parseFlowLabPlanArtifact({ fileName, rawBytes: altered, sidecarBytes: sidecar(raw) }))
      .toThrow(expect.objectContaining<Partial<FlowLabArtifactError>>({ code: "flow_lab_file_hash_mismatch" }));
  });

  it("rejects a semantically changed, sidecar-valid document whose content hash was not recomputed", () => {
    const changed = vector();
    changed.operations[0]!.description = "Cut altered panel";
    const raw = bytes(changed);
    expect(() => parseFlowLabPlanArtifact({ fileName, rawBytes: raw, sidecarBytes: sidecar(raw) }))
      .toThrow(expect.objectContaining<Partial<FlowLabArtifactError>>({ code: "flow_lab_content_hash_mismatch" }));
  });

  it("rejects sidecar paths and whitespace variants", () => {
    const raw = bytes();
    const invalid = Buffer.from(`${createHash("sha256").update(raw).digest("hex")}  ../${fileName}\n`, "ascii");
    expect(() => parseFlowLabPlanArtifact({ fileName, rawBytes: raw, sidecarBytes: invalid }))
      .toThrow(expect.objectContaining<Partial<FlowLabArtifactError>>({ code: "flow_lab_sidecar_invalid" }));
  });

  it("requires an explicit board binding instead of inferring project authority from sourceSetKey", () => {
    expect(() => parseFlowLabBoardBinding({ projectKey: "26133", revision: 1 }))
      .toThrow();
    expect(parseFlowLabBoardBinding({
      projectKey: "DOORSTAR-26133",
      revision: 2,
      componentSnapshotId: "cmp_123",
      expectedOrderContentHash: "c".repeat(64),
      expectedComponentOutputHash: "d".repeat(64),
      stationMappingVersion: "doorstar-flow-lab-stations/v1",
      stationMappingFingerprint: "e".repeat(64),
      reviewNote: "Flow Lab 26133 file handoff is ready for evidence review.",
      actorRole: "technical_preparation",
      actorPrincipal: "doorstar:user:technical-preparation",
    })).toMatchObject({ projectKey: "DOORSTAR-26133", revision: 2 });
  });
});
