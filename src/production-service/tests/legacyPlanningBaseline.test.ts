import { describe, expect, it } from "vitest";
import { calculateLegacyPlanningBaseline } from "../src/services/planning/legacyPlanningBaseline.js";

describe("calculateLegacyPlanningBaseline", () => {
  it("preserves Doorstar's volume, unit-time and workforce calculation", () => {
    expect(
      calculateLegacyPlanningBaseline({
        volume: 20,
        unitMinutes: 15,
        workforce: 2,
      })
    ).toEqual({
      estimatedDurationMinutes: 300,
      estimatedLabourMinutes: 600,
      plannedWorkingDays: 1,
      missingFields: [],
      eligibleForAutomaticPlanning: true,
    });
  });

  it("adds explicit extra days after rounding elapsed time to legacy eight-hour workdays", () => {
    expect(
      calculateLegacyPlanningBaseline({
        volume: 32,
        unitMinutes: 30,
        workforce: 1,
        extraDays: 1,
      })
    ).toMatchObject({
      estimatedDurationMinutes: 960,
      estimatedLabourMinutes: 960,
      plannedWorkingDays: 3,
      eligibleForAutomaticPlanning: true,
    });
  });

  it("makes incomplete inputs visible instead of silently scheduling a zero-duration operation", () => {
    expect(
      calculateLegacyPlanningBaseline({
        volume: 10,
        unitMinutes: null,
        workforce: null,
        extraDays: 2,
      })
    ).toEqual({
      estimatedDurationMinutes: 0,
      estimatedLabourMinutes: 0,
      plannedWorkingDays: 2,
      missingFields: ["unitMinutes", "workforce"],
      eligibleForAutomaticPlanning: false,
    });
  });

  it("rejects invalid calendar policy and extra-day input", () => {
    expect(() => calculateLegacyPlanningBaseline({ volume: 1, unitMinutes: 1, workforce: 1, workingMinutesPerDay: 0 })).toThrow(
      "workingMinutesPerDay"
    );
    expect(() => calculateLegacyPlanningBaseline({ volume: 1, unitMinutes: 1, workforce: 1, extraDays: 1.5 })).toThrow("extraDays");
  });
});
