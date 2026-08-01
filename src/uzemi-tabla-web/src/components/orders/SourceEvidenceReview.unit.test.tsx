import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceEvidenceReview } from "./SourceEvidenceReview";

afterEach(cleanup);

describe("SourceEvidenceReview", () => {
  it("submits an explicit audited decision for an open row", async () => {
    const onReview = vi.fn(async () => undefined);
    render(
      <SourceEvidenceReview
        label="Mennyiség"
        reviewState="REVIEW"
        resolution={null}
        createdByRole="import"
        reviewedByRole={null}
        reviewedAt={null}
        canReview
        pending={false}
        onReview={onReview}
      />,
    );

    fireEvent.change(screen.getByLabelText("Mennyiség döntési indoklása *"), {
      target: { value: "A dokumentum 18. sorával egyezik." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Evidence feloldása" }));

    expect(onReview).toHaveBeenCalledWith("RESOLVED", "A dokumentum 18. sorával egyezik.");
  });

  it("shows complete final audit metadata without editable controls", () => {
    render(
      <SourceEvidenceReview
        label="Mennyiség"
        reviewState="RESOLVED"
        resolution="A forrásérték helyes."
        createdByRole="import"
        reviewedByRole="order_approver"
        reviewedAt="2026-07-30T10:00:00.000Z"
        canReview
        pending={false}
        onReview={async () => undefined}
      />,
    );

    expect(screen.getByText("A forrásérték helyes.")).toBeTruthy();
    expect(screen.getByText("order_approver")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("marks legacy resolved rows with incomplete audit as blocked", () => {
    render(
      <SourceEvidenceReview
        label="Mennyiség"
        reviewState="RESOLVED"
        resolution={null}
        createdByRole="import"
        reviewedByRole={null}
        reviewedAt={null}
        canReview={false}
        pending={false}
        onReview={async () => undefined}
      />,
    );

    expect(screen.getByText("Hiányos történeti audit — felhasználásra zárolva.")).toBeTruthy();
  });
});
