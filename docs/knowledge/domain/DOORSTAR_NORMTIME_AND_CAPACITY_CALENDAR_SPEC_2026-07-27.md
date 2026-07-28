# Doorstar normaidő és kapacitásnaptár — tenant specifikáció

**Date:** 2026-07-27  
**Status:** approved planning baseline; values require Doorstar workshop validation  
**Consumes:** SpaceOS Production Planning module

## Purpose

This specification defines the Doorstar tenant input for automatic production
hour estimates and a capacity-aware calendar. It deliberately contains no
invented hour values. Doorstar validates and supplies the norm-time values
from measured workshop work; the SpaceOS C# platform performs the calculation
and scheduling.

The supplied unit-time catalogue and historical work logs were assessed in
[`DOORSTAR_NORMTIME_SOURCE_ANALYSIS_2026-07-27.md`](DOORSTAR_NORMTIME_SOURCE_ANALYSIS_2026-07-27.md).
They are the source baseline for controlled import and calibration. They do
not replace the explicit approval of a resource calendar or individual
standards.

The existing Doorstar planning workbook is separately mapped in
[`DOORSTAR_LEGACY_SCHEDULING_MODEL_ANALYSIS_2026-07-27.md`](DOORSTAR_LEGACY_SCHEDULING_MODEL_ANALYSIS_2026-07-27.md).
Its `FS` / `SS` / `FF` / `SF` dependencies, partial release, extra-day and
daily-load semantics are compatibility requirements for the first platform
release.

## Tenant identity and scope

- Tenant: `doorstar` (canonical identifier assigned by SpaceOS Instance
  Context; the UI hostname is not an authority source).
- Timezone: `Europe/Budapest`.
- Workflow: the existing six production stages remain the primary routing
  vocabulary.
- Current physical stations are imported from
  `src/production-service/src/config/stations.json` and become versioned
  `Resource` records in the Doorstar instance pack.
- A station may later contain several resources, for example distinct CNC
  machines or an operator pool. This is configuration, not an application-code
  fork.

## Initial resources and routing

| Doorstar resource | Stage | Initial capacity unit | Planning role |
|---|---|---|---|
| Körfűrész | Szabászat / élgyártás | machine minutes | cutting resource |
| CNC | Megmunkálás | machine minutes | machining resource |
| Bürkle | Megmunkálás | machine minutes | edging / machining resource |
| Csiszoló | Felületkezelés | operator or machine minutes | sanding resource |
| Fújó | Felületkezelés | operator or booth minutes | finish resource |
| Asztalos | Összeszerelés | operator minutes | assembly resource |
| Egyéb | Csomagolás | operator minutes | packing resource |
| Száll. / Kész | Kiszállításra megjelölés | coordination minutes | delivery-ready checkpoint |

The exact available minutes and concurrent capacity are tenant configuration.
For example, a station with two independently usable machines has capacity
two; it is not modelled by doubling an estimate.

## Norm-time standard

Each Doorstar `OperationStandard` has the following required fields:

| Field | Meaning |
|---|---|
| `standardKey` | stable human-readable key, for example `door.cnc.standard` |
| `resourceKey` | target station/resource |
| `operationType` | Doorstar operation vocabulary, versioned with the workflow template |
| `setupMinutes` | fixed preparation time per batch |
| `minutesPerUnit` | base time per measurable unit |
| `unit` | `piece`, `m2`, `linear_metre` or another explicitly defined unit |
| `fixedAllowanceMinutes` | approved fixed addition, normally zero |
| `modifiers` | optional, named and bounded material/finish/complexity rules |
| `effectiveFrom` / `effectiveTo` | validity interval |
| `version` | immutable standard revision |
| `approvedBy` / `approvedAt` | accountable approval evidence |

The base calculation is:

```text
estimatedMinutes = setupMinutes
                 + ceil(quantity × minutesPerUnit)
                 + fixedAllowanceMinutes
```

Modifiers must be explicit and reviewable. For example, a finish class can
add a fixed approved allowance; arbitrary code expressions and hidden UI-side
formulas are not permitted.

An operation without an approved, matching standard is labelled
`needs_standard`. It remains visible to the planner but cannot receive an
automatic published reservation.

## Calendar model

### Recurring calendar

Each resource has one or more weekly shifts with local start and end times,
break intervals and capacity. A shift uses local `Europe/Budapest` time; the
platform resolves daylight-saving transitions consistently.

The initial required configuration is:

| Configuration item | Owner input | Validation rule |
|---|---|---|
| Working weekdays | Doorstar | at least one active shift per schedulable resource |
| Shift start/end | Doorstar | no zero or negative duration |
| Breaks | Doorstar | fully inside a shift; breaks may not overlap |
| Concurrent capacity | Doorstar | positive integer or approved fractional FTE policy |
| Resource downtime | Doorstar | dated exception with reason |
| Holidays / planned closure | Doorstar | tenant-wide or resource-specific exception |
| Extra shift / overtime | Doorstar | explicit dated exception and approver |

No default working hours are assumed. Before Doorstar enters and approves the
calendar, scheduling returns a configuration warning rather than inventing a
date.

### Exceptions and overrides

`CalendarException` has a start, end, affected resource scope, available
capacity delta, reason, author and approval metadata. Maintenance and holiday
entries reduce capacity; overtime or an additional crew increases it. A
calendar revision does not alter historical planning-run inputs.

## Scheduling policy

The Doorstar first release uses forward finite-capacity scheduling:

1. The approved 6-stage route orders operations; an explicit dependency can
   add a stricter order.
2. The scheduler searches from the requested earliest date for available
   resource minutes.
3. Breaks, closures, holidays and existing published reservations consume or
   remove capacity.
4. A job may cross a shift boundary only when the resource policy allows
   splitting. The initial recommended default is `allowSplitAcrossShifts: true`
   for long operations and `false` for operations declared indivisible.
5. The result is a **proposal**. It becomes operational only after an
   authorised planner publishes it.

The planning screen must show estimated hours, planned start/end, resource,
standard version, calendar revision and every warning. It must show overloads
instead of silently placing work into unavailable time.

## Human corrections and learning loop

- A manager/planner may override an estimated duration, date or resource only
  with a reason.
- Overrides preserve the original calculation and are audited.
- Actual start/end or actual minutes, when later recorded, are separate facts;
  they do not overwrite the original estimate.
- Doorstar reviews actual-versus-estimated variance periodically and publishes
  a new norm-time standard version when evidence supports it.

This creates a measured improvement loop without making unverified historic
values appear as standards.

## Data collection required from Doorstar

Before production scheduling is enabled, collect and approve:

1. active shifts and breaks for each listed station;
2. holidays, shutdown periods, planned maintenance and normal overtime policy;
3. each station's actual concurrent capacity;
4. the list of operation types and which station performs each;
5. a small, representative sample of completed jobs with quantity, operation,
   actual elapsed time and relevant material/finish/complexity attributes;
6. who may edit standards, calendars, proposals and published plans.

The sample is used to derive initial values, review outliers and establish a
baseline. It is not training data for an opaque model.

## Doorstar acceptance scenarios

| Scenario | Expected result |
|---|---|
| 20 pieces with an approved CNC standard | deterministic minutes, standard version and a CNC proposal slot |
| work spanning a lunch break | duration skips the break and returns the later finish time |
| holiday on a planned day | scheduling continues at the next available resource slot |
| two jobs compete for one resource | second job is scheduled after reserved capacity or flagged by policy |
| missing standard | `needs_standard`; no automatic publication |
| manager date override | original proposal, override reason and actor remain visible |
| another tenant's resource identifier | rejected without returning Doorstar configuration or plan data |

## Rollout

1. Create and validate the Doorstar instance pack in a non-production
   environment.
2. Import the existing task `quantity` / `unitHours` fields as legacy
   historical snapshots for comparison only.
3. Run calculation and calendar proposals in shadow mode for selected jobs.
4. Review proposal differences with Doorstar and adjust approved standards and
   calendar configuration.
5. Enable proposal visibility for users.
6. After UAT and a human release gate, enable planner publication and capacity
   reservations.

## Out of scope

- changing the physical Doorstar workflow without business approval;
- inferring norm times from unreviewed data;
- automatic overtime approval;
- production data migration, credential changes or deployment;
- choosing tenant identity from a client-controlled request value.
