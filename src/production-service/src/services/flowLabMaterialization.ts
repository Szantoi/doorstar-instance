import { Prisma } from "@prisma/client";
import {
  flowLabStationMappingFingerprint,
  flowLabStationMappingVersion,
  flowLabFamilies,
  getFlowLabFamily,
  resolveFlowLabStation,
} from "../config/flowLabStations.js";
import { prisma } from "../db/client.js";
import {
  flowLabPlanProjectionSchema,
  flowLabPlanSchemaVersion,
  type FlowLabPlanOperation,
} from "../domain/flowLabSchemas.js";
import { logger } from "../logger.js";
import { compareFlowLabOrdinal } from "./flowLabArtifact.js";

export class FlowLabMaterializationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export interface MaterializeFlowLabPlanInput {
  projectId: string;
  snapshotId: string;
  actorRole: string;
  actorPrincipal: string;
}

interface ResolvedOperation {
  operation: FlowLabPlanOperation;
  boardStation: string | null;
  position: number;
}

function sameHash(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function baselineFor(operation: FlowLabPlanOperation, boardStation: string | null, position: number) {
  return {
    name: operation.description,
    station: boardStation,
    quantity: operation.boardProjection.quantity,
    quantityUnit: operation.quantity.unit,
    unitHours: operation.boardProjection.unitHours,
    position,
    disabled: false,
    planLocked: false,
    operationType: operation.operationType,
  };
}

function resolveOperations(
  sourceSetKey: string,
  operations: readonly FlowLabPlanOperation[],
  relativeSchedule: ReadonlyArray<{ correlationKey: string; startElapsedMinute: number; finishElapsedMinute: number }>,
): Map<string, ResolvedOperation[]> {
  const scheduleByCorrelation = new Map(relativeSchedule.map((entry) => [entry.correlationKey, entry]));
  const unknownFamilies: string[] = [];
  const unmappedStations: Array<{ correlationKey: string; station: string | null }> = [];
  const invalidCorrelationKeys: string[] = [];

  for (const operation of operations) {
    if (operation.correlationKey.split("/", 1)[0] !== sourceSetKey) invalidCorrelationKeys.push(operation.correlationKey);
    if (!getFlowLabFamily(operation.familyKey)) unknownFamilies.push(operation.familyKey);
    if (operation.station && !resolveFlowLabStation(operation.station)) {
      unmappedStations.push({ correlationKey: operation.correlationKey, station: operation.station });
    }
    if (operation.operationType === "ActiveWork" && !operation.station) {
      unmappedStations.push({ correlationKey: operation.correlationKey, station: null });
    }
  }
  if (invalidCorrelationKeys.length) {
    throw new FlowLabMaterializationError(409, "flow_lab_correlation_source_set_mismatch", { invalidCorrelationKeys });
  }
  if (unknownFamilies.length) {
    throw new FlowLabMaterializationError(409, "flow_lab_family_unmapped", { familyKeys: [...new Set(unknownFamilies)].sort() });
  }
  if (unmappedStations.length) {
    throw new FlowLabMaterializationError(409, "flow_lab_station_unmapped", { stations: unmappedStations });
  }

  const byFamily = new Map<string, ResolvedOperation[]>();
  for (const family of flowLabFamilies) byFamily.set(family.key, []);
  for (const operation of operations) {
    const schedule = scheduleByCorrelation.get(operation.correlationKey);
    if (!schedule) {
      throw new FlowLabMaterializationError(409, "flow_lab_relative_schedule_missing", { correlationKey: operation.correlationKey });
    }
    byFamily.get(operation.familyKey)!.push({
      operation,
      boardStation: operation.station ? resolveFlowLabStation(operation.station)! : null,
      position: 0,
    });
  }

  for (const familyOperations of byFamily.values()) {
    familyOperations.sort((left, right) => {
      const leftSchedule = scheduleByCorrelation.get(left.operation.correlationKey)!;
      const rightSchedule = scheduleByCorrelation.get(right.operation.correlationKey)!;
      return leftSchedule.startElapsedMinute - rightSchedule.startElapsedMinute
        || leftSchedule.finishElapsedMinute - rightSchedule.finishElapsedMinute
        || compareFlowLabOrdinal(left.operation.correlationKey, right.operation.correlationKey);
    });
    familyOperations.forEach((resolved, index) => { resolved.position = index; });
  }
  return byFamily;
}

async function lockProjectForFlowLabMaterialization(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
}

export async function materializeFlowLabPlanSnapshot(input: MaterializeFlowLabPlanInput) {
  return prisma.$transaction(async (tx) => {
    await lockProjectForFlowLabMaterialization(tx, input.projectId);
    const snapshot = await tx.flowLabPlanSnapshot.findFirst({
      where: { id: input.snapshotId, projectId: input.projectId },
      include: {
        project: { select: { id: true, key: true, deletedAt: true } },
        orderRevision: {
          select: {
            id: true,
            status: true,
            order: { select: { projectId: true } },
            audit: { select: { action: true, contentHash: true } },
          },
        },
        componentSnapshot: { select: { id: true, orderRevisionId: true, state: true, outputHash: true } },
      },
    });
    if (!snapshot) throw new FlowLabMaterializationError(404, "flow_lab_plan_snapshot_not_found");
    if (snapshot.project.deletedAt) throw new FlowLabMaterializationError(409, "project_archived");
    if (snapshot.state !== "VERIFIED") {
      throw new FlowLabMaterializationError(409, "flow_lab_plan_snapshot_not_verified", { state: snapshot.state });
    }
    if (snapshot.productionAuthority) {
      throw new FlowLabMaterializationError(409, "flow_lab_snapshot_production_authority_invalid");
    }
    if (snapshot.schemaVersion !== flowLabPlanSchemaVersion) {
      throw new FlowLabMaterializationError(409, "flow_lab_snapshot_schema_unsupported", { schemaVersion: snapshot.schemaVersion });
    }
    if (snapshot.orderRevision.order.projectId !== input.projectId
      || snapshot.componentSnapshot.orderRevisionId !== snapshot.orderRevisionId) {
      throw new FlowLabMaterializationError(409, "flow_lab_snapshot_binding_invalid");
    }
    if (snapshot.orderRevision.status !== "APPROVED" || snapshot.componentSnapshot.state !== "VERIFIED") {
      throw new FlowLabMaterializationError(409, "flow_lab_snapshot_binding_not_current", {
        orderRevisionStatus: snapshot.orderRevision.status,
        componentSnapshotState: snapshot.componentSnapshot.state,
      });
    }
    if (!snapshot.orderRevision.audit.some((audit) => audit.action === "APPROVED" && sameHash(audit.contentHash, snapshot.boundOrderContentHash))
      || !sameHash(snapshot.componentSnapshot.outputHash, snapshot.boundComponentOutputHash)) {
      throw new FlowLabMaterializationError(409, "flow_lab_snapshot_binding_hash_mismatch");
    }
    if (snapshot.resourceMappingVersion !== flowLabStationMappingVersion
      || !sameHash(snapshot.resourceMappingFingerprint, flowLabStationMappingFingerprint)) {
      throw new FlowLabMaterializationError(409, "flow_lab_resource_mapping_mismatch", {
        expected: {
          version: flowLabStationMappingVersion,
          fingerprint: flowLabStationMappingFingerprint,
        },
        actual: {
          version: snapshot.resourceMappingVersion,
          fingerprint: snapshot.resourceMappingFingerprint,
        },
      });
    }

    const existingForSnapshot = await tx.flowLabPlanMaterialization.findUnique({
      where: { flowLabPlanSnapshotId: snapshot.id },
      include: { epicProvenance: true, stepProvenance: true },
    });
    if (existingForSnapshot) {
      logger.info({ projectId: input.projectId, snapshotId: snapshot.id, materializationId: existingForSnapshot.id }, "Flow Lab materialization idempotent no-op");
      return {
        created: false,
        materializationId: existingForSnapshot.id,
        epicCount: existingForSnapshot.epicProvenance.length,
        stepCount: existingForSnapshot.stepProvenance.length,
        conflicts: [],
      };
    }

    const activeMaterialization = await tx.flowLabPlanMaterialization.findFirst({
      where: { projectId: input.projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, flowLabPlanSnapshotId: true },
    });
    if (activeMaterialization) {
      throw new FlowLabMaterializationError(409, "flow_lab_active_materialization_exists", {
        materializationId: activeMaterialization.id,
        flowLabPlanSnapshotId: activeMaterialization.flowLabPlanSnapshotId,
      });
    }

    const parsed = flowLabPlanProjectionSchema.safeParse({
      operations: snapshot.operations,
      relativeSchedule: snapshot.relativeSchedule,
    });
    if (!parsed.success) {
      throw new FlowLabMaterializationError(409, "flow_lab_snapshot_projection_invalid", parsed.error.flatten());
    }
    const operationsByFamily = resolveOperations(snapshot.sourceSetKey, parsed.data.operations, parsed.data.relativeSchedule);

    const materialization = await tx.flowLabPlanMaterialization.create({
      data: {
        flowLabPlanSnapshotId: snapshot.id,
        projectId: input.projectId,
        resourceMappingVersion: flowLabStationMappingVersion,
        resourceMappingFingerprint: flowLabStationMappingFingerprint,
        createdByRole: input.actorRole,
        createdByPrincipal: input.actorPrincipal,
      },
    });

    let stepCount = 0;
    for (const family of flowLabFamilies) {
      const epic = await tx.epic.create({
        data: {
          projectId: input.projectId,
          name: family.name,
          position: family.position,
          disabled: false,
        },
      });
      await tx.flowLabEpicProvenance.create({
        data: { materializationId: materialization.id, epicId: epic.id, familyKey: family.key },
      });
      for (const resolved of operationsByFamily.get(family.key) ?? []) {
        const step = await tx.epicStep.create({
          data: {
            epicId: epic.id,
            name: resolved.operation.description,
            station: resolved.boardStation,
            quantity: resolved.operation.boardProjection.quantity,
            unitHours: resolved.operation.boardProjection.unitHours,
            position: resolved.position,
            disabled: false,
            planLocked: false,
          },
        });
        await tx.flowLabEpicStepProvenance.create({
          data: {
            materializationId: materialization.id,
            epicStepId: step.id,
            correlationKey: resolved.operation.correlationKey,
            baseline: baselineFor(resolved.operation, resolved.boardStation, resolved.position) as Prisma.InputJsonValue,
          },
        });
        stepCount += 1;
      }
    }
    logger.info({
      projectId: input.projectId,
      projectKey: snapshot.project.key,
      snapshotId: snapshot.id,
      materializationId: materialization.id,
      epicCount: flowLabFamilies.length,
      stepCount,
    }, "Flow Lab verified snapshot materialized to worksheet rows");
    return {
      created: true,
      materializationId: materialization.id,
      epicCount: flowLabFamilies.length,
      stepCount,
      conflicts: [],
    };
  });
}
