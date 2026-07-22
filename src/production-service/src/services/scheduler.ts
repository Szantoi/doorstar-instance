import { prisma } from "../db/client.js";
import { monday } from "../domain/dates.js";

export interface IssueSessionResult {
  createdCount: number;
  skippedExisting: number;
  missingPlanDates: Array<{ epicId: string; epicName: string; stepId: string; stepName: string }>;
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
