import { describe, expect, it } from "vitest";
import type {
  ComponentCalculatorProfiles,
  ComponentRequirement,
  ComponentSnapshot,
  ProductionOrderRevision,
} from "@/services/production/types";
import {
  buildOperationWorkspaceReadiness,
  groupComponentRequirements,
  operationFieldDefinitions,
  operationProcessKindDefinitions,
} from "./operationWorkspace";

const approvalHash = "a".repeat(64);
const revision = {
  id: "revision-1",
  status: "APPROVED",
  audit: [{ action: "APPROVED", contentHash: approvalHash, createdAt: "2026-07-31T08:00:00.000Z" }],
} as ProductionOrderRevision;
const profiles: ComponentCalculatorProfiles = {
  configurationVersion: "profiles/v1",
  configurationFingerprint: "b".repeat(64),
  snapshotSchemaVersion: "component-snapshot/v1",
  technicalCatalogVersion: "catalog/v1",
  technicalCatalogFingerprint: "e".repeat(64),
  profiles: [{
    version: "explicit/v1",
    fingerprint: "d".repeat(64),
    label: "Explicit",
    inputMode: "EXPLICIT_REVIEWED_OUTPUT",
    active: true,
    allowsFormulaExecution: false,
    allowsImplicitDefaults: false,
    cutPartDimensions: "FINISHED_AND_CUTTING_REQUIRED",
  }],
};
const verifiedSnapshot = {
  id: "snapshot-1",
  orderRevisionId: "revision-1",
  state: "VERIFIED",
  orderContentHash: approvalHash,
  snapshotSchemaVersion: "component-snapshot/v1",
  calculatorProfileVersion: "explicit/v1",
  calculatorProfileFingerprint: "d".repeat(64),
  technicalCatalogVersion: "catalog/v1",
  technicalCatalogFingerprint: "e".repeat(64),
  createdAt: "2026-07-31T09:00:00.000Z",
  requirements: [],
} as unknown as ComponentSnapshot;

describe("operation workspace readiness", () => {
  it("accepts only the exact current verified component input", () => {
    const readiness = buildOperationWorkspaceReadiness({
      revision,
      latestRevisionId: revision.id,
      profiles,
      snapshots: [verifiedSnapshot],
      dependenciesState: "READY",
    });

    expect(readiness.sourceReady).toBe(true);
    expect(readiness.sourceBlockers).toEqual([]);
    expect(readiness.currentVerifiedSnapshots.map((snapshot) => snapshot.id)).toEqual(["snapshot-1"]);
  });

  it("fails closed for a stale or non-verified snapshot", () => {
    const readiness = buildOperationWorkspaceReadiness({
      revision,
      latestRevisionId: revision.id,
      profiles,
      snapshots: [
        { ...verifiedSnapshot, id: "review", state: "REVIEW" },
        { ...verifiedSnapshot, id: "stale", orderContentHash: "c".repeat(64) },
      ],
      dependenciesState: "READY",
    });

    expect(readiness.sourceReady).toBe(false);
    expect(readiness.currentVerifiedSnapshots).toEqual([]);
    expect(readiness.sourceBlockers).toContain(
      "Nincs az aktuális rendelési hashhez, sémához, profilhoz és verziólenyomathoz tartozó VERIFIED alkatrészsnapshot.",
    );
  });

  it("fails closed when current profile or catalog fingerprints cannot be compared", () => {
    const readiness = buildOperationWorkspaceReadiness({
      revision,
      latestRevisionId: revision.id,
      profiles: {
        ...profiles,
        technicalCatalogFingerprint: undefined,
        profiles: profiles.profiles.map((profile) => ({ ...profile, fingerprint: undefined })),
      },
      snapshots: [verifiedSnapshot],
      dependenciesState: "READY",
    });

    expect(readiness.sourceReady).toBe(false);
    expect(readiness.currentVerifiedSnapshots).toEqual([]);
    expect(readiness.sourceBlockers).toContain(
      "A szerver nem adta át az aktív kalkulátorprofil és a műszaki katalógus aktuális verziólenyomatát; a kapu zárva marad.",
    );
  });

  it("groups only by explicit requirement kind and exposes the handoff fields", () => {
    const requirements = [
      { id: "cut-1", requirementKind: "CUT_PART" },
      { id: "buy-1", requirementKind: "PURCHASED_PART" },
      { id: "cut-2", requirementKind: "CUT_PART" },
    ] as ComponentRequirement[];

    expect(groupComponentRequirements(requirements).map((group) => [group.key, group.requirements.length])).toEqual([
      ["CUT_PART", 2],
      ["PURCHASED_PART", 1],
    ]);
    expect(operationFieldDefinitions.map((field) => field.key)).toEqual(expect.arrayContaining([
      "processKind",
      "resource",
      "setupTime",
      "cycleTime",
      "nonTechnologicalTime",
      "naturalProcessTime",
      "timeStandardSource",
      "workInstruction",
      "qualityCheckpoints",
    ]));
    expect(operationProcessKindDefinitions.map((kind) => kind.key)).toEqual([
      "TECHNOLOGICAL",
      "NON_TECHNOLOGICAL",
      "NATURAL",
    ]);
    expect(operationFieldDefinitions.find((field) => field.key === "workInstruction")?.group).toBe("CONTROL");
    expect(operationFieldDefinitions.find((field) => field.key === "quantity")?.group).toBe("ROUTE");
  });
});
