/**
 * Doorstar's legacy Folyamatok workbook calculates elapsed work time from
 * volume and unit time, then derives labour demand using the workforce count.
 *
 * This is deliberately a pure compatibility baseline, not an authoritative
 * scheduler or HTTP API. The SpaceOS C# Production Planning module will own
 * tenant policy, calendars and capacity reservations. Keeping this small
 * reference implementation allows the Doorstar adapter to compare legacy
 * workbook examples with the published platform contract during migration.
 */

export type LegacyPlanningMissingField = "volume" | "unitMinutes" | "workforce";

export interface LegacyPlanningInput {
  /** Quantity/volume from the legacy Folyamat row. */
  volume: number | null | undefined;
  /** Legacy Excel unit time converted to minutes by the importing adapter. */
  unitMinutes: number | null | undefined;
  /** Required people for the operation; this affects labour, not elapsed time. */
  workforce: number | null | undefined;
  /** Explicit allowance from the legacy Extra nap column. */
  extraDays?: number | null | undefined;
  /** Legacy workbook default is eight hours per working day. */
  workingMinutesPerDay?: number;
}

export interface LegacyPlanningBaseline {
  estimatedDurationMinutes: number;
  estimatedLabourMinutes: number;
  plannedWorkingDays: number;
  missingFields: LegacyPlanningMissingField[];
  eligibleForAutomaticPlanning: boolean;
}

const LEGACY_WORKING_MINUTES_PER_DAY = 8 * 60;

function isPositiveFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegativeWholeNumber(value: number | null | undefined, field: string): number {
  if (value == null) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative whole number`);
  }
  return value;
}

/**
 * Reproduces the legacy workbook's duration/labour/day calculation in minutes.
 * Incomplete input is explicit: legacy Excel yielded zero, whereas consumers
 * can now prevent the resulting row from being scheduled automatically.
 */
export function calculateLegacyPlanningBaseline(input: LegacyPlanningInput): LegacyPlanningBaseline {
  const workingMinutesPerDay = input.workingMinutesPerDay ?? LEGACY_WORKING_MINUTES_PER_DAY;
  if (!Number.isFinite(workingMinutesPerDay) || workingMinutesPerDay <= 0) {
    throw new Error("workingMinutesPerDay must be a positive finite number");
  }

  const extraDays = nonNegativeWholeNumber(input.extraDays, "extraDays");
  const missingFields: LegacyPlanningMissingField[] = [];
  if (!isPositiveFiniteNumber(input.volume)) missingFields.push("volume");
  if (!isPositiveFiniteNumber(input.unitMinutes)) missingFields.push("unitMinutes");
  if (!isPositiveFiniteNumber(input.workforce)) missingFields.push("workforce");

  if (missingFields.length) {
    return {
      estimatedDurationMinutes: 0,
      estimatedLabourMinutes: 0,
      plannedWorkingDays: extraDays,
      missingFields,
      eligibleForAutomaticPlanning: false,
    };
  }

  // The branch above returns every incomplete input. Keep this guard explicit
  // so TypeScript and future maintainers both see the numeric invariant here.
  if (!isPositiveFiniteNumber(input.volume) || !isPositiveFiniteNumber(input.unitMinutes) || !isPositiveFiniteNumber(input.workforce)) {
    throw new Error("legacy planning input invariant failed");
  }

  const estimatedDurationMinutes = input.volume * input.unitMinutes;
  const estimatedLabourMinutes = estimatedDurationMinutes * input.workforce;
  const plannedWorkingDays = Math.ceil(estimatedDurationMinutes / workingMinutesPerDay) + extraDays;

  return {
    estimatedDurationMinutes,
    estimatedLabourMinutes,
    plannedWorkingDays,
    missingFields: [],
    eligibleForAutomaticPlanning: true,
  };
}
