import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrderSupplementaryItem } from "@/services/production/types";
import { SupplementaryItemsPanel } from "./SupplementaryItemsPanel";

const sourceItem: OrderSupplementaryItem = {
  id: "supp-1",
  orderRevisionId: "rev-1",
  entryMode: "SOURCE_REVIEW",
  state: "REVIEW",
  category: "szegőléc",
  code: "SZ-01",
  name: "Tölgy szegőléc",
  quantity: 8,
  unit: "fm",
  calculatedQuantity: null,
  calculatedUnit: null,
  notes: "",
  manualReason: null,
  createdByRole: "import",
  reviewedByRole: null,
  reviewedAt: null,
  reviewResolution: null,
  evidence: [{
    id: "evidence-1",
    supplementaryItemId: "supp-1",
    orderDocumentId: "doc-1",
    sourceRoot: "01 - Megrendelés",
    relativePath: "DSMR 26148/Kalkuláció.xlsx",
    page: null,
    row: 18,
    field: "QUANTITY",
    rawValue: "8 fm",
    normalizedValue: 8,
    confidence: 0.91,
    reviewState: "REVIEW",
    resolution: null,
    createdByRole: "import",
    reviewedByRole: null,
    reviewedAt: null,
    createdAt: "2026-07-30T10:00:00.000Z",
  }],
  createdAt: "2026-07-30T10:00:00.000Z",
  updatedAt: "2026-07-30T10:00:00.000Z",
};

describe("SupplementaryItemsPanel", () => {
  it("keeps source items fail-closed until every evidence record is resolved", () => {
    const onReview = vi.fn(async () => undefined);
    const onReviewEvidence = vi.fn(async () => undefined);
    render(
      <SupplementaryItemsPanel
        items={[sourceItem]}
        canCreate={false}
        canReview
        canReviewEvidence
        pending={false}
        onCreate={async () => undefined}
        onReview={onReview}
        onReviewEvidence={onReviewEvidence}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Tétel-review indoklása *"), { target: { value: "Forrás ellenőrizve" } });
    expect(screen.getByText("8 fm → 8")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elfogadom" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Elutasítom" })).toHaveProperty("disabled", false);

    fireEvent.change(screen.getByLabelText("SZ-01 · QUANTITY döntési indoklása *"), {
      target: { value: "A dokumentum 18. sorával egyezik." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Evidence feloldása" }));
    expect(onReviewEvidence).toHaveBeenCalledWith(
      "supp-1",
      "evidence-1",
      "RESOLVED",
      "A dokumentum 18. sorával egyezik.",
    );
  });
});
