import { Router } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../db/client.js";
import { addOrderDocumentSchema, approveOrderRevisionSchema, createOrderFeedbackSchema, createOrderRevisionSchema, createSalesIntakeSchema, requestOrderReviewSchema, resolveOrderFeedbackSchema, updateOrderIntakeStageSchema, updateOrderRevisionSchema } from "../domain/schemas.js";
import { validateBody } from "../middleware/validate.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { findActiveProject } from "../services/projects.js";
import { createSalesDraft } from "../services/orderDrafts.js";
import { logger } from "../logger.js";

export const productionOrdersRouter = Router();

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

function canAdvanceIntakeStage(req: Parameters<typeof requireRole>[0], res: Parameters<typeof requireRole>[1], stage: string) {
  if (stage === "SURVEY_COMPLETED" || stage === "TECHNICAL_PREPARATION" || stage === "SURVEY_EXCEPTION_REVIEW") {
    return requireRole(req, res, technicalRoles);
  }
  return requireRole(req, res, salesDraftRoles);
}

function surveyIsComplete(positions: Array<{
  productType: string | null; openingDirection: string | null; openingWidthMm: number | null;
  openingHeightMm: number | null; doorThicknessMm: number | null; surface: string | null;
  wallTreatment: string | null; glazing: string | null; glazingSpecification: string | null;
}>) {
  return positions.length > 0 && positions.every((position) => Boolean(
    position.productType && position.openingDirection && position.openingWidthMm &&
    position.openingHeightMm && position.doorThicknessMm && position.surface &&
    position.wallTreatment && position.glazing &&
    (position.glazing !== "GLAZED" || position.glazingSpecification),
  ));
}

function revisionContentHash(revision: {
  revision: number; customerName: string; customerAddress: string | null; contactName: string | null;
  contactPhone: string | null; contactEmail: string | null; deliveryAddress: string | null;
  expectedDelivery: Date | null; plannedStart: Date | null; priority: number; notes: string;
  intakeStage: string; positions: Array<Record<string, unknown>>; documents: Array<Record<string, unknown>>;
  manufacturedItems: Array<Record<string, unknown>>;
}) {
  const snapshot = {
    revision: revision.revision, customerName: revision.customerName, customerAddress: revision.customerAddress,
    contactName: revision.contactName, contactPhone: revision.contactPhone, contactEmail: revision.contactEmail,
    deliveryAddress: revision.deliveryAddress, expectedDelivery: revision.expectedDelivery?.toISOString() ?? null,
    plannedStart: revision.plannedStart?.toISOString() ?? null, priority: revision.priority, notes: revision.notes,
    intakeStage: revision.intakeStage,
    positions: revision.positions.map(({ id: _id, orderRevisionId: _orderRevisionId, ...position }) => position),
    documents: revision.documents.map(({ id: _id, orderRevisionId: _orderRevisionId, createdAt: _createdAt, ...document }) => document),
    manufacturedItems: revision.manufacturedItems.map(({
      id: _id,
      orderRevisionId: _orderRevisionId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      reviewedAt: _reviewedAt,
      ...item
    }) => item),
  };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
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
  if (revision.status !== "DRAFT") return void res.status(409).json({ error: "non_draft_revision_immutable" });

  if (!nextIntakeStages[revision.intakeStage].includes(body.stage)) {
    return void res.status(409).json({ error: "invalid_intake_stage_transition", currentStage: revision.intakeStage });
  }
  if (body.stage === "SALES_DOCUMENTS_RECEIVED") {
    const documentCount = await prisma.orderDocument.count({ where: { orderRevisionId: revision.id } });
    if (documentCount === 0) return void res.status(409).json({ error: "sales_documents_missing" });
  }
  if (body.stage === "SURVEY_COMPLETED") {
    const positions = await prisma.orderPosition.findMany({ where: { orderRevisionId: revision.id } });
    if (!surveyIsComplete(positions)) {
      return void res.status(409).json({ error: "survey_data_incomplete" });
    }
  }

  const updated = await prisma.orderRevision.update({
    where: { id: revision.id },
    data: {
      intakeStage: body.stage,
      salesDocumentsReceivedAt: body.stage === "SALES_DOCUMENTS_RECEIVED" ? new Date() : revision.salesDocumentsReceivedAt,
      surveyCompletedAt: body.stage === "SURVEY_COMPLETED" ? new Date() : revision.surveyCompletedAt,
      surveyExceptionReason: body.stage === "SURVEY_EXCEPTION_REVIEW" ? body.exceptionReason : revision.surveyExceptionReason,
    },
  });
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
  if (revision.status !== "DRAFT") return void res.status(409).json({ error: "non_draft_revision_immutable" });
  const body = req.body as ReturnType<typeof addOrderDocumentSchema.parse>;
  const document = await prisma.orderDocument.create({ data: { orderRevisionId: revision.id, ...body } });
  logger.info({ projectKey: project.key, revision: revision.revision, documentId: document.id, source: document.source, kind: document.kind }, "order document reference added");
  res.status(201).json(document);
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
  if (revision.status !== "DRAFT") return void res.status(409).json({ error: "non_draft_revision_immutable" });

  const body = req.body as ReturnType<typeof updateOrderRevisionSchema.parse>;
  const submittedIds = body.positions.flatMap((position) => position.id ? [position.id] : []);
  if (new Set(submittedIds).size !== submittedIds.length) {
    return void res.status(409).json({ error: "duplicate_order_position_id" });
  }
  const ownedPositions = submittedIds.length === 0 ? [] : await prisma.orderPosition.findMany({
    where: { orderRevisionId: revision.id, id: { in: submittedIds } },
    select: { id: true },
  });
  if (ownedPositions.length !== submittedIds.length) {
    return void res.status(409).json({ error: "order_position_not_from_revision" });
  }
  const saved = await prisma.$transaction(async (tx) => {
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
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: revisionNumber }, include: { positions: { orderBy: { position: "asc" } }, documents: { orderBy: { createdAt: "asc" } }, manufacturedItems: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  if (revision.status !== "DRAFT") return void res.status(409).json({ error: "review_requires_draft" });
  const hasUnresolvedManufacturedItems = revision.manufacturedItems.some((item) => item.state === "CANDIDATE" || item.state === "REVIEW");
  if (revision.intakeStage !== "TECHNICAL_PREPARATION" || !surveyIsComplete(revision.positions) || revision.documents.length === 0 || hasUnresolvedManufacturedItems) {
    return void res.status(409).json({ error: "review_readiness_incomplete" });
  }
  const contentHash = revisionContentHash(revision);
  const audit = await prisma.$transaction(async (tx) => {
    await tx.orderRevision.update({ where: { id: revision.id }, data: { status: "REVIEW" } });
    return tx.orderRevisionAudit.create({ data: { orderRevisionId: revision.id, action: "REVIEW_REQUESTED", actorRole: getRequester(req).role, contentHash, note: (req.body as { note?: string }).note ?? "" } });
  });
  logger.info({ projectKey: project.key, revision: revision.revision, contentHash }, "order revision sent to review");
  res.status(201).json(audit);
});

/** Approval stores the exact content hash that future calculation/issue must reference. */
productionOrdersRouter.post("/production-orders/:projectKey/revisions/:revision/approve", validateBody(approveOrderRevisionSchema), async (req, res) => {
  if (!requireRole(req, res, ["order_approver"])) return;
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const revisionNumber = Number(req.params.revision);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return void res.status(400).json({ error: "invalid_revision" });
  const revision = await prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: revisionNumber }, include: { positions: { orderBy: { position: "asc" } }, documents: { orderBy: { createdAt: "asc" } }, manufacturedItems: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } });
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  if (revision.status !== "REVIEW") return void res.status(409).json({ error: "approval_requires_review" });
  const contentHash = revisionContentHash(revision);
  const audit = await prisma.$transaction(async (tx) => {
    await tx.orderRevision.update({ where: { id: revision.id }, data: { status: "APPROVED" } });
    return tx.orderRevisionAudit.create({ data: { orderRevisionId: revision.id, action: "APPROVED", actorRole: getRequester(req).role, contentHash, note: (req.body as { note: string }).note } });
  });
  logger.info({ projectKey: project.key, revision: revision.revision, contentHash }, "order revision approved");
  res.status(201).json(audit);
});

productionOrdersRouter.get("/production-orders/:projectKey", async (req, res) => {
  const project = await findActiveProject(req.params.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });
  const order = await prisma.productionOrder.findUnique({
    where: { projectId: project.id },
    include: { revisions: { orderBy: { revision: "desc" }, include: {
      positions: { orderBy: { position: "asc" }, include: {
        evidence: { orderBy: { createdAt: "asc" }, include: {
          orderDocument: { select: { id: true, displayName: true, kind: true, relativePath: true } },
        } },
      } },
      documents: { orderBy: { createdAt: "asc" } },
      manufacturedItems: { orderBy: [{ kind: "asc" }, { code: "asc" }], include: {
        relatedOrderPosition: { select: { id: true, code: true, name: true } },
        evidence: { orderBy: { createdAt: "asc" }, include: {
          orderDocument: { select: { id: true, displayName: true, kind: true, relativePath: true } },
        } },
      } },
      audit: { orderBy: { createdAt: "asc" } },
    } } },
  });
  res.json(order);
});

/** Sales intake atomically creates the new customer project and its first
 * DRAFT revision. A repeat customer therefore never overwrites a past job. */
productionOrdersRouter.post("/production-orders/sales-intake", validateBody(createSalesIntakeSchema), async (req, res) => {
  if (!requireRole(req, res, salesDraftRoles)) return;
  const body = req.body as ReturnType<typeof createSalesIntakeSchema.parse>;
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
  const project = await findActiveProject(body.projectKey);
  if (!project) return void res.status(404).json({ error: "project_not_found" });

  const revision = await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id },
      update: {},
    });
    const latest = await tx.orderRevision.findFirst({ where: { orderId: order.id }, orderBy: { revision: "desc" }, select: { revision: true } });
    return tx.orderRevision.create({
      data: {
        orderId: order.id,
        revision: (latest?.revision ?? 0) + 1,
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
  });
  logger.info({ projectKey: project.key, revision: revision.revision, positionCount: revision.positions.length }, "order revision created");
  res.status(201).json(revision);
});
