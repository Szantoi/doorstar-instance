import { Router } from "express";
import { prisma } from "../db/client.js";
import { createOrderPositionEvidenceSchema, resolveOrderPositionEvidenceSchema } from "../domain/schemas.js";
import { logger } from "../logger.js";
import { getRequester, getRequesterPrincipal, requireRole } from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import {
  createOrderPositionEvidence,
  OrderPositionEvidenceReviewError,
  reviewOrderPositionEvidence,
} from "../services/orderPositionEvidenceReview.js";
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

function sendEvidenceError(res: Parameters<typeof requireRole>[1], error: unknown) {
  if (!(error instanceof OrderPositionEvidenceReviewError)) throw error;
  res.status(error.status).json({ error: error.code, ...error.responseFields });
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
    const body = req.body as ReturnType<typeof createOrderPositionEvidenceSchema.parse>;
    let evidence;
    try {
      evidence = await createOrderPositionEvidence(
        revision.id,
        req.params.positionId,
        body,
        getRequester(req).role,
      );
    } catch (error) {
      return void sendEvidenceError(res, error);
    }
    logger.info({
      projectKey: req.params.projectKey,
      revision: revision.revision,
      positionId: req.params.positionId,
      evidenceId: evidence.id,
      field: evidence.field,
    }, "order position evidence recorded");
    res.status(201).json(evidence);
  },
);

/** Finalize one row exactly once. The command never applies its normalized
 * candidate to the order position; it records only the human audit decision. */
orderPositionEvidenceRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/positions/:positionId/evidence/:evidenceId",
  validateBody(resolveOrderPositionEvidenceSchema),
  async (req, res) => {
    if (!requireRole(req, res, technicalRoles)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    const body = req.body as ReturnType<typeof resolveOrderPositionEvidenceSchema.parse>;
    let updated;
    try {
      updated = await reviewOrderPositionEvidence(
        revision.id,
        req.params.positionId,
        req.params.evidenceId,
        body,
        {
          principal: getRequesterPrincipal(req),
          role: getRequester(req).role,
        },
      );
    } catch (error) {
      return void sendEvidenceError(res, error);
    }
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
