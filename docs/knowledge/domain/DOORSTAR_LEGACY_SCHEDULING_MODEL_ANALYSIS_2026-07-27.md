# Doorstar legacy ütemezési modell — átültetési elemzés

**Date:** 2026-07-27  
**Status:** verified formula baseline for the SpaceOS C# Planning module  
**Source:** `ProjektSzám - ProjektNév - 02 - Folyamatok.xlsm` (read-only inspection)

## Purpose

The supplied workbook contains the existing Doorstar calculation and planning
implementation. This document translates its verified spreadsheet semantics
into a platform-neutral contract. It is a behavioural baseline for migration;
the C# implementation must not copy Excel formulas or VBA as code.

For the complete Doorstar chain before this workbook — project intake,
component/dimension calculation and factory issue — see
`DOORSTAR_PRODUCTION_DATA_CHAIN_2026-07-28.md`.

## Verified calculation chain

The `Folyamatok tervezése` sheet stores the `Mérföldkövek` planning table.
For a work item its formulas calculate:

```text
plannedDuration = volume × unitTime
plannedLabour   = volume × unitTime × workforce
plannedDays     = ceil(plannedDurationHours / 8) + extraDays
```

`plannedDuration` is elapsed process time. `plannedLabour` is human effort;
the workforce multiplier does not increase the planned calendar duration in
the legacy model. This distinction must remain explicit in the platform API.

When volume or unit time is missing/zero, the workbook produces zero rather
than an estimate. The SpaceOS module improves this behaviour: it returns
`needs_standard` or `needs_volume` so an incomplete work item is visible and
cannot be silently published.

## Existing dependencies and dates

The workbook represents parent/child dependency and override semantics:

| Legacy rule | Meaning for the platform |
|---|---|
| `FS` | child earliest start follows the parent finish; the workbook adds one calendar day |
| `SS` | child earliest start follows the parent start |
| `FF` | child finish is constrained by the parent finish |
| `SF` | child finish is constrained by the parent start |
| partial-start percentage | a child may be released after the parent reaches an approved completion percentage |
| fixed start / fixed finish | authorised manual date override |
| extra days | explicit lead-time or allowance added to calculated duration |

Start precedence is fixed start, then partial release, then dependency-derived
start. Finish precedence is fixed finish, then finish dependency, then the
calculated end. Weekend dates are moved to the next working day.

## Calendar and load reporting

The legacy workbook assumes an 8-hour day and uses `WORKDAY` / `NETWORKDAYS`.
It distributes both planned duration and planned labour evenly across the
calculated working days:

```text
dailyPlannedDuration = plannedDuration / plannedDays
dailyPlannedLabour   = plannedLabour / plannedDays
```

`Részlegek napi terhelése` then sums the daily planned labour by department.
The Gantt sheet visualises each scheduled interval. This is a valuable and
well-defined Doorstar behaviour baseline.

The workbook does **not** use its calculated department load as a scheduling
constraint. It reports a potential overload after dates have been calculated.
It also has no approved per-resource shift, break, holiday, machine-downtime
or concurrent-capacity model in the inspected formulas.

## Translation to the C# Planning module

| Legacy concept | SpaceOS C# concept | Migration rule |
|---|---|---|
| `Folyamat` / `Mérföldkövek` row | `OperationRequest` / `PlannedOperation` | preserve legacy task ID as a source reference, not a platform ownership decision |
| volume | operation quantity | retain source unit and validation state |
| unit time | `OperationStandard.minutesPerUnit` | preserve standard key and revision |
| workforce | required resource units / labour demand | store separately from elapsed duration |
| 8-hour divisor | `WorkCalendar` available minutes | configure per resource; the first compatibility policy may be 480 minutes/day |
| FS/SS/FF/SF | typed dependency edge | preserve edge type and the legacy one-day FS convention as an explicit policy |
| partial release | dependency release threshold | make it an explicit decimal percentage and policy-controlled feature |
| fixed dates | authorised plan override | retain actor, reason and source revision |
| daily department sum | capacity-demand projection | retain as a report and compare it to actual resource capacity |

## Required behavioural improvements

The first C# release must preserve the calculation inputs and observable
results of the legacy model for compatible examples, while adding the controls
the workbook lacks:

1. allocate only into real resource calendar slots instead of only reporting
   overload after scheduling;
2. use tenant-configured shifts, breaks, holidays and downtime instead of a
   hard-coded 8-hour weekday assumption;
3. distinguish elapsed machine time, labour effort and concurrent capacity;
4. preserve deterministic FS/SS/FF/SF and partial-release semantics;
5. keep an immutable planning run, standard version and calendar revision;
6. require an authorised reason for fixed-date or duration overrides;
7. produce a shadow-comparison report against workbook results before any
   production reservation is published.

## Compatibility test cases

For each selected legacy project, the migration test captures the source row,
input values and expected legacy output. At minimum it covers:

- normal work item with volume, unit time, workforce and no dependency;
- FS and SS start dependencies;
- FF and SF finish dependencies;
- weekend crossing;
- extra-day allowance;
- fixed start and fixed finish overrides;
- partial release after parent completion;
- missing volume or unit time.

The compatibility test compares calculated duration, labour demand, earliest
date and daily demand allocation. A difference caused by a real capacity,
shift or holiday rule is recorded as an intentional platform improvement, not
hidden as a formula mismatch.

## Source notes

The workbook has 31 sheets, including planning, Gantt and daily department
load views. Its operational data flow is Power Query plus worksheet formulas:
the inspected file has 14 `Lekérdezés` connections, including the `Folyamat`,
`Feladat_Egység_idő1`, product and component query outputs. Although the
`.xlsm` container technically includes a `vbaProject.bin` package, no VBA
behaviour is assumed or used by this analysis. The original workbook remains
untouched.

### 2026-07-28 — adapter boundary clarification

The formula chain from `Folyamat` to `Mérföldkövek`, daily time allocation and
department load is verified. The preceding product/component query inputs to
the materialized `Folyamat` output must be reconstructed from the Power Query
M definitions and query-output schemas, not by reverse-engineering VBA. This
is the explicit scope of the future `doorstar.scheduling-import` adapter.
