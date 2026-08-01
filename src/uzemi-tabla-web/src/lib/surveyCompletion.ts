import { sourceEvidenceReviewerRoleAllowed } from "./sourceEvidence";

/** Minimum facts required before a survey may advance to technical preparation.
 * Missing values intentionally remain missing; this helper never supplies
 * defaults from source files, filenames, or client-side guesses. */
export interface SurveyCompletionInput {
  doorTypeKey: string | null;
  openingDirection: string | null;
  surface: string | null;
  wallSolutionKey: string | null;
  glassKey: string | null;
  openingWidthMm: number | null;
  openingHeightMm: number | null;
  openingDepthMm: number | null;
  doorThicknessMm: number | null;
}

const requiredFields: Array<[keyof SurveyCompletionInput, string]> = [
  ["doorTypeKey", "ajtótípus"], ["openingDirection", "örökölt nyitásmegadás"], ["surface", "örökölt felületi forrásadat (nem strukturált kiosztás)"], ["wallSolutionKey", "falmegoldás"], ["glassKey", "üvegezés"],
  ["openingWidthMm", "falnyílás szélessége"], ["openingHeightMm", "falnyílás magassága"], ["openingDepthMm", "kész falvastagság"], ["doorThicknessMm", "ajtólap-vastagság"],
];

export function missingSurveyFields(position: SurveyCompletionInput) {
  return requiredFields.filter(([field]) => position[field] == null || position[field] === "").map(([, label]) => label);
}

export interface SurveyCompletionEvidenceInput {
  id: string;
  reviewState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED";
  resolution: string | null;
  reviewedByPrincipal?: string | null;
  reviewedByRole?: string | null;
  reviewedAt?: string | null;
}

export interface SurveyCompletionPositionInput extends SurveyCompletionInput {
  id: string;
  evidence: SurveyCompletionEvidenceInput[];
}

export interface SurveyCompletionDocumentInput {
  kind: string;
  positionLinks?: Array<{ orderPositionId: string }>;
}

export interface SurveyCompletionReadiness {
  ready: boolean;
  blockers: string[];
  missingFieldPositionIds: string[];
  unlinkedPositionIds: string[];
  unresolvedEvidenceIds: string[];
  surveyDocumentCount: number;
}

/** Position evidence is trusted only with a complete, attributable RESOLVED
 * decision. Optional legacy audit fields therefore fail closed when absent. */
export function surveyPositionEvidenceDecisionComplete(evidence: SurveyCompletionEvidenceInput) {
  return evidence.reviewState === "RESOLVED"
    && Boolean(evidence.resolution?.trim())
    && Boolean(evidence.reviewedByPrincipal?.trim())
    && sourceEvidenceReviewerRoleAllowed(evidence.reviewedByRole)
    && Boolean(evidence.reviewedAt);
}

/** Derived UI pre-gate for survey finalisation. A SURVEY document reference
 * proves only that a source file is registered and linked to a position; it
 * does not assert that the file content itself has been reviewed. */
export function buildSurveyCompletionReadiness(
  positions: SurveyCompletionPositionInput[],
  documents: SurveyCompletionDocumentInput[],
): SurveyCompletionReadiness {
  const surveyDocuments = documents.filter((document) => document.kind === "SURVEY");
  const linkedPositionIds = new Set(surveyDocuments.flatMap((document) =>
    (document.positionLinks ?? []).map((link) => link.orderPositionId)));
  const missingFieldPositionIds = positions
    .filter((position) => missingSurveyFields(position).length > 0)
    .map((position) => position.id);
  const unlinkedPositionIds = positions
    .filter((position) => !linkedPositionIds.has(position.id))
    .map((position) => position.id);
  const unresolvedEvidenceIds = positions
    .flatMap((position) => position.evidence)
    .filter((evidence) => !surveyPositionEvidenceDecisionComplete(evidence))
    .map((evidence) => evidence.id);
  const blockers: string[] = [];

  if (positions.length === 0) blockers.push("Nincs felmérhető pozíció a revízióban.");
  if (missingFieldPositionIds.length > 0) blockers.push(`${missingFieldPositionIds.length} pozíció kötelező adatai hiányosak.`);
  if (surveyDocuments.length === 0) blockers.push("Nincs felmérési forrásfájl rögzítve.");
  if (unlinkedPositionIds.length > 0) blockers.push(`${unlinkedPositionIds.length} pozícióhoz nincs közvetlenül kapcsolt felmérési forrásfájl.`);
  if (unresolvedEvidenceIds.length > 0) blockers.push(`${unresolvedEvidenceIds.length} evidence-rekord ellenőrzése nincs teljesen, auditáltan lezárva.`);

  return {
    ready: blockers.length === 0,
    blockers,
    missingFieldPositionIds,
    unlinkedPositionIds,
    unresolvedEvidenceIds,
    surveyDocumentCount: surveyDocuments.length,
  };
}
