import { Router } from "express";
import { prisma } from "../db/client.js";
import { stationNames } from "../config/stations.js";
import { resolveFlow, markerStatus, isDone, currentStepName } from "../domain/taskStatus.js";
import { monday } from "../domain/dates.js";
import { logger } from "../logger.js";

export const boardRouter = Router();

export async function loadWorkflows(): Promise<Map<string, string[]>> {
  const rows = await prisma.stationWorkflow.findMany();
  return new Map(rows.map((r) => [r.station, r.steps as string[]]));
}

export async function taskVM(
  task: Awaited<ReturnType<typeof prisma.task.findFirstOrThrow>> & { project?: { num: string | null } | null },
  workflows: Map<string, string[]>
) {
  const flow = resolveFlow(task.station, workflows);
  const dep = task.dependsOnId ? await prisma.task.findUnique({ where: { id: task.dependsOnId } }) : null;
  const depFlow = dep ? resolveFlow(dep.station, workflows) : [];
  const { project, ...rest } = task;
  return {
    ...rest,
    status: markerStatus(task, flow),
    isDone: isDone(task, flow),
    flowLabel: currentStepName(task, flow),
    depDone: !dep || isDone(dep, depFlow),
    dependsOnTitle: dep?.title ?? null,
    // The board groups by station/day, not project — the munkaszám on the
    // card itself is what tells a floor worker which order a card belongs
    // to. Matches the mock's card-title convention ("Megrendelő Munkaszám —
    // Epik · Lépés").
    projectNum: project?.num ?? null,
  };
}

/** GET /api/production/board?week=YYYY-MM-DD — all tasks + sidebar state for one week. */
boardRouter.get("/board", async (req, res) => {
  const week = typeof req.query.week === "string" ? req.query.week : monday(new Date());

  const [tasks, orders, note, workflows] = await Promise.all([
    prisma.task.findMany({
      where: { week },
      orderBy: [{ day: "asc" }, { createdAt: "asc" }],
      include: { project: { select: { num: true } } },
    }),
    prisma.orderChecklistItem.findMany({ orderBy: { position: "asc" } }),
    prisma.weekNote.findUnique({ where: { week } }),
    loadWorkflows(),
  ]);

  const vms = await Promise.all(tasks.map((t) => taskVM(t, workflows)));

  res.json({
    week,
    stations: stationNames(),
    tasks: vms,
    orders,
    infoNote: note?.text ?? "",
  });
});

/** PUT /api/production/week-note — upsert the free-text weekly info row. */
boardRouter.put("/week-note", async (req, res) => {
  const { week, text } = req.body as { week: string; text: string };
  const note = await prisma.weekNote.upsert({
    where: { week },
    create: { week, text },
    update: { text },
  });
  logger.info({ week }, "week note saved");
  res.json(note);
});

/** GET/POST/PATCH/DELETE /api/production/orders — board sidebar checklist. */
boardRouter.get("/orders", async (_req, res) => {
  res.json(await prisma.orderChecklistItem.findMany({ orderBy: { position: "asc" } }));
});

boardRouter.post("/orders", async (req, res) => {
  const { label } = req.body as { label: string };
  const count = await prisma.orderChecklistItem.count();
  const item = await prisma.orderChecklistItem.create({ data: { label, position: count } });
  res.status(201).json(item);
});

boardRouter.patch("/orders/:id", async (req, res) => {
  const item = await prisma.orderChecklistItem.update({ where: { id: req.params.id }, data: req.body });
  res.json(item);
});

boardRouter.delete("/orders/:id", async (req, res) => {
  await prisma.orderChecklistItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
