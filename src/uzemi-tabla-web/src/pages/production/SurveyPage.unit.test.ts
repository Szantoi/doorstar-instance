import { describe, expect, it } from "vitest";
import {
  buildSurveyCompletionReadiness,
  missingSurveyFields,
  surveyPositionEvidenceDecisionComplete,
  type SurveyCompletionEvidenceInput,
  type SurveyCompletionInput,
} from "../../lib/surveyCompletion";

type SurveyInput = SurveyCompletionInput;

const completePosition = (): SurveyInput => ({
  doorTypeKey: "falc",
  openingDirection: "Bal be",
  surface: "Fóliás; fix: Magnolia; mozgó: Magnolia",
  wallSolutionKey: "none",
  glassKey: "none",
  openingWidthMm: 900,
  openingHeightMm: 2100,
  openingDepthMm: 110,
  doorThicknessMm: 40,
});

describe("survey completion", () => {
  it("does not invent completion when a required technical value is missing", () => {
    const position = completePosition();
    position.surface = null;
    position.openingDepthMm = null;

    expect(missingSurveyFields(position)).toEqual(["örökölt felületi forrásadat (nem strukturált kiosztás)", "kész falvastagság"]);
  });

  it("accepts a position only when every required field has an explicit value", () => {
    expect(missingSurveyFields(completePosition())).toEqual([]);
  });

  it("requires a survey source document linked to every position", () => {
    const positions = [
      { id: "position-1", ...completePosition(), evidence: [] },
      { id: "position-2", ...completePosition(), evidence: [] },
    ];

    const noSurveyDocument = buildSurveyCompletionReadiness(positions, [{ kind: "SALES_ORDER", positionLinks: [] }]);
    expect(noSurveyDocument.ready).toBe(false);
    expect(noSurveyDocument.blockers).toContain("Nincs felmérési forrásfájl rögzítve.");
    expect(noSurveyDocument.unlinkedPositionIds).toEqual(["position-1", "position-2"]);

    const partiallyLinked = buildSurveyCompletionReadiness(positions, [{ kind: "SURVEY", positionLinks: [{ orderPositionId: "position-1" }] }]);
    expect(partiallyLinked.ready).toBe(false);
    expect(partiallyLinked.unlinkedPositionIds).toEqual(["position-2"]);

    const fullyLinked = buildSurveyCompletionReadiness(positions, [{ kind: "SURVEY", positionLinks: positions.map((position) => ({ orderPositionId: position.id })) }]);
    expect(fullyLinked.ready).toBe(true);
  });

  it("fails closed when a resolved evidence row lacks attributable review audit", () => {
    const completeEvidence = (overrides: Partial<SurveyCompletionEvidenceInput> = {}): SurveyCompletionEvidenceInput => ({
      id: "evidence-1",
      reviewState: "RESOLVED",
      resolution: "A forráslappal összevetve.",
      reviewedByPrincipal: "user:reviewer-1",
      reviewedByRole: "technical_preparation",
      reviewedAt: "2026-07-31T20:00:00.000Z",
      ...overrides,
    });
    expect(surveyPositionEvidenceDecisionComplete(completeEvidence())).toBe(true);
    expect(surveyPositionEvidenceDecisionComplete(completeEvidence({ reviewedByPrincipal: null }))).toBe(false);
    expect(surveyPositionEvidenceDecisionComplete(completeEvidence({ reviewedByRole: "sales" }))).toBe(false);
    expect(surveyPositionEvidenceDecisionComplete(completeEvidence({ reviewedAt: null }))).toBe(false);

    const readiness = buildSurveyCompletionReadiness(
      [{ id: "position-1", ...completePosition(), evidence: [completeEvidence({ reviewedByPrincipal: undefined })] }],
      [{ kind: "SURVEY", positionLinks: [{ orderPositionId: "position-1" }] }],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.unresolvedEvidenceIds).toEqual(["evidence-1"]);
  });
});
