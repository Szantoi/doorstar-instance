import { describe, expect, it } from "vitest";
import {
  blankSalesPosition,
  centimetresToMillimetres,
  smallestAvailableSalesPositionCode,
  toSalesIntakeInput,
  type SalesIntakeDraft,
} from "./salesIntake";

function validDraft(): SalesIntakeDraft {
  return {
    projectKey: " DSMR-TEST-001 ",
    projectName: " Minta Megrendelő ",
    projectNum: " TEST-001 ",
    customerName: " Minta Megrendelő ",
    customerAddress: " 1111 Mintaváros, Próba utca 1. ",
    contactName: " Teszt Kapcsolattartó ",
    contactPhone: " +36 20 000 0000 ",
    contactEmail: " teszt@example.test ",
    deliveryAddress: " 1111 Mintaváros, Példa köz 2. ",
    priority: 0,
    deliveryExpectationPrecision: "DAY",
    expectedDelivery: "2026-09-18",
    expectedDeliveryMonth: "",
    notes: " Sales megjegyzés ",
    positions: [{
      ...blankSalesPosition("draft-p3", 3),
      code: " 03 ",
      name: " Háló ajtó ",
      quantity: 2,
      productType: " CPL beltéri ajtó ",
      openingDirection: " Bal be ",
      openingWidthCm: "81,5",
      openingHeightCm: " 211 ",
      openingDepthCm: "12.5",
      surface: " Minta CPL ",
      glazing: "GLAZED",
      glazingSpecification: " Savmart üveg ",
      notes: " P3 külön megjegyzés ",
    }],
  };
}

describe("centimetresToMillimetres", () => {
  it.each([
    ["81", 810],
    ["81,5", 815],
    ["81.5", 815],
    [" 211 ", 2110],
  ])("converts %s cm exactly to backend millimetres", (input, expected) => {
    expect(centimetresToMillimetres(input)).toEqual({ success: true, millimetres: expected });
  });

  it("maps an empty optional measurement to null", () => {
    expect(centimetresToMillimetres("   ")).toEqual({ success: true, millimetres: null });
  });

  it.each(["0", "-1", "abc", "81,2,3", "81.25"])("rejects %s without rounding or NaN", (input) => {
    const result = centimetresToMillimetres(input);
    expect(result.success).toBe(false);
    expect(result.millimetres).toBeNull();
  });
});

describe("toSalesIntakeInput", () => {
  it("trims source fields, emits mm, and excludes client and technical authority fields", () => {
    const result = toSalesIntakeInput(validDraft());
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.input).toEqual({
      projectKey: "DSMR-TEST-001",
      projectName: "Minta Megrendelő",
      projectNum: "TEST-001",
      customerName: "Minta Megrendelő",
      customerAddress: "1111 Mintaváros, Próba utca 1.",
      contactName: "Teszt Kapcsolattartó",
      contactPhone: "+36 20 000 0000",
      contactEmail: "teszt@example.test",
      deliveryAddress: "1111 Mintaváros, Példa köz 2.",
      expectedDelivery: "2026-09-18T00:00:00.000Z",
      priority: 0,
      notes: "Sales megjegyzés",
      positions: [{
        code: "03",
        name: "Háló ajtó",
        quantity: 2,
        productType: "CPL beltéri ajtó",
        openingDirection: "Bal be",
        openingWidthMm: 815,
        openingHeightMm: 2110,
        openingDepthMm: 125,
        surface: "Minta CPL",
        glazing: "GLAZED",
        glazingSpecification: "Savmart üveg",
        notes: "P3 külön megjegyzés",
      }],
    });
    expect(result.input.positions[0]).not.toHaveProperty("draftId");
    expect(result.input.positions[0]).not.toHaveProperty("doorTypeKey");
    expect(result.input.positions[0]).not.toHaveProperty("finishKey");
    expect(result.input.positions[0]).not.toHaveProperty("wallSolutionKey");
  });

  it("clears stale glazing specification for NONE", () => {
    const draft = validDraft();
    draft.positions[0].glazing = "NONE";
    const result = toSalesIntakeInput(draft);
    expect(result.success && result.input.positions[0].glazingSpecification).toBeNull();
  });

  it("blocks month precision until the union contract exists and permits unresolved null", () => {
    const monthDraft = validDraft();
    monthDraft.deliveryExpectationPrecision = "MONTH";
    monthDraft.expectedDeliveryMonth = "2026-09";
    const blocked = toSalesIntakeInput(monthDraft);
    expect(blocked.success).toBe(false);
    expect(blocked.errors.expectedDeliveryMonth).toContain("DELIVERY_EXPECTATION_CONTRACT_REQUIRED");

    monthDraft.deliveryExpectationPrecision = "UNRESOLVED";
    const unresolved = toSalesIntakeInput(monthDraft);
    expect(unresolved.success && unresolved.input.expectedDelivery).toBeNull();
  });

  it("blocks differing component appearances without adding an unsupported payload field", () => {
    const draft = validDraft();
    draft.positions[0].hasStructuredAppearanceDifferences = true;
    const result = toSalesIntakeInput(draft);
    expect(result.success).toBe(false);
    expect(result.errors["positions.draft-p3.hasStructuredAppearanceDifferences"]).toContain("STRUCTURED_APPEARANCE_CONTRACT_REQUIRED");
  });

  it("reports addressable validation errors instead of producing an unsafe payload", () => {
    const draft = validDraft();
    draft.projectKey = "";
    draft.contactEmail = "hibás";
    draft.positions[0].quantity = 0;
    draft.positions[0].openingWidthCm = "81.25";

    const result = toSalesIntakeInput(draft);
    expect(result.success).toBe(false);
    expect(result.input).toBeNull();
    expect(result.errors).toMatchObject({
      projectKey: expect.any(String),
      contactEmail: expect.any(String),
      "positions.draft-p3.quantity": expect.any(String),
      "positions.draft-p3.openingWidthCm": expect.any(String),
    });
  });

  it("marks every normalized duplicate position code", () => {
    const draft = validDraft();
    draft.positions = [
      { ...blankSalesPosition("draft-a", " a-01 "), name: "Első" },
      { ...blankSalesPosition("draft-b", "A-01"), name: "Második" },
    ];

    const result = toSalesIntakeInput(draft);
    expect(result.success).toBe(false);
    expect(result.errors).toMatchObject({
      "positions.draft-a.code": "A pozíciókódnak a revízión belül egyedinek kell lennie.",
      "positions.draft-b.code": "A pozíciókódnak a revízión belül egyedinek kell lennie.",
    });
  });
});

describe("smallestAvailableSalesPositionCode", () => {
  it("fills the first gap instead of deriving the code from list length", () => {
    const positions = [blankSalesPosition("one", "01"), blankSalesPosition("three", "03")];
    expect(smallestAvailableSalesPositionCode(positions)).toBe("02");
  });

  it("returns null when the explicit two-digit range is exhausted", () => {
    const positions = Array.from({ length: 99 }, (_, index) => blankSalesPosition(`draft-${index}`, index + 1));
    expect(smallestAvailableSalesPositionCode(positions)).toBeNull();
  });
});
