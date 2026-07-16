import { Router, type Request } from "express";
import { prisma } from "../db/client.js";
import { validateBody } from "../middleware/validate.js";
import { createTaskSchema, updateTaskSchema, addCommentSchema, addImageSchema } from "../domain/schemas.js";
import { logger } from "../logger.js";
import { loadWorkflows, taskVM } from "./board.js";

export const tasksRouter = Router();

/** Not real auth (this is a login-less shop-floor tool) — just reads the
 * same X-Role/X-Station headers the frontend sends from uiStore, so the
 * server enforces the same "Vezető vs. Állomás" rule the UI does instead of
 * trusting the client alone. */
function getRequester(req: Request): { role: string; station: string } {
  const role = req.header("x-role");
  return { role: role ?? "vezeto", station: req.header("x-station") ?? "" };
}

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
  const { role, station: myStation } = getRequester(req);

  const current = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { epicStep: { select: { station: true } } },
  });
  if (!current) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  if (role !== "vezeto") {
    // A station operator may only touch a task that is unassigned or
    // already theirs, and may only claim work onto their own station —
    // mirrors the mock's canTouchSel/dropTo/onPick role checks.
    if (current.station !== null && current.station !== myStation) {
      res.status(403).json({ error: "not_your_station", station: current.station });
      return;
    }
    if (typeof patch.station === "string" && patch.station !== myStation) {
      res.status(403).json({ error: "not_your_station", station: patch.station });
      return;
    }
  }

  if (typeof patch.station === "string") {
    // Claiming a free-pool task (current station is null) must go to the
    // station its EpicStep was actually planned for, if it has one — a
    // station cannot pick up another station's designated work. Reassigning
    // an already-assigned task (dispatcher override on the Board) is
    // untouched by this check.
    const designated = current.epicStep?.station ?? null;
    if (current.station === null && designated && designated !== patch.station) {
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
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      images: true,
      audit: { orderBy: { at: "desc" } },
      epicStep: { select: { quantity: true, unitHours: true } },
      project: { select: { name: true, num: true } },
    },
  });
  if (!task) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const vm = await taskVM(task, await loadWorkflows());
  res.json({
    ...vm,
    comments: task.comments,
    images: task.images,
    audit: task.audit,
    epicStep: task.epicStep ? { quantity: task.epicStep.quantity, unitHours: task.epicStep.unitHours } : null,
    project: task.project ? { name: task.project.name, num: task.project.num } : null,
  });
});

tasksRouter.post("/tasks/:id/comments", validateBody(addCommentSchema), async (req, res) => {
  const { text } = req.body as { text: string };
  const comment = await prisma.taskComment.create({ data: { taskId: req.params.id, text } });
  res.status(201).json(comment);
});

/** POST /api/production/tasks/:id/images — attach a photo (client sends an
 * already-downscaled/compressed JPEG data URI; see TaskDetailModal). */
tasksRouter.post("/tasks/:id/images", validateBody(addImageSchema), async (req, res) => {
  const { url } = req.body as { url: string };
  const image = await prisma.taskImage.create({ data: { taskId: req.params.id, url } });
  res.status(201).json(image);
});

tasksRouter.delete("/images/:id", async (req, res) => {
  await prisma.taskImage.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
