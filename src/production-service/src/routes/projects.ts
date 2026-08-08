import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { validateBody } from "../middleware/validate.js";
import {
  createProjectSchema,
  updateProjectSchema,
  saveEpicsSchema,
  scheduleSchema,
  projectSheetKindSchema,
} from "../domain/schemas.js";
import { resolveFlow, isDone, markerStatus } from "../domain/taskStatus.js";
import { issueSession, issueStep, revokeStep } from "../services/scheduler.js";
import { logger } from "../logger.js";
import { requireManager } from "../middleware/requester.js";
import { findActiveProject } from "../services/projects.js";
import { taskVM } from "./board.js";
import {
  LegacyProductionGuardError,
} from "../services/legacyProductionGuard.js";
import { projectFlowLabStep } from "../services/flowLabReadProjection.js";

export const projectsRouter = Router();

class FlowLabWorksheetMutationError extends Error {
  readonly status = 409 as const;
  readonly code = "flow_lab_materialized_rows_require_dedicated_commands" as const;
}

async function assertNoFlowLabWorksheetMaterialization(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  const materialization = await tx.flowLabPlanMaterialization.findFirst({
    where: { projectId },
    select: { id: true },
  });
  if (materialization) throw new FlowLabWorksheetMutationError();
}

/** GET /api/production/projects — card grid with per-project progress rollup. */
projectsRouter.get("/projects", async (_req, res) => {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { tasks: true },
  });
  const workflowRows = await prisma.stationWorkflow.findMany();
  const workflows = new Map(workflowRows.map((w) => [w.station, w.steps as string[]]));

  const cards = projects.map((p) => {
    const done = p.tasks.filter((t) => isDone(t, resolveFlow(t.station, workflows))).length;
    return {
      key: p.key,
      name: p.name,
      num: p.num,
      status: p.status,
      totalTasks: p.tasks.length,
      doneTasks: done,
      progressPct: p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0,
    };
  });
  res.json(cards);
});

/** GET /api/production/projects/:key/epik-rollup — per-epik done/total +
 * next-up step, computed from every Task ever issued for this project
 * (across all weeks), grouped by epicName. Mirrors the design mock's
 * projects-list epik rows and "Epik áttekintés" modal. */
projectsRouter.get("/projects/:key/epik-rollup", async (req, res) => {
  const project = await findActiveProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const [tasks, workflowRows] = await Promise.all([
    prisma.task.findMany({ where: { projectId: project.id }, orderBy: [{ week: "asc" }, { day: "asc" }] }),
    prisma.stationWorkflow.findMany(),
  ]);
  const workflows = new Map(workflowRows.map((w) => [w.station, w.steps as string[]]));

  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const groupName = t.epicName ?? "(epik nélkül)";
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(t);
  }

  const epikRows = Array.from(groups.entries()).map(([name, ts]) => {
    const withStatus = ts.map((t) => {
      const flow = resolveFlow(t.station, workflows);
      return { t, done: isDone(t, flow), status: markerStatus(t, flow) };
    });
    const done = withStatus.filter((x) => x.done).length;
    const next = withStatus.find((x) => !x.done)?.t ?? null;
    return {
      name,
      done,
      total: ts.length,
      next: next ? { id: next.id, title: next.title, week: next.week, day: next.day, station: next.station } : null,
      steps: withStatus.map(({ t, done, status }) => ({
        id: t.id,
        title: t.title,
        week: t.week,
        day: t.day,
        station: t.station,
        status,
        isDone: done,
      })),
    };
  });

  res.json({ epikRows });
});

projectsRouter.post("/projects", validateBody(createProjectSchema), async (req, res) => {
  if (!requireManager(req, res)) return;
  const body = req.body as { key: string; name: string; num?: string };
  const existing = await prisma.project.findUnique({ where: { key: body.key } });
  if (existing) {
    res.status(409).json({ error: existing.deletedAt ? "project_archived" : "project_key_exists" });
    return;
  }
  const project = await prisma.project.create({ data: body });
  logger.info({ key: project.key }, "project created");
  res.status(201).json(project);
});

/** GET /api/production/projects/:key — full munkalap: epics/steps + sub-sheets. */
projectsRouter.get("/projects/:key", async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { key: req.params.key, deletedAt: null },
    include: {
      epics: {
        orderBy: { position: "asc" },
        include: {
          flowLabProvenance: {
            include: { materialization: { include: { flowLabPlanSnapshot: true } } },
          },
          steps: {
            orderBy: { position: "asc" },
            include: {
              tasks: true,
              flowLabProvenance: {
                include: { materialization: { include: { flowLabPlanSnapshot: true } } },
              },
            },
          },
        },
      },
      sheets: true,
    },
  });
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const workflows = new Map((await prisma.stationWorkflow.findMany()).map((row) => [row.station, row.steps as string[]]));
  const withTaskViews = await Promise.all(project.epics.map(async (epic) => {
    const { flowLabProvenance: epicFlowLabProvenance, ...epicRecord } = epic;
    const epicSnapshot = epicFlowLabProvenance?.materialization.flowLabPlanSnapshot;
    const epicFlowLab = epicSnapshot
      ? {
        origin: "FLOW_LAB" as const,
        sourceSetKey: epicSnapshot.sourceSetKey,
        materializationKey: epicSnapshot.materializationKey,
        pins: {
          catalogRevision: epicSnapshot.catalogRevision,
          catalogHash: epicSnapshot.catalogHash,
          planHash: epicSnapshot.planHash,
          engineIdentity: epicSnapshot.engineIdentity,
        },
      }
      : {};
    return {
      ...epicRecord,
      ...epicFlowLab,
      steps: await Promise.all(epic.steps.map(async (step) => {
        const { flowLabProvenance: stepFlowLabProvenance, ...stepRecord } = step;
        const stepSnapshot = stepFlowLabProvenance?.materialization.flowLabPlanSnapshot ?? epicSnapshot;
        const flowLabStep = stepFlowLabProvenance
          ? projectFlowLabStep(stepFlowLabProvenance.materialization.flowLabPlanSnapshot, stepFlowLabProvenance.correlationKey)
          : null;
        return {
          ...stepRecord,
          ...epicFlowLab,
          ...(flowLabStep ?? (stepSnapshot
            ? {
              origin: "FLOW_LAB" as const,
              sourceSetKey: stepSnapshot.sourceSetKey,
              materializationKey: stepSnapshot.materializationKey,
              pins: {
                catalogRevision: stepSnapshot.catalogRevision,
                catalogHash: stepSnapshot.catalogHash,
                planHash: stepSnapshot.planHash,
                engineIdentity: stepSnapshot.engineIdentity,
              },
              operationType: "Manual",
              relativePosition: stepRecord.position,
              predecessors: [],
            }
            : {})),
          tasks: await Promise.all(step.tasks.map((task) => taskVM(task, workflows))),
        };
      })),
    };
  }));
  const unepicTasks = await Promise.all((await prisma.task.findMany({
    where: { projectId: project.id, epicId: null }, orderBy: [{ week: "asc" }, { day: "asc" }], include: { project: { select: { num: true } } },
  })).map((task) => taskVM(task, workflows)));
  res.json({ ...project, epics: withTaskViews, unepicTasks });
});

projectsRouter.put("/projects/:key", validateBody(updateProjectSchema), async (req, res) => {
  if (!requireManager(req, res)) return;
  const current = await findActiveProject(req.params.key);
  if (!current) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const project = await prisma.project.update({ where: { id: current.id }, data: req.body });
  res.json(project);
});

/** Archive a project instead of deleting its work sheet, tasks or history. */
projectsRouter.delete("/projects/:key", async (req, res) => {
  if (!requireManager(req, res)) return;
  const project = await findActiveProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
  logger.info({ key: project.key, projectId: project.id }, "project soft deleted");
  res.status(204).end();
});

/** PUT /api/production/projects/:key/epics — reconcile the editable work-sheet
 * tree. Existing IDs are updated in place so an ordinary save never detaches
 * already issued Tasks from unchanged EpicSteps. */
projectsRouter.put("/projects/:key/epics", validateBody(saveEpicsSchema), async (req, res) => {
  if (!requireManager(req, res)) return;
  const { epics } = req.body as {
    epics: Array<{
      id?: string;
      name: string;
      quantityLabel?: string | null;
      disabled?: boolean;
      steps: Array<{
        id?: string;
        name: string;
        station?: string | null;
        quantity?: number | null;
        unitHours?: number | null;
        planDate?: string | null;
        planLocked?: boolean;
        disabled?: boolean;
      }>;
    }>;
  };

  const project = await findActiveProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await assertNoFlowLabWorksheetMaterialization(tx, project.id);
      const currentEpics = await tx.epic.findMany({
        where: { projectId: project.id },
        include: { steps: { select: { id: true } } },
      });
      const currentById = new Map(currentEpics.map((epic) => [epic.id, epic]));
      const retainedEpicIds = new Set<string>();

      for (const [epicIndex, epic] of epics.entries()) {
        const epicData = {
          name: epic.name,
          quantityLabel: epic.quantityLabel ?? null,
          disabled: epic.disabled ?? false,
          position: epicIndex,
        };
        const currentEpic = epic.id ? currentById.get(epic.id) : undefined;

        if (!currentEpic) {
          const createdEpic = await tx.epic.create({
            data: {
              projectId: project.id,
              ...epicData,
              steps: {
                create: epic.steps.map((step, stepIndex) => ({
                  name: step.name,
                  station: step.station ?? null,
                  quantity: step.quantity ?? null,
                  unitHours: step.unitHours ?? null,
                  planDate: step.planDate ? new Date(step.planDate) : null,
                  planLocked: step.planLocked ?? false,
                  disabled: step.disabled ?? false,
                  position: stepIndex,
                })),
              },
            },
          });
          retainedEpicIds.add(createdEpic.id);
          continue;
        }

        retainedEpicIds.add(currentEpic.id);
        await tx.epic.update({ where: { id: currentEpic.id }, data: epicData });
        const currentStepIds = new Set(currentEpic.steps.map((step) => step.id));
        const retainedStepIds = new Set(
          epic.steps.flatMap((step) => (step.id && currentStepIds.has(step.id) ? [step.id] : []))
        );
        await tx.epicStep.deleteMany({
          where: retainedStepIds.size
            ? { epicId: currentEpic.id, id: { notIn: Array.from(retainedStepIds) } }
            : { epicId: currentEpic.id },
        });

        for (const [stepIndex, step] of epic.steps.entries()) {
          const stepData = {
            name: step.name,
            station: step.station ?? null,
            quantity: step.quantity ?? null,
            unitHours: step.unitHours ?? null,
            planDate: step.planDate ? new Date(step.planDate) : null,
            planLocked: step.planLocked ?? false,
            disabled: step.disabled ?? false,
            position: stepIndex,
          };
          if (step.id && currentStepIds.has(step.id)) {
            await tx.epicStep.update({ where: { id: step.id }, data: stepData });
          } else {
            await tx.epicStep.create({ data: { epicId: currentEpic.id, ...stepData } });
          }
        }
      }

        await tx.epic.deleteMany({
          where: retainedEpicIds.size
            ? { projectId: project.id, id: { notIn: Array.from(retainedEpicIds) } }
            : { projectId: project.id },
        });

    });
  } catch (error) {
    if (error instanceof FlowLabWorksheetMutationError) {
      return void res.status(error.status).json({ error: error.code });
    }
    throw error;
  }

  const saved = await prisma.epic.findMany({
    where: { projectId: project.id },
    orderBy: { position: "asc" },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  res.json(saved);
});

/** DELETE /api/production/projects/:key/epics/:epicId — remove exactly one
 * epic. EpicStep's SET NULL relation preserves cards already issued from that
 * epic, while leaving every other epic and its issued tasks untouched. */
projectsRouter.delete("/projects/:key/epics/:epicId", async (req, res) => {
  if (!requireManager(req, res)) return;
  const project = await findActiveProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const epic = await prisma.epic.findFirst({ where: { id: req.params.epicId, projectId: project.id } });
  if (!epic) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      await assertNoFlowLabWorksheetMaterialization(tx, project.id);
      await tx.epic.delete({ where: { id: epic.id } });
    });
  } catch (error) {
    if (error instanceof FlowLabWorksheetMutationError) {
      return void res.status(error.status).json({ error: error.code });
    }
    throw error;
  }
  logger.info({ key: project.key, epicId: epic.id }, "project epic deleted");
  res.status(204).end();
});

/** POST /api/production/projects/:key/schedule — "Munkamenet kiadása": create
 * board Tasks from every not-yet-issued epic step. */
projectsRouter.post("/projects/:key/schedule", validateBody(scheduleSchema), async (req, res) => {
  if (!requireManager(req, res)) return;
  const project = await findActiveProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  let result: Awaited<ReturnType<typeof issueSession>>;
  try {
    result = await issueSession(project.id);
  } catch (error) {
    if (error instanceof LegacyProductionGuardError) {
      return void res.status(error.status).json({ error: error.code, details: error.details });
    }
    throw error;
  }
  if (result.missingPlanDates.length) {
    logger.warn({ key: project.key, missingPlanDates: result.missingPlanDates }, "session issue rejected: planned date missing");
    res.status(409).json({ error: "missing_plan_dates", missingSteps: result.missingPlanDates });
    return;
  }
  logger.info({ key: project.key, ...result }, "session issued to board");
  res.json(result);
});

/** Issue one planned step while preserving the active epic's predecessor chain. */
projectsRouter.post("/projects/:key/steps/:stepId/issue", async (req, res) => {
  if (!requireManager(req, res)) return;
  const project = await findActiveProject(req.params.key);
  if (!project) return void res.status(404).json({ error: "not_found" });
  try {
    const result = await issueStep(project.id, req.params.stepId);
    if (result.outcome === "missing_plan_date") return void res.status(409).json({ error: result.outcome });
    if (result.outcome === "predecessor_not_issued") return void res.status(409).json({ error: result.outcome, predecessorStepId: result.predecessorStepId });
    res.status(result.outcome === "issued" ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof LegacyProductionGuardError) {
      return void res.status(error.status).json({ error: error.code, details: error.details });
    }
    if (error instanceof Error && error.message === "step_not_found") return void res.status(404).json({ error: "not_found" });
    throw error;
  }
});

/** Revoke only a non-completed issued step that no later task depends on. */
projectsRouter.delete("/projects/:key/steps/:stepId/issue", async (req, res) => {
  if (!requireManager(req, res)) return;
  const project = await findActiveProject(req.params.key);
  if (!project) return void res.status(404).json({ error: "not_found" });
  const result = await revokeStep(project.id, req.params.stepId);
  if (result.outcome === "not_issued") return void res.status(404).json({ error: result.outcome });
  if (result.outcome === "completed") return void res.status(409).json({ error: result.outcome });
  if (result.outcome === "dependent_exists") return void res.status(409).json({ error: result.outcome, dependentTaskId: result.dependentTaskId });
  res.status(204).end();
});

/** GET/PUT /api/production/projects/:key/sheets/:kind — quantities / cutting-list /
 * hardware sub-sheets. Kept as free-form JSON — see schema.prisma comment. */
projectsRouter.get("/projects/:key/sheets/:kind", async (req, res) => {
  const kind = projectSheetKindSchema.parse(req.params.kind);
  const project = await findActiveProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const sheet = await prisma.projectSheet.findUnique({ where: { projectId_kind: { projectId: project.id, kind } } });
  res.json(sheet?.data ?? null);
});

projectsRouter.put("/projects/:key/sheets/:kind", async (req, res) => {
  if (!requireManager(req, res)) return;
  const kind = projectSheetKindSchema.parse(req.params.kind);
  const project = await findActiveProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const sheet = await prisma.projectSheet.upsert({
    where: { projectId_kind: { projectId: project.id, kind } },
    create: { projectId: project.id, kind, data: req.body },
    update: { data: req.body },
  });
  res.json(sheet.data);
});
