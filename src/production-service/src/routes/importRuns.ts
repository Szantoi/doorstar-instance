import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { applyImportRunDraftSchema, applyManufacturedItemCandidatesSchema, createDeadlineObservationSchema, createImportCandidateSchema, createImportRunSchema } from "../domain/schemas.js";
import { validateBody } from "../middleware/validate.js";
import { getRequester, requireRole } from "../middleware/requester.js";
import { logger } from "../logger.js";
import { applyManufacturedItemCandidates, ManufacturedItemImportError } from "../services/manufacturedItemImport.js";
import { createSalesDraft } from "../services/orderDrafts.js";
import { isImportTestSchema } from "../services/importSchemaGuard.js";

export const importRunsRouter = Router();

type InboxState = "PDF_REVISION_SELECTION_REQUIRED" | "SALES_REVIEW" | "SURVEY_RECONCILIATION" | "DEADLINE_CONFLICT" | "READY_FOR_TEST_DRAFT" | "APPLIED_TO_TEST";

function inboxStates(runStatus: string, candidateStatus: string, errors: string[]): InboxState[] {
  if (runStatus === "APPLIED") return ["APPLIED_TO_TEST"];
  const text = errors.join(" ").toLowerCase();
  const states: InboxState[] = [];
  if (text.includes("revision") && text.includes("selection")) states.push("PDF_REVISION_SELECTION_REQUIRED");
  if (text.includes("deadline") && (text.includes("conflict") || text.includes("ambiguous"))) states.push("DEADLINE_CONFLICT");
  if (text.includes("survey") || text.includes("reconciliation")) states.push("SURVEY_RECONCILIATION");
  if (candidateStatus === "READY" && states.length === 0) states.push("READY_FOR_TEST_DRAFT");
  if (states.length === 0) states.push("SALES_REVIEW");
  return states;
}

/** Paginated backend-owned review projection. Dates are deliberately absent:
 * source file timestamps never become delay or completion states here. */
importRunsRouter.get("/import-inbox", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25));
  const candidates = await prisma.importCandidate.findMany({
    orderBy: [{ importRun: { createdAt: "desc" } }, { workNumber: "asc" }, { createdAt: "asc" }],
    include: { importRun: { select: { id: true, profileVersion: true, sourceFingerprint: true, status: true, targetSchema: true, createdAt: true } } },
  });
  const grouped = new Map<string, { importRun: typeof candidates[number]["importRun"]; workNumber: string; states: Set<InboxState>; candidateCount: number; readyCount: number; reviewCount: number; blockedCount: number; sourcePaths: Set<string> }>();
  for (const candidate of candidates) {
    const workNumber = candidate.workNumber ?? "UNASSIGNED";
    const key = `${candidate.importRunId}:${workNumber}`;
    const item = grouped.get(key) ?? { importRun: candidate.importRun, workNumber, states: new Set<InboxState>(), candidateCount: 0, readyCount: 0, reviewCount: 0, blockedCount: 0, sourcePaths: new Set<string>() };
    inboxStates(candidate.importRun.status, candidate.status, candidate.errors).forEach((state) => item.states.add(state));
    item.candidateCount += 1;
    if (candidate.status === "READY") item.readyCount += 1;
    if (candidate.status === "REVIEW") item.reviewCount += 1;
    if (candidate.status === "BLOCKED") item.blockedCount += 1;
    item.sourcePaths.add(candidate.relativePath);
    grouped.set(key, item);
  }
  const rows = [...grouped.values()];
  const total = rows.length;
  res.json({ page, pageSize, total, items: rows.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
    importRunId: item.importRun.id, workNumber: item.workNumber, profileVersion: item.importRun.profileVersion,
    sourceFingerprint: item.importRun.sourceFingerprint, targetSchema: item.importRun.targetSchema,
    states: [...item.states].sort(), candidateCount: item.candidateCount, readyCount: item.readyCount,
    reviewCount: item.reviewCount, blockedCount: item.blockedCount, sourcePaths: [...item.sourcePaths].sort(),
  })) });
});

/** Evidence packet for one reviewed work-number group. It deliberately
 * reports source facts and review markers, never an inferred reconciliation. */
importRunsRouter.get("/import-inbox/:importRunId/:workNumber/evidence", async (req, res) => {
  const run = await prisma.importRun.findUnique({ where: { id: req.params.importRunId }, select: { id: true, profileVersion: true, sourceFingerprint: true, targetSchema: true } });
  if (!run) return void res.status(404).json({ error: "import_run_not_found" });
  const workNumber = req.params.workNumber === "UNASSIGNED" ? null : req.params.workNumber;
  const [candidates, deadlines] = await Promise.all([
    prisma.importCandidate.findMany({ where: { importRunId: run.id, workNumber }, orderBy: { createdAt: "asc" }, select: { id: true, recordType: true, status: true, sourceRoot: true, relativePath: true, sheet: true, page: true, row: true, normalizedPayload: true, errors: true } }),
    workNumber ? prisma.orderDeadlineObservation.findMany({ where: { importRunId: run.id, workNumber }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, rawValue: true, normalizedDate: true, confidence: true, reviewState: true, resolution: true, sourceRoot: true, relativePath: true, sheet: true, page: true, row: true } }) : Promise.resolve([]),
  ]);
  res.json({ workNumber: workNumber ?? "UNASSIGNED", importRun: run, candidates, deadlineObservations: deadlines });
});

function isTestSchemaConnection(): boolean {
  try {
    return isImportTestSchema(new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema"));
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
      registrationKey: run.registrationKey,
      registrationVersion: run.registrationVersion,
      artifactFingerprint: run.artifactFingerprint,
      reviewNote: run.reviewNote,
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
