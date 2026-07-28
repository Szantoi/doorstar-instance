/**
 * Platform-neutral compatibility reference for Doorstar dependency semantics.
 * The future C# planner resolves these bounds through working calendars and
 * finite capacity. This module does not schedule or reserve any resource.
 */

export type DependencyType = "FS" | "SS" | "FF" | "SF";
export type DependencyBoundSource = "fixed_override" | "partial_release" | "dependency";
export type DependencyBoundWarning = "partial_release_delays_fs_start";

export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
  type: string;
  lagMinutes?: number;
  /** Legacy partial-start percentage; calendar-aware release calculation is external. */
  releaseThresholdPercent?: number;
}

export interface PlannedOperationNode { id: string; }

export type DependencyGraphIssueCode =
  | "blank_operation_id"
  | "duplicate_operation_id"
  | "unknown_predecessor"
  | "unknown_successor"
  | "self_dependency"
  | "invalid_dependency_type"
  | "invalid_lag"
  | "invalid_release_threshold"
  | "duplicate_dependency"
  | "circular_dependency";

export interface DependencyGraphIssue { code: DependencyGraphIssueCode; edge?: DependencyEdge; operationId?: string; }
export interface DependencyGraphValidation { issues: DependencyGraphIssue[]; topologicalOrder: string[] | null; }

export interface ResolvedDependencyBounds {
  earliestStartMinute?: number;
  earliestFinishMinute?: number;
  startSource?: DependencyBoundSource;
  finishSource?: DependencyBoundSource;
  /** A planner-facing explanation, not a local scheduling decision. */
  warnings?: readonly DependencyBoundWarning[];
}

export interface DependencyBoundInput {
  type: DependencyType;
  predecessorStartMinute: number;
  predecessorFinishMinute: number;
  lagMinutes?: number;
  /** Calculated by the calendar engine from the legacy release percentage. */
  partialReleaseMinute?: number;
  fixedStartMinute?: number;
  fixedFinishMinute?: number;
}

const DEPENDENCY_TYPES = new Set<DependencyType>(["FS", "SS", "FF", "SF"]);

function hasText(value: string): boolean { return value.trim().length > 0; }
function isMinute(value: number | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }

/**
 * Resolves one dependency's lower bound. The time scale is a normalized minute
 * timeline, not a JavaScript Date: calendar/DST conversion is authoritative in
 * the C# service. Legacy precedence is fixed start, partial release, then
 * FS/SS start dependency; fixed finish, then FF/SF finish dependency.
 */
export function resolveLegacyDependencyBounds(input: DependencyBoundInput): ResolvedDependencyBounds {
  const values = [input.predecessorStartMinute, input.predecessorFinishMinute, input.lagMinutes ?? 0];
  if (!values.every(Number.isFinite)) throw new Error("dependency minutes must be finite");
  if (input.predecessorFinishMinute < input.predecessorStartMinute) throw new Error("predecessor finish precedes start");
  if (input.partialReleaseMinute !== undefined && !isMinute(input.partialReleaseMinute)) throw new Error("partialReleaseMinute must be finite");
  if (input.fixedStartMinute !== undefined && !isMinute(input.fixedStartMinute)) throw new Error("fixedStartMinute must be finite");
  if (input.fixedFinishMinute !== undefined && !isMinute(input.fixedFinishMinute)) throw new Error("fixedFinishMinute must be finite");

  const lag = input.lagMinutes ?? 0;
  const dependencyStart = input.type === "FS" ? input.predecessorFinishMinute + lag : input.type === "SS" ? input.predecessorStartMinute + lag : undefined;
  const dependencyFinish = input.type === "FF" ? input.predecessorFinishMinute + lag : input.type === "SF" ? input.predecessorStartMinute + lag : undefined;
  const earliestStartMinute = input.fixedStartMinute ?? input.partialReleaseMinute ?? dependencyStart;
  const earliestFinishMinute = input.fixedFinishMinute ?? dependencyFinish;
  const warnings: DependencyBoundWarning[] = [];
  if (
    input.fixedStartMinute === undefined
    && input.type === "FS"
    && input.partialReleaseMinute !== undefined
    && input.partialReleaseMinute > dependencyStart!
  ) {
    warnings.push("partial_release_delays_fs_start");
  }

  return {
    earliestStartMinute,
    earliestFinishMinute,
    startSource: input.fixedStartMinute !== undefined ? "fixed_override" : input.partialReleaseMinute !== undefined ? "partial_release" : dependencyStart !== undefined ? "dependency" : undefined,
    finishSource: input.fixedFinishMinute !== undefined ? "fixed_override" : dependencyFinish !== undefined ? "dependency" : undefined,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** Validates the complete dependency network before any scheduling run. */
export function validateDependencyGraph(nodes: readonly PlannedOperationNode[], edges: readonly DependencyEdge[]): DependencyGraphValidation {
  const issues: DependencyGraphIssue[] = [];
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!hasText(node.id)) issues.push({ code: "blank_operation_id", operationId: node.id });
    else if (nodeIds.has(node.id)) issues.push({ code: "duplicate_operation_id", operationId: node.id });
    else nodeIds.add(node.id);
  }

  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.predecessorId)) issues.push({ code: "unknown_predecessor", edge });
    if (!nodeIds.has(edge.successorId)) issues.push({ code: "unknown_successor", edge });
    if (edge.predecessorId === edge.successorId) issues.push({ code: "self_dependency", edge });
    if (!DEPENDENCY_TYPES.has(edge.type as DependencyType)) issues.push({ code: "invalid_dependency_type", edge });
    if (edge.lagMinutes !== undefined && !Number.isFinite(edge.lagMinutes)) issues.push({ code: "invalid_lag", edge });
    if (edge.releaseThresholdPercent !== undefined && (!Number.isFinite(edge.releaseThresholdPercent) || edge.releaseThresholdPercent <= 0 || edge.releaseThresholdPercent > 1)) issues.push({ code: "invalid_release_threshold", edge });
    const key = `${edge.predecessorId}\u0000${edge.successorId}\u0000${edge.type}`;
    if (edgeKeys.has(key)) issues.push({ code: "duplicate_dependency", edge }); else edgeKeys.add(key);
  }
  if (issues.length) return { issues, topologicalOrder: null };

  const successors = new Map<string, string[]>();
  const incoming = new Map<string, number>([...nodeIds].map((id) => [id, 0]));
  for (const edge of edges) {
    successors.set(edge.predecessorId, [...(successors.get(edge.predecessorId) ?? []), edge.successorId]);
    incoming.set(edge.successorId, (incoming.get(edge.successorId) ?? 0) + 1);
  }
  const queue = [...nodeIds].filter((id) => incoming.get(id) === 0).sort();
  const topologicalOrder: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    topologicalOrder.push(current);
    for (const successor of successors.get(current) ?? []) {
      const count = (incoming.get(successor) ?? 0) - 1;
      incoming.set(successor, count);
      if (count === 0) { queue.push(successor); queue.sort(); }
    }
  }
  if (topologicalOrder.length !== nodeIds.size) return { issues: [{ code: "circular_dependency" }], topologicalOrder: null };
  return { issues: [], topologicalOrder };
}
