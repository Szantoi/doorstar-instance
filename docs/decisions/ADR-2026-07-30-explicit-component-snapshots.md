# ADR — Explicit, immutable component snapshots before Doorstar formula migration

Date: 2026-07-30

## Context

The order aggregate, technical catalog, approval hash and document-version
chain are stable enough to begin DSORD-05. The repository does not yet contain
an approved, versioned set of Doorstar door-component formulas. Legacy Excel
cell references and cached formulas are evidence, not production rules.

## Decision

The first calculator boundary accepts only explicit component output from an
active, configuration-backed adapter profile. Creation requires:

- an `APPROVED` order revision and its exact approval content hash;
- a configured calculator profile version and its configuration fingerprint;
- a human review note and explicit confirmation;
- stable component keys and exactly one source record per row;
- explicit finished and cutting dimensions for every `CUT_PART`;
- verified source records for standalone manufactured and supplementary items.

The snapshot starts in `REVIEW` and is not a production release. A separate
planner/approver decision closes it as `VERIFIED` or `REJECTED`. The snapshot
and its requirements are otherwise immutable. For one order revision and
calculator profile version, an identical payload is an idempotent replay. A
different payload is rejected as nondeterministic; corrected logic must use a
new profile version.

Each snapshot stores the exact approval audit, order content hash, technical
catalog version/fingerprint, adapter profile fingerprint, input/output hashes,
and downstream planning lineage keys. Materialization is refused for a
non-latest order revision.

No order dimension, free-text field, catalog label, Excel formula or missing
value is converted into a component default by this adapter.

## Consequences

DSORD-05 gains a safe persistence and lineage boundary now. Once Doorstar
approves typed calculation rules, a pure calculator can produce the same
explicit input contract without changing downstream component, cutting or
planning references. This decision does not create operation candidates,
production-board tasks, schedules or work packages.
