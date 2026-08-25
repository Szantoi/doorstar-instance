import { Router, type Response } from "express";
import {
  componentCalculatorProfileFingerprint,
  componentCalculatorProfiles,
  componentCalculatorProfilesFingerprint,
  componentSnapshotSchemaVersion,
} from "../config/componentCalculatorProfiles.js";
import { technicalCatalog, technicalCatalogFingerprint } from "../config/technicalCatalog.js";
import { prisma } from "../db/client.js";
import { createComponentSnapshotSchema, reviewComponentSnapshotSchema } from "../domain/schemas.js";
import { logger } from "../logger.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { validateBody } from "../middleware/validate.js";
import {
  ComponentSnapshotError,
  createComponentSnapshot,
  listComponentSnapshots,
  reviewComponentSnapshot,
} from "../services/componentSnapshots.js";
import { findActiveProject } from "../services/projects.js";

export const componentSnapshotsRouter = Router();
const creators = ["technical_preparation", "order_approver", "production_planner"] as const;
const reviewers = ["order_approver", "production_planner"] as const;

componentSnapshotsRouter.get("/component-calculator-profiles", (_req, res) => {
  res.json({
    ...componentCalculatorProfiles,
    profiles: componentCalculatorProfiles.profiles.map((profile) => ({
      ...profile,
      fingerprint: componentCalculatorProfileFingerprint(profile),
    })),
    configurationFingerprint: componentCalculatorProfilesFingerprint,
    snapshotSchemaVersion: componentSnapshotSchemaVersion,
    technicalCatalogVersion: technicalCatalog.version,
    technicalCatalogFingerprint,
  });
});

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
  if (!(error instanceof ComponentSnapshotError)) {
    logger.error({ err: error, event: "component_snapshot_request_failed" });
    res.status(500).json({ error: "internal_error" });
    return;
  }
  res.status(error.status).json({ error: error.code, ...(error.details === undefined ? {} : { details: error.details }) });
}

componentSnapshotsRouter.get("/production-orders/:projectKey/revisions/:revision/component-snapshots", async (req, res) => {
  const found = await findRevision(req.params.projectKey, req.params.revision);
  if ("error" in found) return void res.status(found.error === "invalid_revision" ? 400 : 404).json({ error: found.error });
  res.json(await listComponentSnapshots(found.revision.id));
});

componentSnapshotsRouter.post(
  "/production-orders/:projectKey/revisions/:revision/component-snapshots",
  validateBody(createComponentSnapshotSchema),
  async (req, res) => {
    if (!requireRole(req, res, creators)) return;
    const found = await findRevision(req.params.projectKey, req.params.revision);
    if ("error" in found) return void res.status(found.error === "invalid_revision" ? 400 : 404).json({ error: found.error });
    try {
      const result = await createComponentSnapshot(
        found.revision.id,
        req.body as ReturnType<typeof createComponentSnapshotSchema.parse>,
        getRequester(req).role,
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: Number(req.params.revision),
        snapshotId: result.snapshot.id,
        calculatorProfileVersion: result.snapshot.calculatorProfileVersion,
        created: result.created,
      }, "component snapshot materialized");
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendDomainError(error, res);
    }
  },
);

componentSnapshotsRouter.patch(
  "/production-orders/:projectKey/revisions/:revision/component-snapshots/:snapshotId/review",
  validateBody(reviewComponentSnapshotSchema),
  async (req, res) => {
    if (!requireRole(req, res, reviewers)) return;
    const found = await findRevision(req.params.projectKey, req.params.revision);
    if ("error" in found) return void res.status(found.error === "invalid_revision" ? 400 : 404).json({ error: found.error });
    const decision = req.body as ReturnType<typeof reviewComponentSnapshotSchema.parse>;
    try {
      const snapshot = await reviewComponentSnapshot(
        found.revision.id,
        req.params.snapshotId,
        decision,
        getRequester(req).role,
      );
      logger.info({
        projectKey: req.params.projectKey,
        revision: Number(req.params.revision),
        snapshotId: snapshot.id,
        state: snapshot.state,
      }, "component snapshot reviewed");
      res.json(snapshot);
    } catch (error) {
      sendDomainError(error, res);
    }
  },
);
