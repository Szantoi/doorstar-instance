/** Validates Doorstar recurring resource calendars before C# platform import. */
export type PlanningWeekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type CapacityPolicy = "integer" | "fractional_fte";

export interface LocalTimeRange { start: string; end: string; }
export interface RecurringShift extends LocalTimeRange { weekday: PlanningWeekday; breaks?: readonly LocalTimeRange[] | null; }
export interface ResourceCalendarCandidate {
  resourceKey: string | null | undefined;
  capacity: number | null | undefined;
  shifts: readonly RecurringShift[] | null | undefined;
  sourceRevision: string | null | undefined;
}

export type CalendarConfigQuarantineReason =
  | "missing_resource_key" | "missing_source_revision" | "missing_shift" | "invalid_capacity"
  | "fractional_capacity_not_approved" | "invalid_weekday" | "invalid_shift_time"
  | "invalid_break_time" | "break_outside_shift" | "overlapping_breaks" | "duplicate_resource_key";
export interface QuarantinedResourceCalendar { candidate: ResourceCalendarCandidate; reasons: CalendarConfigQuarantineReason[]; }
export interface CalendarConfigPreflightResult { ready: ResourceCalendarCandidate[]; quarantined: QuarantinedResourceCalendar[]; }

const WEEKDAYS = new Set<PlanningWeekday>(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Returns minutes since midnight only for exact 24-hour local HH:mm values. */
function localMinutes(value: string): number | undefined {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validRange(range: LocalTimeRange): boolean {
  const start = localMinutes(range.start);
  const end = localMinutes(range.end);
  return start !== undefined && end !== undefined && start < end;
}

function inside(breakRange: LocalTimeRange, shift: RecurringShift): boolean {
  const breakStart = localMinutes(breakRange.start);
  const breakEnd = localMinutes(breakRange.end);
  const shiftStart = localMinutes(shift.start);
  const shiftEnd = localMinutes(shift.end);
  return breakStart !== undefined && breakEnd !== undefined && shiftStart !== undefined && shiftEnd !== undefined && shiftStart <= breakStart && breakEnd <= shiftEnd;
}

function overlap(left: LocalTimeRange, right: LocalTimeRange): boolean {
  const leftStart = localMinutes(left.start);
  const leftEnd = localMinutes(left.end);
  const rightStart = localMinutes(right.start);
  const rightEnd = localMinutes(right.end);
  return leftStart !== undefined && leftEnd !== undefined && rightStart !== undefined && rightEnd !== undefined && leftStart < rightEnd && rightStart < leftEnd;
}

/**
 * Returns net schedulable minutes for one valid local shift. Undefined means
 * the shift or its breaks are malformed; no capacity assumption is inferred.
 */
export function calculateNetShiftMinutes(shift: RecurringShift): number | undefined {
  if (!validRange(shift)) return undefined;
  const breaks = shift.breaks ?? [];
  if (breaks.some((breakRange) => !validRange(breakRange) || !inside(breakRange, shift))) return undefined;
  for (let index = 0; index < breaks.length; index += 1) {
    for (let comparison = index + 1; comparison < breaks.length; comparison += 1) {
      if (overlap(breaks[index], breaks[comparison])) return undefined;
    }
  }
  const start = localMinutes(shift.start);
  const end = localMinutes(shift.end);
  if (start === undefined || end === undefined) return undefined;
  const breakMinutes = breaks.reduce((total, breakRange) => total + (localMinutes(breakRange.end)! - localMinutes(breakRange.start)!), 0);
  return end - start - breakMinutes;
}

function reasonsFor(candidate: ResourceCalendarCandidate, capacityPolicy: CapacityPolicy): CalendarConfigQuarantineReason[] {
  const reasons: CalendarConfigQuarantineReason[] = [];
  if (!hasText(candidate.resourceKey)) reasons.push("missing_resource_key");
  if (!hasText(candidate.sourceRevision)) reasons.push("missing_source_revision");
  if (!Array.isArray(candidate.shifts) || candidate.shifts.length === 0) reasons.push("missing_shift");
  if (typeof candidate.capacity !== "number" || !Number.isFinite(candidate.capacity) || candidate.capacity <= 0) reasons.push("invalid_capacity");
  else if (capacityPolicy === "integer" && !Number.isInteger(candidate.capacity)) reasons.push("fractional_capacity_not_approved");

  for (const shift of candidate.shifts ?? []) {
    if (!WEEKDAYS.has(shift.weekday)) reasons.push("invalid_weekday");
    if (!validRange(shift)) { reasons.push("invalid_shift_time"); continue; }
    const breaks = shift.breaks ?? [];
    for (const breakRange of breaks) {
      if (!validRange(breakRange)) reasons.push("invalid_break_time");
      else if (!inside(breakRange, shift)) reasons.push("break_outside_shift");
    }
    for (let index = 0; index < breaks.length; index += 1) {
      for (let comparison = index + 1; comparison < breaks.length; comparison += 1) {
        if (overlap(breaks[index], breaks[comparison])) reasons.push("overlapping_breaks");
      }
    }
  }
  return [...new Set(reasons)];
}

/** Non-mutating dry run; duplicate resource records are never silently merged. */
export function preflightDoorstarCalendarConfig(candidates: readonly ResourceCalendarCandidate[], capacityPolicy: CapacityPolicy): CalendarConfigPreflightResult {
  const keys = new Map<string, number>();
  for (const candidate of candidates) if (hasText(candidate.resourceKey)) keys.set(candidate.resourceKey.trim(), (keys.get(candidate.resourceKey.trim()) ?? 0) + 1);
  const ready: ResourceCalendarCandidate[] = [];
  const quarantined: QuarantinedResourceCalendar[] = [];
  for (const candidate of candidates) {
    const reasons = reasonsFor(candidate, capacityPolicy);
    if (hasText(candidate.resourceKey) && (keys.get(candidate.resourceKey.trim()) ?? 0) > 1) reasons.push("duplicate_resource_key");
    if (reasons.length) quarantined.push({ candidate, reasons }); else ready.push(candidate);
  }
  return { ready, quarantined };
}
