import { describe, expect, it } from "vitest";
import { addOrderDocumentSchema, createOrderRevisionSchema, createSalesIntakeSchema, updateOrderIntakeStageSchema } from "../src/domain/schemas.js";

const validDraft = {
  projectKey: "24181-aktiv-passzivhaz",
  customerName: "Minta ügyfél",
  positions: [{ code: "01", name: "Főbejárati ajtó", quantity: 2, openingWidthMm: 1000 }],
};

describe("order intake draft schema", () => {
  it("accepts a minimal draft with one position", () => {
    expect(createOrderRevisionSchema.parse(validDraft).positions).toHaveLength(1);
  });
  it("rejects a position without a stable code or positive quantity", () => {
    expect(() => createOrderRevisionSchema.parse({ ...validDraft, positions: [{ ...validDraft.positions[0], code: "", quantity: 0 }] })).toThrow();
  });
  it("requires a reason for a survey exception", () => {
    expect(() => updateOrderIntakeStageSchema.parse({ stage: "SURVEY_EXCEPTION_REVIEW" })).toThrow();
    expect(updateOrderIntakeStageSchema.parse({ stage: "SURVEY_EXCEPTION_REVIEW", exceptionReason: "Az ügyfél írásban igazolta a méreteket." }).stage).toBe("SURVEY_EXCEPTION_REVIEW");
  });
  it("accepts the survey process drivers and a new-project Sales intake", () => {
    const position = { ...validDraft.positions[0], productType: "Furnérozott", openingDirection: "Bal be", surface: "RAL 9016", wallTreatment: "WALL_PANEL" as const, glazing: "GLAZED" as const, glazingSpecification: "savmart 4 mm" };
    expect(createSalesIntakeSchema.parse({ ...validDraft, projectName: "Aktív és Passzívház Kft.", positions: [position] }).projectKey).toBe(validDraft.projectKey);
  });
  it("permits only a relative document reference and stable SharePoint identity", () => {
    expect(addOrderDocumentSchema.parse({ source: "LEGACY_FOLDER", kind: "SALES_ORDER", displayName: "Megrendelés", relativePath: "DSMR 24181/Megrendeles.pdf" }).source).toBe("LEGACY_FOLDER");
    expect(() => addOrderDocumentSchema.parse({ source: "LEGACY_FOLDER", kind: "SALES_ORDER", displayName: "Megrendelés", relativePath: "C:\\Users\\szant\\secret.pdf" })).toThrow();
    expect(() => addOrderDocumentSchema.parse({ source: "SHAREPOINT", kind: "DRAWING", displayName: "Rajz", relativePath: "Projekt/Rajz.pdf" })).toThrow();
  });
});
