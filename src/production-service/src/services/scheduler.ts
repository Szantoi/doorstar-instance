import { prisma } from "../db/client.js";
import { monday } from "../domain/dates.js";
import { isDone, resolveFlow } from "../domain/taskStatus.js";
import { loadWorkflows } from "../routes/board.js";

export interface IssueSessionResult {
  createdCount: number;
  skippedExisting: number;
  missingPlanDates: Array<{ epicId: string; epicName: string; stepId: string; stepName: string }>;
}

export type IssueStepResult =
  | { outcome: "issued"; taskId: string }
  | { outcome: "already_issued"; taskId: string }
  | { outcome: "missing_plan_date" }
  | { outcome: "predecessor_not_issued"; predecessorStepId: string };

/**
 * Issues one work-sheet step without inventing a partial dependency chain.
 * A non-first active step can only be issued once its immediate active
 * predecessor is already on the board. This is deliberately narrower than
 * the all-or-nothing session publisher above.
 */
export async function issueStep(projectId: string, stepId: string): Promise<IssueStepResult> {
  const step = await prisma.epicStep.findFirst({
    where: { id: stepId, epic: { projectId, disabled: false }, disabled: false },
    include: { epic: { include: { steps: { where: { disabled: false }, orderBy: { position: "asc" }, include: { tasks: true } } } }, tasks: true },
  });
  if (!step) throw new Error("step_not_found");
  if (step.tasks[0]) return { outcome: "already_issued", taskId: step.tasks[0].id };
  if (!step.planDate) return { outcome: "missing_plan_date" };

  const index = step.epic.steps.findIndex((candidate) => candidate.id === step.id);
  const predecessor = index > 0 ? step.epic.steps[index - 1] : undefined;
  const predecessorTask = predecessor?.tasks[0];
  if (predecessor && !predecessorTask) return { outcome: "predecessor_not_issued", predecessorStepId: predecessor.id };

  const task = await prisma.task.create({
    data: {
      projectId,
      epicId: step.epicId,
      epicStepId: step.id,
      epicName: step.epic.name,
      quantity: step.quantity,
      unitHours: step.unitHours,
      title: `${step.epic.name} · ${step.name}`,
      station: step.station,
      week: monday(step.planDate),
      day: (step.planDate.getDay() + 6) % 7,
      dependsOnId: predecessorTask?.id ?? null,
      description: "",
      audit: { create: [{ label: "Egyedi lépésként kiadva a táblára" }] },
    },
  });
  return { outcome: "issued", taskId: task.id };
}

export type RevokeStepResult = { outcome: "revoked" } | { outcome: "not_issued" } | { outcome: "completed" } | { outcome: "dependent_exists"; dependentTaskId: string };

/** Removes only a reversible issued step; completed work and its successors stay auditable. */
export async function revokeStep(projectId: string, stepId: string): Promise<RevokeStepResult> {
  const task = await prisma.task.findFirst({ where: { projectId, epicStepId: stepId }, include: { dependent: true } });
  if (!task) return { outcome: "not_issued" };
  if (task.dependent) return { outcome: "dependent_exists", dependentTaskId: task.dependent.id };
  const workflows = await loadWorkflows();
  if (isDone(task, resolveFlow(task.station, workflows))) return { outcome: "completed" };
  await prisma.task.delete({ where: { id: task.id } });
  return { outcome: "revoked" };
}

/**
 * Publishes dependency-chained board tasks only for planned, non-disabled
 * work-sheet steps. The date check precedes every write, so a partly planned
 * work sheet can never publish a partial session.
 */
export async function issueSession(projectId: string): Promise<IssueSessionResult> {
  const epics = await prisma.epic.findMany({
    where: { projectId, disabled: false },
    orderBy: { position: "asc" },
    include: { steps: { where: { disabled: false }, orderBy: { position: "asc" }, include: { tasks: true } } },
  });

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const missingPlanDates = epics.flatMap((epic) =>
    epic.steps
      .filter((step) => !step.tasks.length && !step.planDate)
      .map((step) => ({ epicId: epic.id, epicName: epic.name, stepId: step.id, stepName: step.name }))
  );
  const skippedExisting = epics.reduce((count, epic) => count + epic.steps.filter((step) => step.tasks.length).length, 0);

  if (missingPlanDates.length) {
    return { createdCount: 0, skippedExisting, missingPlanDates };
  }

  let createdCount = 0;
  for (const epic of epics) {
    let prevTaskId: string | null = null;
    for (const step of epic.steps) {
      const existing = step.tasks[0];
      if (existing) {
        prevTaskId = existing.id;
        continue;
      }

      // The early validation guarantees the non-null date: no auto-scheduling.
      const planDate = step.planDate!;
      const week = monday(planDate);
      const day = (planDate.getDay() + 6) % 7;
      const createdTask: { id: string } = await prisma.task.create({
        data: {
          projectId: project.id,
          epicId: epic.id,
          epicStepId: step.id,
          epicName: epic.name,
          quantity: step.quantity,
          unitHours: step.unitHours,
          title: `${epic.name} · ${step.name}`,
          station: step.station,
          week,
          day,
          dependsOnId: prevTaskId,
          description: "",
          audit: { create: [{ label: "Kiadva a táblára" }] },
        },
      });
      prevTaskId = createdTask.id;
      createdCount += 1;
    }
  }

  return { createdCount, skippedExisting, missingPlanDates: [] };
}
