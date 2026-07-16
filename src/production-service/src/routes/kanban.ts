import { Router } from "express";
import { prisma } from "../db/client.js";
import { resolveFlow } from "../domain/taskStatus.js";
import { DEFAULT_WORKFLOW } from "../config/stations.js";
import { monday } from "../domain/dates.js";
import { loadWorkflows, taskVM } from "./board.js";

export const kanbanRouter = Router();

/**
 * GET /api/production/kanban?station=CNC&week=... — the three kanban lanes
 * for one station: newly-assigned-not-started, the shared weekly pool
 * ("Szabad feladatok"), and the station's own workflow columns. Uses the
 * same taskVM as the board so status/isDone/flowLabel/depDone are computed
 * consistently everywhere a task appears.
 */
kanbanRouter.get("/kanban", async (req, res) => {
  const station = typeof req.query.station === "string" ? req.query.station : null;
  const week = typeof req.query.week === "string" ? req.query.week : monday(new Date());

  if (!station) {
    res.status(400).json({ error: "station_required" });
    return;
  }

  const workflows = await loadWorkflows();
  const flow = resolveFlow(station, workflows);

  const [assignedRaw, poolRaw, stationTasksRaw] = await Promise.all([
    prisma.task.findMany({
      where: { station, week, stepIndex: 0, acknowledged: false },
      include: { project: { select: { num: true } } },
    }),
    prisma.task.findMany({
      where: { station: null, week },
      include: { epicStep: { select: { station: true } }, project: { select: { num: true } } },
    }),
    prisma.task.findMany({
      where: { station, week, NOT: { AND: [{ stepIndex: 0 }, { acknowledged: false }] } },
      include: { project: { select: { num: true } } },
    }),
  ]);

  const assigned = await Promise.all(assignedRaw.map((t) => taskVM(t, workflows)));
  // A pool task planned from an EpicStep carries that step's station as its
  // "designated" station — only that station (or a station-less free task)
  // should be able to claim it. Prevents e.g. Fújó picking up a CNC-only step.
  const pool = await Promise.all(
    poolRaw.map(async ({ epicStep, ...task }) => ({
      ...(await taskVM(task, workflows)),
      designatedStation: epicStep?.station ?? null,
    }))
  );
  const stationTasks = await Promise.all(stationTasksRaw.map((t) => taskVM(t, workflows)));

  const columns = flow.map((name, index) => ({
    name,
    isTerminal: index === flow.length - 1,
    tasks: stationTasks.filter((t) => Math.min(t.stepIndex, flow.length - 1) === index),
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

/** PUT /api/production/kanban/:station/workflow — add/rename a station's
 * kanban columns. Safe without reflow: appending a column doesn't shift
 * existing positions, and renaming doesn't touch stored stepIndex values
 * (Task references a column by position, not name). */
kanbanRouter.put("/kanban/:station/workflow", async (req, res) => {
  const { steps } = req.body as { steps: string[] };
  const row = await prisma.stationWorkflow.upsert({
    where: { station: req.params.station },
    create: { station: req.params.station, steps },
    update: { steps },
  });
  res.json(row);
});

/** DELETE /api/production/kanban/:station/workflow/:index — remove one
 * column. Mirrors the mock's canDelete rule (not the first/last column,
 * and at least 2 remain), and reflows every task at this station whose
 * stepIndex pointed past the removed column so nothing silently jumps to
 * the wrong step. */
kanbanRouter.delete("/kanban/:station/workflow/:index", async (req, res) => {
  const station = req.params.station;
  const index = Number(req.params.index);

  const workflowRow = await prisma.stationWorkflow.findUnique({ where: { station } });
  const current = (workflowRow?.steps as string[] | undefined) ?? DEFAULT_WORKFLOW;

  if (!Number.isInteger(index) || index <= 0 || index >= current.length - 1 || current.length <= 2) {
    res.status(400).json({ error: "cannot_delete_column" });
    return;
  }

  const steps = current.filter((_, i) => i !== index);
  await prisma.$transaction([
    prisma.stationWorkflow.upsert({ where: { station }, create: { station, steps }, update: { steps } }),
    prisma.task.updateMany({ where: { station, stepIndex: { gt: index } }, data: { stepIndex: { decrement: 1 } } }),
  ]);

  res.json({ station, steps });
});
