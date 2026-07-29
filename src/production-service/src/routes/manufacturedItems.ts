import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createManufacturedItemSchema, reviewManufacturedItemSchema } from "../domain/schemas.js";
import { logger } from "../logger.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import { findActiveProject } from "../services/projects.js";

export const manufacturedItemsRouter = Router();

const technicalRoles = ["technical_preparation", "order_approver"] as const;

async function findRevision(projectKey: string, revisionValue: string) {
  const project = await findActiveProject(projectKey);
  const revisionNumber = Number(revisionValue);
  if (!project || !Number.isInteger(revisionNumber) || revisionNumber < 1) return null;
  return prisma.orderRevision.findFirst({
    where: { order: { projectId: project.id }, revision: revisionNumber },
  });
}

/** Create a review-only standalone wall panel or furniture front together
 * with at least one field-level source record. */
manufacturedItemsRouter.post(
  "/production-orders/:projectKey/revisions/:revision/manufactured-items",
  validateBody(createManufacturedItemSchema),
  async (req, res) => {
    if (!requireRole(req, res, technicalRoles)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    if (revision.status !== "DRAFT") return void res.status(409).json({ error: "manufactured_item_requires_draft" });

    const body = req.body as ReturnType<typeof createManufacturedItemSchema.parse>;
    if (body.relatedOrderPositionId) {
      const relatedPosition = await prisma.orderPosition.findFirst({
        where: { id: body.relatedOrderPositionId, orderRevisionId: revision.id },
      });
      if (!relatedPosition) return void res.status(409).json({ error: "related_position_not_from_revision" });
    }
    if (body.importCandidateId) {
      if (!revision.importRunId) return void res.status(409).json({ error: "revision_has_no_import_run" });
      const candidate = await prisma.importCandidate.findFirst({
        where: { id: body.importCandidateId, importRunId: revision.importRunId },
      });
      if (!candidate) return void res.status(409).json({ error: "manufactured_item_candidate_not_from_import_run" });
    }
    const documentIds = [...new Set(body.evidence.flatMap((item) => item.orderDocumentId ? [item.orderDocumentId] : []))];
    if (documentIds.length) {
      const documentCount = await prisma.orderDocument.count({
        where: { id: { in: documentIds }, orderRevisionId: revision.id },
      });
      if (documentCount !== documentIds.length) {
        return void res.status(409).json({ error: "manufactured_item_document_not_from_revision" });
      }
    }

    const { evidence, ...item } = body;
    const actorRole = getRequester(req).role;
    const created = await prisma.manufacturedItem.create({
      data: {
        ...item,
        orderRevisionId: revision.id,
        notes: item.notes ?? "",
        evidence: {
          create: evidence.map((source) => ({
            ...source,
            normalizedValue: source.normalizedValue === null ? Prisma.JsonNull : source.normalizedValue,
            createdByRole: actorRole,
          })),
        },
      },
      include: { evidence: { orderBy: { createdAt: "asc" } } },
    });
    logger.info({
      projectKey: req.params.projectKey,
      revision: revision.revision,
      manufacturedItemId: created.id,
      kind: created.kind,
      code: created.code,
      evidenceCount: created.evidence.length,
    }, "manufactured item candidate recorded");
    res.status(201).json(created);
  },
);

/** Human review finalizes the candidate snapshot. Verification does not
 * create work packages; it only makes the item eligible for later generation. */
manufacturedItemsRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/manufactured-items/:itemId/review",
  validateBody(reviewManufacturedItemSchema),
  async (req, res) => {
    if (!requireRole(req, res, technicalRoles)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    if (revision.status !== "DRAFT") return void res.status(409).json({ error: "manufactured_item_review_requires_draft" });
    const item = await prisma.manufacturedItem.findFirst({
      where: { id: req.params.itemId, orderRevisionId: revision.id },
    });
    if (!item) return void res.status(404).json({ error: "manufactured_item_not_found" });
    if (item.state === "VERIFIED" || item.state === "REJECTED") {
      return void res.status(409).json({ error: "manufactured_item_review_final", state: item.state });
    }

    const body = req.body as ReturnType<typeof reviewManufacturedItemSchema.parse>;
    const updated = await prisma.manufacturedItem.update({
      where: { id: item.id },
      data: {
        state: body.state,
        resolution: body.resolution,
        reviewedByRole: getRequester(req).role,
        reviewedAt: new Date(),
      },
      include: { evidence: { orderBy: { createdAt: "asc" } } },
    });
    logger.info({
      projectKey: req.params.projectKey,
      revision: revision.revision,
      manufacturedItemId: updated.id,
      state: updated.state,
    }, "manufactured item review finalized");
    res.json(updated);
  },
);
