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
import { resolveFlow, isDone } from "../domain/taskStatus.js";
import { issueSession } from "../services/scheduler.js";
import { logger } from "../logger.js";

export const projectsRouter = Router();

/** GET /api/production/projects — card grid with per-project progress rollup. */
projectsRouter.get("/projects", async (_req, res) => {
  const projects = await prisma.project.findMany({
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

projectsRouter.post("/projects", validateBody(createProjectSchema), async (req, res) => {
  const body = req.body as { key: string; name: string; num?: string };
  const project = await prisma.project.create({ data: body });
  logger.info({ key: project.key }, "project created");
  res.status(201).json(project);
});

/** GET /api/production/projects/:key — full munkalap: epics/steps + sub-sheets. */
projectsRouter.get("/projects/:key", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { key: req.params.key },
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
  const project = await prisma.project.update({ where: { key: req.params.key }, data: req.body });
  res.json(project);
});

/** PUT /api/production/projects/:key/epics — bulk-replace the epic/step tree
 * (the munkalap's editable grid is saved as a whole, matching the source UI). */
projectsRouter.put("/projects/:key/epics", validateBody(saveEpicsSchema), async (req, res) => {
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

  const project = await prisma.project.findUniqueOrThrow({ where: { key: req.params.key } });

  await prisma.$transaction(async (tx) => {
    await tx.epic.deleteMany({ where: { projectId: project.id } });
    for (const [epicIndex, epic] of epics.entries()) {
      await tx.epic.create({
        data: {
          projectId: project.id,
          name: epic.name,
          quantityLabel: epic.quantityLabel ?? null,
          disabled: epic.disabled ?? false,
          position: epicIndex,
          steps: {
            create: epic.steps.map((s, stepIndex) => ({
              name: s.name,
              station: s.station ?? null,
              quantity: s.quantity ?? null,
              unitHours: s.unitHours ?? null,
              planDate: s.planDate ? new Date(s.planDate) : null,
              planLocked: s.planLocked ?? false,
              disabled: s.disabled ?? false,
              position: stepIndex,
            })),
          },
        },
      });
    }
  });

  const saved = await prisma.epic.findMany({
    where: { projectId: project.id },
    orderBy: { position: "asc" },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  res.json(saved);
});

/** POST /api/production/projects/:key/schedule — "Munkamenet kiadása": create
 * board Tasks from every not-yet-issued epic step. */
projectsRouter.post("/projects/:key/schedule", validateBody(scheduleSchema), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { key: req.params.key } });
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { schedDays } = req.body as { schedDays?: boolean[] };
  const result = await issueSession(project.id, schedDays);
  logger.info({ key: project.key, ...result }, "session issued to board");
  res.json(result);
});

/** GET/PUT /api/production/projects/:key/sheets/:kind — quantities / cutting-list /
 * hardware sub-sheets. Kept as free-form JSON — see schema.prisma comment. */
projectsRouter.get("/projects/:key/sheets/:kind", async (req, res) => {
  const kind = projectSheetKindSchema.parse(req.params.kind);
  const project = await prisma.project.findUniqueOrThrow({ where: { key: req.params.key } });
  const sheet = await prisma.projectSheet.findUnique({ where: { projectId_kind: { projectId: project.id, kind } } });
  res.json(sheet?.data ?? null);
});

projectsRouter.put("/projects/:key/sheets/:kind", async (req, res) => {
  const kind = projectSheetKindSchema.parse(req.params.kind);
  const project = await prisma.project.findUniqueOrThrow({ where: { key: req.params.key } });
  const sheet = await prisma.projectSheet.upsert({
    where: { projectId_kind: { projectId: project.id, kind } },
    create: { projectId: project.id, kind, data: req.body },
    update: { data: req.body },
  });
  res.json(sheet.data);
});
