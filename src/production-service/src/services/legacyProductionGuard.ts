import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  evaluateOperationPlanSnapshot,
  loadComponentAuthority,
  loadRevisionAuthority,
} from "./operationPlanReadiness.js";

export const legacyProductionBlockerCodes = [
  "approved_revision_required",
  "approved_order_audit_required",
  "approved_order_content_changed",
  "explicit_order_revision_lineage_required",
  "current_verified_component_snapshot_required",
  "explicit_component_snapshot_lineage_required",
  "current_verified_operation_plan_required",
  "planning_proposal_required",
  "issued_work_package_required",
  "exact_document_lineage_required",
  "legacy_lineage_concurrency_conflict",
] as const;

export type LegacyProductionBlockerCode = typeof legacyProductionBlockerCodes[number];

export interface LegacyProductionBlocker {
  code: LegacyProductionBlockerCode;
  message: string;
  entityId?: string;
}

export interface LegacyProductionGuardDetails {
  mutation: string;
  projectId: string | null;
  blockers: LegacyProductionBlocker[];
}

/**
 * Stable 409 raised by every legacy path that could materialize production
 * work. The legacy Project/EpicStep/Task model cannot carry the immutable
 * release lineage, so even observed current snapshots are diagnostics only.
 */
export class LegacyProductionGuardError extends Error {
  readonly status = 409 as const;
  readonly code = "legacy_production_issue_blocked" as const;

  constructor(public readonly details: LegacyProductionGuardDetails) {
    super("legacy_production_issue_blocked");
    this.name = "LegacyProductionGuardError";
  }
}

function blocker(
  code: LegacyProductionBlockerCode,
  message: string,
  entityId?: string,
): LegacyProductionBlocker {
  return { code, message, ...(entityId ? { entityId } : {}) };
}

function isConcurrencyFailure(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    const databaseCode = typeof error.meta?.code === "string" ? error.meta.code : "";
    if (error.code === "P2010" && ["40001", "40P01"].includes(databaseCode)) return true;
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError
    && /write conflict|deadlock|serialize access/i.test(error.message);
}

async function evaluateLockedAuthority(
  tx: Prisma.TransactionClient,
  projectId: string | null,
  mutation: string,
): Promise<LegacyProductionGuardDetails> {
  // Lock order is shared with downstream materialization: aggregate root,
  // exact revision, component snapshot, then operation snapshot. This makes a
  // concurrent supersession/review commit visible before the decision.
  if (projectId) {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  }
  const orders = projectId
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ProductionOrder" WHERE "projectId" = ${projectId} FOR UPDATE
      `
    : [];
  const orderId = orders[0]?.id;
  const latestRows = orderId
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "OrderRevision"
        WHERE "orderId" = ${orderId}
        ORDER BY "revision" DESC, "id" DESC
        LIMIT 1
        FOR UPDATE
      `
    : [];
  const revisionAuthority = latestRows[0]
    ? await loadRevisionAuthority(tx, latestRows[0].id)
    : undefined;
  const latest = revisionAuthority?.revision;
  const approvalAudit = revisionAuthority?.approvalAudit;
  const approvalContentCurrent = Boolean(
    revisionAuthority
    && revisionAuthority.blockers.length === 0,
  );

  if (latest) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "ComponentSnapshot"
      WHERE "orderRevisionId" = ${latest.id}
      ORDER BY "id"
      FOR UPDATE
    `;
  }
  const componentCandidates = latest
    ? await tx.componentSnapshot.findMany({
        where: { orderRevisionId: latest.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      })
    : [];
  let currentComponent: typeof componentCandidates[number] | undefined;
  for (const candidate of componentCandidates) {
    const authority = await loadComponentAuthority(
      tx,
      latest!.id,
      candidate.id,
      approvalAudit?.id,
      approvalAudit?.contentHash,
    );
    if (approvalContentCurrent && authority.blockers.length === 0) {
      currentComponent = candidate;
      break;
    }
  }

  if (currentComponent) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "OperationPlanSnapshot"
      WHERE "componentSnapshotId" = ${currentComponent.id}
      ORDER BY "id"
      FOR UPDATE
    `;
  }
  const operationCandidates = currentComponent
    ? await tx.operationPlanSnapshot.findMany({
        where: { orderRevisionId: latest!.id, componentSnapshotId: currentComponent.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      })
    : [];
  let currentOperation: typeof operationCandidates[number] | undefined;
  for (const candidate of operationCandidates) {
    const authority = await evaluateOperationPlanSnapshot(tx, candidate);
    if (candidate.state === "VERIFIED" && authority.blockers.length === 0) {
      currentOperation = candidate;
      break;
    }
  }

  const blockers: LegacyProductionBlocker[] = [];
  if (!latest || revisionAuthority?.blockers.some((entry) => [
    "operation_revision_stale",
    "operation_revision_not_approved",
  ].includes(entry.code))) {
    blockers.push(blocker(
      "approved_revision_required",
      "The latest order revision must be APPROVED before any production release.",
      latest?.id,
    ));
  }
  if (latest?.status === "APPROVED" && revisionAuthority?.blockers.some((entry) =>
    ["operation_approval_audit_missing", "operation_content_hash_schema_unsupported"].includes(entry.code))) {
    blockers.push(blocker(
      "approved_order_audit_required",
      "The APPROVED order revision has no immutable approval audit.",
      latest.id,
    ));
  }
  if (latest?.status === "APPROVED" && approvalAudit && revisionAuthority?.blockers.some((entry) =>
    entry.code === "operation_order_hash_stale")) {
    blockers.push(blocker(
      "approved_order_content_changed",
      "The APPROVED order content no longer matches its immutable approval audit.",
      latest.id,
    ));
  }
  blockers.push(blocker(
    "explicit_order_revision_lineage_required",
    "The legacy mutation cannot bind an exact approved order revision and content hash.",
    latest?.id,
  ));
  if (!currentComponent) {
    blockers.push(blocker(
      "current_verified_component_snapshot_required",
      "A current VERIFIED component snapshot matching the latest approval and active configuration is required.",
      latest?.id,
    ));
  }
  blockers.push(blocker(
    "explicit_component_snapshot_lineage_required",
    "The legacy mutation cannot bind an exact VERIFIED component snapshot and output hash.",
    currentComponent?.id,
  ));
  if (!currentOperation) {
    blockers.push(blocker(
      "current_verified_operation_plan_required",
      "A current VERIFIED operation plan matching the order and component hashes is required.",
      currentComponent?.id,
    ));
  }
  blockers.push(
    blocker(
      "planning_proposal_required",
      "An approved immutable planning proposal authority does not exist on the legacy path.",
      currentOperation?.id,
    ),
    blocker(
      "issued_work_package_required",
      "An immutable IssuedWorkPackage authority is required before production tasks may be created.",
    ),
    blocker(
      "exact_document_lineage_required",
      "The work package must freeze its exact document versions and hashes.",
    ),
  );
  return { mutation, projectId, blockers };
}

/**
 * This function intentionally has no success path until PlanningProposal and
 * IssuedWorkPackage aggregates can be verified. Call it before every legacy
 * production write; the transaction provides a consistent diagnostic view.
 * If a future authority adds a success path, the Task write must move into
 * this same transaction. Calling a success-returning precheck before a later
 * write would reintroduce a supersession/snapshot TOCTOU race.
 */
export async function rejectLegacyProductionMutation(projectId: string | null, mutation: string): Promise<never> {
  try {
    const details = await prisma.$transaction(
      (tx) => evaluateLockedAuthority(tx, projectId, mutation),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    throw new LegacyProductionGuardError(details);
  } catch (error) {
    if (error instanceof LegacyProductionGuardError) throw error;
    if (isConcurrencyFailure(error)) {
      throw new LegacyProductionGuardError({
        mutation,
        projectId,
        blockers: [blocker(
          "legacy_lineage_concurrency_conflict",
          "Production lineage changed concurrently; retry against a fresh authoritative read model.",
        )],
      });
    }
    throw error;
  }
}
