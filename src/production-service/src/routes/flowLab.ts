import { Router, type Request, type Response } from "express";
import { prisma } from "../db/client.js";
import {
  addFlowLabManualStepSchema,
  flowLabDeviationListQuerySchema,
  materializeFlowLabPlanSnapshotSchema,
  reviewFlowLabPlanSnapshotSchema,
  updateFlowLabMaterializedStepSchema,
} from "../domain/flowLabSchemas.js";
import { logger } from "../logger.js";
import { getRequester, getRequesterPrincipal, requireExplicitRole } from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import {
  addFlowLabManualStep,
  FlowLabDeviationError,
  listFlowLabDeviations,
  updateFlowLabMaterializedStep,
} from "../services/flowLabDeviation.js";
import {
  FlowLabMaterializationError,
  materializeFlowLabPlanSnapshot,
} from "../services/flowLabMaterialization.js";
import { FlowLabPlanReviewError, reviewFlowLabPlanSnapshot } from "../services/flowLabPlanReview.js";
import { projectFlowLabPlanSnapshot } from "../services/flowLabReadProjection.js";
import { findActiveProject } from "../services/projects.js";

export const flowLabRouter = Router();

const flowLabReaders = ["technical_preparation", "production_planner", "order_approver", "reader"] as const;
const flowLabReviewers = ["production_planner", "order_approver"] as const;
const flowLabMaterializers = ["production_planner"] as const;

function requireFlowLabPrincipal(req: Request, res: Response): string | null {
  if (!req.header("x-principal")?.trim()) {
    res.status(401).json({ error: "flow_lab_principal_required" });
    return null;
  }
  return getRequesterPrincipal(req);
}

async function resolveProject(req: Request, res: Response) {
  const project = await findActiveProject(req.params.projectKey);
  if (!project) {
    res.status(404).json({ error: "project_not_found" });
    return null;
  }
  return project;
}

function sendFlowLabError(error: unknown, res: Response) {
  if (error instanceof FlowLabPlanReviewError
    || error instanceof FlowLabMaterializationError
    || error instanceof FlowLabDeviationError) {
    res.status(error.status).json({
      error: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }
  logger.error({ err: error }, "Flow Lab request failed");
  res.status(500).json({ error: "internal_error" });
}

/** Read-only review surface. File import remains a configured inbox/CLI action,
 * never an HTTP upload path. */
flowLabRouter.get("/flow-lab/projects/:projectKey/plan-snapshots", async (req, res) => {
  if (!requireExplicitRole(req, res, flowLabReaders, "flow_lab_role_required")) return;
  const project = await resolveProject(req, res);
  if (!project) return;
  try {
    const snapshots = await prisma.flowLabPlanSnapshot.findMany({
      where: { projectId: project.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    res.json({ snapshots: await Promise.all(snapshots.map((snapshot) => projectFlowLabPlanSnapshot(prisma, snapshot))) });
  } catch (error) {
    sendFlowLabError(error, res);
  }
});

flowLabRouter.patch(
  "/flow-lab/projects/:projectKey/plan-snapshots/:snapshotId/review",
  validateBody(reviewFlowLabPlanSnapshotSchema),
  async (req, res) => {
    if (!requireExplicitRole(req, res, flowLabReviewers, "flow_lab_review_role_required")) return;
    const principal = requireFlowLabPrincipal(req, res);
    if (!principal) return;
    const project = await resolveProject(req, res);
    if (!project) return;
    try {
      const snapshot = await reviewFlowLabPlanSnapshot({
        projectId: project.id,
        snapshotId: req.params.snapshotId,
        decision: req.body as ReturnType<typeof reviewFlowLabPlanSnapshotSchema.parse>,
        actorRole: getRequester(req).role,
        actorPrincipal: principal,
      });
      logger.info({ projectKey: project.key, snapshotId: snapshot.id, state: snapshot.state }, "Flow Lab snapshot independently reviewed");
      res.json(await projectFlowLabPlanSnapshot(prisma, snapshot));
    } catch (error) {
      sendFlowLabError(error, res);
    }
  },
);

flowLabRouter.post(
  "/flow-lab/projects/:projectKey/plan-snapshots/:snapshotId/materialize",
  validateBody(materializeFlowLabPlanSnapshotSchema),
  async (req, res) => {
    if (!requireExplicitRole(req, res, flowLabMaterializers, "flow_lab_materialization_role_required")) return;
    const principal = requireFlowLabPrincipal(req, res);
    if (!principal) return;
    const project = await resolveProject(req, res);
    if (!project) return;
    try {
      const result = await materializeFlowLabPlanSnapshot({
        projectId: project.id,
        snapshotId: req.params.snapshotId,
        actorRole: getRequester(req).role,
        actorPrincipal: principal,
      });
      logger.info({ projectKey: project.key, snapshotId: req.params.snapshotId, ...result }, "Flow Lab snapshot materialized to worksheet rows");
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendFlowLabError(error, res);
    }
  },
);

flowLabRouter.get("/flow-lab/projects/:projectKey/deviations", async (req, res) => {
  if (!requireExplicitRole(req, res, flowLabReaders, "flow_lab_role_required")) return;
  const parsed = flowLabDeviationListQuerySchema.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const project = await resolveProject(req, res);
  if (!project) return;
  try {
    res.json(await listFlowLabDeviations({ projectId: project.id, ...parsed.data }));
  } catch (error) {
    sendFlowLabError(error, res);
  }
});

/** The legacy full-tree worksheet save is intentionally not allowed to mutate
 * a Flow Lab row. These narrow commands preserve an append-only observation. */
flowLabRouter.patch(
  "/flow-lab/projects/:projectKey/steps/:stepId",
  validateBody(updateFlowLabMaterializedStepSchema),
  async (req, res) => {
    if (!requireExplicitRole(req, res, flowLabMaterializers, "flow_lab_materialization_role_required")) return;
    const principal = requireFlowLabPrincipal(req, res);
    if (!principal) return;
    const project = await resolveProject(req, res);
    if (!project) return;
    try {
      res.json(await updateFlowLabMaterializedStep({
        projectId: project.id,
        epicStepId: req.params.stepId,
        actorRole: getRequester(req).role,
        actorPrincipal: principal,
        changes: req.body as ReturnType<typeof updateFlowLabMaterializedStepSchema.parse>,
      }));
    } catch (error) {
      sendFlowLabError(error, res);
    }
  },
);

flowLabRouter.post(
  "/flow-lab/projects/:projectKey/epics/:epicId/steps",
  validateBody(addFlowLabManualStepSchema),
  async (req, res) => {
    if (!requireExplicitRole(req, res, flowLabMaterializers, "flow_lab_materialization_role_required")) return;
    const principal = requireFlowLabPrincipal(req, res);
    if (!principal) return;
    const project = await resolveProject(req, res);
    if (!project) return;
    try {
      res.status(201).json(await addFlowLabManualStep({
        projectId: project.id,
        epicId: req.params.epicId,
        actorRole: getRequester(req).role,
        actorPrincipal: principal,
        step: req.body as ReturnType<typeof addFlowLabManualStepSchema.parse>,
      }));
    } catch (error) {
      sendFlowLabError(error, res);
    }
  },
);
