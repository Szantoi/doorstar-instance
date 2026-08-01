import { Router, type Response } from "express";
import { prisma } from "../db/client.js";
import {
  createOrderSupplementaryItemSchema,
  reviewOrderSupplementaryItemEvidenceSchema,
  reviewOrderSupplementaryItemSchema,
  updateOrderSupplementaryItemSchema,
} from "../domain/schemas.js";
import { logger } from "../logger.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import { findActiveProject } from "../services/projects.js";
import {
  createSupplementaryItem,
  deleteSupplementaryItem,
  reviewSupplementaryItem,
  reviewSupplementaryItemEvidence,
  SupplementaryReviewError,
  updateSupplementaryItem,
} from "../services/supplementaryItemReview.js";

export const supplementaryItemsRouter = Router();
const writers = ["sales", "technical_preparation", "order_approver"] as const;
const reviewers = ["technical_preparation", "order_approver"] as const;

async function findRevision(projectKey: string, revisionValue: string) {
  const project = await findActiveProject(projectKey);
  const revisionNumber = Number(revisionValue);
  if (!project || !Number.isInteger(revisionNumber) || revisionNumber < 1) return null;
  return prisma.orderRevision.findFirst({ where: { order: { projectId: project.id }, revision: revisionNumber } });
}

function sendReviewError(error: unknown, res: Response) {
  if (!(error instanceof SupplementaryReviewError)) {
    logger.error({ err: error }, "supplementary review request failed");
    res.status(500).json({ error: "internal_error" });
    return;
  }
  res.status(error.status).json({ error: error.code, ...error.responseFields });
}

supplementaryItemsRouter.post("/production-orders/:projectKey/revisions/:revision/supplementary-items", validateBody(createOrderSupplementaryItemSchema), async (req, res) => {
  if (!requireRole(req, res, writers)) return;
  const revision = await findRevision(req.params.projectKey, req.params.revision);
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  const body = req.body as ReturnType<typeof createOrderSupplementaryItemSchema.parse>;
  const actorRole = getRequester(req).role;
  try {
    const created = await createSupplementaryItem(revision.id, body, actorRole);
    logger.info({
      projectKey: req.params.projectKey,
      revision: revision.revision,
      supplementaryItemId: created.id,
      entryMode: created.entryMode,
      evidenceCount: created.evidence.length,
    }, "supplementary item recorded");
    res.status(201).json(created);
  } catch (error) {
    sendReviewError(error, res);
  }
});

supplementaryItemsRouter.patch("/production-orders/:projectKey/revisions/:revision/supplementary-items/:itemId", validateBody(updateOrderSupplementaryItemSchema), async (req, res) => {
  if (!requireRole(req, res, writers)) return;
  const revision = await findRevision(req.params.projectKey, req.params.revision);
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  const body = req.body as ReturnType<typeof updateOrderSupplementaryItemSchema.parse>;
  try {
    res.json(await updateSupplementaryItem(revision.id, req.params.itemId, body));
  } catch (error) {
    sendReviewError(error, res);
  }
});

supplementaryItemsRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/supplementary-items/:itemId/evidence/:evidenceId/review",
  validateBody(reviewOrderSupplementaryItemEvidenceSchema),
  async (req, res) => {
    if (!requireRole(req, res, reviewers)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    const decision = req.body as ReturnType<typeof reviewOrderSupplementaryItemEvidenceSchema.parse>;
    try {
      const evidence = await reviewSupplementaryItemEvidence(
        revision.id,
        req.params.itemId,
        req.params.evidenceId,
        decision,
        getRequester(req).role,
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: revision.revision,
        supplementaryItemId: req.params.itemId,
        evidenceId: evidence.id,
        reviewState: evidence.reviewState,
      }, "supplementary item evidence reviewed");
      res.json(evidence);
    } catch (error) {
      sendReviewError(error, res);
    }
  },
);

supplementaryItemsRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/supplementary-items/:itemId/review",
  validateBody(reviewOrderSupplementaryItemSchema),
  async (req, res) => {
    if (!requireRole(req, res, reviewers)) return;
    const revision = await findRevision(req.params.projectKey, req.params.revision);
    if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
    const decision = req.body as ReturnType<typeof reviewOrderSupplementaryItemSchema.parse>;
    try {
      const item = await reviewSupplementaryItem(
        revision.id,
        req.params.itemId,
        decision,
        getRequester(req).role,
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: revision.revision,
        supplementaryItemId: item.id,
        state: item.state,
      }, "supplementary item review finalized");
      res.json(item);
    } catch (error) {
      sendReviewError(error, res);
    }
  },
);

supplementaryItemsRouter.delete("/production-orders/:projectKey/revisions/:revision/supplementary-items/:itemId", async (req, res) => {
  if (!requireRole(req, res, writers)) return;
  const revision = await findRevision(req.params.projectKey, req.params.revision);
  if (!revision) return void res.status(404).json({ error: "order_revision_not_found" });
  try {
    await deleteSupplementaryItem(revision.id, req.params.itemId);
    res.status(204).send();
  } catch (error) {
    sendReviewError(error, res);
  }
});
