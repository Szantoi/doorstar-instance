/**
 * Doorstar adapter boundary for the materialised `Folyamat` Power Query
 * output. It turns an extracted, typed row into an operation draft only when
 * it can be traced to an approved standard. It contains neither Excel
 * formulas nor scheduling policy; the SpaceOS C# Planning API remains the
 * authority for calendar allocation and reservations.
 */

import {
  doorstarStandardSourceIdentity,
  type DoorstarStandardCandidate,
  type SourceQualifier,
} from "./standardImportPreflight.js";

export type DoorstarDependencyType = "FS" | "SS" | "FF" | "SF";

/** A row produced by the future Power Query extraction, not an Excel cell map. */
export interface DoorstarFolyamatOperationCandidate {
  /** Immutable source-row identity; it makes a re-import idempotent and auditable. */
  sourceOperationKey: string | null | undefined;
  /** Source work-order identity, not a customer name or display label. */
  sourceWorkOrderKey: string | null | undefined;
  /** Immutable revision of the Gyártásmegrendelő input used by the calculator. */
  sourceOrderRevision: string | null | undefined;
  /** Stable calculator-produced component identity, not a display label. */
  sourceComponentKey: string | null | undefined;
  /** Immutable calculator-output revision that produced the component dimensions. */
  sourceCalculatorRevision: string | null | undefined;
  sourceStandardKey: string | null | undefined;
  operationType: string | null | undefined;
  quantity: number | null | undefined;
  quantityUnit: string | null | undefined;
  sourceRevision: string | null | undefined;
  qualifiers?: readonly SourceQualifier[] | null;
  extraDays?: number | null | undefined;
  dependency?: {
    predecessorSourceOperationKey: string | null | undefined;
    type: string | null | undefined;
    lagWorkingDays?: number | null | undefined;
    releaseThresholdPercent?: number | null | undefined;
  } | null;
}

export interface DoorstarPlanningOperationDraft {
  sourceOperationKey: string;
  sourceWorkOrderKey: string;
  sourceOrderRevision: string;
  sourceComponentKey: string;
  sourceCalculatorRevision: string;
  sourceStandardKey: string;
  operationType: string;
  quantity: number;
  quantityUnit: string;
  sourceRevision: string;
  qualifiers: readonly SourceQualifier[];
  extraDays: number;
  dependency?: {
    predecessorSourceOperationKey: string;
    type: DoorstarDependencyType;
    lagWorkingDays: number;
    releaseThresholdPercent?: number;
  };
}

export type FolyamatOperationQuarantineReason =
  | "missing_source_operation_key"
  | "missing_source_work_order_key"
  | "missing_source_order_revision"
  | "missing_source_component_key"
  | "missing_source_calculator_revision"
  | "missing_source_standard_key"
  | "unknown_or_unapproved_standard"
  | "missing_operation_type"
  | "invalid_quantity"
  | "missing_quantity_unit"
  | "missing_source_revision"
  | "invalid_qualifier"
  | "invalid_extra_days"
  | "missing_dependency_predecessor"
  | "unknown_dependency_predecessor"
  | "invalid_dependency_type"
  | "invalid_dependency_lag"
  | "invalid_release_threshold"
  | "duplicate_source_operation_key";

export interface QuarantinedFolyamatOperation {
  candidate: DoorstarFolyamatOperationCandidate;
  reasons: FolyamatOperationQuarantineReason[];
}

export interface FolyamatOperationPreflightResult {
  ready: DoorstarPlanningOperationDraft[];
  quarantined: QuarantinedFolyamatOperation[];
}

const DEPENDENCY_TYPES = new Set<DoorstarDependencyType>(["FS", "SS", "FF", "SF"]);

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function qualifiersAreValid(qualifiers: readonly SourceQualifier[] | null | undefined): boolean {
  return (qualifiers ?? []).every((qualifier) => hasText(qualifier.key) && hasText(qualifier.value));
}

function standardIdentity(candidate: DoorstarFolyamatOperationCandidate): string | undefined {
  return doorstarStandardSourceIdentity({
    sourceStandardKey: candidate.sourceStandardKey,
    qualifiers: candidate.qualifiers,
  });
}

function dependencyReasons(candidate: DoorstarFolyamatOperationCandidate): FolyamatOperationQuarantineReason[] {
  if (!candidate.dependency) return [];
  const reasons: FolyamatOperationQuarantineReason[] = [];
  const { predecessorSourceOperationKey, type, lagWorkingDays, releaseThresholdPercent } = candidate.dependency;
  if (!hasText(predecessorSourceOperationKey)) reasons.push("missing_dependency_predecessor");
  if (!hasText(type) || !DEPENDENCY_TYPES.has(type as DoorstarDependencyType)) reasons.push("invalid_dependency_type");
  if (lagWorkingDays !== undefined && !isNonNegativeInteger(lagWorkingDays)) reasons.push("invalid_dependency_lag");
  if (releaseThresholdPercent !== undefined && (
    typeof releaseThresholdPercent !== "number"
    || !Number.isFinite(releaseThresholdPercent)
    || releaseThresholdPercent <= 0
    || releaseThresholdPercent > 1
  )) reasons.push("invalid_release_threshold");
  return reasons;
}

/**
 * Validates the full Power Query-to-operation boundary before a caller can
 * submit a batch to the platform. Missing or ambiguous data is quarantined;
 * this function does not invent a standard, quantity unit, or dependency.
 */
export function preflightDoorstarFolyamatOperationImport(
  candidates: readonly DoorstarFolyamatOperationCandidate[],
  approvedStandards: readonly DoorstarStandardCandidate[],
): FolyamatOperationPreflightResult {
  const approvedStandardIdentities = new Set(
    approvedStandards.map(doorstarStandardSourceIdentity).filter((identity): identity is string => identity !== undefined),
  );
  const sourceOperationKeys = new Map<string, number>();
  for (const candidate of candidates) {
    if (hasText(candidate.sourceOperationKey)) {
      const key = candidate.sourceOperationKey.trim();
      sourceOperationKeys.set(key, (sourceOperationKeys.get(key) ?? 0) + 1);
    }
  }

  const ready: DoorstarPlanningOperationDraft[] = [];
  const quarantined: QuarantinedFolyamatOperation[] = [];
  for (const candidate of candidates) {
    const reasons: FolyamatOperationQuarantineReason[] = [];
    if (!hasText(candidate.sourceOperationKey)) reasons.push("missing_source_operation_key");
    if (!hasText(candidate.sourceWorkOrderKey)) reasons.push("missing_source_work_order_key");
    if (!hasText(candidate.sourceOrderRevision)) reasons.push("missing_source_order_revision");
    if (!hasText(candidate.sourceComponentKey)) reasons.push("missing_source_component_key");
    if (!hasText(candidate.sourceCalculatorRevision)) reasons.push("missing_source_calculator_revision");
    if (!hasText(candidate.sourceStandardKey)) reasons.push("missing_source_standard_key");
    if (!hasText(candidate.operationType)) reasons.push("missing_operation_type");
    if (!isPositiveFinite(candidate.quantity)) reasons.push("invalid_quantity");
    if (!hasText(candidate.quantityUnit)) reasons.push("missing_quantity_unit");
    if (!hasText(candidate.sourceRevision)) reasons.push("missing_source_revision");
    if (!qualifiersAreValid(candidate.qualifiers)) reasons.push("invalid_qualifier");
    if (candidate.extraDays !== undefined && !isNonNegativeInteger(candidate.extraDays)) reasons.push("invalid_extra_days");
    const identity = standardIdentity(candidate);
    if (identity && !approvedStandardIdentities.has(identity)) reasons.push("unknown_or_unapproved_standard");
    reasons.push(...dependencyReasons(candidate));
    if (hasText(candidate.sourceOperationKey) && (sourceOperationKeys.get(candidate.sourceOperationKey.trim()) ?? 0) > 1) {
      reasons.push("duplicate_source_operation_key");
    }

    if (reasons.length > 0) {
      quarantined.push({ candidate, reasons });
      continue;
    }

    const dependency = candidate.dependency;
    ready.push({
      sourceOperationKey: candidate.sourceOperationKey!.trim(),
      sourceWorkOrderKey: candidate.sourceWorkOrderKey!.trim(),
      sourceOrderRevision: candidate.sourceOrderRevision!.trim(),
      sourceComponentKey: candidate.sourceComponentKey!.trim(),
      sourceCalculatorRevision: candidate.sourceCalculatorRevision!.trim(),
      sourceStandardKey: candidate.sourceStandardKey!.trim(),
      operationType: candidate.operationType!.trim(),
      quantity: candidate.quantity!,
      quantityUnit: candidate.quantityUnit!.trim(),
      sourceRevision: candidate.sourceRevision!.trim(),
      qualifiers: candidate.qualifiers ?? [],
      extraDays: candidate.extraDays ?? 0,
      dependency: dependency
        ? {
            predecessorSourceOperationKey: dependency.predecessorSourceOperationKey!.trim(),
            type: dependency.type!.trim() as DoorstarDependencyType,
            lagWorkingDays: dependency.lagWorkingDays ?? 0,
            ...(typeof dependency.releaseThresholdPercent === "number"
              ? { releaseThresholdPercent: dependency.releaseThresholdPercent }
              : {}),
          }
        : undefined,
    });
  }
  return { ready, quarantined };
}
