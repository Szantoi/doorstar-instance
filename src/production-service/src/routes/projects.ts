import { Router } from "express";
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
import { issueSession } from "../services/scheduler.js";
import { logger } from "../logger.js";
import { requireManager } from "../middleware/requester.js";
import { findActiveProject } from "../services/projects.js";

export const projectsRouter = Router();

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
        include: { steps: { orderBy: { position: "asc" }, include: { tasks: true } } },
      },
      sheets: true,
    },
  });
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(project);
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

  await prisma.$transaction(async (tx) => {
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
  await prisma.epic.delete({ where: { id: epic.id } });
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
  const result = await issueSession(project.id);
  if (result.missingPlanDates.length) {
    logger.warn({ key: project.key, missingPlanDates: result.missingPlanDates }, "session issue rejected: planned date missing");
    res.status(409).json({ error: "missing_plan_dates", missingSteps: result.missingPlanDates });
    return;
  }
  logger.info({ key: project.key, ...result }, "session issued to board");
  res.json(result);
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
