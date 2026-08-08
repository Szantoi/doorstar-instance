import { Prisma } from "@prisma/client";
import { getStation } from "../config/stations.js";
import { prisma } from "../db/client.js";
import {
  flowLabDeviationInputSchema,
  type FlowLabDeviationInput,
} from "../domain/flowLabSchemas.js";
import { logger } from "../logger.js";

export class FlowLabDeviationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export interface AppendFlowLabDeviationInput {
  projectId: string;
  materializationId: string;
  actorRole: string;
  actorPrincipal: string;
  deviation: FlowLabDeviationInput;
  occurredAt?: Date;
}

export interface UpdateFlowLabMaterializedStepInput {
  projectId: string;
  epicStepId: string;
  actorRole: string;
  actorPrincipal: string;
  changes: {
    quantity?: number;
    unitHours?: number;
    station?: string | null;
    planDate?: string | null;
    disabled?: boolean;
    planLocked?: boolean;
    position?: number;
  };
}

export interface AddFlowLabManualStepInput {
  projectId: string;
  epicId: string;
  actorRole: string;
  actorPrincipal: string;
  step: {
    name: string;
    station?: string | null;
    quantity?: number | null;
    unitHours?: number | null;
    planDate?: string | null;
    disabled?: boolean;
    planLocked?: boolean;
    position?: number;
  };
}

export type FlowLabDeviationOutboxLifecycleState = "PENDING" | "PUBLISHED" | "FAILED";

/**
 * The health deadline belongs to an enqueue episode, not to each new board
 * observation. In particular, a FAILED outbox remains terminal until the
 * dedicated human requeue path starts a new PENDING episode.
 */
export function nextFlowLabDeviationOutboxAfterAppend(
  existing: { state: FlowLabDeviationOutboxLifecycleState; pendingSince: Date | null } | null,
  enqueuedAt: Date,
): { state: FlowLabDeviationOutboxLifecycleState; pendingSince: Date | null } {
  if (Number.isNaN(enqueuedAt.getTime())) throw new Error("flow_lab_deviation_pending_since_invalid");
  if (!existing) return { state: "PENDING", pendingSince: enqueuedAt };
  if (existing.state === "FAILED") return { state: "FAILED", pendingSince: existing.pendingSince };
  if (existing.state === "PENDING" && existing.pendingSince) {
    return { state: "PENDING", pendingSince: existing.pendingSince };
  }
  return { state: "PENDING", pendingSince: enqueuedAt };
}

interface Cursor {
  occurredAt: string;
  id: string;
}

function quantityUnitFromBaseline(baseline: Prisma.JsonValue): string {
  if (baseline && typeof baseline === "object" && !Array.isArray(baseline)) {
    const candidate = baseline.quantityUnit;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  throw new FlowLabDeviationError(409, "flow_lab_quantity_unit_baseline_missing");
}

/** The date is board-owned calendar anchoring, not a Flow Lab deviation. */
function boardPlanDateToUtc(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function boardPlanDateValue(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function encodeCursor(record: { occurredAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ occurredAt: record.occurredAt.toISOString(), id: record.id }), "utf8").toString("base64url");
}

function decodeCursor(value: string): { occurredAt: Date; id: string } {
  let parsed: Cursor;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
  } catch {
    throw new FlowLabDeviationError(400, "flow_lab_deviation_cursor_invalid");
  }
  const occurredAt = new Date(parsed.occurredAt);
  if (!parsed || typeof parsed.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
    || Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== parsed.occurredAt) {
    throw new FlowLabDeviationError(400, "flow_lab_deviation_cursor_invalid");
  }
  return { occurredAt, id: parsed.id };
}

async function lockProjectForFlowLabDeviation(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
}

async function loadMaterialization(
  tx: Prisma.TransactionClient,
  projectId: string,
  materializationId: string,
) {
  const materialization = await tx.flowLabPlanMaterialization.findFirst({
    where: { id: materializationId, projectId },
    include: {
      flowLabPlanSnapshot: {
        select: {
          id: true,
          projectId: true,
          sourceSetKey: true,
          materializationKey: true,
          catalogRevision: true,
          catalogHash: true,
          planHash: true,
          engineIdentity: true,
        },
      },
    },
  });
  if (!materialization) throw new FlowLabDeviationError(404, "flow_lab_materialization_not_found");
  if (materialization.flowLabPlanSnapshot.projectId !== projectId) {
    throw new FlowLabDeviationError(409, "flow_lab_materialization_binding_invalid");
  }
  return materialization;
}

/**
 * Appends raw evidence and marks the materialization dirty in one database
 * transaction. No caller can obtain an update/delete capability for records.
 */
export async function appendFlowLabDeviationInTransaction(
  tx: Prisma.TransactionClient,
  input: AppendFlowLabDeviationInput,
) {
  const parsed = flowLabDeviationInputSchema.safeParse(input.deviation);
  if (!parsed.success) {
    throw new FlowLabDeviationError(400, "flow_lab_deviation_invalid", parsed.error.flatten());
  }
  const materialization = await loadMaterialization(tx, input.projectId, input.materializationId);
  if (parsed.data.correlationKey) {
    const provenance = await tx.flowLabEpicStepProvenance.findFirst({
      where: { materializationId: materialization.id, correlationKey: parsed.data.correlationKey },
      select: { id: true },
    });
    if (!provenance) {
      throw new FlowLabDeviationError(409, "flow_lab_deviation_correlation_not_materialized", {
        correlationKey: parsed.data.correlationKey,
      });
    }
  }
  const record = await tx.flowLabDeviationRecord.create({
    data: {
      projectId: input.projectId,
      flowLabPlanSnapshotId: materialization.flowLabPlanSnapshotId,
      materializationId: materialization.id,
      correlationKey: parsed.data.correlationKey,
      kind: parsed.data.kind,
      actorRole: input.actorRole,
      actorPrincipal: input.actorPrincipal,
      payload: parsed.data.payload as Prisma.InputJsonValue,
      occurredAt: input.occurredAt,
    },
  });
  const enqueuedAt = new Date();
  const existingOutbox = await tx.flowLabDeviationOutbox.findUnique({
    where: { materializationId: materialization.id },
    select: { id: true, state: true, pendingSince: true },
  });
  const nextOutbox = nextFlowLabDeviationOutboxAfterAppend(existingOutbox, enqueuedAt);
  const outbox = existingOutbox
    ? await tx.flowLabDeviationOutbox.update({
      where: { id: existingOutbox.id },
      data: {
        state: nextOutbox.state,
        generation: { increment: 1 },
        pendingSince: nextOutbox.pendingSince,
        ...(nextOutbox.state === "FAILED" ? {} : { lastError: null }),
      },
    })
    : await tx.flowLabDeviationOutbox.create({
      data: {
        materializationId: materialization.id,
        state: "PENDING",
        generation: 1,
        pendingSince: enqueuedAt,
      },
    });
  return { record, outbox, materialization };
}

export async function appendFlowLabDeviation(input: AppendFlowLabDeviationInput) {
  return prisma.$transaction(async (tx) => {
    await lockProjectForFlowLabDeviation(tx, input.projectId);
    const result = await appendFlowLabDeviationInTransaction(tx, input);
    logger.info({
      projectId: input.projectId,
      materializationId: input.materializationId,
      deviationId: result.record.id,
      kind: result.record.kind,
      outboxGeneration: result.outbox.generation,
      outboxState: result.outbox.state,
      pendingSince: result.outbox.pendingSince?.toISOString() ?? null,
    }, "Flow Lab deviation appended and outbox updated");
    return result;
  });
}

export async function listFlowLabDeviations(input: { projectId: string; cursor?: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  const records = await prisma.flowLabDeviationRecord.findMany({
    where: {
      projectId: input.projectId,
      ...(cursor
        ? {
          OR: [
            { occurredAt: { lt: cursor.occurredAt } },
            { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
          ],
        }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      materialization: {
        select: {
          id: true,
          flowLabPlanSnapshot: {
            select: {
              sourceSetKey: true,
              materializationKey: true,
              catalogRevision: true,
              catalogHash: true,
              planHash: true,
              engineIdentity: true,
            },
          },
        },
      },
    },
  });
  const hasMore = records.length > limit;
  const page = records.slice(0, limit);
  return {
    records: page.map((record) => ({
      id: record.id,
      occurredAt: record.occurredAt,
      kind: record.kind,
      correlationKey: record.correlationKey,
      actor: { role: record.actorRole, principal: record.actorPrincipal },
      payload: record.payload,
      materializationId: record.materialization.id,
      pins: record.materialization.flowLabPlanSnapshot,
    })),
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function updateFlowLabMaterializedStep(input: UpdateFlowLabMaterializedStepInput) {
  return prisma.$transaction(async (tx) => {
    await lockProjectForFlowLabDeviation(tx, input.projectId);
    const provenance = await tx.flowLabEpicStepProvenance.findFirst({
      where: { epicStepId: input.epicStepId },
      include: {
        epicStep: { include: { epic: { select: { projectId: true } } } },
        materialization: { select: { id: true, projectId: true } },
      },
    });
    if (!provenance || provenance.materialization.projectId !== input.projectId || provenance.epicStep.epic.projectId !== input.projectId) {
      throw new FlowLabDeviationError(404, "flow_lab_materialized_step_not_found");
    }
    if (input.changes.station !== undefined && input.changes.station !== null && !getStation(input.changes.station)) {
      throw new FlowLabDeviationError(409, "flow_lab_board_station_unknown", { station: input.changes.station });
    }
    const current = provenance.epicStep;
    const deviations: FlowLabDeviationInput[] = [];
    const planDateChanged = input.changes.planDate !== undefined
      && input.changes.planDate !== boardPlanDateValue(current.planDate);
    if (input.changes.quantity !== undefined && input.changes.quantity !== current.quantity) {
      if (current.quantity === null) throw new FlowLabDeviationError(409, "flow_lab_quantity_baseline_missing");
      deviations.push({
        kind: "QUANTITY_CHANGED",
        correlationKey: provenance.correlationKey,
        payload: {
          quantityBefore: current.quantity,
          quantityAfter: input.changes.quantity,
          quantityUnit: quantityUnitFromBaseline(provenance.baseline),
        },
      });
    }
    if (input.changes.unitHours !== undefined && input.changes.unitHours !== current.unitHours) {
      if (current.unitHours === null) throw new FlowLabDeviationError(409, "flow_lab_unit_hours_baseline_missing");
      deviations.push({
        kind: "UNIT_HOURS_CHANGED",
        correlationKey: provenance.correlationKey,
        payload: { unitHoursBefore: current.unitHours, unitHoursAfter: input.changes.unitHours },
      });
    }
    if (input.changes.disabled !== undefined && input.changes.disabled !== current.disabled) {
      if (input.changes.disabled) {
        deviations.push({ kind: "STEP_DISABLED", correlationKey: provenance.correlationKey, payload: { disabled: true } });
      } else {
        deviations.push({ kind: "STEP_ENABLED", correlationKey: provenance.correlationKey, payload: { disabled: false } });
      }
    }
    if (input.changes.position !== undefined && input.changes.position !== current.position) {
      deviations.push({
        kind: "STEP_REORDERED",
        correlationKey: provenance.correlationKey,
        payload: { positionBefore: current.position, positionAfter: input.changes.position },
      });
    }
    if (input.changes.station !== undefined && input.changes.station !== current.station) {
      deviations.push({
        kind: "STATION_CHANGED",
        correlationKey: provenance.correlationKey,
        payload: { stationBefore: current.station, stationAfter: input.changes.station },
      });
    }
    if (input.changes.planLocked !== undefined && input.changes.planLocked !== current.planLocked) {
      if (input.changes.planLocked) {
        deviations.push({ kind: "PLAN_LOCKED", correlationKey: provenance.correlationKey, payload: { planLocked: true } });
      } else {
        deviations.push({ kind: "PLAN_UNLOCKED", correlationKey: provenance.correlationKey, payload: { planLocked: false } });
      }
    }
    if (!deviations.length && !planDateChanged) return { changed: false, step: current, deviations: [] };

    const { planDate, ...materializedChanges } = input.changes;
    const step = await tx.epicStep.update({
      where: { id: current.id },
      data: {
        ...materializedChanges,
        ...(planDate === undefined ? {} : { planDate: boardPlanDateToUtc(planDate) }),
      },
    });
    const emitted = [];
    for (const deviation of deviations) {
      emitted.push(await appendFlowLabDeviationInTransaction(tx, {
        projectId: input.projectId,
        materializationId: provenance.materialization.id,
        actorRole: input.actorRole,
        actorPrincipal: input.actorPrincipal,
        deviation,
      }));
    }
    logger.info({ projectId: input.projectId, epicStepId: step.id, deviationCount: emitted.length }, "Flow Lab materialized step changed with typed deviation evidence");
    return { changed: true, step, deviations: emitted.map((entry) => entry.record) };
  });
}

export async function addFlowLabManualStep(input: AddFlowLabManualStepInput) {
  return prisma.$transaction(async (tx) => {
    await lockProjectForFlowLabDeviation(tx, input.projectId);
    const epicProvenance = await tx.flowLabEpicProvenance.findFirst({
      where: { epicId: input.epicId },
      include: { materialization: { select: { id: true, projectId: true } } },
    });
    if (!epicProvenance || epicProvenance.materialization.projectId !== input.projectId) {
      throw new FlowLabDeviationError(404, "flow_lab_materialized_epic_not_found");
    }
    if (input.step.station !== undefined && input.step.station !== null && !getStation(input.step.station)) {
      throw new FlowLabDeviationError(409, "flow_lab_board_station_unknown", { station: input.step.station });
    }
    const nextPosition = input.step.position ?? ((await tx.epicStep.aggregate({
      where: { epicId: input.epicId },
      _max: { position: true },
    }))._max.position ?? -1) + 1;
    const step = await tx.epicStep.create({
      data: {
        epicId: input.epicId,
        name: input.step.name,
        station: input.step.station ?? null,
        quantity: input.step.quantity ?? null,
        unitHours: input.step.unitHours ?? null,
        planDate: input.step.planDate === undefined ? null : boardPlanDateToUtc(input.step.planDate),
        disabled: input.step.disabled ?? false,
        planLocked: input.step.planLocked ?? false,
        position: nextPosition,
      },
    });
    const emitted = await appendFlowLabDeviationInTransaction(tx, {
      projectId: input.projectId,
      materializationId: epicProvenance.materialization.id,
      actorRole: input.actorRole,
      actorPrincipal: input.actorPrincipal,
      deviation: {
        kind: "STEP_ADDED_BY_HAND",
        correlationKey: null,
        payload: {
          handAddedName: step.name,
          handAddedStation: step.station,
          handAddedPosition: step.position,
        },
      },
    });
    logger.info({ projectId: input.projectId, epicId: input.epicId, epicStepId: step.id, deviationId: emitted.record.id }, "manual Flow Lab worksheet step added with deviation evidence");
    return { step, deviation: emitted.record };
  });
}
