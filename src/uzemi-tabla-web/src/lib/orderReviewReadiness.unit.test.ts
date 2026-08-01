import { describe, expect, it } from "vitest";
import { buildOrderReviewReadiness } from "./orderReviewReadiness";

const completeEvidence = {
  reviewState: "RESOLVED" as const,
  resolution: "A dokumentummal egyezik.",
  reviewedByRole: "technical_preparation",
  reviewedAt: "2026-07-30T10:00:00.000Z",
};

describe("order review readiness", () => {
  it("reports all open review work", () => {
    const readiness = buildOrderReviewReadiness({
      documentCount: 1,
      positionCount: 2,
      feedbackStates: ["OPEN"],
      evidenceStates: ["RESOLVED", "REVIEW"],
      manufacturedItems: [{ state: "CANDIDATE", evidence: [] }],
      supplementaryItems: [{ state: "REVIEW", entryMode: "SOURCE_REVIEW", evidence: [] }],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.openFeedbackCount).toBe(1);
    expect(readiness.unresolvedEvidenceCount).toBe(1);
    expect(readiness.pendingManufacturedItemCount).toBe(1);
    expect(readiness.pendingSupplementaryItemCount).toBe(1);
  });

  it("accepts fully audited verified source items and rejected parent items", () => {
    const readiness = buildOrderReviewReadiness({
      documentCount: 2,
      positionCount: 1,
      feedbackStates: ["RESOLVED"],
      evidenceStates: ["RESOLVED"],
      manufacturedItems: [
        { state: "VERIFIED", evidence: [completeEvidence] },
        { state: "REJECTED", evidence: [] },
      ],
      supplementaryItems: [
        { state: "VERIFIED", entryMode: "SOURCE_REVIEW", evidence: [completeEvidence] },
        { state: "VERIFIED", entryMode: "MANUAL", evidence: [] },
      ],
    });
    expect(readiness.ready).toBe(true);
  });

  it("keeps legacy VERIFIED parents with incomplete evidence audit fail-closed", () => {
    const readiness = buildOrderReviewReadiness({
      documentCount: 2,
      positionCount: 1,
      feedbackStates: ["RESOLVED"],
      evidenceStates: [],
      manufacturedItems: [{
        state: "VERIFIED",
        evidence: [{ ...completeEvidence, reviewedAt: null }],
      }],
      supplementaryItems: [{
        state: "VERIFIED",
        entryMode: "SOURCE_REVIEW",
        evidence: [{ ...completeEvidence, resolution: null }],
      }],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.pendingManufacturedItemCount).toBe(1);
    expect(readiness.pendingSupplementaryItemCount).toBe(1);
  });
});
