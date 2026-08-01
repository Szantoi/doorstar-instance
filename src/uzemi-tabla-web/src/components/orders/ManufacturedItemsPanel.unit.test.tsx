import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManufacturedItem } from "@/services/production/types";
import { ManufacturedItemsPanel } from "./ManufacturedItemsPanel";

const item: ManufacturedItem = {
  id: "manufactured-1",
  kind: "WALL_PANEL",
  code: "FP-01",
  name: "Előtéri falpanel",
  itemType: "Falpanel",
  componentName: null,
  quantity: 1,
  widthMm: 1200,
  heightMm: 2400,
  thicknessMm: 19,
  material: "MDF",
  surface: "CPL",
  colour: "Tölgy",
  pattern: null,
  workKind: "STANDARD",
  state: "REVIEW",
  notes: "",
  resolution: null,
  reviewedByRole: null,
  reviewedAt: null,
  relatedOrderPosition: null,
  evidence: [{
    id: "manufactured-evidence-1",
    manufacturedItemId: "manufactured-1",
    orderDocumentId: "document-1",
    field: "WIDTH_MM",
    rawValue: "1200",
    normalizedValue: 1200,
    sourceRoot: "01 - Megrendelés",
    relativePath: "DSMR 26148/Falpanel.xlsx",
    sheet: "Tételek",
    page: null,
    row: 12,
    confidence: 0.96,
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

describe("ManufacturedItemsPanel", () => {
  it("gates parent acceptance on complete evidence audit but keeps rejection available", () => {
    const onReview = vi.fn(async () => undefined);
    const onReviewEvidence = vi.fn(async () => undefined);
    render(
      <ManufacturedItemsPanel
        items={[item]}
        canReview
        canReviewEvidence
        pending={false}
        onReview={onReview}
        onReviewEvidence={onReviewEvidence}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Tétel-review indoklása *"), {
      target: { value: "A teljes tételt ellenőriztem." },
    });
    expect(screen.getByRole("button", { name: "Tétel elfogadása" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Elutasítás" })).toHaveProperty("disabled", false);

    fireEvent.change(screen.getByLabelText("FP-01 · WIDTH_MM döntési indoklása *"), {
      target: { value: "A rajzi mérettel egyezik." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Evidence feloldása" }));
    expect(onReviewEvidence).toHaveBeenCalledWith(
      "manufactured-1",
      "manufactured-evidence-1",
      "RESOLVED",
      "A rajzi mérettel egyezik.",
    );
  });
});
