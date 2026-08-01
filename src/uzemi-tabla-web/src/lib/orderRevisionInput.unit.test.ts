import { describe, expect, it } from "vitest";
import type { ProductionOrderPosition, ProductionOrderRevision } from "../services/production/types";
import { toOrderRevisionInput } from "./orderRevisionInput";

describe("order revision replacement input", () => {
  it("preserves the Sales header while a position is edited", () => {
    const revision = {
      customerName: "Minta Kft.", customerAddress: "Budapest", contactName: "Nagy Anna",
      contactPhone: "+361", contactEmail: "anna@example.com", deliveryAddress: "Telki",
      expectedDelivery: "2026-08-30T00:00:00.000Z", plannedStart: "2026-08-01T00:00:00.000Z",
      priority: 2, notes: "Sales megjegyzés",
    } as ProductionOrderRevision;
    const position: Omit<ProductionOrderPosition, "evidence"> = {
      id: "pos-1",
      code: "A01",
      name: "Bejárati ajtó",
      quantity: 1,
      productType: "AJTÓ",
      openingDirection: "BAL",
      openingWidthMm: 1000,
      openingHeightMm: 2100,
      openingDepthMm: 150,
      doorWidthMm: 900,
      doorHeightMm: 2050,
      doorThicknessMm: 42,
      surface: "RAL 9010",
      wallTreatment: "NONE",
      glazing: "NONE",
      glazingSpecification: null,
      doorTypeKey: "bejárati",
      finishKey: "ral-9010",
      glassKey: "nincs",
      hardwareKeys: ["pant-a"],
      wallSolutionKey: "none",
      materialKey: "tolgy",
      machiningKeys: ["zar-marasa"],
      technicalNotes: "Műszaki megjegyzés",
      notes: "Felmérési megjegyzés",
    };
    const input = toOrderRevisionInput(revision, [position]);
    const { finishKey: _legacyFinishKey, ...safePosition } = position;
    expect(input).toMatchObject({ customerAddress: "Budapest", contactName: "Nagy Anna", deliveryAddress: "Telki", plannedStart: "2026-08-01T00:00:00.000Z" });
    expect(input.positions).toEqual([safePosition]);
    expect(input.positions[0]).not.toHaveProperty("finishKey");
    expect(input.positions[0].surface).toBe("RAL 9010");
  });
});
