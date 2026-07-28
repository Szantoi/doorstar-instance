# DSPLAN-01 — Legacy calculation compatibility baseline

**Status:** completed, 2026-07-27

## Delivered

- Pure TypeScript reference calculation at
  `src/production-service/src/services/planning/legacyPlanningBaseline.ts`.
- It preserves `volume × unit time`, separate workforce/labour and legacy
  eight-hour day plus extra-day semantics.
- Incomplete inputs are explicit and ineligible for automatic planning; no
  zero-duration plan is silently published.
- Database-free test command: `npm run test:unit`.

## Evidence

`npm run test:unit` passed: 4 tests. `npm run build` passed.

## Boundary

This module has no route, database write or scheduling side effect. The C#
SpaceOS service remains the future authoritative planner.

## Finalised partial-release compatibility rule

The Doorstar business owner decision recorded by platform ADR-069 §4 is
represented in the dependency compatibility reference and input pack: partial
release unconditionally overrides an FS lower bound, even when it yields a
later start. That specific case has an explicit
`partial_release_delays_fs_start` warning so the platform proposal can explain
the delay. Converting the percentage to a calendar-aware release instant
remains exclusively the future C# calendar engine's responsibility.
