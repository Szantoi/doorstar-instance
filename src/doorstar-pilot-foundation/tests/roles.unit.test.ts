import { describe, expect, it } from "vitest";
import { isEffectivePilotRosterManager } from "../src/domain/roles.js";

describe("isEffectivePilotRosterManager", () => {
  it("requires an active permitted Office role and the explicit manager flag", () => {
    expect(isEffectivePilotRosterManager({ active: true, role: "READER", canManagePilotRoster: true })).toBe(true);
    expect(isEffectivePilotRosterManager({ active: true, role: "ADMINISTRATOR", canManagePilotRoster: false })).toBe(false);
    expect(isEffectivePilotRosterManager({ active: false, role: "READER", canManagePilotRoster: true })).toBe(false);
  });

  it("never treats shop-floor as a roster manager", () => {
    expect(isEffectivePilotRosterManager({ active: true, role: "SHOP_FLOOR", canManagePilotRoster: true })).toBe(false);
  });
});
