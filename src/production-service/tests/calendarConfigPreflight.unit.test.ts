import { describe, expect, it } from "vitest";
import { calculateNetShiftMinutes, preflightDoorstarCalendarConfig, type ResourceCalendarCandidate } from "../src/services/planning/calendarConfigPreflight.js";

const validCalendar: ResourceCalendarCandidate = {
  resourceKey: "CNC", capacity: 1, sourceRevision: "doorstar-calendar-draft-2026-07-27",
  shifts: [{ weekday: "monday", start: "06:00", end: "14:30", breaks: [{ start: "10:00", end: "10:20" }] }],
};

describe("preflightDoorstarCalendarConfig", () => {
  it("keeps a complete resource calendar ready for a future adapter", () => {
    expect(preflightDoorstarCalendarConfig([validCalendar], "integer")).toEqual({ ready: [validCalendar], quarantined: [] });
  });
  it("rejects bad time format and a break outside its shift", () => {
    const invalid = { ...validCalendar, shifts: [
      { weekday: "monday" as const, start: "6:00", end: "14:30" },
      { weekday: "tuesday" as const, start: "06:00", end: "14:30", breaks: [{ start: "14:00", end: "15:00" }] },
    ] };
    expect(preflightDoorstarCalendarConfig([invalid], "integer").quarantined[0]?.reasons).toEqual(["invalid_shift_time", "break_outside_shift"]);
  });
  it("rejects overlapping breaks", () => {
    const invalid = { ...validCalendar, shifts: [{ weekday: "monday" as const, start: "06:00", end: "14:30", breaks: [{ start: "10:00", end: "10:30" }, { start: "10:20", end: "10:40" }] }] };
    expect(preflightDoorstarCalendarConfig([invalid], "integer").quarantined[0]?.reasons).toEqual(["overlapping_breaks"]);
  });
  it("requires explicit approval for fractional capacity", () => {
    const fractional = { ...validCalendar, capacity: 0.5 };
    expect(preflightDoorstarCalendarConfig([fractional], "integer").quarantined[0]?.reasons).toEqual(["fractional_capacity_not_approved"]);
    expect(preflightDoorstarCalendarConfig([fractional], "fractional_fte").ready).toEqual([fractional]);
  });
  it("quarantines duplicate resources instead of merging capacity", () => {
    const duplicate = { ...validCalendar, sourceRevision: "doorstar-calendar-draft-2026-07-28" };
    const result = preflightDoorstarCalendarConfig([validCalendar, duplicate], "integer");
    expect(result.ready).toEqual([]);
    expect(result.quarantined.map(({ reasons }) => reasons)).toEqual([["duplicate_resource_key"], ["duplicate_resource_key"]]);
  });
  it("calculates the Doorstar 07:00-16:00 break pattern as 480 net working minutes", () => {
    expect(calculateNetShiftMinutes({
      weekday: "monday", start: "07:00", end: "16:00",
      breaks: [{ start: "09:00", end: "09:20" }, { start: "12:00", end: "12:30" }, { start: "14:00", end: "14:10" }],
    })).toBe(480);
  });
});
