import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  flowLabStationMappingFingerprint,
  flowLabStationMappingVersion,
} from "../config/flowLabStations.js";
import type { ReviewFlowLabPlanSnapshotInput } from "../domain/flowLabSchemas.js";
import {
  loadComponentAuthority,
  loadRevisionAuthority,
} from "./operationPlanReadiness.js";

export class FlowLabPlanReviewError extends Error {
  constructor(
    readonly status: 404 | 409,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "FlowLabPlanReviewError";
  }
}

function hashEquals(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function isConcurrencyFailure(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    const databaseCode = typeof error.meta?.code === "string" ? error.meta.code : "";
    return error.code === "P2010" && ["40001", "40P01"].includes(databaseCode);
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError
    && /write conflict|deadlock|serialize access/i.test(error.message);
}

async function lockReviewScope(
  tx: Prisma.TransactionClient,
  projectId: string,
  orderRevisionId: string,
  componentSnapshotId: string,
  snapshotId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "OrderRevision" WHERE "id" = ${orderRevisionId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "ComponentSnapshot" WHERE "id" = ${componentSnapshotId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "FlowLabPlanSnapshot" WHERE "id" = ${snapshotId} FOR UPDATE`;
}

async function assertCurrentBinding(tx: Prisma.TransactionClient, snapshot: {
  id: string;
  projectId: string;
  orderRevisionId: string;
  componentSnapshotId: string;
  productionAuthority: boolean;
  resourceMappingVersion: string;
  resourceMappingFingerprint: string;
  boundOrderContentHash: string;
  boundComponentOutputHash: string;
}) {
  const revisionAuthority = await loadRevisionAuthority(tx, snapshot.orderRevisionId);
  const componentAuthority = await loadComponentAuthority(
    tx,
    snapshot.orderRevisionId,
    snapshot.componentSnapshotId,
    revisionAuthority.approvalAudit?.id,
    revisionAuthority.approvalAudit?.contentHash,
  );
  const blockers = [...revisionAuthority.blockers, ...componentAuthority.blockers];
  if (!revisionAuthority.approvalAudit
    || !hashEquals(snapshot.boundOrderContentHash, revisionAuthority.approvalAudit.contentHash)
    || !componentAuthority.component
    || !hashEquals(snapshot.boundComponentOutputHash, componentAuthority.component.outputHash)) {
    blockers.push({
      code: "flow_lab_explicit_binding_hash_mismatch",
      message: "The stored binding does not match the current exact Doorstar authority.",
    });
  }
  if (snapshot.productionAuthority) {
    blockers.push({
      code: "flow_lab_snapshot_production_authority_invalid",
      message: "Flow Lab evidence must not carry production authority.",
    });
  }
  if (snapshot.resourceMappingVersion !== flowLabStationMappingVersion
    || !hashEquals(snapshot.resourceMappingFingerprint, flowLabStationMappingFingerprint)) {
    blockers.push({
      code: "flow_lab_resource_mapping_stale",
      message: "The Flow Lab station mapping is no longer the current Doorstar mapping.",
    });
  }
  if (blockers.length) {
    throw new FlowLabPlanReviewError(409, "flow_lab_binding_authority_not_current", { blockers });
  }
}

/** Independent review closes an imported file only while its exact Doorstar
 * order/component binding and station-map pin are still current. */
export async function reviewFlowLabPlanSnapshot(input: {
  projectId: string;
  snapshotId: string;
  decision: ReviewFlowLabPlanSnapshotInput;
  actorRole: string;
  actorPrincipal: string;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const initial = await tx.flowLabPlanSnapshot.findFirst({
        where: { id: input.snapshotId, projectId: input.projectId },
        select: {
          id: true,
          projectId: true,
          orderRevisionId: true,
          componentSnapshotId: true,
        },
      });
      if (!initial) throw new FlowLabPlanReviewError(404, "flow_lab_plan_snapshot_not_found");
      await lockReviewScope(tx, initial.projectId, initial.orderRevisionId, initial.componentSnapshotId, initial.id);
      const snapshot = await tx.flowLabPlanSnapshot.findUniqueOrThrow({ where: { id: initial.id } });
      if (snapshot.state !== "REVIEW") {
        throw new FlowLabPlanReviewError(409, "flow_lab_plan_snapshot_state_conflict", { state: snapshot.state });
      }
      if (!hashEquals(snapshot.contentHash, input.decision.expectedContentHash)) {
        throw new FlowLabPlanReviewError(409, "flow_lab_review_content_hash_conflict", {
          expectedContentHash: snapshot.contentHash,
        });
      }
      if (snapshot.createdByPrincipal === input.actorPrincipal) {
        throw new FlowLabPlanReviewError(409, "flow_lab_review_separation_required", {
          createdByPrincipal: snapshot.createdByPrincipal,
          reviewerPrincipal: input.actorPrincipal,
        });
      }
      if (input.decision.state === "VERIFIED") await assertCurrentBinding(tx, snapshot);
      const claimed = await tx.flowLabPlanSnapshot.updateMany({
        where: { id: snapshot.id, state: "REVIEW", contentHash: snapshot.contentHash },
        data: {
          state: input.decision.state,
          reviewResolution: input.decision.resolution,
          reviewedByRole: input.actorRole,
          reviewedByPrincipal: input.actorPrincipal,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw new FlowLabPlanReviewError(409, "flow_lab_plan_snapshot_state_conflict");
      return tx.flowLabPlanSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof FlowLabPlanReviewError) throw error;
    if (isConcurrencyFailure(error)) throw new FlowLabPlanReviewError(409, "flow_lab_review_concurrency_conflict");
    throw error;
  }
}
