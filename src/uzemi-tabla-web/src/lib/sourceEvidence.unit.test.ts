import { describe, expect, it } from "vitest";
import {
  buildRevisionSourceReadiness,
  sourceEvidenceDecisionComplete,
  sourceEvidenceDecisionOpen,
  sourceEvidenceSetReady,
  type SourceEvidenceAuditRecord,
} from "./sourceEvidence";

const resolvedEvidence = (overrides: Partial<SourceEvidenceAuditRecord> = {}): SourceEvidenceAuditRecord => ({
  reviewState: "RESOLVED",
  resolution: "A forrásérték a dokumentummal egyezik.",
  reviewedByRole: "technical_preparation",
  reviewedAt: "2026-07-30T10:00:00.000Z",
  ...overrides,
});

describe("source evidence audit gate", () => {
  it("requires a complete resolved decision and at least one record", () => {
    expect(sourceEvidenceSetReady([])).toBe(false);
    expect(sourceEvidenceDecisionComplete(resolvedEvidence())).toBe(true);
    expect(sourceEvidenceSetReady([resolvedEvidence(), resolvedEvidence()])).toBe(true);
  });

  it("keeps legacy RESOLVED rows without audit metadata closed", () => {
    expect(sourceEvidenceDecisionComplete(resolvedEvidence({ resolution: null }))).toBe(false);
    expect(sourceEvidenceDecisionComplete(resolvedEvidence({ reviewedByRole: null }))).toBe(false);
    expect(sourceEvidenceDecisionComplete(resolvedEvidence({ reviewedAt: null }))).toBe(false);
  });

  it("only accepts backend-authorized evidence reviewer roles", () => {
    expect(sourceEvidenceDecisionComplete(resolvedEvidence({ reviewedByRole: "administrator" }))).toBe(true);
    expect(sourceEvidenceDecisionComplete(resolvedEvidence({ reviewedByRole: "vezeto" }))).toBe(true);
    expect(sourceEvidenceDecisionComplete(resolvedEvidence({ reviewedByRole: "sales" }))).toBe(false);
    expect(sourceEvidenceDecisionComplete(resolvedEvidence({ reviewedByRole: "import" }))).toBe(false);
  });

  it("only permits a decision for non-final evidence", () => {
    expect(sourceEvidenceDecisionOpen({ reviewState: "UNVERIFIED" })).toBe(true);
    expect(sourceEvidenceDecisionOpen({ reviewState: "REVIEW" })).toBe(true);
    expect(sourceEvidenceDecisionOpen({ reviewState: "RESOLVED" })).toBe(false);
    expect(sourceEvidenceDecisionOpen({ reviewState: "REJECTED" })).toBe(false);
  });

  it("matches the aggregate backend gate and counts parent items", () => {
    const readiness = buildRevisionSourceReadiness({
      manufacturedItems: [
        { state: "VERIFIED", evidence: [resolvedEvidence()] },
        { state: "VERIFIED", evidence: [resolvedEvidence({ reviewState: "REJECTED" })] },
        { state: "REJECTED", evidence: [] },
      ],
      supplementaryItems: [
        { state: "VERIFIED", entryMode: "MANUAL", evidence: [] },
        { state: "VERIFIED", entryMode: "SOURCE_REVIEW", evidence: [resolvedEvidence()] },
        { state: "REVIEW", entryMode: "SOURCE_REVIEW", evidence: [] },
      ],
    });

    expect(readiness).toEqual({
      manufacturedItems: { total: 3, ready: 2, unresolved: 1 },
      supplementaryItems: { total: 3, ready: 2, unresolved: 1 },
      ready: false,
    });
  });
});
