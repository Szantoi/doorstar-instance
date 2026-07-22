import { prisma } from "../db/client.js";
import { STATIONS, stageOf } from "../config/stations.js";
import { resolveFlow, isDone } from "../domain/taskStatus.js";

export interface DayLoad {
  day: number;
  hours: number;
  taskCount: number;
}

export interface StationLoad {
  station: string;
  cells: DayLoad[];
  totalHours: number;
  utilizationPct: number;
  overloadedDays: number[];
}

export interface LoadReport {
  week: string;
  hoursPerDay: number;
  stations: StationLoad[];
  bottlenecks: string[];
}

/**
 * Computes per-station/per-day workload for a week. Hours = quantity ×
 * unit-time when both are known on the task. Issued tasks start with a
 * snapshot of their originating EpicStep values; legacy cards fall back to
 * the source step. Otherwise the mock's 1h/task estimate applies. Completed
 * tasks don't count against capacity.
 */
export async function computeLoad(week: string, hoursPerDayOverride?: number): Promise<LoadReport> {
  const capacity = await prisma.capacitySetting.findUnique({ where: { id: "default" } });
  const hoursPerDay = hoursPerDayOverride ?? capacity?.hoursPerDay ?? 8;

  const workflowRows = await prisma.stationWorkflow.findMany();
  const workflows = new Map<string, string[]>(workflowRows.map((w) => [w.station, w.steps as string[]]));

  const tasks = await prisma.task.findMany({
    where: { week, station: { not: null } },
    include: { epicStep: true },
  });

  const stations = STATIONS.map((s) => s.key);
  const byStation = new Map<string, DayLoad[]>(
    stations.map((s) => [s, Array.from({ length: 7 }, (_, day) => ({ day, hours: 0, taskCount: 0 }))])
  );

  for (const task of tasks) {
    if (!task.station) continue;
    const flow = resolveFlow(task.station, workflows);
    if (isDone(task, flow)) continue;

    const qty = task.quantity ?? task.epicStep?.quantity ?? null;
    const unitHours = task.unitHours ?? task.epicStep?.unitHours ?? null;
    const hours = qty != null && unitHours != null ? qty * unitHours : 1;

    const cells = byStation.get(task.station);
    if (!cells) continue;
    cells[task.day].hours += hours;
    cells[task.day].taskCount += 1;
  }

  const bottlenecks: string[] = [];
  const stationLoads: StationLoad[] = stations.map((station) => {
    const cells = byStation.get(station)!;
    const totalHours = cells.reduce((sum, c) => sum + c.hours, 0);
    const capacityForWeek = hoursPerDay * 7;
    const utilizationPct = capacityForWeek > 0 ? Math.round((totalHours / capacityForWeek) * 100) : 0;
    const overloadedDays = cells.filter((c) => c.hours > hoursPerDay).map((c) => c.day);
    if (overloadedDays.length) {
      bottlenecks.push(`${station}: ${overloadedDays.length} túlterhelt nap ezen a héten`);
    }
    return { station, cells, totalHours, utilizationPct, overloadedDays };
  });

  return { week, hoursPerDay, stations: stationLoads, bottlenecks };
}

export function stageForStation(station: string) {
  return stageOf(station);
}
