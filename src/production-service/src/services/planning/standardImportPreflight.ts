/**
 * Validates Doorstar norm-time catalogue rows before an adapter submits them
 * to the SpaceOS C# Production Planning import API.
 *
 * This module deliberately has no HTTP or database dependency. A caller must
 * supply only an already-approved resource mapping and measurement unit; rows
 * that are incomplete or ambiguous remain quarantined for a human review.
 */

export interface SourceQualifier {
  key: string;
  value: string;
}

export interface DoorstarStandardCandidate {
  /** Stable source identity: task codes plus the immutable source row. */
  sourceStandardKey: string | null | undefined;
  operationType: string | null | undefined;
  minutesPerUnit: number | null | undefined;
  workforce: number | null | undefined;
  /** Approved Doorstar resource mapping, never inferred from a display label. */
  resourceKey: string | null | undefined;
  /** Explicit source unit, for example piece, m2, linear_metre or batch. */
  unit: string | null | undefined;
  /** Workbook revision plus sheet/row reference for auditability. */
  sourceRevision: string | null | undefined;
  qualifiers?: readonly SourceQualifier[] | null;
}

export type StandardImportQuarantineReason =
  | "missing_source_standard_key"
  | "missing_operation_type"
  | "invalid_minutes_per_unit"
  | "invalid_workforce"
  | "missing_resource_mapping"
  | "missing_unit"
  | "missing_source_revision"
  | "invalid_qualifier"
  | "duplicate_source_identity";

export interface QuarantinedStandardCandidate {
  candidate: DoorstarStandardCandidate;
  reasons: StandardImportQuarantineReason[];
}

export interface StandardImportPreflightResult {
  ready: DoorstarStandardCandidate[];
  quarantined: QuarantinedStandardCandidate[];
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function qualifiersAreValid(qualifiers: readonly SourceQualifier[] | null | undefined): boolean {
  return (qualifiers ?? []).every((qualifier) => hasText(qualifier.key) && hasText(qualifier.value));
}

/**
 * Creates a deterministic identity from the stable source key and the full
 * qualifier set. Label-only matching is intentionally absent: Doorstar has
 * several valid standards with the same operation label.
 */
/**
 * Stable adapter identity shared by standard and operation imports. This is
 * deliberately based on the source key plus context, never the display label.
 */
export function doorstarStandardSourceIdentity(candidate: Pick<DoorstarStandardCandidate, "sourceStandardKey" | "qualifiers">): string | undefined {
  if (!hasText(candidate.sourceStandardKey) || !qualifiersAreValid(candidate.qualifiers)) return undefined;

  const qualifierPart = (candidate.qualifiers ?? [])
    .map((qualifier) => `${qualifier.key.trim()}=${qualifier.value.trim()}`)
    .sort()
    .join("|");
  return `${candidate.sourceStandardKey.trim()}::${qualifierPart}`;
}

function validationReasons(candidate: DoorstarStandardCandidate): StandardImportQuarantineReason[] {
  const reasons: StandardImportQuarantineReason[] = [];
  if (!hasText(candidate.sourceStandardKey)) reasons.push("missing_source_standard_key");
  if (!hasText(candidate.operationType)) reasons.push("missing_operation_type");
  if (!isPositiveFinite(candidate.minutesPerUnit)) reasons.push("invalid_minutes_per_unit");
  if (!isPositiveFinite(candidate.workforce)) reasons.push("invalid_workforce");
  if (!hasText(candidate.resourceKey)) reasons.push("missing_resource_mapping");
  if (!hasText(candidate.unit)) reasons.push("missing_unit");
  if (!hasText(candidate.sourceRevision)) reasons.push("missing_source_revision");
  if (!qualifiersAreValid(candidate.qualifiers)) reasons.push("invalid_qualifier");
  return reasons;
}

/**
 * Splits a catalogue extract into import-ready and review-only records.
 * No persistence happens here, so a dry run is deterministic and non-mutating.
 */
export function preflightDoorstarStandardImport(
  candidates: readonly DoorstarStandardCandidate[]
): StandardImportPreflightResult {
  const identities = new Map<string, number>();
  for (const candidate of candidates) {
    const identity = doorstarStandardSourceIdentity(candidate);
    if (identity) identities.set(identity, (identities.get(identity) ?? 0) + 1);
  }

  const ready: DoorstarStandardCandidate[] = [];
  const quarantined: QuarantinedStandardCandidate[] = [];

  for (const candidate of candidates) {
    const reasons = validationReasons(candidate);
    const identity = doorstarStandardSourceIdentity(candidate);
    if (identity && (identities.get(identity) ?? 0) > 1) reasons.push("duplicate_source_identity");

    if (reasons.length > 0) quarantined.push({ candidate, reasons });
    else ready.push(candidate);
  }

  return { ready, quarantined };
}
