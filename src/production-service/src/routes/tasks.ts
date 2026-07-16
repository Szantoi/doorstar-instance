import { Router } from "express";
import { prisma } from "../db/client.js";
import { validateBody } from "../middleware/validate.js";
import { createTaskSchema, updateTaskSchema, addCommentSchema } from "../domain/schemas.js";
import { logger } from "../logger.js";

export const tasksRouter = Router();

const AUDIT_LABELS: Record<string, string> = {
  station: "Áthelyezve",
  stepIndex: "Lépés léptetve",
  acknowledged: "Felvéve",
  problem: "Probléma jelzés",
};

function auditLabelFor(patch: Record<string, unknown>): string {
  const key = Object.keys(patch).find((k) => k in AUDIT_LABELS);
  return key ? AUDIT_LABELS[key] : "Frissítve";
}

/** POST /api/production/tasks — write a new free/pool task straight onto the board. */
tasksRouter.post("/tasks", validateBody(createTaskSchema), async (req, res) => {
  const body = req.body as {
    title: string;
    station?: string | null;
    week: string;
    day: number;
    urgent?: boolean;
    description?: string;
  };
  const task = await prisma.task.create({
    data: {
      title: body.title,
      station: body.station ?? null,
      week: body.week,
      day: body.day,
      urgent: body.urgent ?? false,
      description: body.description ?? "",
      audit: { create: [{ label: "Új feladat felírva" }] },
    },
  });
  logger.info({ taskId: task.id }, "task created");
  res.status(201).json(task);
});

/** PATCH /api/production/tasks/:id — move/update a card (drag-drop, pick-up, progress, problem flag, ...). */
tasksRouter.patch("/tasks/:id", validateBody(updateTaskSchema), async (req, res) => {
  const patch = req.body as Record<string, unknown>;

  if (typeof patch.station === "string") {
    // Claiming a free-pool task (current station is null) must go to the
    // station its EpicStep was actually planned for, if it has one — a
    // station cannot pick up another station's designated work. Reassigning
    // an already-assigned task (dispatcher override on the Board) is
    // untouched by this check.
    const current = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { epicStep: { select: { station: true } } },
    });
    const designated = current?.epicStep?.station ?? null;
    if (current && current.station === null && designated && designated !== patch.station) {
      res.status(400).json({ error: "station_mismatch", designatedStation: designated });
      return;
    }
  }

  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: {
      ...patch,
      audit: { create: [{ label: auditLabelFor(patch) }] },
    },
  });
  res.json(task);
});

tasksRouter.delete("/tasks/:id", async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

tasksRouter.get("/tasks/:id", async (req, res) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { comments: { orderBy: { createdAt: "asc" } }, images: true, audit: { orderBy: { at: "desc" } } },
  });
  if (!task) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(task);
});

tasksRouter.post("/tasks/:id/comments", validateBody(addCommentSchema), async (req, res) => {
  const { text } = req.body as { text: string };
  const comment = await prisma.taskComment.create({ data: { taskId: req.params.id, text } });
  res.status(201).json(comment);
});
