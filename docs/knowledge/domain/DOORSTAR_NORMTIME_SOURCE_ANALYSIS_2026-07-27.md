# Doorstar normaidő és kapacitás — forrásadat-felmérés

**Date:** 2026-07-27  
**Status:** source evidence collected; not yet an approved production import  
**Related specification:** `DOORSTAR_NORMTIME_AND_CAPACITY_CALENDAR_SPEC_2026-07-27.md`

## Scope and handling

This is a read-only assessment of the Doorstar files supplied from
`Gyártás-Dokumentumok - Dokumentumok/10 - Adatok`. No source workbook, macro,
calendar or production data was changed. The results supply the first Doorstar
instance-pack import and the SpaceOS Production Planning calibration, but they
do not approve a production schedule by themselves.

## Sources inspected

| Source | Relevant content | Planning use |
|---|---|---|
| `Egység_idő.xlsx` / `Feladat_Egység_idő` | task catalogue, unit time, workforce, responsibility, dependency and lookup conditions | candidate `OperationStandard` records |
| `Egység_idő_Fejleszté.xlsx` | revised task catalogue, including product/component-oriented structure | future mapping/reference; not selected as the authoritative import without Doorstar approval |
| `Gyártási Naplók DATA.xlsm` | nine worker sheets with work order, component, operation, quantity, date, start/end, error and note fields | historical actual-time calibration and data-quality report |
| `Data - 05.0.01.xlsm` | product and cutting parameter/configuration tables | later product/component classification; not a norm-time import source by itself |

## Norm-time catalogue evidence

`Egység_idő.xlsx` contains **125 rows with a positive unit time**, representing
**67 unique operation descriptions**. Values range from **0.8 to 240 minutes**.
The catalogue includes workforce values, workflow/dependency metadata and,
for many rows, product/component/finish lookup conditions.

This means an operation is not uniquely identified by its display name. For
example, multiple `Csiszolás`, `Fújás`, `Fóliázás` and `Csomagolás` rows have
different minute values because they describe different product or component
contexts. The SpaceOS import key must therefore be based on the existing
stable task identifier plus its lookup-condition set, not on the human label.

### Required import identity

The Doorstar `OperationStandard` import must preserve these source concepts:

```text
sourceStandardKey = task code + task code 4 + source row identity
operationType     = source task description
resourceKey       = approved Doorstar station mapping
minutesPerUnit    = source unit time in minutes
workforce         = source human-resource value
qualifiers        = product/component/finish lookup conditions
sourceRevision    = workbook name + workbook revision/date + source row identity
```

The source unit time is a candidate `minutesPerUnit`, pending confirmation of
what the relevant `unit` means for each row. A standard is not published when
the unit, resource mapping or qualifiers are unknown.

## Historical work-log evidence

`Gyártási Naplók DATA.xlsm` has nine worker sheets and **2,449 data rows**.
The inspection found:

| Measure | Result |
|---|---:|
| Valid, positive start-to-end intervals | 2,246 |
| Total valid recorded interval | 2,162.28 hours |
| Median valid interval | 30 minutes |
| Rows without start or end | 177 |
| Rows without an operation in the operation column | 22 |
| Non-positive intervals | 4 |
| Distinct recorded operation labels | 507 |
| Observed date range | 2024-02-17 to 2025-04-11 |

The log is valuable for calibration, but it is not directly importable as a
norm catalogue. Reasons include missing times, free-text naming variants,
mixed batch/per-piece quantities, non-production activities and the absence
of a canonical link to the catalogue row.

The most frequently timed labels include `Szabás`, `Csiszolás`, `Pántolás`,
`Fóliázás`, `Összerakás`, `Ragasztás`, `Fújás`, `Marás` and `Csomagolás`.
Exact label matches exist with catalogue operations, but they remain ambiguous:
the catalogue has several product-qualified standards for the same label.

## Data decisions

1. **Do not infer a standard by label alone.** A manual/controlled mapping
   table is required from legacy operation text to an approved Doorstar
   standard key, resource and unit.
2. **Keep source and actual data separate.** Catalogue values are proposed
   standards; log intervals are actual observations. Neither overwrites the
   other.
3. **Do not infer the work calendar from logs.** The logs are incomplete and
   may include meetings, cleaning, breaks and manually entered spans. Doorstar
   must approve shifts, breaks, closures and concurrent capacity explicitly.
4. **Preserve provenance.** Every imported standard and every historical
   observation stores its source workbook and source row/sheet reference.
5. **Quarantine incomplete observations.** Rows missing operation, quantity
   where required, start or end remain reviewable but do not influence
   automatic norm calculations.

## Proposed controlled import sequence

1. Select the approved authoritative unit-time workbook version.
2. Extract each candidate standard with its source key, minutes, workforce and
   lookup conditions into the Doorstar instance-pack staging area.
3. Doorstar maps each candidate to a physical planning resource and confirms
   the unit (`piece`, `m2`, `linear_metre`, batch, or another explicit unit).
4. Build a controlled legacy-log mapping table: raw operation label ->
   standard key/resource/unit, with an `unmapped` status as the safe default.
5. Compare matched historical actuals with the candidate standard by
   product/component/finish context. Review outliers before creating a new
   standard revision.
6. Enter and approve the resource calendars separately.
7. Run the C# Planning module in shadow mode before publishing any capacity
   reservation.

## Missing Doorstar input before scheduling can be enabled

- approved working days, shifts, breaks and holiday/closure calendar per
  resource;
- concurrent machine/operator capacity per station;
- authoritative choice between the current and the development unit-time
  workbook where their records differ;
- definition of the measurement unit for each standard;
- approved resource mapping for catalogue responsibility names such as CNC,
  Fóliázó, Asztalos and Összeszerelő;
- review policy for actual-time outliers and correction of incomplete logs.

## Acceptance criteria for the import

- every imported norm has a stable source key, source revision, approved unit
  and Doorstar resource;
- every historical observation is mapped or explicitly quarantined;
- no raw free-text label can select a production standard without a controlled
  mapping;
- calendar configuration is approved independently of historic logs;
- shadow-mode report can show standard versus actual variance without changing
  production reservations.
