import { describe, expect, it } from "vitest";
import { revisionContentHash } from "../src/services/orderRevisionHash.js";

function revisionWithEvidence(evidence: Record<string, unknown>) {
  return {
    revision: 1,
    customerName: "Teszt ügyfél",
    customerAddress: null,
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    deliveryAddress: null,
    expectedDelivery: null,
    plannedStart: null,
    priority: 0,
    notes: "",
    intakeStage: "TECHNICAL_PREPARATION",
    positions: [],
    documents: [],
    manufacturedItems: [],
    supplementaryItems: [{
      id: "item-id",
      orderRevisionId: "revision-id",
      entryMode: "SOURCE_REVIEW",
      state: "VERIFIED",
      category: "OTHER",
      code: null,
      name: "Forrástétel",
      quantity: null,
      unit: null,
      calculatedQuantity: null,
      calculatedUnit: null,
      notes: "",
      manualReason: null,
      createdByRole: "technical_preparation",
      reviewedByRole: "order_approver",
      reviewResolution: "Ellenőrizve.",
      reviewedAt: new Date("2026-07-30T12:00:00.000Z"),
      createdAt: new Date("2026-07-30T10:00:00.000Z"),
      updatedAt: new Date("2026-07-30T12:00:00.000Z"),
      evidence: [evidence],
    }],
  };
}

function revisionWithManufacturedEvidence(evidence?: Record<string, unknown>) {
  return {
    ...revisionWithEvidence(legacyEvidence),
    supplementaryItems: [],
    manufacturedItems: [{
      id: "manufactured-id",
      orderRevisionId: "revision-id",
      kind: "WALL_PANEL",
      code: "FP-01",
      name: "Falpanel",
      quantity: 1,
      workKind: "STANDARD",
      state: "VERIFIED",
      notes: "",
      resolution: "Ellenőrizve.",
      reviewedByRole: "technical_preparation",
      reviewedAt: new Date("2026-07-30T12:00:00.000Z"),
      createdAt: new Date("2026-07-30T10:00:00.000Z"),
      updatedAt: new Date("2026-07-30T12:00:00.000Z"),
      ...(evidence ? { evidence: [evidence] } : {}),
    }],
  };
}

const legacyEvidence = {
  id: "evidence-id",
  supplementaryItemId: "item-id",
  orderDocumentId: null,
  sourceRoot: "LEGACY_2026",
  relativePath: "Teszt/Forras.pdf",
  page: 1,
  row: 2,
  field: "QUANTITY",
  rawValue: "5",
  normalizedValue: 5,
  confidence: null,
  reviewState: "RESOLVED",
  createdAt: new Date("2026-07-30T10:00:00.000Z"),
};

const linkedDocument = {
  id: "document-id",
  orderRevisionId: "revision-id",
  documentFamilyKey: "family-sales-order",
  supersedesDocumentId: null,
  source: "LEGACY_FOLDER",
  kind: "SALES_ORDER",
  displayName: "Megrendelés.pdf",
  relativePath: "Teszt/Megrendeles.pdf",
  driveId: null,
  itemId: null,
  versionId: "v1",
  contentSha256: "a".repeat(64),
  createdAt: new Date("2026-07-30T09:00:00.000Z"),
};

function revisionWithPositionLineage(overrides: Record<string, unknown> = {}) {
  return {
    ...revisionWithEvidence(legacyEvidence),
    supplementaryItems: [],
    documents: [linkedDocument],
    positions: [{
      id: "position-id",
      orderRevisionId: "revision-id",
      position: 0,
      code: "01",
      name: "Beltéri ajtó",
      quantity: 1,
      technicalNotes: "",
      notes: "",
      evidence: [{
        id: "position-evidence-id",
        orderPositionId: "position-id",
        orderDocumentId: linkedDocument.id,
        orderDocument: linkedDocument,
        sourceRoot: "sales",
        relativePath: linkedDocument.relativePath,
        sheet: null,
        page: 1,
        row: null,
        field: "OPENING_WIDTH_MM",
        rawValue: "900 mm",
        normalizedValue: 900,
        confidence: 0.9,
        reviewState: "RESOLVED",
        resolution: "A felmérési lappal egyezik.",
        createdByRole: "technical_preparation",
        reviewedByPrincipal: "doorstar-user:reviewer-1",
        reviewedByRole: "technical_preparation",
        reviewedAt: new Date("2026-07-30T11:00:00.000Z"),
        createdAt: new Date("2026-07-30T10:00:00.000Z"),
        updatedAt: new Date("2026-07-30T11:00:00.000Z"),
        ...overrides,
      }],
      documentLinks: [{
        id: "position-link-id",
        orderDocumentId: linkedDocument.id,
        orderPositionId: "position-id",
        orderDocument: linkedDocument,
        createdAt: new Date("2026-07-30T10:30:00.000Z"),
      }],
    }],
  };
}

describe("revisionContentHash supplementary evidence compatibility", () => {
  it("matches the deployed legacy v1 envelope exactly", () => {
    expect(revisionContentHash(revisionWithEvidence(legacyEvidence), 1)).toBe(
      "8b492c9b1ddf0553f9e11b6004e343e6df10051e46785797cc3626751240d48d",
    );
  });

  it("does not invalidate v1 approvals when new evidence audit columns appear", () => {
    const legacyHash = revisionContentHash(revisionWithEvidence(legacyEvidence), 1);
    const { createdAt, ...evidenceBeforeNewColumns } = legacyEvidence;
    const migratedHash = revisionContentHash(revisionWithEvidence({
      ...evidenceBeforeNewColumns,
      resolution: "A forrássor ellenőrizve.",
      createdByRole: "legacy_migration",
      reviewedByRole: "technical_preparation",
      reviewedAt: new Date("2026-07-30T11:00:00.000Z"),
      createdAt,
    }), 1);
    expect(migratedHash).toBe(legacyHash);
  });

  it("covers the evidence decision state in v2", () => {
    const resolvedHash = revisionContentHash(revisionWithEvidence(legacyEvidence), 2);
    const reviewHash = revisionContentHash(revisionWithEvidence({
      ...legacyEvidence,
      reviewState: "REVIEW",
    }), 2);
    expect(reviewHash).not.toBe(resolvedHash);
  });

  it("binds evidence reviewer provenance in every new v2 approval", () => {
    const resolvedHash = revisionContentHash(revisionWithEvidence({
      ...legacyEvidence,
      resolution: "A forrássor ellenőrizve.",
      createdByRole: "technical_preparation",
      reviewedByRole: "technical_preparation",
      reviewedAt: new Date("2026-07-30T11:00:00.000Z"),
    }), 2);
    const changedReviewerHash = revisionContentHash(revisionWithEvidence({
      ...legacyEvidence,
      resolution: "A forrássor ellenőrizve.",
      createdByRole: "technical_preparation",
      reviewedByRole: "order_approver",
      reviewedAt: new Date("2026-07-30T11:00:00.000Z"),
    }), 2);
    expect(changedReviewerHash).not.toBe(resolvedHash);
  });

  it("preserves historical v1 manufactured hashes that predate evidence loading", () => {
    const withoutLoadedEvidence = revisionContentHash(
      revisionWithManufacturedEvidence(),
      1,
    );
    const withNewlyLoadedEvidence = revisionContentHash(
      revisionWithManufacturedEvidence({
        id: "manufactured-evidence-id",
        manufacturedItemId: "manufactured-id",
        reviewState: "RESOLVED",
        resolution: "Ellenőrizve.",
        reviewedByRole: "technical_preparation",
        reviewedAt: new Date("2026-07-30T11:00:00.000Z"),
      }),
      1,
    );
    expect(withNewlyLoadedEvidence).toBe(withoutLoadedEvidence);
  });

  it("preserves historical v1/v2 hashes when position lineage relations are newly loaded", () => {
    const loaded = revisionWithPositionLineage();
    const unloaded = {
      ...loaded,
      positions: loaded.positions.map(({ evidence: _evidence, documentLinks: _links, ...position }) => position),
    };
    expect(revisionContentHash(loaded, 1)).toBe(revisionContentHash(unloaded, 1));
    expect(revisionContentHash(loaded, 2)).toBe(revisionContentHash(unloaded, 2));
  });

  it("binds the reviewer principal and final decision in hash-v3", () => {
    const baseline = revisionContentHash(revisionWithPositionLineage(), 3);
    expect(revisionContentHash(revisionWithPositionLineage({
      reviewedByPrincipal: "doorstar-user:reviewer-2",
    }), 3)).not.toBe(baseline);
    expect(revisionContentHash(revisionWithPositionLineage({
      reviewState: "REJECTED",
    }), 3)).not.toBe(baseline);
  });

  it("binds exact document-position membership in hash-v3", () => {
    const linked = revisionWithPositionLineage();
    const unlinked = {
      ...linked,
      positions: linked.positions.map(({ documentLinks: _links, ...position }) => ({
        ...position,
        documentLinks: [],
      })),
    };
    expect(revisionContentHash(unlinked, 3)).not.toBe(revisionContentHash(linked, 3));
  });
});
