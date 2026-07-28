# DSPLAN-02 — Doorstar standard/resource import mapping

**Status:** preflight implementation complete; platform import remains blocked

## Goal

Create a controlled mapping from the Doorstar standard catalogue to the
published C# Planning import contract. The stable source task key and source
qualifiers identify a standard; a display label alone never does.

## Required inputs

- C# Planning OpenAPI/version and instance-pack schema;
- approved station/resource mapping;
- source unit interpretation and authoritative workbook revision;
- approved work calendar and capacity configuration.

## Acceptance

- unmapped/ambiguous rows are quarantined;
- each mapped row retains source provenance and standard revision;
- dry-run is non-mutating and reports mapping gaps.

## Delivered preflight

`src/production-service/src/services/planning/standardImportPreflight.ts`
provides a pure, non-mutating preflight for a catalogue extract. It accepts a
row only when it has a stable source key, operation, positive norm and
workforce, explicit approved resource and unit, source revision, and valid
qualifiers. Duplicate source-key/qualifier identities and incomplete rows are
quarantined with machine-readable reasons. It intentionally does not infer a
mapping from an operation label.

The unit tests in `tests/standardImportPreflight.unit.test.ts` cover accepted,
incomplete, equivalent-label, duplicate and malformed-qualifier cases.

## Remaining gate

### Modernised `Folyamat` operation boundary

`src/production-service/src/services/planning/folyamatOperationPreflight.ts`
is the next adapter boundary: an extracted Power Query `Folyamat` row becomes
a typed, auditable operation draft only when it has an immutable operation and
work-order key, positive quantity with an explicit unit, source revision and
an already-approved *qualified* standard identity. The adapter also carries
the legacy dependency metadata as typed data and quarantines malformed edges.

The draft now also requires the immutable source-order revision, the calculator
component key and calculator-output revision. This preserves the full Doorstar
lineage (`Gyártásmegrendelő → Kalkulátor → Folyamat`) before any future
platform handoff; the adapter must never reconstruct a component from an
operation label.

This deliberately reconstructs the business inputs, rather than copying cell
formulas. It does not calculate dates, reserve capacity, write to the Doorstar
database or call a platform endpoint. The generated C# client will be added
only after the published platform contract is available.

### Atomic source-export preflight

`src/production-service/src/services/planning/planningImportBatchPreflight.ts`
composes the norm and Folyamat checks for one immutable Power Query export. A
batch must name both a stable source identity and a revision/fingerprint. A
Folyamat row may use only a norm that passed its *own* preflight; a malformed
norm is therefore not accidentally accepted merely because its source key
matches. Dependency predecessors must also be ready in that same export: a
quarantined predecessor cannot leave an open edge behind for the platform.

The result is still a dry run: it contains ready and quarantined records plus
machine-readable issues, but makes no HTTP call and performs no scheduling.
It is the final Doorstar adapter staging format before the published Planning
OpenAPI determines the actual request DTO and handoff endpoint.

No data is imported or published yet. The C# Planning OpenAPI and instance
pack schema are still required before a Doorstar adapter can map this staging
format to the platform contract.
