import { Router } from "express";
import { prisma } from "../db/client.js";
import { validateBody } from "../middleware/validate.js";
import { createTaskSchema, updateTaskSchema, addCommentSchema, addImageSchema } from "../domain/schemas.js";
import { logger } from "../logger.js";
import { loadWorkflows, taskVM } from "./board.js";
import { getRequester, requireManager } from "../middleware/requester.js";
import { findActiveProject } from "../services/projects.js";

export const tasksRouter = Router();

/** Not real auth (this is a login-less shop-floor tool) — just reads the
 * same X-Role/X-Station headers the frontend sends from uiStore, so the
 * server enforces the same "Vezető vs. Állomás" rule the UI does instead of
 * trusting the client alone. */
const AUDIT_LABELS: Record<string, string> = {
  projectKey: "Projekt hozzárendelés módosítva",
  epicId: "Epik hozzárendelés módosítva",
  quantity: "Mennyiség módosítva",
  unitHours: "Munkaidő módosítva",
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
  if (!requireManager(req, res)) return;
  const body = req.body as {
    title: string;
    projectKey?: string;
    station?: string | null;
    week: string;
    day: number;
    urgent?: boolean;
    description?: string;
  };
  const project = body.projectKey ? await findActiveProject(body.projectKey) : null;
  if (body.projectKey && !project) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const task = await prisma.task.create({
    data: {
      title: body.title,
      projectId: project?.id,
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
  const body = req.body as Record<string, unknown>;
  const { projectKey, epicId, ...patch } = body as Record<string, unknown> & {
    projectKey?: string | null;
    epicId?: string | null;
  };
  const { role, station: myStation } = getRequester(req);

  const current = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { epicStep: { select: { station: true } }, epic: { select: { projectId: true } } },
  });
  if (!current) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Project/epic association and capacity inputs are planning data, not
  // shop-floor execution state. Enforce the manager rule server-side too.
  const changesPlanning = projectKey !== undefined || epicId !== undefined || "quantity" in patch || "unitHours" in patch;
  if (changesPlanning && role !== "vezeto") {
    res.status(403).json({ error: "manager_role_required" });
    return;
  }

  // A work-sheet-issued task gets its project and epic from its EpicStep.
  // Letting the task point elsewhere would split one production step across
  // two projects. Free-standing board tasks are intentionally editable by
  // the manager and may link directly to an Epic.
  let projectId: string | null | undefined;
  let resolvedEpicId: string | null | undefined;
  let epicName: string | null | undefined;
  if (projectKey !== undefined || epicId !== undefined) {
    if (current.epicStepId) {
      res.status(409).json({ error: "issued_task_project_locked" });
      return;
    }
  }

  if (epicId !== undefined) {
    if (epicId === null) {
      resolvedEpicId = null;
      epicName = null;
    } else {
      const epic = await prisma.epic.findFirst({
        where: { id: epicId, disabled: false, project: { is: { deletedAt: null } } },
        include: { project: { select: { id: true, key: true } } },
      });
      if (!epic) {
        res.status(404).json({ error: "epic_not_found" });
        return;
      }
      if (projectKey !== undefined && projectKey !== epic.project.key) {
        res.status(400).json({ error: "epic_project_mismatch" });
        return;
      }
      resolvedEpicId = epic.id;
      epicName = epic.name;
      projectId = epic.project.id;
    }
  }

  if (projectKey !== undefined) {
    if (projectKey === null) {
      projectId = null;
    } else {
      const project = await findActiveProject(projectKey);
      if (!project) {
        res.status(404).json({ error: "project_not_found" });
        return;
      }
      projectId = project.id;
    }
    // Selecting another project deliberately clears the prior direct epic
    // when no explicit epic decision accompanies the request; otherwise a
    // task could retain an Epic from the old project. An explicit epicId:null
    // has already requested the same unlink above.
    if (epicId === undefined && current.epicId && projectId !== current.epic?.projectId) {
      resolvedEpicId = null;
      epicName = null;
    }
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
      ...(projectKey !== undefined || epicId !== undefined ? { projectId } : {}),
      ...(epicId !== undefined || resolvedEpicId !== undefined ? { epicId: resolvedEpicId, epicName } : {}),
      audit: { create: [{ label: auditLabelFor(body) }] },
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
      epic: { select: { id: true, name: true } },
      epicStep: { select: { quantity: true, unitHours: true, epic: { select: { id: true, name: true } } } },
      project: { select: { id: true, key: true, name: true, num: true } },
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
    epic: task.epic ?? task.epicStep?.epic ?? null,
    project: task.project
      ? { id: task.project.id, key: task.project.key, name: task.project.name, num: task.project.num }
      : null,
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
