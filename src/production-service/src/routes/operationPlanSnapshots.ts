import { Router, type Response } from "express";
import { prisma } from "../db/client.js";
import {
  createOperationPlanSnapshotSchema,
  reviewOperationPlanSnapshotSchema,
} from "../domain/operationSchemas.js";
import { logger } from "../logger.js";
import {
  getRequester,
  getRequesterPrincipal,
  requireRole,
} from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import {
  createOperationPlanSnapshot,
  listOperationPlanSnapshots,
  OperationPlanError,
  reviewOperationPlanSnapshot,
} from "../services/operationPlanSnapshots.js";
import { findActiveProject } from "../services/projects.js";

export const operationPlanSnapshotsRouter = Router();
const creators = ["technical_preparation", "production_planner"] as const;
const reviewers = ["order_approver", "production_planner"] as const;

async function findRevision(projectKey: string, revisionValue: string) {
  const project = await findActiveProject(projectKey);
  if (!project) return { error: "project_not_found" as const };
  const revisionNumber = Number(revisionValue);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return { error: "invalid_revision" as const };
  const revision = await prisma.orderRevision.findFirst({
    where: { order: { projectId: project.id }, revision: revisionNumber },
    select: { id: true },
  });
  return revision ? { revision } : { error: "order_revision_not_found" as const };
}

function sendDomainError(error: unknown, res: Response) {
  if (!(error instanceof OperationPlanError)) {
    logger.error({ err: error }, "operation plan request failed");
    res.status(500).json({ error: "internal_error" });
    return;
  }
  res.status(error.status).json({
    error: error.code,
    ...(error.details === undefined ? {} : { details: error.details }),
  });
}

operationPlanSnapshotsRouter.get(
  "/production-orders/:projectKey/revisions/:revision/operation-plan-snapshots",
  async (req, res) => {
    const found = await findRevision(req.params.projectKey, req.params.revision);
    if ("error" in found) return void res.status(found.error === "invalid_revision" ? 400 : 404).json({ error: found.error });
    try {
      res.json(await listOperationPlanSnapshots(found.revision.id));
    } catch (error) {
      sendDomainError(error, res);
    }
  },
);

operationPlanSnapshotsRouter.post(
  "/production-orders/:projectKey/revisions/:revision/operation-plan-snapshots",
  validateBody(createOperationPlanSnapshotSchema),
  async (req, res) => {
    if (!requireRole(req, res, creators)) return;
    const found = await findRevision(req.params.projectKey, req.params.revision);
    if ("error" in found) return void res.status(found.error === "invalid_revision" ? 400 : 404).json({ error: found.error });
    try {
      const result = await createOperationPlanSnapshot(
        found.revision.id,
        req.body as ReturnType<typeof createOperationPlanSnapshotSchema.parse>,
        getRequester(req).role,
        getRequesterPrincipal(req),
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: Number(req.params.revision),
        snapshotId: result.snapshot.id,
        generatorProfileVersion: result.snapshot.generatorProfileVersion,
        created: result.created,
      }, "operation plan snapshot materialized");
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendDomainError(error, res);
    }
  },
);

operationPlanSnapshotsRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/operation-plan-snapshots/:snapshotId/review",
  validateBody(reviewOperationPlanSnapshotSchema),
  async (req, res) => {
    if (!requireRole(req, res, reviewers)) return;
    const found = await findRevision(req.params.projectKey, req.params.revision);
    if ("error" in found) return void res.status(found.error === "invalid_revision" ? 400 : 404).json({ error: found.error });
    try {
      const snapshot = await reviewOperationPlanSnapshot(
        found.revision.id,
        req.params.snapshotId,
        req.body as ReturnType<typeof reviewOperationPlanSnapshotSchema.parse>,
        getRequester(req).role,
        getRequesterPrincipal(req),
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: Number(req.params.revision),
        snapshotId: snapshot.id,
        state: snapshot.state,
      }, "operation plan snapshot reviewed");
      res.json(snapshot);
    } catch (error) {
      sendDomainError(error, res);
    }
  },
);
