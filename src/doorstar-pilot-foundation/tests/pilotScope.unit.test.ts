import { describe, expect, it } from "vitest";
import {
  isValidPilotScopeKey,
  requirePilotScopeKey,
  requireSingleProductionPilotScope,
} from "../src/domain/pilotScope.js";

describe("pilot scope key", () => {
  it("accepts deterministic configuration keys", () => {
    expect(isValidPilotScopeKey("doorstar-pilot")).toBe(true);
    expect(requirePilotScopeKey("doorstar-pilot")).toBe("doorstar-pilot");
  });

  it("rejects request-shaped, malformed and absent values", () => {
    expect(isValidPilotScopeKey("Doorstar")).toBe(false);
    expect(isValidPilotScopeKey("do")).toBe(false);
    expect(() => requirePilotScopeKey(undefined)).toThrow("doorstar_pilot_scope_key_invalid");
  });

  it("requires exactly the configured production scope", () => {
    expect(requireSingleProductionPilotScope("doorstar-pilot", ["doorstar-pilot"])).toBe("doorstar-pilot");
    expect(() => requireSingleProductionPilotScope("doorstar-pilot", [])).toThrow("doorstar_pilot_scope_cardinality_invalid");
    expect(() => requireSingleProductionPilotScope("doorstar-pilot", ["doorstar-pilot", "proof-b"])).toThrow("doorstar_pilot_scope_cardinality_invalid");
    expect(() => requireSingleProductionPilotScope("doorstar-pilot", ["another-pilot"])).toThrow("doorstar_pilot_scope_cardinality_invalid");
  });
});
