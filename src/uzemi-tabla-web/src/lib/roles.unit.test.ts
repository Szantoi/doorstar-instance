import { describe, expect, it } from "vitest";
import { canApplyManufacturedItemImport } from "./roles";

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
});
