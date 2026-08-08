import { Prisma } from "@prisma/client";
import {
  operationAuthority,
  operationGeneratorProfileFingerprint,
  operationPlanSnapshotSchemaVersion,
  resourceMappingFingerprint,
  standardCatalogFingerprint,
} from "../config/operationAuthority.js";
import { prisma } from "../db/client.js";
import type { CreateOperationPlanSnapshotInput } from "../domain/operationSchemas.js";
import {
  componentAuthorityInclude,
  evaluateOperationPlanSnapshot,
  loadComponentAuthority,
  loadRevisionAuthority,
  operationGeneratorBlockers,
  OperationPlanError,
  operationPlanBlocker,
  projectOperationPlanSnapshot,
  throwOperationPlanBlockers,
  type DatabaseClient,
} from "./operationPlanReadiness.js";
import {
  canonicalHash,
  normalizeOperations,
  validateOperationCandidates,
  type OperationPlanBlocker,
} from "./operationPlanValidation.js";
import { projectFlowLabPlanSnapshot } from "./flowLabReadProjection.js";

export { OperationPlanError } from "./operationPlanReadiness.js";

function isConcurrencyFailure(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    const databaseCode = typeof error.meta?.code === "string" ? error.meta.code : "";
    if (error.code === "P2010" && ["40001", "40P01"].includes(databaseCode)) return true;
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError
    && /write conflict|deadlock|serialize access/i.test(error.message);
}

export async function listOperationPlanSnapshots(orderRevisionId: string, db: DatabaseClient = prisma) {
  const revisionAuthority = await loadRevisionAuthority(db, orderRevisionId);
  const componentSnapshots = await db.componentSnapshot.findMany({
    where: { orderRevisionId },
    include: componentAuthorityInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  let currentComponentFound = false;
  const componentBlockers: OperationPlanBlocker[] = [];
  for (const component of componentSnapshots) {
    const authority = await loadComponentAuthority(
      db,
      orderRevisionId,
      component.id,
      revisionAuthority.approvalAudit?.id,
      revisionAuthority.approvalAudit?.contentHash,
    );
    if (authority.blockers.length === 0) currentComponentFound = true;
    else componentBlockers.push(...authority.blockers);
  }
  const createBlockers = [...revisionAuthority.blockers];
  if (!currentComponentFound) {
    createBlockers.push(...(componentBlockers.length ? componentBlockers : [
      operationPlanBlocker(
        "operation_component_snapshot_not_current",
        "No current VERIFIED component snapshot exists for this revision.",
        orderRevisionId,
      ),
    ]));
  }
  const snapshots = await db.operationPlanSnapshot.findMany({
    where: { orderRevisionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  // Flow Lab evidence is a separate aggregate and never participates in the
  // incumbent create/review/release authority. It is included only as an
  // explicitly marked read-only origin for the shared operation workspace.
  const flowLabSnapshots = await db.flowLabPlanSnapshot.findMany({
    where: { orderRevisionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const projectedSnapshots = await Promise.all(
    snapshots.map((snapshot) => projectOperationPlanSnapshot(db, snapshot)),
  );
  const projectedFlowLabSnapshots = await Promise.all(
    flowLabSnapshots.map((snapshot) => projectFlowLabPlanSnapshot(db, snapshot)),
  );
  return {
    readiness: {
      ready: createBlockers.length === 0,
      blockers: createBlockers,
      allowedActions: createBlockers.length === 0 ? ["CREATE_OPERATION_PLAN_SNAPSHOT"] : [],
    },
    snapshots: [...projectedSnapshots, ...projectedFlowLabSnapshots]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)),
  };
}

async function lockMaterializationRows(
  tx: Prisma.TransactionClient,
  orderRevisionId: string,
  componentSnapshotId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "OrderRevision" WHERE "id" = ${orderRevisionId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "ComponentSnapshot" WHERE "id" = ${componentSnapshotId} FOR UPDATE`;
}

export async function createOperationPlanSnapshot(
  orderRevisionId: string,
  input: CreateOperationPlanSnapshotInput,
  actorRole: string,
  actorPrincipal: string,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockMaterializationRows(tx, orderRevisionId, input.componentSnapshotId);
      const revisionAuthority = await loadRevisionAuthority(tx, orderRevisionId);
      const componentAuthority = await loadComponentAuthority(
        tx,
        orderRevisionId,
        input.componentSnapshotId,
        revisionAuthority.approvalAudit?.id,
        revisionAuthority.approvalAudit?.contentHash,
      );
      const generator = operationGeneratorBlockers(input.generatorProfileVersion);
      const blockers = [
        ...revisionAuthority.blockers,
        ...componentAuthority.blockers,
        ...generator.blockers,
      ];
      if (revisionAuthority.approvalAudit?.contentHash.toLowerCase() !== input.expectedOrderContentHash.toLowerCase()) {
        blockers.push(operationPlanBlocker(
          "operation_order_hash_mismatch",
          "Expected order hash does not match the current approval.",
          orderRevisionId,
        ));
      }
      if (componentAuthority.component?.outputHash.toLowerCase() !== input.expectedComponentOutputHash.toLowerCase()) {
        blockers.push(operationPlanBlocker(
          "operation_component_hash_mismatch",
          "Expected component output hash does not match the selected snapshot.",
          input.componentSnapshotId,
        ));
      }
      const operations = normalizeOperations(input.operations);
      if (componentAuthority.component) {
        blockers.push(...validateOperationCandidates(
          operations,
          componentAuthority.component.requirements,
          revisionAuthority.revision.documents,
        ));
      }
      if (blockers.length) throwOperationPlanBlockers(blockers);

      const generatorProfileFingerprint = operationGeneratorProfileFingerprint(generator.profile!);
      const inputHash = canonicalHash({
        schemaVersion: operationPlanSnapshotSchemaVersion,
        orderRevisionId,
        orderContentHash: revisionAuthority.approvalAudit!.contentHash,
        componentSnapshotId: componentAuthority.component!.id,
        componentOutputHash: componentAuthority.component!.outputHash,
        generatorProfileVersion: generator.profile!.version,
        generatorProfileFingerprint,
        standardCatalogVersion: operationAuthority.standardCatalog.version,
        standardCatalogFingerprint,
        resourceMappingVersion: operationAuthority.resourceMapping.version,
        resourceMappingFingerprint,
      });
      const outputHash = canonicalHash(operations);
      const materializationKey = canonicalHash({
        componentSnapshotId: componentAuthority.component!.id,
        generatorProfileVersion: generator.profile!.version,
      });
      const existing = await tx.operationPlanSnapshot.findUnique({
        where: {
          componentSnapshotId_generatorProfileVersion: {
            componentSnapshotId: componentAuthority.component!.id,
            generatorProfileVersion: generator.profile!.version,
          },
        },
      });
      if (existing) {
        if (existing.inputHash !== inputHash || existing.outputHash !== outputHash) {
          throw new OperationPlanError("operation_snapshot_profile_conflict", 409, {
            snapshotId: existing.id,
          });
        }
        return {
          created: false,
          snapshot: await projectOperationPlanSnapshot(tx, existing),
        };
      }
      const snapshot = await tx.operationPlanSnapshot.create({
        data: {
          orderRevisionId,
          componentSnapshotId: componentAuthority.component!.id,
          schemaVersion: operationPlanSnapshotSchemaVersion,
          generatorProfileVersion: generator.profile!.version,
          generatorProfileFingerprint,
          standardCatalogVersion: operationAuthority.standardCatalog.version,
          standardCatalogFingerprint,
          resourceMappingVersion: operationAuthority.resourceMapping.version,
          resourceMappingFingerprint,
          orderContentHash: revisionAuthority.approvalAudit!.contentHash,
          componentOutputHash: componentAuthority.component!.outputHash,
          inputHash,
          outputHash,
          materializationKey,
          reviewNote: input.reviewNote,
          createdByRole: actorRole,
          createdByPrincipal: actorPrincipal,
          operations: operations as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        created: true,
        snapshot: await projectOperationPlanSnapshot(tx, snapshot),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isConcurrencyFailure(error)) {
      throw new OperationPlanError("operation_concurrency_conflict", 409);
    }
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const replay = await prisma.operationPlanSnapshot.findUnique({
      where: {
        componentSnapshotId_generatorProfileVersion: {
          componentSnapshotId: input.componentSnapshotId,
          generatorProfileVersion: input.generatorProfileVersion,
        },
      },
    });
    const replayOutputHash = canonicalHash(normalizeOperations(input.operations));
    if (
      replay
      && replay.outputHash === replayOutputHash
      && replay.orderContentHash.toLowerCase() === input.expectedOrderContentHash.toLowerCase()
      && replay.componentOutputHash.toLowerCase() === input.expectedComponentOutputHash.toLowerCase()
    ) {
      return {
        created: false,
        snapshot: await projectOperationPlanSnapshot(prisma, replay),
      };
    }
    if (replay) {
      throw new OperationPlanError("operation_snapshot_profile_conflict", 409, {
        snapshotId: replay.id,
      });
    }
    throw new OperationPlanError("operation_concurrency_conflict", 409);
  }
}

export async function reviewOperationPlanSnapshot(
  orderRevisionId: string,
  snapshotId: string,
  decision: { state: "VERIFIED" | "REJECTED"; resolution: string; expectedOutputHash: string },
  actorRole: string,
  actorPrincipal: string,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const initial = await tx.operationPlanSnapshot.findFirst({
        where: { id: snapshotId, orderRevisionId },
      });
      if (!initial) throw new OperationPlanError("operation_snapshot_not_found", 404);
      await lockMaterializationRows(tx, orderRevisionId, initial.componentSnapshotId);
      await tx.$queryRaw`SELECT "id" FROM "OperationPlanSnapshot" WHERE "id" = ${snapshotId} FOR UPDATE`;
      const snapshot = await tx.operationPlanSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
      if (snapshot.state !== "REVIEW") {
        throw new OperationPlanError("operation_snapshot_state_conflict", 409, {
          state: snapshot.state,
        });
      }
      if (snapshot.outputHash.toLowerCase() !== decision.expectedOutputHash.toLowerCase()) {
        throw new OperationPlanError("operation_concurrency_conflict", 409, {
          expectedOutputHash: snapshot.outputHash,
        });
      }
      if (snapshot.createdByPrincipal === actorPrincipal) {
        throw new OperationPlanError("operation_review_separation_required", 409, {
          createdByPrincipal: snapshot.createdByPrincipal,
          reviewerPrincipal: actorPrincipal,
        });
      }
      if (decision.state === "VERIFIED") {
        const evaluation = await evaluateOperationPlanSnapshot(tx, snapshot);
        if (evaluation.blockers.length) throwOperationPlanBlockers(evaluation.blockers);
      }
      const claimed = await tx.operationPlanSnapshot.updateMany({
        where: { id: snapshotId, state: "REVIEW", outputHash: snapshot.outputHash },
        data: {
          state: decision.state,
          reviewResolution: decision.resolution,
          reviewedByRole: actorRole,
          reviewedByPrincipal: actorPrincipal,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new OperationPlanError("operation_snapshot_state_conflict", 409);
      }
      const reviewed = await tx.operationPlanSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
      return projectOperationPlanSnapshot(tx, reviewed);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isConcurrencyFailure(error)) {
      throw new OperationPlanError("operation_concurrency_conflict", 409);
    }
    throw error;
  }
}
