/**
 * Presentation-only view model for a future generated C# Planning proposal.
 * It renders server-provided dates and relationships; it never calculates a
 * schedule, infers an edge, or changes capacity.
 */

export type VisualDependencyType = "FS" | "SS" | "FF" | "SF";
export type PlanningVisualStatus = "proposal" | "warning" | "published" | "blocked";

export interface PlanningVisualOperation {
  id: string;
  label: string;
  stage: string;
  scheduledStart: string;
  scheduledFinish: string;
  status: PlanningVisualStatus;
}

export interface PlanningVisualDependency {
  predecessorId: string;
  successorId: string;
  type: VisualDependencyType;
  lagMinutes: number;
  partialReleasePercent?: number;
}

export interface GanttBar {
  operation: PlanningVisualOperation;
  x: number;
  width: number;
}

export interface GraphNode { operation: PlanningVisualOperation; x: number; y: number; }
export interface GraphEdge { dependency: PlanningVisualDependency; from: GraphNode; to: GraphNode; label: string; }

const MIN_BAR_WIDTH = 12;
const STAGE_WIDTH = 235;
const ROW_HEIGHT = 90;

function milliseconds(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function dependencyLabel(dependency: PlanningVisualDependency): string {
  const lag = dependency.lagMinutes === 0 ? "" : dependency.lagMinutes > 0 ? ` +${dependency.lagMinutes} perc` : ` ${dependency.lagMinutes} perc`;
  const partial = dependency.partialReleasePercent == null ? "" : ` · részleges kiadás ${Math.round(dependency.partialReleasePercent * 100)}%`;
  return `${dependency.type}${lag}${partial}`;
}

/** Returns only valid server-provided intervals; invalid data stays out of a misleading chart. */
export function buildGanttBars(operations: readonly PlanningVisualOperation[], width: number): GanttBar[] {
  const intervals = operations
    .map((operation) => ({ operation, start: milliseconds(operation.scheduledStart), finish: milliseconds(operation.scheduledFinish) }))
    .filter((entry): entry is { operation: PlanningVisualOperation; start: number; finish: number } => entry.start !== undefined && entry.finish !== undefined && entry.finish > entry.start);
  if (!intervals.length) return [];

  const first = Math.min(...intervals.map((entry) => entry.start));
  const last = Math.max(...intervals.map((entry) => entry.finish));
  const span = Math.max(last - first, 1);
  return intervals.map(({ operation, start, finish }) => ({
    operation,
    x: ((start - first) / span) * width,
    width: Math.max(((finish - start) / span) * width, MIN_BAR_WIDTH),
  }));
}

/** Places operations by their server-provided stage, preserving input order inside a stage. */
export function buildDependencyGraph(operations: readonly PlanningVisualOperation[], dependencies: readonly PlanningVisualDependency[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const stages = [...new Set(operations.map((operation) => operation.stage))];
  const nodeRows = new Map<string, number>();
  const nodes = operations.map((operation) => {
    const stageIndex = stages.indexOf(operation.stage);
    const row = nodeRows.get(operation.stage) ?? 0;
    nodeRows.set(operation.stage, row + 1);
    return { operation, x: 120 + stageIndex * STAGE_WIDTH, y: 58 + row * ROW_HEIGHT };
  });
  const nodeById = new Map(nodes.map((node) => [node.operation.id, node]));
  const edges = dependencies.flatMap((dependency) => {
    const from = nodeById.get(dependency.predecessorId);
    const to = nodeById.get(dependency.successorId);
    return from && to ? [{ dependency, from, to, label: dependencyLabel(dependency) }] : [];
  });
  return { nodes, edges };
}

export function visualStatusColor(status: PlanningVisualStatus): string {
  return {
    proposal: "var(--marker-blue)",
    warning: "var(--marker-orange)",
    published: "var(--marker-green)",
    blocked: "var(--marker-red)",
  }[status];
}
