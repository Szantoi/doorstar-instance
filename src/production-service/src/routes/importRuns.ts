import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { applyImportRunDraftSchema, applyManufacturedItemCandidatesSchema, createDeadlineObservationSchema, createImportCandidateSchema, createImportRunSchema } from "../domain/schemas.js";
import { validateBody } from "../middleware/validate.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { logger } from "../logger.js";
import { applyManufacturedItemCandidates, ManufacturedItemImportError } from "../services/manufacturedItemImport.js";
import { createSalesDraft } from "../services/orderDrafts.js";

export const importRunsRouter = Router();

function isTestSchemaConnection(): boolean {
  try {
    return new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") === "doorstar_test";
  } catch {
    return false;
  }
}

/** Preview provenance is visible for audit; it contains metadata only, never
 * source document content or a production database target. */
importRunsRouter.get("/import-runs", async (_req, res) => {
  const runs = await prisma.importRun.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    include: { _count: { select: { candidates: true, deadlineObservations: true } }, revisions: { select: {
      revision: true, status: true, intakeStage: true,
      order: { select: { project: { select: { key: true, name: true, num: true } } } },
      _count: { select: { positions: true, documents: true, feedback: true } },
    } } },
  });
  res.json(runs);
});

importRunsRouter.get("/import-runs/:importRunId/evidence", async (req, res) => {
  const run = await prisma.importRun.findUnique({ where: { id: req.params.importRunId }, include: {
    candidates: { orderBy: [{ workNumber: "asc" }, { createdAt: "asc" }], include: {
      manufacturedItem: { select: {
        id: true, kind: true, code: true, state: true,
        orderRevision: { select: { order: { select: { project: { select: { key: true } } } } } },
      } },
    } },
    deadlineObservations: { orderBy: { createdAt: "asc" }, include: {
      orderRevision: { select: {
        revision: true,
        order: { select: { project: { select: { key: true, name: true } } } },
      } },
    } },
    revisions: { orderBy: { revision: "desc" }, select: {
      id: true, revision: true, status: true, intakeStage: true,
      order: { select: { project: { select: { key: true, name: true } } } },
    } },
  } });
  if (!run) return void res.status(404).json({ error: "import_run_not_found" });
  res.json({
    importRun: {
      id: run.id,
      profileVersion: run.profileVersion,
      sourceFingerprint: run.sourceFingerprint,
      previewArtifact: run.previewArtifact,
      targetSchema: run.targetSchema,
      status: run.status,
      candidateCount: run.candidateCount,
      createdByRole: run.createdByRole,
      createdAt: run.createdAt,
      appliedAt: run.appliedAt,
    },
    candidates: run.candidates,
    deadlineObservations: run.deadlineObservations,
    targetRevisions: run.revisions,
  });
});

/** Applies selected READY panel/front candidates to the exact imported DRAFT.
 * The fixed confirmation, fingerprint and test-schema guard form the human
 * boundary; the stored payload remains the only write source. */
importRunsRouter.post(
  "/import-runs/:importRunId/apply-manufactured-items",
  validateBody(applyManufacturedItemCandidatesSchema),
  async (req, res) => {
    if (!requireRole(req, res, ["technical_preparation", "order_approver"])) return;
    if (!isTestSchemaConnection()) {
      return void res.status(409).json({ error: "import_runs_require_test_database" });
    }
    const body = req.body as ReturnType<typeof applyManufacturedItemCandidatesSchema.parse>;
    try {
      const result = await applyManufacturedItemCandidates(prisma, {
        importRunId: req.params.importRunId,
        orderRevisionId: body.orderRevisionId,
        sourceFingerprint: body.sourceFingerprint,
        candidateIds: body.candidateIds,
        actorRole: getRequester(req).role,
      });
      logger.info({
        importRunId: result.importRunId,
        orderRevisionId: result.orderRevisionId,
        projectKey: result.projectKey,
        createdCount: result.createdCount,
        existingCount: result.existingCount,
      }, "manufactured item import candidates applied to test draft");
      res.json(result);
    } catch (error) {
      if (error instanceof ManufacturedItemImportError) {
        const status = error.code === "import_run_not_found" ? 404 : 409;
        return void res.status(status).json({ error: error.code, ...error.details });
      }
      throw error;
    }
  },
);

importRunsRouter.post("/import-runs/:importRunId/candidates", validateBody(createImportCandidateSchema), async (req, res) => {
  if (!requireRole(req, res, [])) return;
  if (!isTestSchemaConnection()) return void res.status(409).json({ error: "import_runs_require_test_database" });
  const run = await prisma.importRun.findUnique({ where: { id: req.params.importRunId } });
  if (!run) return void res.status(404).json({ error: "import_run_not_found" });
  const body = req.body as ReturnType<typeof createImportCandidateSchema.parse>;
  const candidate = await prisma.importCandidate.create({ data: { ...body, importRunId: run.id, normalizedPayload: body.normalizedPayload as Prisma.InputJsonValue, errors: body.errors ?? [] } });
  res.status(201).json(candidate);
});

importRunsRouter.post("/import-runs/:importRunId/deadline-observations", validateBody(createDeadlineObservationSchema), async (req, res) => {
  if (!requireRole(req, res, [])) return;
  if (!isTestSchemaConnection()) return void res.status(409).json({ error: "import_runs_require_test_database" });
  const run = await prisma.importRun.findUnique({ where: { id: req.params.importRunId } });
  if (!run) return void res.status(404).json({ error: "import_run_not_found" });
  const body = req.body as ReturnType<typeof createDeadlineObservationSchema.parse>;
  if (body.orderRevisionId) {
    const revision = await prisma.orderRevision.findFirst({ where: { id: body.orderRevisionId, importRunId: run.id } });
    if (!revision) return void res.status(409).json({ error: "deadline_revision_not_from_import_run" });
  }
  const observation = await prisma.orderDeadlineObservation.create({ data: { ...body, importRunId: run.id, normalizedDate: body.normalizedDate ? new Date(body.normalizedDate) : null } });
  res.status(201).json(observation);
});

/** Administrators register a reviewed preview before any future test-schema
 * writer can consume it. The schema literal blocks a public/production target. */
importRunsRouter.post("/import-runs", validateBody(createImportRunSchema), async (req, res) => {
  if (!requireRole(req, res, [])) return;
  if (!isTestSchemaConnection()) {
    res.status(409).json({ error: "import_runs_require_test_database" });
    return;
  }
  const body = req.body as ReturnType<typeof createImportRunSchema.parse>;
  const run = await prisma.importRun.create({ data: { ...body, createdByRole: getRequester(req).role } });
  logger.info({ importRunId: run.id, profileVersion: run.profileVersion, candidateCount: run.candidateCount }, "legacy import preview registered");
  res.status(201).json(run);
});

/** Applies one already reviewed preview as a fresh mutable Sales DRAFT. This
 * route is deliberately bound to both a PREVIEWED run and doorstar_test. */
importRunsRouter.post("/import-runs/:importRunId/apply-draft", validateBody(applyImportRunDraftSchema), async (req, res) => {
  if (!requireRole(req, res, [])) return;
  if (!isTestSchemaConnection()) {
    res.status(409).json({ error: "import_runs_require_test_database" });
    return;
  }
  const body = req.body as ReturnType<typeof applyImportRunDraftSchema.parse>;
  const run = await prisma.importRun.findUnique({ where: { id: req.params.importRunId } });
  if (!run) return void res.status(404).json({ error: "import_run_not_found" });
  if (run.status !== "PREVIEWED") return void res.status(409).json({ error: "import_run_not_previewed", status: run.status });
  if (body.positions.length > run.candidateCount) return void res.status(409).json({ error: "import_position_count_exceeds_preview" });
  const existing = await prisma.project.findUnique({ where: { key: body.projectKey } });
  if (existing) return void res.status(409).json({ error: existing.deletedAt ? "project_archived" : "project_key_exists" });

  const revision = await prisma.$transaction(async (tx) => {
    const draft = await createSalesDraft(tx, body, { importRunId: run.id, documents: body.documents });
    await tx.importRun.update({ where: { id: run.id }, data: { status: "APPLIED", appliedAt: new Date() } });
    return draft;
  });
  logger.info({ importRunId: run.id, projectKey: body.projectKey, revision: revision.revision, positionCount: revision.positions.length }, "legacy import draft applied to test schema");
  res.status(201).json(revision);
});
