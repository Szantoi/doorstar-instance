import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { addOrderDocumentSchema, approveOrderRevisionSchema, createOrderFeedbackSchema, createOrderRevisionSchema, createSalesIntakeSchema, issueOrderDocumentReferencesSchema, linkOrderDocumentToPositionSchema, requestOrderReviewSchema, resolveOrderFeedbackSchema, updateOrderIntakeStageSchema, updateOrderRevisionSchema } from "../domain/schemas.js";
import { validateBody } from "../middleware/validate.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { findActiveProject } from "../services/projects.js";
import { createSalesDraft } from "../services/orderDrafts.js";
import { catalogDerivedFields, validateTechnicalSelection } from "../config/technicalCatalog.js";
import { logger } from "../logger.js";
import {
  CURRENT_ORDER_CONTENT_HASH_SCHEMA_VERSION,
  revisionContentHash,
  type OrderContentHashSchemaVersion,
} from "../services/orderRevisionHash.js";
import {
  sourceDerivedRevisionIsReady,
} from "../services/sourceEvidenceGate.js";
import {
  positionEvidenceRevisionIsReady,
  summarizePositionEvidence,
} from "../services/positionEvidenceGate.js";
import {
  revisionReviewReadinessError,
  surveyCompletionReadiness,
} from "../services/orderReviewReadiness.js";
import {
  lockDraftRevisionForWrite,
  RevisionWriteLockError,
} from "../services/revisionWriteLock.js";

export const productionOrdersRouter = Router();

function sendRevisionWriteLockError(
  res: Parameters<typeof requireRole>[1],
  error: unknown,
) {
  if (!(error instanceof RevisionWriteLockError)) throw error;
  res.status(error.status).json({ error: error.code, details: error.details });
}

function resolveCatalogPositions<T extends { doorTypeKey?: string | null; finishKey?: string | null; glassKey?: string | null; wallSolutionKey?: string | null; materialKey?: string | null; hardwareKeys?: string[]; machiningKeys?: string[] }>(positions: T[]): { positions?: T[]; errors?: string[] } {
  const errors = positions.flatMap((position, index) => validateTechnicalSelection(position).map((error) => `positions.${index}.${error}`));
  if (errors.length) return { errors };
  return { positions: positions.map((position) => ({ ...position, ...catalogDerivedFields(position) })) };
}

/** Office-facing order register. It exposes only the newest revision's
 * summary; the immutable revision history remains available per project. */
productionOrdersRouter.get("/production-orders", async (_req, res) => {
  const orders = await prisma.productionOrder.findMany({
    where: { project: { deletedAt: null } },
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { key: true, name: true, num: true } },
      revisions: {
        orderBy: { revision: "desc" },
        take: 1,
        include: { _count: { select: { positions: true } } },
      },
    },
  });
  res.json(orders.flatMap((order) => {
    const revision = order.revisions[0];
    return revision ? [{
      projectKey: order.project.key,
      projectName: order.project.name,
      projectNum: order.project.num,
      revision: revision.revision,
      status: revision.status,
      intakeStage: revision.intakeStage,
      customerName: revision.customerName,
      expectedDelivery: revision.expectedDelivery,
      positionCount: revision._count.positions,
      updatedAt: revision.updatedAt,
    }] : [];
  }));
});

const nextIntakeStages: Record<string, string[]> = {
  SALES_DRAFT: ["SALES_DOCUMENTS_RECEIVED"],
  SALES_DOCUMENTS_RECEIVED: ["SURVEY_PENDING"],
  SURVEY_PENDING: ["SURVEY_COMPLETED", "SURVEY_EXCEPTION_REVIEW"],
  SURVEY_COMPLETED: ["TECHNICAL_PREPARATION"],
  SURVEY_EXCEPTION_REVIEW: ["TECHNICAL_PREPARATION"],
  TECHNICAL_PREPARATION: [],
};

const salesDraftRoles = ["sales", "technical_preparation", "order_approver"] as const;
const technicalRoles = ["technical_preparation", "order_approver"] as const;
const feedbackRoles = ["sales", "technical_preparation", "production_planner", "shop_floor", "installer", "warehouse_dispatch"] as const;

const reviewContentInclude = {
  positions: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      evidence: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { orderDocument: true },
      },
      documentLinks: {
        orderBy: [{ orderDocumentId: "asc" }, { id: "asc" }],
        include: { orderDocument: true },
      },
    },
  },
  documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  manufacturedItems: {
    orderBy: [{ kind: "asc" }, { code: "asc" }],
    include: {
      evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  },
  supplementaryItems: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  },
} satisfies Prisma.OrderRevisionInclude;

function canAdvanceIntakeStage(req: Parameters<typeof requireRole>[0], res: Parameters<typeof requireRole>[1], stage: string) {
  if (stage === "SURVEY_COMPLETED" || stage === "TECHNICAL_PREPARATION" || stage === "SURVEY_EXCEPTION_REVIEW") {
    return requireRole(req, res, technicalRoles);
  }
  return requireRole(req, res, salesDraftRoles);
}

async function lockPositionEvidenceRows(
  tx: Prisma.TransactionClient,
  orderRevisionId: string,
) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT evidence."id"
    FROM "OrderPositionEvidence" AS evidence
    INNER JOIN "OrderPosition" AS position
      ON position."id" = evidence."orderPositionId"
    WHERE position."orderRevisionId" = ${orderRevisionId}
    ORDER BY evidence."id"
    FOR UPDATE OF evidence
  `;
}

/** Advances the sales/felmérés gate without changing the immutable revision
 * payload. The approval state remains a separate later gate. */
productionOrdersRouter.patch("/production-orders/:projectKey/revisions/:revision/intake-stage", validateBody(updateOrderIntakeStageSchema), async (req, res) => {
  const body = req.body as ReturnType<typeof updateOrderIntakeStageSchema.parse>;
  if (!canAdvanceIntakeStage(req, res, body.stage)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revisionNumber = Number(req.params.revision);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return void res.status(400).json({ error: "invalid_revision" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: revisionNumber } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await lockDraftRevisionForWrite(tx, revision.id);
      const current = await tx.orderRevision.findUniqueOrThrow({ where: { id: revision.id } });
      if (!nextIntakeStages[current.intakeStage].includes(body.stage)) {
        return { error: "invalid_intake_stage_transition" as const, currentStage: current.intakeStage };
      }
      if (body.stage === "SALES_DOCUMENTS_RECEIVED") {
        const documentCount = await tx.orderDocument.count({ where: { orderRevisionId: revision.id } });
        if (documentCount === 0) return { error: "sales_documents_missing" as const };
      }
      if (body.stage === "SURVEY_COMPLETED") {
        const [positions, documents] = await Promise.all([
          tx.orderPosition.findMany({
            where: { orderRevisionId: revision.id },
            include: {
              evidence: { include: { orderDocument: { select: { id: true, kind: true } } } },
              documentLinks: { include: { orderDocument: { select: { id: true, kind: true } } } },
            },
          }),
          tx.orderDocument.findMany({
            where: { orderRevisionId: revision.id },
            select: { id: true, kind: true },
          }),
        ]);
        const readiness = surveyCompletionReadiness(positions, documents);
        if (!readiness.ready) {
          return {
            error: "survey_data_incomplete" as const,
            details: readiness.details,
          };
        }
      }
      return tx.orderRevision.update({
        where: { id: revision.id },
        data: {
          intakeStage: body.stage,
          salesDocumentsReceivedAt: body.stage === "SALES_DOCUMENTS_RECEIVED" ? new Date() : current.salesDocumentsReceivedAt,
          surveyCompletedAt: body.stage === "SURVEY_COMPLETED" ? new Date() : current.surveyCompletedAt,
          surveyExceptionReason: body.stage === "SURVEY_EXCEPTION_REVIEW" ? body.exceptionReason : current.surveyExceptionReason,
        },
      });
    });
  } catch (error) {
    return void sendRevisionWriteLockError(res, error);
  }
  if ("error" in updated) return void res.status(409).json(updated);
  logger.info({ projectKey: project.key, revision: revision.revision, intakeStage: updated.intakeStage }, "order intake stage advanced");
  res.json(updated);
});

/** Append a source reference without copying its binary or exposing a local
 * absolute path. A document version stays attached to this order revision. */
productionOrdersRouter.post("/production-orders/:projectKey/revisions/:revision/documents", validateBody(addOrderDocumentSchema), async (req, res) => {
  if (!requireRole(req, res, salesDraftRoles)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revisionNumber = Number(req.params.revision);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return void res.status(400).json({ error: "invalid_revision" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: revisionNumber } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  const body = req.body as ReturnType<typeof addOrderDocumentSchema.parse>;
  let document;
  try {
    document = await prisma.$transaction(async (tx) => {
      await lockDraftRevisionForWrite(tx, revision.id);
      const { supersedesDocumentId, ...documentData } = body;
      const superseded = supersedesDocumentId
        ? await tx.orderDocument.findFirst({ where: { id: supersedesDocumentId, orderRevisionId: revision.id } })
        : null;
      if (supersedesDocumentId && !superseded) {
        return { error: "superseded_document_not_from_revision" as const, status: 404 as const };
      }
      if (superseded && await tx.orderDocument.count({ where: { supersedesDocumentId: superseded.id } })) {
        return { error: "document_version_already_replaced" as const, status: 409 as const };
      }
      return tx.orderDocument.create({ data: {
        orderRevisionId: revision.id,
        ...documentData,
        ...(superseded ? { documentFamilyKey: superseded.documentFamilyKey, supersedesDocumentId: superseded.id } : {}),
      } });
    });
  } catch (error) {
    return void sendRevisionWriteLockError(res, error);
  }
  if ("error" in document) return void res.status(document.status).json({ error: document.error });
  logger.info({ projectKey: project.key, revision: revision.revision, documentId: document.id, source: document.source, kind: document.kind }, "order document reference added");
  res.status(201).json(document);
});

/** Attach an already registered document version to one door position. */
productionOrdersRouter.post("/production-orders/:projectKey/revisions/:revision/documents/:documentId/positions", validateBody(linkOrderDocumentToPositionSchema), async (req, res) => {
  if (!requireRole(req, res, salesDraftRoles)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: Number(req.params.revision) } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  const body = req.body as ReturnType<typeof linkOrderDocumentToPositionSchema.parse>;
  let link;
  try {
    link = await prisma.$transaction(async (tx) => {
      await lockDraftRevisionForWrite(tx, revision.id);
      const [document, position] = await Promise.all([
        tx.orderDocument.findFirst({ where: { id: req.params.documentId, orderRevisionId: revision.id } }),
        tx.orderPosition.findFirst({ where: { id: body.orderPositionId, orderRevisionId: revision.id } }),
      ]);
      if (!document) return { error: "order_document_not_from_revision" as const };
      if (!position) return { error: "order_position_not_from_revision" as const };
      return tx.orderDocumentPositionLink.upsert({
        where: { orderDocumentId_orderPositionId: { orderDocumentId: document.id, orderPositionId: position.id } },
        create: { orderDocumentId: document.id, orderPositionId: position.id }, update: {},
      });
    });
  } catch (error) {
    return void sendRevisionWriteLockError(res, error);
  }
  if ("error" in link) return void res.status(404).json({ error: link.error });
  res.status(201).json(link);
});

/** Freeze exact document versions for a downstream issued work package. */
productionOrdersRouter.post("/production-orders/:projectKey/revisions/:revision/document-releases", validateBody(issueOrderDocumentReferencesSchema), async (req, res) => {
  if (!requireRole(req, res, technicalRoles)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revision = await prisma.orderRevision.findFirst({
    where: { order: { projectId: project.id }, revision: Number(req.params.revision) },
    include: {
      ...reviewContentInclude,
      audit: {
        where: { action: "APPROVED" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  if (revision.status !== "APPROVED") return void res.status(409).json({ error: "approved_revision_required_for_document_release" });
  if (!positionEvidenceRevisionIsReady(revision)) {
    return void res.status(409).json({
      error: "position_evidence_unresolved",
      details: summarizePositionEvidence(revision),
    });
  }
  const approvalAudit = revision.audit[0];
  if (!approvalAudit) return void res.status(409).json({ error: "approved_order_audit_required" });
  if (![1, 2, 3].includes(approvalAudit.contentHashSchemaVersion)) {
    return void res.status(409).json({ error: "content_hash_schema_version_unsupported" });
  }
  if (revisionContentHash(
    revision,
    approvalAudit.contentHashSchemaVersion as OrderContentHashSchemaVersion,
  ) !== approvalAudit.contentHash) {
    return void res.status(409).json({ error: "approved_order_content_changed" });
  }
  const body = req.body as ReturnType<typeof issueOrderDocumentReferencesSchema.parse>;
  const documents = await prisma.orderDocument.findMany({ where: { id: { in: body.documentIds }, orderRevisionId: revision.id } });
  if (documents.length !== body.documentIds.length) return void res.status(409).json({ error: "release_document_not_from_revision" });
  if (documents.some((document) => !document.contentSha256)) return void res.status(409).json({ error: "release_document_hash_required" });
  const references = await prisma.$transaction((tx) => Promise.all(documents.map((document) => tx.orderDocumentReleaseReference.upsert({
    where: { issuedWorkPackageKey_orderDocumentId: { issuedWorkPackageKey: body.issuedWorkPackageKey, orderDocumentId: document.id } },
    create: { orderRevisionId: revision.id, orderDocumentId: document.id, issuedWorkPackageKey: body.issuedWorkPackageKey, documentVersionId: document.versionId, documentContentSha256: document.contentSha256!, releasedByRole: getRequester(req).role, releaseNote: body.releaseNote },
    update: {},
  }))));
  logger.info({ projectKey: project.key, revision: revision.revision, issuedWorkPackageKey: body.issuedWorkPackageKey, documentCount: references.length }, "document versions released");
  res.status(201).json(references);
});

/** Source data stays in Excel/PDF during transition; this captures a
 * traceable correction request against the imported system representation. */
productionOrdersRouter.get("/production-orders/:projectKey/revisions/:revision/feedback", async (req, res) => {
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: Number(req.params.revision) } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  res.json(await prisma.orderFeedback.findMany({ where: { orderRevisionId: revision.id }, orderBy: { createdAt: "desc" } }));
});

productionOrdersRouter.post("/production-orders/:projectKey/revisions/:revision/feedback", validateBody(createOrderFeedbackSchema), async (req, res) => {
  if (!requireRole(req, res, feedbackRoles)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: Number(req.params.revision) } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  const body = req.body as ReturnType<typeof createOrderFeedbackSchema.parse>;
  const feedback = await prisma.orderFeedback.create({ data: { orderRevisionId: revision.id, ...body, createdByRole: getRequester(req).role } });
  logger.info({ projectKey: project.key, revision: revision.revision, feedbackId: feedback.id, category: feedback.category }, "order feedback reported");
  res.status(201).json(feedback);
});

productionOrdersRouter.patch("/production-orders/:projectKey/revisions/:revision/feedback/:feedbackId", validateBody(resolveOrderFeedbackSchema), async (req, res) => {
  if (!requireRole(req, res, technicalRoles)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: Number(req.params.revision) } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  const feedback = await prisma.orderFeedback.findFirst({ where: { id: req.params.feedbackId, orderRevisionId: revision.id } });
  if (!feedback) return void res.status(404).json({ error: "order_feedback_not_found" });
  const body = req.body as ReturnType<typeof resolveOrderFeedbackSchema.parse>;
  const updated = await prisma.orderFeedback.update({ where: { id: feedback.id }, data: { ...body, resolvedByRole: getRequester(req).role, resolvedAt: body.status === "RESOLVED" ? new Date() : null } });
  logger.info({ projectKey: project.key, revision: revision.revision, feedbackId: updated.id, status: updated.status }, "order feedback updated");
  res.json(updated);
});

/** Replace the mutable DRAFT payload. This is the controlled hand-off from
 * Sales to field survey: no approved or reviewed order can be altered here. */
productionOrdersRouter.put("/production-orders/:projectKey/revisions/:revision", validateBody(updateOrderRevisionSchema), async (req, res) => {
  if (!requireRole(req, res, salesDraftRoles)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revisionNumber = Number(req.params.revision);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return void res.status(400).json({ error: "invalid_revision" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: revisionNumber } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });

  const body = req.body as ReturnType<typeof updateOrderRevisionSchema.parse>;
  const catalog = resolveCatalogPositions(body.positions);
  if (!catalog.positions) return void res.status(400).json({ error: "technical_catalog_value_invalid", details: catalog.errors });
  body.positions = catalog.positions;
  const submittedIds = body.positions.flatMap((position) => position.id ? [position.id] : []);
  if (new Set(submittedIds).size !== submittedIds.length) {
    return void res.status(409).json({ error: "duplicate_order_position_id" });
  }
  let saved;
  try {
    saved = await prisma.$transaction(async (tx) => {
      await lockDraftRevisionForWrite(tx, revision.id);
      const ownedPositions = submittedIds.length === 0 ? [] : await tx.orderPosition.findMany({
        where: { orderRevisionId: revision.id, id: { in: submittedIds } },
        select: { id: true },
      });
      if (ownedPositions.length !== submittedIds.length) {
        return { error: "order_position_not_from_revision" as const };
      }
      const evidencedPositionToDelete = await tx.orderPosition.findFirst({
        where: {
          orderRevisionId: revision.id,
          ...(submittedIds.length ? { id: { notIn: submittedIds } } : {}),
          evidence: { some: {} },
        },
        select: { id: true },
      });
      if (evidencedPositionToDelete) {
        return {
          error: "position_evidence_must_be_retained" as const,
          positionId: evidencedPositionToDelete.id,
        };
      }
      // Move current indexes out of the target range before reordering. Existing
      // rows retain their IDs and therefore keep their source evidence.
      await tx.orderPosition.updateMany({
        where: { orderRevisionId: revision.id },
        data: { position: { increment: 1_000_000 } },
      });
      await tx.orderPosition.deleteMany({
        where: { orderRevisionId: revision.id, ...(submittedIds.length ? { id: { notIn: submittedIds } } : {}) },
      });
      for (const [index, position] of body.positions.entries()) {
        const { id, ...positionData } = position;
        if (id) {
          await tx.orderPosition.update({
            where: { id },
            data: { ...positionData, position: index, notes: positionData.notes ?? "" },
          });
        } else {
          await tx.orderPosition.create({
            data: { ...positionData, orderRevisionId: revision.id, position: index, notes: positionData.notes ?? "" },
          });
        }
      }
      return tx.orderRevision.update({
        where: { id: revision.id },
        data: {
          customerName: body.customerName,
          customerAddress: body.customerAddress ?? null,
          contactName: body.contactName ?? null,
          contactPhone: body.contactPhone ?? null,
          contactEmail: body.contactEmail ?? null,
          deliveryAddress: body.deliveryAddress ?? null,
          expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
          plannedStart: body.plannedStart ? new Date(body.plannedStart) : null,
          priority: body.priority ?? 0,
          notes: body.notes ?? "",
        },
        include: { positions: { orderBy: { position: "asc" }, include: { evidence: { orderBy: { createdAt: "asc" } } } } },
      });
    });
  } catch (error) {
    return void sendRevisionWriteLockError(res, error);
  }
  if ("error" in saved) return void res.status(409).json(saved);
  logger.info({ projectKey: project.key, revision: saved.revision, positionCount: saved.positions.length }, "order draft updated");
  res.json(saved);
});

/** Freeze a technically complete DRAFT for independent order approval. */
productionOrdersRouter.post("/production-orders/:projectKey/revisions/:revision/review", validateBody(requestOrderReviewSchema), async (req, res) => {
  if (!requireRole(req, res, technicalRoles)) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revisionNumber = Number(req.params.revision);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return void res.status(400).json({ error: "invalid_revision" });
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT revision_row."id"
      FROM "OrderRevision" AS revision_row
      INNER JOIN "ProductionOrder" AS production_order
        ON production_order."id" = revision_row."orderId"
      WHERE production_order."projectId" = ${project.id}
        AND revision_row."revision" = ${revisionNumber}
      FOR UPDATE OF revision_row
    `;
    const lockedRevisionId = locked[0]?.id;
    if (!lockedRevisionId) {
      return { error: "order_revision_not_found", status: 404 as const };
    }
    await lockPositionEvidenceRows(tx, lockedRevisionId);
    const revision = await tx.orderRevision.findUnique({
      where: { id: lockedRevisionId },
      include: reviewContentInclude,
    });
    if (!revision) return { error: "order_revision_not_found", status: 404 as const };
    if (revision.status !== "DRAFT") {
      return { error: "review_requires_draft", status: 409 as const };
    }
    const readinessError = revisionReviewReadinessError(revision);
    if (readinessError) {
      return { ...readinessError, status: 409 as const };
    }
    const contentHashSchemaVersion = CURRENT_ORDER_CONTENT_HASH_SCHEMA_VERSION;
    const contentHash = revisionContentHash(revision, contentHashSchemaVersion);
    await tx.orderRevision.update({
      where: { id: revision.id },
      data: { status: "REVIEW" },
    });
    const audit = await tx.orderRevisionAudit.create({
      data: {
        orderRevisionId: revision.id,
        action: "REVIEW_REQUESTED",
        actorRole: getRequester(req).role,
        contentHash,
        contentHashSchemaVersion,
        note: (req.body as { note?: string }).note ?? "",
      },
    });
    return { audit, revision, contentHash };
  });
  if ("error" in result && result.status !== undefined) {
    return void res.status(result.status).json({
      error: result.error,
      ...("details" in result ? { details: result.details } : {}),
    });
  }
  logger.info({
    projectKey: project.key,
    revision: result.revision.revision,
    contentHash: result.contentHash,
    contentHashSchemaVersion: result.audit.contentHashSchemaVersion,
  }, "order revision sent to review");
  res.status(201).json(result.audit);
});

/** Approval stores the exact content hash that future calculation/issue must reference. */
productionOrdersRouter.post("/production-orders/:projectKey/revisions/:revision/approve", validateBody(approveOrderRevisionSchema), async (req, res) => {
  if (!requireRole(req, res, ["order_approver"])) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revisionNumber = Number(req.params.revision);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return void res.status(400).json({ error: "invalid_revision" });
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT revision_row."id"
      FROM "OrderRevision" AS revision_row
      INNER JOIN "ProductionOrder" AS production_order
        ON production_order."id" = revision_row."orderId"
      WHERE production_order."projectId" = ${project.id}
        AND revision_row."revision" = ${revisionNumber}
      FOR UPDATE OF revision_row
    `;
    const lockedRevisionId = locked[0]?.id;
    if (!lockedRevisionId) {
      return { error: "order_revision_not_found", status: 404 as const };
    }
    await lockPositionEvidenceRows(tx, lockedRevisionId);
    const revision = await tx.orderRevision.findUnique({
      where: { id: lockedRevisionId },
      include: reviewContentInclude,
    });
    if (!revision) return { error: "order_revision_not_found", status: 404 as const };
    if (revision.status !== "REVIEW") {
      return { error: "approval_requires_review", status: 409 as const };
    }
    const readinessError = revisionReviewReadinessError(revision);
    if (readinessError) {
      return { ...readinessError, status: 409 as const };
    }
    const reviewAudit = await tx.orderRevisionAudit.findFirst({
      where: { orderRevisionId: revision.id, action: "REVIEW_REQUESTED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!reviewAudit) {
      return { error: "review_audit_required", status: 409 as const };
    }
    if (
      reviewAudit.contentHashSchemaVersion !== 1
      && reviewAudit.contentHashSchemaVersion !== 2
      && reviewAudit.contentHashSchemaVersion !== 3
    ) {
      return { error: "content_hash_schema_version_unsupported", status: 409 as const };
    }
    const contentHashSchemaVersion =
      reviewAudit.contentHashSchemaVersion as OrderContentHashSchemaVersion;
    const contentHash = revisionContentHash(revision, contentHashSchemaVersion);
    if (contentHash !== reviewAudit.contentHash) {
      return { error: "reviewed_order_content_changed", status: 409 as const };
    }
    await tx.orderRevision.update({
      where: { id: revision.id },
      data: { status: "APPROVED" },
    });
    const audit = await tx.orderRevisionAudit.create({
      data: {
        orderRevisionId: revision.id,
        action: "APPROVED",
        actorRole: getRequester(req).role,
        contentHash,
        contentHashSchemaVersion,
        note: (req.body as { note: string }).note,
      },
    });
    return { audit, revision, contentHash };
  });
  if ("error" in result && result.status !== undefined) {
    return void res.status(result.status).json({
      error: result.error,
      ...("details" in result ? { details: result.details } : {}),
    });
  }
  logger.info({
    projectKey: project.key,
    revision: result.revision.revision,
    contentHash: result.contentHash,
    contentHashSchemaVersion: result.audit.contentHashSchemaVersion,
  }, "order revision approved");
  res.status(201).json(result.audit);
});

productionOrdersRouter.get("/production-orders/:projectKey", async (req, res) => {
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const order = await prisma.productionOrder.findUnique({
    where: { projectId: project.id },
    include: { revisions: { orderBy: { revision: "desc" }, include: {
      positions: { orderBy: [{ position: "asc" }, { id: "asc" }], include: {
        evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: {
          orderDocument: { select: { id: true, displayName: true, kind: true, relativePath: true } },
        } },
      } },
      documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { positionLinks: { select: { orderPositionId: true } }, releaseReferences: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } },
      supplementaryItems: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } },
      manufacturedItems: { orderBy: [{ kind: "asc" }, { code: "asc" }], include: {
        relatedOrderPosition: { select: { id: true, code: true, name: true } },
        evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: {
          orderDocument: { select: { id: true, displayName: true, kind: true, relativePath: true } },
        } },
      } },
      audit: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    } } },
  });
  res.json(order);
});

/** Sales intake atomically creates the new customer project and its first
 * DRAFT revision. A repeat customer therefore never overwrites a past job. */
productionOrdersRouter.post("/production-orders/sales-intake", validateBody(createSalesIntakeSchema), async (req, res) => {
  if (!requireRole(req, res, salesDraftRoles)) return;
  const body = req.body as ReturnType<typeof createSalesIntakeSchema.parse>;
  const catalog = resolveCatalogPositions(body.positions);
  if (!catalog.positions) return void res.status(400).json({ error: "technical_catalog_value_invalid", details: catalog.errors });
  body.positions = catalog.positions;
  const existing = await prisma.project.findUnique({ where: { key: body.projectKey } });
  if (existing) return void res.status(409).json({ error: existing.deletedAt ? "project_archived" : "project_key_exists" });

  const revision = await prisma.$transaction((tx) => createSalesDraft(tx, body));
  logger.info({ projectKey: body.projectKey, revision: revision.revision, positionCount: revision.positions.length }, "sales intake created");
  res.status(201).json(revision);
});

/** Create revision 1 for a project, or a later draft without altering history. */
productionOrdersRouter.post("/production-orders/revisions", validateBody(createOrderRevisionSchema), async (req, res) => {
  if (!requireRole(req, res, technicalRoles)) return;
  const body = req.body as ReturnType<typeof createOrderRevisionSchema.parse>;
  const catalog = resolveCatalogPositions(body.positions);
  if (!catalog.positions) return void res.status(400).json({ error: "technical_catalog_value_invalid", details: catalog.errors });
  body.positions = catalog.positions;
  const project = await findActiveProject(body.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id },
      update: {},
    });
    const latest = await tx.orderRevision.findFirst({
      where: { orderId: order.id },
      orderBy: { revision: "desc" },
      select: { id: true, revision: true, status: true },
    });
    if (latest?.status === "DRAFT" || latest?.status === "REVIEW") {
      return { conflict: "active_order_revision_exists" as const };
    }
    const nextRevision = (latest?.revision ?? 0) + 1;
    if (latest?.status === "APPROVED") {
      const approval = await tx.orderRevisionAudit.findFirst({
        where: { orderRevisionId: latest.id, action: "APPROVED" },
        orderBy: { createdAt: "desc" },
      });
      if (!approval) return { conflict: "approved_order_audit_required" as const };
      await tx.orderRevision.update({ where: { id: latest.id }, data: { status: "SUPERSEDED" } });
      await tx.orderRevisionAudit.create({
        data: {
          orderRevisionId: latest.id,
          action: "SUPERSEDED",
          actorRole: getRequester(req).role,
          contentHash: approval.contentHash,
          contentHashSchemaVersion: approval.contentHashSchemaVersion,
          note: `Superseded by revision ${nextRevision}.`,
        },
      });
    }
    const revision = await tx.orderRevision.create({
      data: {
        orderId: order.id,
        revision: nextRevision,
        customerName: body.customerName,
        customerAddress: body.customerAddress ?? null,
        contactName: body.contactName ?? null,
        contactPhone: body.contactPhone ?? null,
        contactEmail: body.contactEmail ?? null,
        deliveryAddress: body.deliveryAddress ?? null,
        expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
        plannedStart: body.plannedStart ? new Date(body.plannedStart) : null,
        priority: body.priority ?? 0,
        notes: body.notes ?? "",
        positions: { create: body.positions.map((position, index) => ({ ...position, position: index, notes: position.notes ?? "" })) },
      },
      include: { positions: { orderBy: { position: "asc" } } },
    });
    return { revision };
  });
  if ("conflict" in result) return void res.status(409).json({ error: result.conflict });
  const { revision } = result;
  logger.info({ projectKey: project.key, revision: revision.revision, positionCount: revision.positions.length }, "order revision created");
  res.status(201).json(revision);
});
