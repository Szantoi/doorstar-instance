import { describe, expect, it } from "vitest";
import { canApplyManufacturedItemImport, canCreateComponentSnapshot, canReviewComponentSnapshot, canReviewSourceEvidence } from "./roles";

describe("Doorstar role capabilities", () => {
  it("keeps manufactured-item import behind technical review roles", () => {
    expect(canApplyManufacturedItemImport("technical_preparation")).toBe(true);
    expect(canApplyManufacturedItemImport("order_approver")).toBe(true);
    expect(canApplyManufacturedItemImport("administrator")).toBe(true);
    expect(canApplyManufacturedItemImport("vezeto")).toBe(true);
    expect(canApplyManufacturedItemImport("sales")).toBe(false);
    expect(canApplyManufacturedItemImport("reader")).toBe(false);
    expect(canApplyManufacturedItemImport("installer")).toBe(false);
  });

  it("separates snapshot creation roles from independent snapshot reviewers", () => {
    expect(canCreateComponentSnapshot("technical_preparation")).toBe(true);
    expect(canCreateComponentSnapshot("order_approver")).toBe(true);
    expect(canCreateComponentSnapshot("production_planner")).toBe(true);
    expect(canCreateComponentSnapshot("administrator")).toBe(true);
    expect(canCreateComponentSnapshot("vezeto")).toBe(true);
    expect(canCreateComponentSnapshot("sales")).toBe(false);
    expect(canReviewComponentSnapshot("order_approver")).toBe(true);
    expect(canReviewComponentSnapshot("production_planner")).toBe(true);
    expect(canReviewComponentSnapshot("administrator")).toBe(true);
    expect(canReviewComponentSnapshot("vezeto")).toBe(true);
    expect(canReviewComponentSnapshot("technical_preparation")).toBe(false);
    expect(canReviewComponentSnapshot("sales")).toBe(false);
  });

  it("mirrors the narrow backend role gate for source-evidence decisions", () => {
    expect(canReviewSourceEvidence("technical_preparation")).toBe(true);
    expect(canReviewSourceEvidence("order_approver")).toBe(true);
    expect(canReviewSourceEvidence("administrator")).toBe(true);
    expect(canReviewSourceEvidence("vezeto")).toBe(true);
    expect(canReviewSourceEvidence("sales")).toBe(false);
  });
});
