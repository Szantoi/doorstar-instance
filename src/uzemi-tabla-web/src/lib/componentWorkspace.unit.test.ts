import { describe, expect, it } from "vitest";
import {
  buildComponentSourceOptions,
  componentWorkspaceBlockers,
  createEmptyComponentDraft,
  toComponentRequirementInput,
  validateComponentDraft,
} from "./componentWorkspace";
import type { ComponentCalculatorProfile, ComponentSnapshot, ProductionOrderRevision } from "@/services/production/types";

const revision = (status: ProductionOrderRevision["status"] = "APPROVED"): ProductionOrderRevision => ({
  id: "revision-1",
  revision: 1,
  status,
  intakeStage: "TECHNICAL_PREPARATION",
  customerName: "Minta Kft.",
  customerAddress: null,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  deliveryAddress: null,
  expectedDelivery: null,
  plannedStart: null,
  priority: 0,
  notes: "",
  positions: [{
    id: "position-1",
    code: "P01",
    name: "Irodaajtó",
    quantity: 2,
    productType: "Beltéri ajtó",
    openingDirection: null,
    openingWidthMm: null,
    openingHeightMm: null,
    openingDepthMm: null,
    doorWidthMm: null,
    doorHeightMm: null,
    doorThicknessMm: null,
    surface: null,
    wallTreatment: null,
    glazing: null,
    glazingSpecification: null,
    doorTypeKey: null,
    finishKey: null,
    glassKey: null,
    hardwareKeys: [],
    wallSolutionKey: null,
    materialKey: null,
    machiningKeys: [],
    technicalNotes: "",
    notes: "",
    evidence: [],
  }],
  manufacturedItems: [{
    id: "manufactured-1",
    kind: "WALL_PANEL",
    code: "FP01",
    name: "Falpanel",
    itemType: null,
    componentName: null,
    quantity: 1,
    widthMm: null,
    heightMm: null,
    thicknessMm: null,
    material: null,
    surface: null,
    colour: null,
    pattern: null,
    workKind: "STANDARD",
    state: "REVIEW",
    notes: "",
    resolution: null,
    reviewedByRole: null,
    reviewedAt: null,
    relatedOrderPosition: null,
    evidence: [],
  }],
  supplementaryItems: [{
    id: "supplementary-1",
    orderRevisionId: "revision-1",
    entryMode: "MANUAL",
    state: "VERIFIED",
    category: "Vasalat",
    code: null,
    name: "Kilincs",
    quantity: 2,
    unit: "db",
    calculatedQuantity: null,
    calculatedUnit: null,
    notes: "",
    manualReason: "Megrendelői kérés",
    createdByRole: "sales",
    reviewedByRole: "order_approver",
    reviewedAt: "2026-07-30T10:00:00.000Z",
    reviewResolution: "Ellenőrizve",
    evidence: [],
    createdAt: "2026-07-30T09:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
  }],
  documents: [],
  audit: [],
  createdAt: "2026-07-30T09:00:00.000Z",
});

const profile: ComponentCalculatorProfile = {
  version: "doorstar-explicit-component-adapter/v1",
  label: "Explicit adapter",
  inputMode: "EXPLICIT_REVIEWED_OUTPUT",
  active: true,
  allowsFormulaExecution: false,
  allowsImplicitDefaults: false,
  cutPartDimensions: "FINISHED_AND_CUTTING_REQUIRED",
};

describe("component calculator workspace model", () => {
  it("links a source without inventing a component kind, quantity, material, or dimension", () => {
    const row = createEmptyComponentDraft("row-1", { kind: "ORDER_POSITION", id: "position-1" });
    expect(row).toMatchObject({
      requirementKind: "",
      quantity: "",
      materialKey: "",
      finishedDimensionsMm: { width: "", height: "", thickness: "" },
      cuttingDimensionsMm: { width: "", height: "", thickness: "" },
    });
  });

  it("keeps order positions selectable but blocks unverified standalone sources", () => {
    const sources = buildComponentSourceOptions(revision());
    expect(sources.find((item) => item.id === "position-1")?.available).toBe(true);
    expect(sources.find((item) => item.id === "manufactured-1")?.available).toBe(false);
    expect(sources.find((item) => item.id === "supplementary-1")?.available).toBe(true);
  });

  it("does not trust a VERIFIED manufactured item with unresolved evidence", () => {
    const sourceRevision = revision();
    sourceRevision.manufacturedItems[0] = {
      ...sourceRevision.manufacturedItems[0]!,
      state: "VERIFIED",
      evidence: [{
        id: "manufactured-evidence-1",
        manufacturedItemId: "manufactured-1",
        orderDocumentId: null,
        field: "QUANTITY",
        rawValue: "1",
        normalizedValue: 1,
        sourceRoot: "sales",
        relativePath: "order.xlsx",
        sheet: "Tételek",
        page: null,
        row: 8,
        confidence: 0.95,
        reviewState: "REVIEW",
        resolution: null,
        createdByRole: "import",
        reviewedByRole: null,
        reviewedAt: null,
        createdAt: "2026-07-30T09:00:00.000Z",
        updatedAt: "2026-07-30T09:00:00.000Z",
        orderDocument: null,
      }],
    };

    let source = buildComponentSourceOptions(sourceRevision).find((item) => item.id === "manufactured-1");
    expect(source?.available).toBe(false);
    expect(source?.unavailableReason).toContain("teljes, auditált RESOLVED");

    sourceRevision.manufacturedItems[0]!.evidence[0]!.reviewState = "RESOLVED";
    source = buildComponentSourceOptions(sourceRevision).find((item) => item.id === "manufactured-1");
    expect(source?.available).toBe(false);

    Object.assign(sourceRevision.manufacturedItems[0]!.evidence[0]!, {
      resolution: "A dokumentummal egyezik.",
      reviewedByRole: "technical_preparation",
      reviewedAt: "2026-07-30T10:00:00.000Z",
    });
    source = buildComponentSourceOptions(sourceRevision).find((item) => item.id === "manufactured-1");
    expect(source?.available).toBe(true);
  });

  it("keeps SOURCE_REVIEW supplementary items blocked until every evidence row is resolved", () => {
    const sourceRevision = revision();
    sourceRevision.supplementaryItems[0] = {
      ...sourceRevision.supplementaryItems[0]!,
      entryMode: "SOURCE_REVIEW",
      evidence: [{
        id: "supplementary-evidence-1",
        supplementaryItemId: "supplementary-1",
        orderDocumentId: null,
        sourceRoot: "sales",
        relativePath: "order.xlsx",
        page: null,
        row: 4,
        field: "quantity",
        rawValue: "2",
        normalizedValue: 2,
        confidence: 0.98,
        reviewState: "REVIEW",
        resolution: null,
        createdByRole: "import",
        reviewedByRole: null,
        reviewedAt: null,
        createdAt: "2026-07-30T09:00:00.000Z",
      }],
    };

    let source = buildComponentSourceOptions(sourceRevision).find((item) => item.id === "supplementary-1");
    expect(source?.available).toBe(false);
    expect(source?.unavailableReason).toContain("teljes, auditált RESOLVED");

    sourceRevision.supplementaryItems[0]!.evidence[0]!.reviewState = "RESOLVED";
    source = buildComponentSourceOptions(sourceRevision).find((item) => item.id === "supplementary-1");
    expect(source?.available).toBe(false);

    Object.assign(sourceRevision.supplementaryItems[0]!.evidence[0]!, {
      resolution: "A dokumentummal egyezik.",
      reviewedByRole: "order_approver",
      reviewedAt: "2026-07-30T10:00:00.000Z",
    });
    source = buildComponentSourceOptions(sourceRevision).find((item) => item.id === "supplementary-1");
    expect(source?.available).toBe(true);
  });

  it("requires explicit cut-part material and both complete dimension triples", () => {
    const sources = buildComponentSourceOptions(revision());
    const row = createEmptyComponentDraft("row-1", { kind: "ORDER_POSITION", id: "position-1" });
    Object.assign(row, {
      requirementKind: "CUT_PART",
      sourceComponentKey: "P01:door-leaf",
      componentKey: "door-leaf",
      name: "Ajtólap",
      quantity: "2",
      quantityUnit: "db",
    });
    expect(validateComponentDraft([row], sources).rowErrors["row-1"]).toContain("Gyártott alkatrészhez katalógusbeli anyag szükséges.");

    row.materialKey = "mdf-standard";
    row.finishedDimensionsMm = { width: "820", height: "2040", thickness: "40" };
    row.cuttingDimensionsMm = { width: "830", height: "2050", thickness: "42" };
    expect(validateComponentDraft([row], sources).valid).toBe(true);
    expect(toComponentRequirementInput(row)).toMatchObject({
      quantity: 2,
      materialKey: "mdf-standard",
      finishedDimensionsMm: { width: 820, height: 2040, thickness: 40 },
      cuttingDimensionsMm: { width: 830, height: 2050, thickness: 42 },
    });
  });

  it("rejects duplicate source-component keys before the immutable request", () => {
    const sources = buildComponentSourceOptions(revision());
    const first = createEmptyComponentDraft("row-1", { kind: "ORDER_POSITION", id: "position-1" });
    const second = createEmptyComponentDraft("row-2", { kind: "ORDER_POSITION", id: "position-1" });
    for (const row of [first, second]) {
      Object.assign(row, {
        requirementKind: "PURCHASED_PART",
        sourceComponentKey: "P01:handle",
        componentKey: "handle",
        name: "Kilincs",
        quantity: "1",
        quantityUnit: "db",
      });
    }
    expect(validateComponentDraft([first, second], sources).globalErrors[0]).toContain("nem lehet ismétlődő");
  });

  it("blocks a row if its standalone source loses VERIFIED state", () => {
    const sources = buildComponentSourceOptions(revision());
    const row = createEmptyComponentDraft("row-1", { kind: "MANUFACTURED_ITEM", id: "manufactured-1" });
    Object.assign(row, {
      requirementKind: "PURCHASED_PART",
      sourceComponentKey: "FP01:edge-profile",
      componentKey: "edge-profile",
      name: "Élzáró profil",
      quantity: "1",
      quantityUnit: "db",
    });

    expect(validateComponentDraft([row], sources).rowErrors["row-1"]).toContain(
      "A gyártott tétel állapota REVIEW; csak ellenőrzött forrás használható.",
    );
  });

  it("stays blocked for a draft revision and for an already materialized profile", () => {
    const draftBlockers = componentWorkspaceBlockers({
      revision: revision("DRAFT"),
      latestRevisionId: "revision-1",
      approvalHash: null,
      profile,
      snapshots: [],
      role: "technical_preparation",
      dependenciesReady: true,
    });
    expect(draftBlockers).toContain("A rendelési revízió még nincs jóváhagyva.");

    const immutableBlockers = componentWorkspaceBlockers({
      revision: revision(),
      latestRevisionId: "revision-1",
      approvalHash: "a".repeat(64),
      profile,
      snapshots: [{ calculatorProfileVersion: profile.version } as ComponentSnapshot],
      role: "production_planner",
      dependenciesReady: true,
    });
    expect(immutableBlockers).toContain("Ehhez a profilverzióhoz már létezik megváltoztathatatlan snapshot.");
  });

  it("blocks position-only composition while any source item in the revision is unresolved", () => {
    const sourceRevision = revision();
    const blockers = componentWorkspaceBlockers({
      revision: sourceRevision,
      latestRevisionId: sourceRevision.id,
      approvalHash: "a".repeat(64),
      profile,
      snapshots: [],
      role: "technical_preparation",
      dependenciesReady: true,
    });

    expect(blockers).toContain("A teljes revízió forrásauditja hiányos: 1 külön gyártott tétel.");
  });
});
