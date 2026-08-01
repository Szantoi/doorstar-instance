export interface SourceEvidenceAuditRecord {
  reviewState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED";
  resolution: string | null;
  reviewedByRole: string | null;
  reviewedAt: string | null;
}

interface ManufacturedSourceItemReadiness {
  state: "CANDIDATE" | "REVIEW" | "VERIFIED" | "REJECTED";
  evidence: SourceEvidenceAuditRecord[];
}

interface SupplementarySourceItemReadiness {
  state: "REVIEW" | "VERIFIED" | "REJECTED";
  entryMode: "MANUAL" | "SOURCE_REVIEW";
  evidence: SourceEvidenceAuditRecord[];
}

export interface SourceItemReadinessCounts {
  total: number;
  ready: number;
  unresolved: number;
}

export interface RevisionSourceReadiness {
  manufacturedItems: SourceItemReadinessCounts;
  supplementaryItems: SourceItemReadinessCounts;
  ready: boolean;
}

export const SOURCE_EVIDENCE_REVIEWER_ROLES = [
  "technical_preparation",
  "order_approver",
  "administrator",
  "vezeto",
] as const;

const sourceEvidenceReviewerRoles = new Set<string>(SOURCE_EVIDENCE_REVIEWER_ROLES);

/** Shared client-side mirror of the backend reviewer capability. The backend
 * remains authoritative; this helper only keeps fail-closed read models from
 * duplicating the temporary role allowlist. */
export function sourceEvidenceReviewerRoleAllowed(role: string | null | undefined) {
  return typeof role === "string" && sourceEvidenceReviewerRoles.has(role);
}

/** A final state alone is not proof of a completed human decision. Legacy
 * rows without the decision note, actor or timestamp remain fail-closed. */
export function sourceEvidenceDecisionComplete(evidence: SourceEvidenceAuditRecord) {
  return evidence.reviewState === "RESOLVED"
    && Boolean(evidence.resolution?.trim())
    && sourceEvidenceReviewerRoleAllowed(evidence.reviewedByRole)
    && Boolean(evidence.reviewedAt);
}

export function sourceEvidenceSetReady(evidence: SourceEvidenceAuditRecord[]) {
  return evidence.length > 0 && evidence.every(sourceEvidenceDecisionComplete);
}

/** Mirrors the backend aggregate component-source gate. Rejected parent items
 * are final and therefore ready; a VERIFIED source-derived item is ready only
 * when its required evidence audit is complete. Counts are parent-item counts,
 * never evidence-row counts. */
export function buildRevisionSourceReadiness(input: {
  manufacturedItems: ManufacturedSourceItemReadiness[];
  supplementaryItems: SupplementarySourceItemReadiness[];
}): RevisionSourceReadiness {
  const manufacturedReady = input.manufacturedItems.filter((item) =>
    item.state === "REJECTED"
    || (item.state === "VERIFIED" && sourceEvidenceSetReady(item.evidence))).length;
  const supplementaryReady = input.supplementaryItems.filter((item) =>
    item.state === "REJECTED"
    || (
      item.state === "VERIFIED"
      && (item.entryMode !== "SOURCE_REVIEW" || sourceEvidenceSetReady(item.evidence))
    )).length;
  const manufacturedItems = {
    total: input.manufacturedItems.length,
    ready: manufacturedReady,
    unresolved: input.manufacturedItems.length - manufacturedReady,
  };
  const supplementaryItems = {
    total: input.supplementaryItems.length,
    ready: supplementaryReady,
    unresolved: input.supplementaryItems.length - supplementaryReady,
  };
  return {
    manufacturedItems,
    supplementaryItems,
    ready: manufacturedItems.unresolved === 0 && supplementaryItems.unresolved === 0,
  };
}

export function sourceEvidenceDecisionOpen(evidence: Pick<SourceEvidenceAuditRecord, "reviewState">) {
  return evidence.reviewState === "UNVERIFIED" || evidence.reviewState === "REVIEW";
}
