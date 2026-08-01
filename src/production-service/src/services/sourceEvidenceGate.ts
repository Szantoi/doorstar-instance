export type ReviewedSourceEvidence = {
  reviewState: string;
  resolution: string | null;
  reviewedByRole: string | null;
  reviewedAt: Date | null;
};

export type SourceEvidenceResolutionSummary = {
  totalEvidence: number;
  resolvedEvidence: number;
  unresolvedEvidence: number;
  rejectedEvidence: number;
};

export type SourceDerivedRevision = {
  manufacturedItems: Array<{
    state: string;
    evidence: ReviewedSourceEvidence[];
  }>;
  supplementaryItems: Array<{
    entryMode: string;
    state: string;
    evidence: ReviewedSourceEvidence[];
  }>;
};

export const sourceEvidenceReviewerRoles = [
  "technical_preparation",
  "order_approver",
  // Temporary login-less compatibility: requireRole grants these identities
  // the same capability, so their persisted audit must remain consumable.
  "administrator",
  "vezeto",
] as const;

const sourceEvidenceReviewerRoleSet = new Set<string>(sourceEvidenceReviewerRoles);

/** Evidence decisions are one-way even for legacy rows whose historical
 * actor metadata is incomplete. Migrations reopen such rows deliberately. */
export function sourceEvidenceIsFinal(evidence: Pick<ReviewedSourceEvidence, "reviewState">) {
  return evidence.reviewState === "RESOLVED" || evidence.reviewState === "REJECTED";
}

export function sourceEvidenceHasCompleteResolvedDecision(evidence: ReviewedSourceEvidence) {
  return evidence.reviewState === "RESOLVED"
    && Boolean(evidence.resolution?.trim())
    && evidence.reviewedByRole !== null
    && sourceEvidenceReviewerRoleSet.has(evidence.reviewedByRole)
    && evidence.reviewedAt !== null;
}

export function summarizeSourceEvidence(
  evidence: ReviewedSourceEvidence[],
): SourceEvidenceResolutionSummary {
  const resolvedEvidence = evidence.filter(sourceEvidenceHasCompleteResolvedDecision).length;
  return {
    totalEvidence: evidence.length,
    resolvedEvidence,
    unresolvedEvidence: evidence.length - resolvedEvidence,
    rejectedEvidence: evidence.filter((item) => item.reviewState === "REJECTED").length,
  };
}

/** A source-derived item is eligible for verification/materialization only
 * when at least one evidence row exists and every row is completely resolved. */
export function sourceEvidenceIsReady(evidence: ReviewedSourceEvidence[]) {
  return evidence.length > 0 && evidence.every(sourceEvidenceHasCompleteResolvedDecision);
}

function manufacturedItemIsReady(item: SourceDerivedRevision["manufacturedItems"][number]) {
  return item.state === "REJECTED"
    || (item.state === "VERIFIED" && sourceEvidenceIsReady(item.evidence));
}

function supplementaryItemIsReady(item: SourceDerivedRevision["supplementaryItems"][number]) {
  return item.state === "REJECTED"
    || (
      item.state === "VERIFIED"
      && (item.entryMode !== "SOURCE_REVIEW" || sourceEvidenceIsReady(item.evidence))
    );
}

/** A component payload may intentionally omit a rejected or irrelevant item,
 * but it must never bypass an unresolved source-derived item on the approved
 * revision. Order review and downstream materialization therefore share this
 * aggregate-level predicate. */
export function sourceDerivedRevisionIsReady(revision: SourceDerivedRevision) {
  return revision.manufacturedItems.every(manufacturedItemIsReady)
    && revision.supplementaryItems.every(supplementaryItemIsReady);
}

export function summarizeSourceDerivedRevision(revision: SourceDerivedRevision) {
  const manufacturedItemsReady = revision.manufacturedItems.filter(manufacturedItemIsReady).length;
  const supplementaryItemsReady = revision.supplementaryItems.filter(supplementaryItemIsReady).length;
  return {
    manufacturedItems: {
      total: revision.manufacturedItems.length,
      ready: manufacturedItemsReady,
      unresolved: revision.manufacturedItems.length - manufacturedItemsReady,
    },
    supplementaryItems: {
      total: revision.supplementaryItems.length,
      ready: supplementaryItemsReady,
      unresolved: revision.supplementaryItems.length - supplementaryItemsReady,
    },
  };
}
