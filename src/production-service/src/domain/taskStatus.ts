import { DEFAULT_WORKFLOW } from "../config/stations.js";

export type MarkerStatus = "assigned" | "inprogress" | "done" | "problem";

export interface TaskLike {
  station: string | null;
  stepIndex: number;
  acknowledged: boolean;
  problem: boolean;
}

/** Resolves the kanban step-name sequence for a station, falling back to the
 * generic 3-step flow when no custom StationWorkflow row exists. */
export function resolveFlow(station: string | null, workflows: Map<string, string[]>): string[] {
  if (!station) return DEFAULT_WORKFLOW;
  return workflows.get(station) ?? DEFAULT_WORKFLOW;
}

export function isDone(task: TaskLike, flow: string[]): boolean {
  return !!task.station && task.stepIndex >= flow.length - 1;
}

/** Marker-pen status used for card color, matching the design system's
 * status vocabulary (narancs/kék/zöld/piros — see tokens/colors.css). */
export function markerStatus(task: TaskLike, flow: string[]): MarkerStatus {
  if (task.problem && !isDone(task, flow)) return "problem";
  if (!task.station) return "assigned";
  const step = Math.min(task.stepIndex, flow.length - 1);
  if (step === flow.length - 1) return "done";
  if (step === 0 && !task.acknowledged) return "assigned";
  return "inprogress";
}

export function currentStepName(task: TaskLike, flow: string[]): string | null {
  if (!task.station || task.stepIndex <= 0 || isDone(task, flow)) return null;
  return flow[Math.min(task.stepIndex, flow.length - 1)] ?? null;
}
