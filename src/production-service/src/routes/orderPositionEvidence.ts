import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createOrderPositionEvidenceSchema, resolveOrderPositionEvidenceSchema } from "../domain/schemas.js";
import { logger } from "../logger.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import { findActiveProject } from "../services/projects.js";

export const orderPositionEvidenceRouter = Router();

const technicalRoles = ["technical_preparation", "order_approver"] as const;

async function findRevision(projectKey: string, revisionValue: string) {
  const project = await findActiveProject(projectKey);
  const revisionNumber = Number(revisionValue);
  if (!project || !Number.isInteger(revisionNumber) || revisionNumber < 1) return null;
  return prisma.orderRevision.findFirst({
    where: { order: { projectId: project.id }, revision: revisionNumber },
  });
}

/** Add source context to one field without changing the selected position
 * value. New evidence is accepted only while the revision is still a DRAFT. */
orderPositionEvidenceRouter.post(
  "/production-orders/:projectKey/revisions/:revision/positions/:positionId/evidence",
  validateBody(createOrderPositionEvidenceSchema),
  async (req, res) => {
    if (!requireRole(req, res, technicalRoles)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    if (revision.status !== "DRAFT") return void res.status(409).json({ error: "evidence_requires_draft" });

    const position = await prisma.orderPosition.findFirst({
      where: { id: req.params.positionId, orderRevisionId: revision.id },
    });
    if (!position) return void res.status(404).json({ error: "order_position_not_found" });

    const body = req.body as ReturnType<typeof createOrderPositionEvidenceSchema.parse>;
    if (body.orderDocumentId) {
      const document = await prisma.orderDocument.findFirst({
        where: { id: body.orderDocumentId, orderRevisionId: revision.id },
      });
      if (!document) return void res.status(409).json({ error: "evidence_document_not_from_revision" });
    }

    const evidence = await prisma.orderPositionEvidence.create({
      data: {
        ...body,
        normalizedValue: body.normalizedValue === null ? Prisma.JsonNull : body.normalizedValue,
        orderPositionId: position.id,
        createdByRole: getRequester(req).role,
      },
    });
    logger.info({
      projectKey: req.params.projectKey,
      revision: revision.revision,
      positionId: position.id,
      evidenceId: evidence.id,
      field: evidence.field,
    }, "order position evidence recorded");
    res.status(201).json(evidence);
  },
);

/** Review metadata may be updated during DRAFT or REVIEW. It remains
 * explanatory and never writes the normalized value into the order. */
orderPositionEvidenceRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/positions/:positionId/evidence/:evidenceId",
  validateBody(resolveOrderPositionEvidenceSchema),
  async (req, res) => {
    if (!requireRole(req, res, technicalRoles)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    if (revision.status === "APPROVED" || revision.status === "SUPERSEDED") {
      return void res.status(409).json({ error: "approved_revision_evidence_immutable" });
    }
    const evidence = await prisma.orderPositionEvidence.findFirst({
      where: {
        id: req.params.evidenceId,
        orderPositionId: req.params.positionId,
        orderPosition: { orderRevisionId: revision.id },
      },
    });
    if (!evidence) return void res.status(404).json({ error: "order_position_evidence_not_found" });

    const body = req.body as ReturnType<typeof resolveOrderPositionEvidenceSchema.parse>;
    const updated = await prisma.orderPositionEvidence.update({
      where: { id: evidence.id },
      data: {
        reviewState: body.reviewState,
        resolution: body.resolution ?? (body.reviewState === "REVIEW" ? null : evidence.resolution),
      },
    });
    logger.info({
      projectKey: req.params.projectKey,
      revision: revision.revision,
      positionId: req.params.positionId,
      evidenceId: updated.id,
      reviewState: updated.reviewState,
    }, "order position evidence reviewed");
    res.json(updated);
  },
);
