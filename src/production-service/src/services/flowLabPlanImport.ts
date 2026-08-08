import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  flowLabStationMappingFingerprint,
  flowLabStationMappingVersion,
} from "../config/flowLabStations.js";
import {
  loadComponentAuthority,
  loadRevisionAuthority,
  type DatabaseClient,
} from "./operationPlanReadiness.js";
import {
  readFlowLabPlanArtifactFromInbox,
  type FlowLabBoardBinding,
  type ValidatedFlowLabPlanArtifact,
} from "./flowLabArtifact.js";

export class FlowLabPlanImportError extends Error {
  constructor(
    public readonly code:
      | "flow_lab_binding_project_not_found"
      | "flow_lab_binding_revision_not_found"
      | "flow_lab_binding_authority_not_current"
      | "flow_lab_station_mapping_stale"
      | "flow_lab_materialization_key_conflict"
      | "flow_lab_import_concurrency_conflict",
    public readonly status: 404 | 409,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "FlowLabPlanImportError";
  }
}

export interface FlowLabPlanImportResult {
  created: boolean;
  snapshot: {
    id: string;
    state: "REVIEW" | "VERIFIED" | "REJECTED";
    projectId: string;
    orderRevisionId: string;
    componentSnapshotId: string;
    sourceSetKey: string;
    materializationKey: string;
    contentHash: string;
    fileSha256: string;
    resourceMappingVersion: string;
    resourceMappingFingerprint: string;
  };
}

function snapshotResult(snapshot: {
  id: string;
  state: "REVIEW" | "VERIFIED" | "REJECTED";
  projectId: string;
  orderRevisionId: string;
  componentSnapshotId: string;
  sourceSetKey: string;
  materializationKey: string;
  contentHash: string;
  fileSha256: string;
  resourceMappingVersion: string;
  resourceMappingFingerprint: string;
}): FlowLabPlanImportResult["snapshot"] {
  return snapshot;
}

function hashEquals(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function concurrencyFailure(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    const databaseCode = typeof error.meta?.code === "string" ? error.meta.code : "";
    return error.code === "P2010" && ["40001", "40P01"].includes(databaseCode);
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError
    && /write conflict|deadlock|serialize access/i.test(error.message);
}

async function lockBindingScope(tx: Prisma.TransactionClient, projectId: string, orderRevisionId: string, componentSnapshotId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "OrderRevision" WHERE "id" = ${orderRevisionId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "ComponentSnapshot" WHERE "id" = ${componentSnapshotId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "FlowLabPlanSnapshot" WHERE "projectId" = ${projectId} FOR UPDATE`;
}

function assertCurrentMapping(binding: FlowLabBoardBinding) {
  if (
    binding.stationMappingVersion !== flowLabStationMappingVersion
    || !hashEquals(binding.stationMappingFingerprint, flowLabStationMappingFingerprint)
  ) {
    throw new FlowLabPlanImportError("flow_lab_station_mapping_stale", 409, {
      expectedVersion: flowLabStationMappingVersion,
      expectedFingerprint: flowLabStationMappingFingerprint,
      suppliedVersion: binding.stationMappingVersion,
      suppliedFingerprint: binding.stationMappingFingerprint,
    });
  }
}

async function inSerializableImportTransaction<T>(
  db: DatabaseClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (db === prisma) {
    return prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  // Service-level tests may provide their already-open transaction. The
  // production path above is always SERIALIZABLE and owns the transaction.
  return callback(db as Prisma.TransactionClient);
}

/**
 * Persists an already byte- and semantic-validated Flow Lab file behind an
 * explicit Doorstar binding. The sourceSetKey never resolves board data by
 * itself; the caller has already supplied the exact reviewable target.
 */
export async function importFlowLabPlanSnapshot(
  binding: FlowLabBoardBinding,
  validated: ValidatedFlowLabPlanArtifact,
  db: DatabaseClient = prisma,
): Promise<FlowLabPlanImportResult> {
  assertCurrentMapping(binding);
  const artifact = validated.artifact;
  try {
    return await inSerializableImportTransaction(
      db,
      async (tx) => {
        const project = await tx.project.findUnique({ where: { key: binding.projectKey }, select: { id: true } });
        if (!project) throw new FlowLabPlanImportError("flow_lab_binding_project_not_found", 404);
        const revision = await tx.orderRevision.findFirst({
          where: { order: { projectId: project.id }, revision: binding.revision },
          select: { id: true },
        });
        if (!revision) throw new FlowLabPlanImportError("flow_lab_binding_revision_not_found", 404);
        await lockBindingScope(tx, project.id, revision.id, binding.componentSnapshotId);

        const revisionAuthority = await loadRevisionAuthority(tx, revision.id);
        const componentAuthority = await loadComponentAuthority(
          tx,
          revision.id,
          binding.componentSnapshotId,
          revisionAuthority.approvalAudit?.id,
          revisionAuthority.approvalAudit?.contentHash,
        );
        const blockers = [...revisionAuthority.blockers, ...componentAuthority.blockers];
        if (
          !revisionAuthority.approvalAudit
          || !hashEquals(binding.expectedOrderContentHash, revisionAuthority.approvalAudit.contentHash)
          || !componentAuthority.component
          || !hashEquals(binding.expectedComponentOutputHash, componentAuthority.component.outputHash)
        ) {
          blockers.push({
            code: "flow_lab_explicit_binding_hash_mismatch",
            message: "The binding does not match the current exact Doorstar authority.",
          });
        }
        if (blockers.length) {
          throw new FlowLabPlanImportError("flow_lab_binding_authority_not_current", 409, { blockers });
        }

        const existing = await tx.flowLabPlanSnapshot.findUnique({
          where: { projectId_materializationKey: { projectId: project.id, materializationKey: artifact.materializationKey } },
        });
        if (existing) {
          if (hashEquals(existing.fileSha256, validated.fileSha256) && hashEquals(existing.contentHash, artifact.contentHash)) {
            return { created: false, snapshot: snapshotResult(existing) };
          }
          throw new FlowLabPlanImportError("flow_lab_materialization_key_conflict", 409, {
            materializationKey: artifact.materializationKey,
            existingFileSha256: existing.fileSha256,
            incomingFileSha256: validated.fileSha256,
            existingContentHash: existing.contentHash,
            incomingContentHash: artifact.contentHash,
          });
        }

        const snapshot = await tx.flowLabPlanSnapshot.create({
          data: {
            projectId: project.id,
            orderRevisionId: revision.id,
            componentSnapshotId: binding.componentSnapshotId,
            schemaVersion: artifact.schemaVersion,
            sourceSetKey: artifact.sourceSetKey,
            materializationKey: artifact.materializationKey,
            contentHash: artifact.contentHash,
            fileSha256: validated.fileSha256,
            fileName: validated.fileName,
            catalogRevision: artifact.pins.catalogRevision,
            catalogHash: artifact.pins.catalogHash,
            planHash: artifact.pins.planHash,
            engineIdentity: artifact.pins.engineIdentity,
            resourceMappingVersion: flowLabStationMappingVersion,
            resourceMappingFingerprint: flowLabStationMappingFingerprint,
            boundOrderContentHash: binding.expectedOrderContentHash,
            boundComponentOutputHash: binding.expectedComponentOutputHash,
            operations: artifact.operations as Prisma.InputJsonValue,
            dependencies: artifact.dependencies as Prisma.InputJsonValue,
            relativeSchedule: artifact.relativeSchedule as Prisma.InputJsonValue,
            unresolved: artifact.unresolved as Prisma.InputJsonValue,
            absentMembers: artifact.absentMembers as Prisma.InputJsonValue,
            findings: artifact.findings as Prisma.InputJsonValue,
            productionAuthority: false,
            reviewNote: binding.reviewNote,
            createdByRole: binding.actorRole,
            createdByPrincipal: binding.actorPrincipal,
          },
        });
        return { created: true, snapshot: snapshotResult(snapshot) };
      },
    );
  } catch (error) {
    if (error instanceof FlowLabPlanImportError) throw error;
    if (concurrencyFailure(error)) throw new FlowLabPlanImportError("flow_lab_import_concurrency_conflict", 409);
    throw error;
  }
}

/** Reads only the configured handoff inbox, then delegates all persistence to
 * the exact same binding and idempotence gate as a test fixture import. */
export async function importFlowLabPlanSnapshotFromInbox(
  binding: FlowLabBoardBinding,
  inbox: { inboxDirectory: string; fileName: string },
  db: DatabaseClient = prisma,
) {
  return importFlowLabPlanSnapshot(binding, readFlowLabPlanArtifactFromInbox(inbox), db);
}
