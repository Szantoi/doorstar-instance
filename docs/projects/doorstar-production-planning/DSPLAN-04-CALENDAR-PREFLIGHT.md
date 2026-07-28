# DSPLAN-04 — Doorstar resource-calendar preflight

**Status:** implementation complete; platform calendar import remains blocked

## Goal

Validate the recurring Doorstar resource calendar before an adapter sends it to SpaceOS Production Planning. The preflight creates neither a calendar nor a capacity reservation.

## Delivered behaviour

`src/production-service/src/services/planning/calendarConfigPreflight.ts` is deterministic and non-mutating. Every resource needs a stable key, source revision, one or more recurring shifts, positive capacity and exact local `HH:mm` times.

- Rejects zero, invalid or unapproved fractional capacity.
- Rejects missing or invalid shifts, plus invalid, outside-shift or overlapping breaks.
- Quarantines duplicate resource records rather than silently merging capacity.
- Requires explicit `integer` or `fractional_fte` capacity policy.

## Test evidence

`tests/calendarConfigPreflight.unit.test.ts` covers valid configuration, time and break errors, capacity policy and duplicate resources. It runs without PostgreSQL or Docker.

## Remaining gate

Doorstar must still approve real shifts, breaks, closures and capacities. The C# Planning OpenAPI and instance-pack schema are required before any calendar import or proposal.
