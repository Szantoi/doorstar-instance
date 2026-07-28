/**
 * Doorstar-side composition of the two Power Query materialisation
 * boundaries. It is deliberately a dry-run: it validates one source export
 * without scheduling, persistence, or an HTTP dependency on the platform.
 */
import {
  preflightDoorstarFolyamatOperationImport,
  type DoorstarFolyamatOperationCandidate,
  type DoorstarPlanningOperationDraft,
  type QuarantinedFolyamatOperation,
} from "./folyamatOperationPreflight.js";
import {
  preflightDoorstarStandardImport,
  type DoorstarStandardCandidate,
  type QuarantinedStandardCandidate,
} from "./standardImportPreflight.js";

export interface DoorstarPlanningImportBatch {
  /** Stable identity of one extracted Power Query export. */
  sourceBatchKey: string | null | undefined;
  /** Immutable revision or content fingerprint of that export. */
  sourceBatchRevision: string | null | undefined;
  standards: readonly DoorstarStandardCandidate[];
  operations: readonly DoorstarFolyamatOperationCandidate[];
}

export type PlanningImportBatchIssueCode =
  | "missing_source_batch_key"
  | "missing_source_batch_revision"
  | "unknown_dependency_predecessor";

export interface PlanningImportBatchIssue {
  code: PlanningImportBatchIssueCode;
  detail: string;
}

export interface DoorstarPlanningImportBatchPreflightResult {
  readyForPlatformHandoff: boolean;
  readyStandards: DoorstarStandardCandidate[];
  readyOperations: DoorstarPlanningOperationDraft[];
  quarantinedStandards: QuarantinedStandardCandidate[];
  quarantinedOperations: QuarantinedFolyamatOperation[];
  issues: PlanningImportBatchIssue[];
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Makes a batch reviewable as a single unit. Standards are preflighted first;
 * only their ready subset can qualify operations. A dependency must point to a
 * row in the same immutable export, so the future platform handoff cannot
 * silently create an open predecessor edge.
 */
export function preflightDoorstarPlanningImportBatch(
  batch: DoorstarPlanningImportBatch,
): DoorstarPlanningImportBatchPreflightResult {
  const issues: PlanningImportBatchIssue[] = [];
  if (!hasText(batch.sourceBatchKey)) {
    issues.push({ code: "missing_source_batch_key", detail: "A Power Query export needs a stable batch identity." });
  }
  if (!hasText(batch.sourceBatchRevision)) {
    issues.push({ code: "missing_source_batch_revision", detail: "A Power Query export needs an immutable batch revision or fingerprint." });
  }

  const standards = preflightDoorstarStandardImport(batch.standards);
  const operations = preflightDoorstarFolyamatOperationImport(batch.operations, standards.ready);
  const readyOperationKeys = new Set(operations.ready.map((operation) => operation.sourceOperationKey));
  const quarantinedOperations = [...operations.quarantined];
  const readyOperations: DoorstarPlanningOperationDraft[] = [];

  for (const operation of operations.ready) {
    const predecessor = operation.dependency?.predecessorSourceOperationKey;
    if (predecessor && !readyOperationKeys.has(predecessor)) {
      quarantinedOperations.push({
        candidate: batch.operations.find((candidate) => candidate.sourceOperationKey?.trim() === operation.sourceOperationKey)!,
        reasons: ["unknown_dependency_predecessor"],
      });
      issues.push({
        code: "unknown_dependency_predecessor",
        detail: `Operation ${operation.sourceOperationKey} references predecessor ${predecessor}, which is absent from or quarantined within this batch.`,
      });
      continue;
    }
    readyOperations.push(operation);
  }

  return {
    readyForPlatformHandoff: issues.length === 0
      && standards.quarantined.length === 0
      && quarantinedOperations.length === 0,
    readyStandards: standards.ready,
    readyOperations,
    quarantinedStandards: standards.quarantined,
    quarantinedOperations,
    issues,
  };
}
