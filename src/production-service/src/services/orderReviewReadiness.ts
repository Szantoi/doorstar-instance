import type { ReviewedPositionEvidence } from "./positionEvidenceGate.js";
import {
  positionEvidenceRevisionIsReady,
  summarizePositionEvidence,
} from "./positionEvidenceGate.js";
import {
  sourceDerivedRevisionIsReady,
  type SourceDerivedRevision,
} from "./sourceEvidenceGate.js";

export type SurveyCompletionPosition = {
  id: string;
  productType: string | null;
  openingDirection: string | null;
  openingWidthMm: number | null;
  openingHeightMm: number | null;
  openingDepthMm: number | null;
  doorThicknessMm: number | null;
  surface: string | null;
  wallTreatment: string | null;
  glazing: string | null;
  glazingSpecification: string | null;
  doorTypeKey: string | null;
  wallSolutionKey: string | null;
  glassKey: string | null;
  evidence?: Array<ReviewedPositionEvidence & {
    orderDocument: { id: string; kind: string } | null;
  }>;
  documentLinks?: Array<{
    orderDocument: { id: string; kind: string };
  }>;
};

export const requiredSurveyPositionFields = [
  "productType",
  "openingDirection",
  "openingWidthMm",
  "openingHeightMm",
  "openingDepthMm",
  "doorThicknessMm",
  "surface",
  "wallTreatment",
  "glazing",
  "doorTypeKey",
  "wallSolutionKey",
  "glassKey",
] as const;

/** This is the single survey predicate used by stage transition, order review,
 * approval and the exact-revision readiness projection. */
export function surveyCompletionReadiness(
  positions: SurveyCompletionPosition[],
  documents: Array<{ id: string; kind: string }>,
) {
  const surveyDocumentIds = new Set(
    documents.filter((document) => document.kind === "SURVEY").map((document) => document.id),
  );
  const positionsMissingFields = positions.flatMap((position) => {
    const fields: string[] = requiredSurveyPositionFields.filter((field) => !position[field]);
    if (position.glazing === "GLAZED" && !position.glazingSpecification) {
      fields.push("glazingSpecification");
    }
    return fields.length > 0 ? [{ orderPositionId: position.id, fields }] : [];
  });
  const positionIdsMissingSurveyDocumentLink = positions
    .filter((position) => !(position.documentLinks ?? []).some((link) =>
      surveyDocumentIds.has(link.orderDocument.id)))
    .map((position) => position.id);
  const evidence = summarizePositionEvidence({ positions });
  const details = {
    positionCount: positions.length,
    surveyDocumentRequired: surveyDocumentIds.size === 0,
    positionsMissingFields,
    positionIdsMissingSurveyDocumentLink,
    positionEvidence: evidence,
  };
  return {
    ready: positions.length > 0
      && !details.surveyDocumentRequired
      && positionsMissingFields.length === 0
      && positionIdsMissingSurveyDocumentLink.length === 0
      && evidence.unresolvedEvidence === 0,
    details,
  };
}

/** An exact position link must point at the current member of its document
 * family. The version chain is already authoritative; this predicate only
 * rejects links whose target has an in-revision successor. */
export function documentVersionReadiness(
  positions: Array<{ documentLinks?: Array<{ orderDocument: { id: string } }> }>,
  documents: Array<{ id: string; supersedesDocumentId?: string | null }>,
) {
  const supersededVersionIds = new Set(
    documents.flatMap((document) => document.supersedesDocumentId ? [document.supersedesDocumentId] : []),
  );
  const linkedVersionIds = new Set(positions.flatMap((position) =>
    (position.documentLinks ?? []).map((link) => link.orderDocument.id)));
  const staleLinkedDocumentVersionIds = [...supersededVersionIds]
    .filter((id) => linkedVersionIds.has(id))
    .sort();
  return {
    ready: staleLinkedDocumentVersionIds.length === 0,
    details: {
      currentVersionIds: documents.filter((document) => !supersededVersionIds.has(document.id)).map((document) => document.id),
      supersededVersionIds: [...supersededVersionIds].sort(),
      staleLinkedDocumentVersionIds,
    },
  };
}

export type ReviewableRevision = {
  intakeStage: string;
  positions: SurveyCompletionPosition[] & Array<{
    evidence: Parameters<typeof positionEvidenceRevisionIsReady>[0]["positions"][number]["evidence"];
  }>;
  documents: Array<{ id: string; kind: string; supersedesDocumentId?: string | null }>;
  manufacturedItems: SourceDerivedRevision["manufacturedItems"];
  supplementaryItems: SourceDerivedRevision["supplementaryItems"];
};

/** Preserve the established review/approval error precedence. The read model
 * calls the same predicate and only expands its facts into structured gates. */
export function revisionReviewReadinessError(revision: ReviewableRevision) {
  if (!positionEvidenceRevisionIsReady(revision)) {
    return {
      error: "position_evidence_unresolved" as const,
      details: summarizePositionEvidence(revision),
    };
  }
  if (
    revision.intakeStage !== "TECHNICAL_PREPARATION"
    || !surveyCompletionReadiness(revision.positions, revision.documents).ready
    || !documentVersionReadiness(revision.positions, revision.documents).ready
    || !sourceDerivedRevisionIsReady(revision)
  ) {
    return { error: "review_readiness_incomplete" as const };
  }
  return null;
}
