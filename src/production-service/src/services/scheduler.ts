import { prisma } from "../db/client.js";
import { iso, monday } from "../domain/dates.js";

/** Working-day sequence starting today, honoring an optional weekday mask
 * (index 0=Monday..6=Sunday). An all-false / missing mask means every day
 * is a working day (mirrors the mock's `anyDay` fallback). */
function workingDays(mask: boolean[] | undefined, count: number): Date[] {
  const dates: Date[] = [];
  const anyDay = !!mask && mask.some(Boolean);
  const d = new Date(`${iso(new Date())}T00:00:00`);
  while (dates.length < count) {
    const dow = (d.getDay() + 6) % 7;
    if (!anyDay || mask![dow]) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

export interface IssueSessionResult {
  createdCount: number;
  skippedExisting: number;
}

/**
 * "Munkamenet kiadása" — walks every non-disabled epic/step of a project
 * that doesn't already have a Task on the board, assigns it a plan date
 * (existing locked planDate wins, otherwise the next free working day),
 * and creates a dependency-chained Task per step. Mirrors `schedule()` /
 * `planDates()` / `onBoard()` in the original design mock.
 */
export async function issueSession(
  projectId: string,
  schedDays: boolean[] | undefined
): Promise<IssueSessionResult> {
  const epics = await prisma.epic.findMany({
    where: { projectId, disabled: false },
    orderBy: { position: "asc" },
    include: { steps: { where: { disabled: false }, orderBy: { position: "asc" }, include: { tasks: true } } },
  });

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  let created = 0;
  let skipped = 0;

  for (const epic of epics) {
    const days = workingDays(schedDays, epic.steps.length + 1);
    let dayCursor = 0;
    let prevTaskId: string | null = null;

    for (const step of epic.steps) {
      const existing = step.tasks[0];
      if (existing) {
        prevTaskId = existing.id;
        skipped += 1;
        continue;
      }

      const planDate = step.planLocked && step.planDate ? step.planDate : days[Math.min(dayCursor, days.length - 1)];
      dayCursor += 1;

      const week = monday(planDate);
      const day = (planDate.getDay() + 6) % 7;

      // Explicit annotation breaks a circular-inference issue TS hits on
      // Task.create's return type because of the self-relation (dependsOn).
      const createdTask: { id: string } = await prisma.task.create({
        data: {
          projectId: project.id,
          epicStepId: step.id,
          epicName: epic.name,
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
      created += 1;
    }
  }

  return { createdCount: created, skippedExisting: skipped };
}
