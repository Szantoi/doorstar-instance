import { Router, type Response } from "express";
import { prisma } from "../db/client.js";
import {
  createManufacturedItemSchema,
  reviewManufacturedItemEvidenceSchema,
  reviewManufacturedItemSchema,
} from "../domain/schemas.js";
import { logger } from "../logger.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import { findActiveProject } from "../services/projects.js";
import {
  createManufacturedItem,
  ManufacturedItemReviewError,
  reviewManufacturedItem,
  reviewManufacturedItemEvidence,
} from "../services/manufacturedItemReview.js";

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

function sendManufacturedItemError(error: unknown, res: Response) {
  if (!(error instanceof ManufacturedItemReviewError)) {
    logger.error({ err: error, event: "manufactured_item_request_failed" });
    res.status(500).json({ error: "internal_error" });
    return;
  }
  res.status(error.status).json({ error: error.code, ...error.responseFields });
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
    const body = req.body as ReturnType<typeof createManufacturedItemSchema.parse>;
    const actorRole = getRequester(req).role;
    try {
      const created = await createManufacturedItem(revision.id, body, actorRole);
      logger.info({
        projectKey: req.params.projectKey,
        revision: revision.revision,
        manufacturedItemId: created.id,
        kind: created.kind,
        code: created.code,
        evidenceCount: created.evidence.length,
      }, "manufactured item candidate recorded");
      res.status(201).json(created);
    } catch (error) {
      sendManufacturedItemError(error, res);
    }
  },
);

manufacturedItemsRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/manufactured-items/:itemId/evidence/:evidenceId/review",
  validateBody(reviewManufacturedItemEvidenceSchema),
  async (req, res) => {
    if (!requireRole(req, res, technicalRoles)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    const decision = req.body as ReturnType<typeof reviewManufacturedItemEvidenceSchema.parse>;
    try {
      const evidence = await reviewManufacturedItemEvidence(
        revision.id,
        req.params.itemId,
        req.params.evidenceId,
        decision,
        getRequester(req).role,
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: revision.revision,
        manufacturedItemId: req.params.itemId,
        evidenceId: evidence.id,
        reviewState: evidence.reviewState,
      }, "manufactured item evidence reviewed");
      res.json(evidence);
    } catch (error) {
      sendManufacturedItemError(error, res);
    }
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
    const body = req.body as ReturnType<typeof reviewManufacturedItemSchema.parse>;
    try {
      const updated = await reviewManufacturedItem(
        revision.id,
        req.params.itemId,
        body,
        getRequester(req).role,
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: revision.revision,
        manufacturedItemId: updated.id,
        state: updated.state,
      }, "manufactured item review finalized");
      res.json(updated);
    } catch (error) {
      sendManufacturedItemError(error, res);
    }
  },
);
