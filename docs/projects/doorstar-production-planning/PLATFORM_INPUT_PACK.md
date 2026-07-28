# Doorstar planning input packs

**Status:** ready for platform review; no import or publication is authorised.

This is the Doorstar response to the four inputs requested in the accepted
platform handoff. The immutable base payload is
[`fixtures/doorstar-planning-input-pack.v1.json`](fixtures/doorstar-planning-input-pack.v1.json).
The versioned expansion is
[`fixtures/doorstar-planning-input-pack.v2.json`](fixtures/doorstar-planning-input-pack.v2.json).
Each contains representative catalogue rows, compatibility vectors and a
calendar draft only. Neither copies a source workbook or includes customer or
employee data.

`v1` is permanently pinned to SHA-256
`D7D84A3E54016108CDDB9E1686DF108D0A1C1DBA39855ADA0628ABF3C87BC837`.
The v2 file declares this predecessor and adds the final partial-release/FS
warning vector without changing v1.
Its declared SHA-256 is
`7BB8A9243D19E1A5E28979CBBE795E8A99AC259B4F24A63A65C8BF572F822A55`.
The manifest at
[`fixtures/doorstar-planning-input-pack.manifest.json`](fixtures/doorstar-planning-input-pack.manifest.json)
is checked by both `npm run test:unit` and `npm run verify:planning-input-pack`.
Changing either fixture therefore requires an intentional version/hash update.

`npm run test:unit` verifies the pack against the pure calculation, dependency
and calendar references: 29 tests passed on 2026-07-27. `npm run build` passed.
The same preflight now emits a machine-readable review verdict and never turns
the calendar draft into an import or reservation.

Run `npm run verify:planning-input-pack` from `src/production-service` to
produce the review verdict. It exits non-zero for an invalid fixture, while
platform-owned approval workflow setup remains explicit `action_required`.

## What is ready

1. **Legacy calculation and dependency vectors:** elapsed duration, labour
   demand and eight-hour/extra-day semantics are explicit. FS, SS, FF and SF
   precedence, lag, partial release and fixed start/finish overrides are also
   executable compatibility vectors; fixed bounds intentionally override a
   derived bound. ADR-069 §4 records that partial release unconditionally
   overrides an FS lower bound, including when it is later; the later case
   carries the `partial_release_delays_fs_start` planner warning.
2. **Versioned source provenance:** both source workbooks have immutable SHA-256
   fingerprints. The unit-time sample rows retain their stable source task key,
   source row and source lookup qualifiers.
3. **Calendar draft:** the supplied H–P CNC pattern is 07:00–16:00, with 20
   minutes at 09:00, 30 minutes at 12:00 and 10 minutes at 14:00. This is a
   Doorstar-only, versioned draft profile—not a platform default or a runtime
   constant. Its calculated 480 net minutes/day matches the current legacy
   workbook baseline. It cannot be turned into a reservation or a
   delivery-date promise.

Calendar configuration is tenant data: every workshop can define its own
resources, shifts, breaks and approval threshold. A change creates a new
profile revision with its own effective interval; it must not silently rewrite
the calendar that an existing planning proposal used.

## Approval workflow

Approval rules are not part of this fixture and have no defaults in the
Doorstar adapter. The future C# tenant-policy service owns the configured
reviewers, quorum, delegation, separation-of-duties and audit records. It may
allow one or many approvers, per workshop, resource, calendar revision or
release type. A platform policy and its authenticated records are required
before a platform import, reservation or release.

## Required before import or reservation

- Configure the tenant approval workflow in the published C# platform:
  reviewers, quorum, delegation and audit requirements are chosen there, not
  copied from this fixture.
- Approve the active calendar revision through that workflow, including all
  weekday shifts, breaks, capacity, closures, downtime and overtime exceptions.
- Approve the resource mapping for each catalogue operation. The source
  resource labels are provenance, not automatically accepted platform keys.

## Requested platform response

Use this pack in PLAN-01/PLAN-02 to validate the proposed Planning namespace,
the standard-import shape and the OpenAPI draft. Return the published contract
version/hash, signed product manifest, world-to-module capability result and
RLS proof gate before Doorstar starts DSPLAN-02 import. The browser must treat
JWT `enabled_modules` only as a display hint; the server enforces entitlement,
enabled state and tenant isolation independently.
