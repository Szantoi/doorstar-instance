import type { Prisma } from "@prisma/client";
import {
  flowLabStationMappingFingerprint,
  flowLabStationMappingVersion,
} from "../config/flowLabStations.js";
import { compareFlowLabOrdinal, flowLabPlanArtifactSchema, type FlowLabPlanArtifact } from "./flowLabArtifact.js";
import {
  loadComponentAuthority,
  loadRevisionAuthority,
  type DatabaseClient,
} from "./operationPlanReadiness.js";

type StoredFlowLabPlan = Prisma.FlowLabPlanSnapshotGetPayload<Record<string, never>>;

export interface FlowLabReadBlocker {
  code: string;
  message: string;
  entityId?: string;
}

export interface FlowLabReadiness {
  ready: boolean;
  blockers: FlowLabReadBlocker[];
  allowedActions: string[];
}

/** Immutable evidence retained from the Flow Lab artifact. It is deliberately
 * separate from readiness: evidence stays inspectable even when a snapshot is
 * not eligible for a downstream board action. */
export interface FlowLabArtifactEvidence {
  findings: Array<{
    code: string;
    severity: "Information" | "Warning" | "Error";
    count: number;
  }>;
  unresolved: Array<{
    code: string;
    field: string;
    count: number;
  }>;
  absentMembers: Array<{
    name: string;
    reason: string;
  }>;
  productionAuthority: false;
}

export interface FlowLabSnapshotReadProjection {
  id: string;
  orderRevisionId: string;
  componentSnapshotId: string;
  state: "REVIEW" | "VERIFIED" | "REJECTED";
  schemaVersion: string;
  generatorProfileVersion: string;
  generatorProfileFingerprint: string;
  standardCatalogVersion: string;
  standardCatalogFingerprint: string;
  resourceMappingVersion: string;
  resourceMappingFingerprint: string;
  orderContentHash: string;
  componentOutputHash: string;
  inputHash: string;
  outputHash: string;
  materializationKey: string;
  reviewNote: string;
  createdByRole: string;
  createdByPrincipal: string;
  reviewResolution: string | null;
  reviewedByRole: string | null;
  reviewedByPrincipal: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  origin: "FLOW_LAB";
  sourceSetKey: string;
  pins: {
    catalogRevision: string;
    catalogHash: string;
    planHash: string;
    engineIdentity: string;
  };
  operations: Array<Record<string, unknown>>;
  evidence: FlowLabArtifactEvidence;
  readiness: FlowLabReadiness;
}

export interface FlowLabStepReadProjection {
  origin: "FLOW_LAB";
  sourceSetKey: string;
  materializationKey: string;
  pins: FlowLabSnapshotReadProjection["pins"];
  correlationKey: string;
  operationType: "ActiveWork" | "Summary";
  relativePosition: number;
  predecessors: Array<{
    correlationKey: string;
    type: "FS" | "SS" | "FF" | "SF";
    lagMinutes: number;
    partialRelease: string | null;
  }>;
}

function hashEquals(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function blocker(code: string, message: string, entityId?: string): FlowLabReadBlocker {
  return { code, message, ...(entityId ? { entityId } : {}) };
}

/** Re-parse persisted JSON before projecting it. A malformed historic row stays
 * visible as an invalid snapshot; the UI never receives invented operations. */
export function parseStoredFlowLabPlan(snapshot: StoredFlowLabPlan): FlowLabPlanArtifact | null {
  const parsed = flowLabPlanArtifactSchema.safeParse({
    schemaVersion: snapshot.schemaVersion,
    sourceSetKey: snapshot.sourceSetKey,
    materializationKey: snapshot.materializationKey,
    contentHash: snapshot.contentHash,
    pins: {
      catalogRevision: snapshot.catalogRevision,
      catalogHash: snapshot.catalogHash,
      planHash: snapshot.planHash,
      engineIdentity: snapshot.engineIdentity,
    },
    operations: snapshot.operations,
    dependencies: snapshot.dependencies,
    relativeSchedule: snapshot.relativeSchedule,
    unresolved: snapshot.unresolved,
    absentMembers: snapshot.absentMembers,
    findings: snapshot.findings,
    productionAuthority: snapshot.productionAuthority,
  });
  return parsed.success ? parsed.data : null;
}

function flowLabPins(snapshot: StoredFlowLabPlan) {
  return {
    catalogRevision: snapshot.catalogRevision,
    catalogHash: snapshot.catalogHash,
    planHash: snapshot.planHash,
    engineIdentity: snapshot.engineIdentity,
  };
}

/**
 * Returns only contract-owned immutable artifact evidence. If a historic row
 * no longer parses against the contract, do not forward raw JSON to the UI;
 * readiness carries the corresponding fail-closed blocker.
 */
export function projectFlowLabArtifactEvidence(snapshot: StoredFlowLabPlan): FlowLabArtifactEvidence {
  const artifact = parseStoredFlowLabPlan(snapshot);
  return {
    findings: artifact?.findings.map((finding) => ({ ...finding })) ?? [],
    unresolved: artifact?.unresolved.map((entry) => ({ ...entry })) ?? [],
    absentMembers: artifact?.absentMembers.map((entry) => ({ ...entry })) ?? [],
    productionAuthority: false,
  };
}

function orderedOperations(artifact: FlowLabPlanArtifact) {
  const schedule = new Map(artifact.relativeSchedule.map((entry) => [entry.correlationKey, entry]));
  return [...artifact.operations].sort((left, right) => {
    const leftSchedule = schedule.get(left.correlationKey)!;
    const rightSchedule = schedule.get(right.correlationKey)!;
    return leftSchedule.startElapsedMinute - rightSchedule.startElapsedMinute
      || leftSchedule.finishElapsedMinute - rightSchedule.finishElapsedMinute
      || compareFlowLabOrdinal(left.correlationKey, right.correlationKey);
  });
}

function predecessorIndex(artifact: FlowLabPlanArtifact) {
  const bySuccessor = new Map<string, FlowLabStepReadProjection["predecessors"]>();
  for (const dependency of artifact.dependencies) {
    const predecessors = bySuccessor.get(dependency.successor) ?? [];
    predecessors.push({
      correlationKey: dependency.predecessor,
      type: dependency.type,
      lagMinutes: dependency.lagMinutes,
      partialRelease: dependency.partialRelease
        ? `${dependency.partialRelease.threshold}/${dependency.partialRelease.scaleMaximum}`
        : null,
    });
    bySuccessor.set(dependency.successor, predecessors);
  }
  return bySuccessor;
}

function relativePositions(artifact: FlowLabPlanArtifact) {
  return new Map(orderedOperations(artifact).map((operation, index) => [operation.correlationKey, index + 1]));
}

export function projectFlowLabStep(
  snapshot: StoredFlowLabPlan,
  correlationKey: string,
): FlowLabStepReadProjection | null {
  const artifact = parseStoredFlowLabPlan(snapshot);
  if (!artifact) return null;
  const operation = artifact.operations.find((candidate) => candidate.correlationKey === correlationKey);
  const position = relativePositions(artifact).get(correlationKey);
  if (!operation || !position) return null;
  return {
    origin: "FLOW_LAB",
    sourceSetKey: snapshot.sourceSetKey,
    materializationKey: snapshot.materializationKey,
    pins: flowLabPins(snapshot),
    correlationKey,
    operationType: operation.operationType,
    relativePosition: position,
    predecessors: predecessorIndex(artifact).get(correlationKey) ?? [],
  };
}

export async function evaluateFlowLabSnapshotReadiness(
  db: DatabaseClient,
  snapshot: StoredFlowLabPlan,
): Promise<FlowLabReadiness> {
  const blockers: FlowLabReadBlocker[] = [];
  const artifact = parseStoredFlowLabPlan(snapshot);
  if (!artifact) blockers.push(blocker("flow_lab_snapshot_payload_invalid", "The persisted Flow Lab payload is no longer schema-valid.", snapshot.id));
  if (snapshot.productionAuthority) {
    blockers.push(blocker("flow_lab_snapshot_production_authority_invalid", "Flow Lab evidence must not carry production authority.", snapshot.id));
  }
  if (snapshot.resourceMappingVersion !== flowLabStationMappingVersion
    || !hashEquals(snapshot.resourceMappingFingerprint, flowLabStationMappingFingerprint)) {
    blockers.push(blocker("flow_lab_resource_mapping_stale", "The Flow Lab station mapping is no longer the current Doorstar mapping.", snapshot.id));
  }
  if (snapshot.state !== "VERIFIED") {
    blockers.push(blocker("flow_lab_plan_snapshot_not_verified", "The Flow Lab snapshot has not been independently VERIFIED.", snapshot.id));
  }

  try {
    const revisionAuthority = await loadRevisionAuthority(db, snapshot.orderRevisionId);
    const componentAuthority = await loadComponentAuthority(
      db,
      snapshot.orderRevisionId,
      snapshot.componentSnapshotId,
      revisionAuthority.approvalAudit?.id,
      revisionAuthority.approvalAudit?.contentHash,
    );
    blockers.push(...revisionAuthority.blockers);
    blockers.push(...componentAuthority.blockers);
    if (!revisionAuthority.approvalAudit
      || !hashEquals(snapshot.boundOrderContentHash, revisionAuthority.approvalAudit.contentHash)
      || !componentAuthority.component
      || !hashEquals(snapshot.boundComponentOutputHash, componentAuthority.component.outputHash)) {
      blockers.push(blocker("flow_lab_binding_authority_not_current", "The stored Flow Lab binding no longer matches Doorstar's exact order/component authority.", snapshot.id));
    }
  } catch {
    blockers.push(blocker("flow_lab_binding_authority_unavailable", "The exact Doorstar authority for this Flow Lab snapshot is unavailable.", snapshot.id));
  }

  const ready = blockers.length === 0;
  return {
    ready,
    blockers,
    allowedActions: snapshot.state === "REVIEW"
      ? ["VERIFY_FLOW_LAB_PLAN", "REJECT_FLOW_LAB_PLAN"]
      : [],
  };
}

/** Compatibility read-model for the existing operation workspace endpoint.
 * It deliberately keeps the Flow Lab origin explicit and does not satisfy the
 * incumbent OperationPlanSnapshot or production-release authority. */
export async function projectFlowLabPlanSnapshot(
  db: DatabaseClient,
  snapshot: StoredFlowLabPlan,
): Promise<FlowLabSnapshotReadProjection> {
  const artifact = parseStoredFlowLabPlan(snapshot);
  const readiness = await evaluateFlowLabSnapshotReadiness(db, snapshot);
  const operations = artifact
    ? orderedOperations(artifact).map((operation, index) => ({
      id: operation.correlationKey,
      sourceOperationKey: operation.operationKey,
      sourceComponentRequirementIds: [],
      sourceComponentLineHashes: [],
      outputAssemblyKey: operation.familyKey,
      sequence: index + 1,
      workflowGroup: operation.description,
      processKind: operation.operationType === "ActiveWork" ? "TECHNOLOGICAL" : "NON_TECHNOLOGICAL",
      operationType: operation.operationType,
      standardKey: "flow-lab",
      standardVersion: artifact.pins.catalogRevision,
      qualifiers: {},
      resourceKey: operation.station ?? "flow-lab-summary",
      machineKey: null,
      toolKeys: [],
      quantity: operation.quantity.value,
      quantityUnit: operation.quantity.unit,
      setupMinutesPerBatch: operation.time.setupMinutes,
      cycleMinutesPerUnit: operation.time.cycleMinutesPerUnit,
      nonTechnologicalMinutes: operation.time.passiveWaitMinutes,
      plannedNaturalHoldMinutes: null,
      timeStandardSource: null,
      workforce: operation.time.requiredWorkers,
      dependencies: [],
      documentReferences: [],
      workInstruction: null,
      qualityCheckpoints: [],
      sourceEvidence: [],
      state: readiness.ready ? "READY" : "QUARANTINED",
      quarantineReasons: readiness.blockers.map(({ code, message }) => ({ code, message })),
      correlationKey: operation.correlationKey,
      station: operation.station,
      boardProjection: operation.boardProjection,
      relativePosition: index + 1,
      predecessors: predecessorIndex(artifact).get(operation.correlationKey) ?? [],
    }))
    : [];
  return {
    id: snapshot.id,
    orderRevisionId: snapshot.orderRevisionId,
    componentSnapshotId: snapshot.componentSnapshotId,
    state: snapshot.state,
    schemaVersion: snapshot.schemaVersion,
    generatorProfileVersion: "flow-lab",
    generatorProfileFingerprint: snapshot.engineIdentity,
    standardCatalogVersion: snapshot.catalogRevision,
    standardCatalogFingerprint: snapshot.catalogHash,
    resourceMappingVersion: snapshot.resourceMappingVersion,
    resourceMappingFingerprint: snapshot.resourceMappingFingerprint,
    orderContentHash: snapshot.boundOrderContentHash,
    componentOutputHash: snapshot.boundComponentOutputHash,
    inputHash: snapshot.contentHash,
    outputHash: snapshot.contentHash,
    materializationKey: snapshot.materializationKey,
    reviewNote: snapshot.reviewNote,
    createdByRole: snapshot.createdByRole,
    createdByPrincipal: snapshot.createdByPrincipal,
    reviewResolution: snapshot.reviewResolution,
    reviewedByRole: snapshot.reviewedByRole,
    reviewedByPrincipal: snapshot.reviewedByPrincipal,
    reviewedAt: snapshot.reviewedAt,
    createdAt: snapshot.createdAt,
    origin: "FLOW_LAB",
    sourceSetKey: snapshot.sourceSetKey,
    pins: flowLabPins(snapshot),
    operations,
    evidence: projectFlowLabArtifactEvidence(snapshot),
    readiness,
  };
}
