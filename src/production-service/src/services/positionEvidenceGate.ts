import { sourceEvidenceReviewerRoles } from "./sourceEvidenceGate.js";

export type ReviewedPositionEvidence = {
  id: string;
  reviewState: string;
  resolution: string | null;
  reviewedByPrincipal: string | null;
  reviewedByRole: string | null;
  reviewedAt: Date | null;
};

const reviewerRoleSet = new Set<string>(sourceEvidenceReviewerRoles);

export function positionEvidenceIsFinal(
  evidence: Pick<ReviewedPositionEvidence, "reviewState">,
) {
  return evidence.reviewState === "RESOLVED" || evidence.reviewState === "REJECTED";
}

/** A position source is trustworthy only after a complete, attributable and
 * allowed RESOLVED decision. REJECTED and partially migrated final rows remain
 * blockers; no candidate value is applied automatically. */
export function positionEvidenceHasCompleteResolvedDecision(
  evidence: ReviewedPositionEvidence,
) {
  return evidence.reviewState === "RESOLVED"
    && Boolean(evidence.resolution?.trim())
    && Boolean(evidence.reviewedByPrincipal?.trim())
    && evidence.reviewedByRole !== null
    && reviewerRoleSet.has(evidence.reviewedByRole)
    && evidence.reviewedAt !== null;
}

export function positionEvidenceRevisionIsReady(revision: {
  positions: Array<{ evidence?: ReviewedPositionEvidence[] }>;
}) {
  return revision.positions.every((position) =>
    (position.evidence ?? []).every(positionEvidenceHasCompleteResolvedDecision));
}

export function summarizePositionEvidence(revision: {
  positions: Array<{ evidence?: ReviewedPositionEvidence[] }>;
}) {
  const rows = revision.positions.flatMap((position) => position.evidence ?? []);
  const resolvedEvidence = rows.filter(positionEvidenceHasCompleteResolvedDecision).length;
  return {
    totalEvidence: rows.length,
    resolvedEvidence,
    unresolvedEvidence: rows.length - resolvedEvidence,
    rejectedEvidence: rows.filter((evidence) => evidence.reviewState === "REJECTED").length,
    blockerEvidenceIds: rows
      .filter((evidence) => !positionEvidenceHasCompleteResolvedDecision(evidence))
      .map((evidence) => evidence.id),
  };
}
