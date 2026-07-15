import { Router } from "express";
import { prisma } from "../db/client.js";
import { resolveFlow, markerStatus, isDone } from "../domain/taskStatus.js";
import { monday } from "../domain/dates.js";

export const kanbanRouter = Router();

/**
 * GET /api/production/kanban?station=CNC&week=... — the three kanban lanes
 * for one station: newly-assigned-not-started, the shared weekly pool
 * ("Szabad feladatok"), and the station's own workflow columns.
 */
kanbanRouter.get("/kanban", async (req, res) => {
  const station = typeof req.query.station === "string" ? req.query.station : null;
  const week = typeof req.query.week === "string" ? req.query.week : monday(new Date());

  if (!station) {
    res.status(400).json({ error: "station_required" });
    return;
  }

  const workflowRow = await prisma.stationWorkflow.findUnique({ where: { station } });
  const flow = resolveFlow(station, new Map(workflowRow ? [[station, workflowRow.steps as string[]]] : []));

  const [assigned, pool, stationTasks] = await Promise.all([
    prisma.task.findMany({ where: { station, week, stepIndex: 0, acknowledged: false } }),
    prisma.task.findMany({ where: { station: null, week } }),
    prisma.task.findMany({ where: { station, week, NOT: { AND: [{ stepIndex: 0 }, { acknowledged: false }] } } }),
  ]);

  const columns = flow.map((name, index) => ({
    name,
    isTerminal: index === flow.length - 1,
    tasks: stationTasks
      .filter((t) => Math.min(t.stepIndex, flow.length - 1) === index)
      .map((t) => ({ ...t, status: markerStatus(t, flow), isDone: isDone(t, flow) })),
  }));

  res.json({
    station,
    week,
    flow,
    assigned,
    pool,
    columns,
  });
});

/** PUT /api/production/kanban/:station/workflow — rename/reorder a station's kanban columns. */
kanbanRouter.put("/kanban/:station/workflow", async (req, res) => {
  const { steps } = req.body as { steps: string[] };
  const row = await prisma.stationWorkflow.upsert({
    where: { station: req.params.station },
    create: { station: req.params.station, steps },
    update: { steps },
  });
  res.json(row);
});
