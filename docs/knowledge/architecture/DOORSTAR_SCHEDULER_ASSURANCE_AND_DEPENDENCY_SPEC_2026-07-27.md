# Doorstar Scheduler Assurance and Dependency Specification

**Date:** 2026-07-27  
**Status:** approved compatibility design; implementation gate remains the SpaceOS C# Planning contract  
**Purpose:** a testable, explainable scheduling model for Doorstar's important production commitments.

## Why this is strict

The accepted Excel workbook is the behavioural baseline, not a disposable prototype. A schedule must never silently turn a missing norm, calendar or invalid dependency into a credible delivery date. Every proposal is therefore versioned, explainable and publishable only after validation.

## International alignment

The model uses the four standard precedence relations used by Microsoft Project and Oracle Primavera P6: finish-to-start, start-to-start, finish-to-finish and start-to-finish. Both systems also model positive lag as delay and negative lag as overlap. Microsoft documents layered project, resource and task calendars; Primavera uses calendars for scheduling, tracking and resource leveling. Doorstar adopts these proven primitives, but keeps tenant identity, calendar revision and manual approval explicit.

- [Microsoft Project: task-link types and lag](https://support.microsoft.com/en-US/project/link-tasks-in-a-project)
- [Microsoft Project: calendar interaction](https://support.microsoft.com/en-us/project/work-with-calendars-in-project)
- [Oracle Primavera P6: relationships](https://docs.oracle.com/cd/G48902_01/English/User_Guides/p6_pro_user/relationships.htm)
- [Oracle Primavera P6: schedule checking](https://docs.oracle.com/cd/G48902_01/English/User_Guides/p6_pro_user/101251.htm)

## Canonical dependency contract

| Edge | Constraint on successor | Doorstar use |
|---|---|---|
| `FS` | start is not before predecessor finish plus lag | default sequential workshop route |
| `SS` | start is not before predecessor start plus lag | controlled concurrent preparation |
| `FF` | finish is not before predecessor finish plus lag | jointly completed inspection/finishing work |
| `SF` | finish is not before predecessor start plus lag | exceptional hand-off; requires an explanation |

An edge stores immutable predecessor/successor IDs, type, signed `lagMinutes`, optional partial-release threshold, author, reason and revision. FS is the default, but not a hidden one: every non-FS relation needs a reason. A legacy one-day FS shift is represented as a versioned Doorstar compatibility policy, not as a hard-coded day count.

### Multiple relationships and graph safety

All incoming edges constrain the same successor. The planner aggregates start and finish lower bounds and then finds the first resource-calendar slot satisfying every bound and capacity reservation. It does not discard an inconvenient predecessor.

Before calculation the system rejects unknown operation IDs, self-links, duplicate logical links, invalid lag/thresholds and every directed cycle. A cyclic network returns `invalid_dependency_graph`; it cannot yield a date or be published. The graph is stored with the planning run, including the deterministic topological order used for the proposal.

### Partial release, lead/lag and overrides

Partial release is not a casual date subtraction. For a threshold `p`, the C# calendar engine calculates the release point by advancing `ceil(estimatedDurationMinutes * p)` working minutes from the predecessor start in the relevant calendar. Breaks, closures and DST are therefore respected. `p` must be greater than zero and at most one.

The legacy precedence is retained: authorised fixed start, then calculated partial release, then FS/SS-derived start. Finish precedence is authorised fixed finish, then FF/SF-derived finish. A fixed start/finish pair that cannot accommodate the estimated work or its calendar is a validation error, never an automatic compression. Every override records actor, reason, original bound and resulting impact.

## Calendar and capacity contract

All timestamps use `Europe/Budapest`. Norms and relationship lags preserve their supplied numeric-minute precision; the C# calendar engine applies a documented, versioned rounding policy when it allocates real calendar slots. The planner uses a versioned tenant calendar with recurring shifts, breaks, dated closures, maintenance, overtime and per-resource concurrent capacity. It uses the intersection required by the operation/resource policy, not an assumed eight-hour weekday. No task-calendar override may ignore a resource calendar without an authorised, audited exception.

The calculator keeps these separate facts:

- elapsed duration: `quantity × norm minutes` plus approved setup/allowance;
- labour demand: elapsed duration times approved workforce requirement;
- available capacity: resource calendar minutes multiplied by configured concurrent capacity;
- reservation: a published allocation, not an estimate.

An incomplete norm, resource, unit, calendar or dependency returns a named warning such as `needs_standard`, `needs_calendar` or `invalid_dependency_graph`; publication is disabled but visible.

## Calculation run and audit contract

A planning run contains the tenant ID resolved server-side, input operation revision, standard revision, resource/calendar revision, dependency graph revision, calculation policy version, generated bounds, selected slots, warnings and result hash. Publishing creates immutable capacity reservations from that run. Recalculation creates a new run; it never changes a published history in place.

The Doorstar UI only renders the C# proposal and audit data. It never recalculates dates locally. Any difference from the Excel compatibility corpus is classified as parity, approved capacity/calendar improvement, or defect.

## Mandatory verification ladder

1. Unit tests: all FS/SS/FF/SF bounds, signed lag, partial release, override precedence, invalid values and graph cycles.
2. Calendar tests: shift boundaries, breaks, weekends, holidays, downtime, overtime and Europe/Budapest daylight-saving changes.
3. Capacity tests: one/many resources, contention, concurrent capacity, indivisible work and split-work policy.
4. Contract tests: generated C# OpenAPI client, tenant/RLS negative cases and idempotent import/publication.
5. Golden compatibility tests: selected workbook examples for normal, FS, SS, FF, SF, weekend, extra-day, partial-release, fixed-date and missing-data scenarios.
6. Shadow UAT: compare every proposal with approved workbook output before reservation publication.

The release gate is zero unexplained golden-test differences, no critical schedule-check finding, an approved Doorstar calendar, and explicit human approval. This is the minimum needed to protect the trust basis; no production deployment is implied by this document.
