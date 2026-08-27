# Doorstar pilot — operations and release gate

This is an execution checklist for the isolated named-user pilot. It is not an
instruction to perform any of these actions automatically. Every external
action remains subject to a separately recorded human operations approval.

The runtime source implementation is deliberately unable to create an IdP
client, database login, database, mapping, ingress, listener or deployment.
The separately gated A-03 proof harness is the sole exception: after an exact
human acknowledgement it may create only a generated, local, disposable
PostgreSQL 16 container, database and identities, all of which it destroys at
the end of that proof. It cannot receive a production connection string or
perform a deploy. The legacy Doorstar operational surface and JoineryTech
Plant are outside this pilot.

## A-03 source harness

`src/doorstar-pilot-staging-proof` is the reviewed, disposable-only Gate 1
harness. Its `npm test`, build and lint commands are source-only checks and
must not start Docker. Its `proof:docker` command is intentionally fail-closed:
it requires an exact one-run acknowledgement, a clean committed candidate, a
generated loopback-only PostgreSQL 16 container with tmpfs storage, and it
destroys that container in its finalizer. The package README is the detailed
operator reference; this document remains the approval authority.

## Gate 0 — immutable source candidate

Before any staging environment exists, record one immutable candidate commit
and its package-lock hashes. The candidate must pass, from a clean checkout:

- `src/doorstar-pilot-foundation`: source verifier, unit tests, Prisma
  validation/generation, build and lint;
- `src/doorstar-pilot-bff`: unit tests, build, lint and production-dependency
  audit;
- `src/doorstar-pilot-bootstrap`: unit tests, build, lint and
  production-dependency audit.

The approval record must name the candidate commit, the reviewer, the
environment classification and the permitted next action. It must not contain
credentials, raw OIDC subjects, browser tokens or customer data.

## Gate 1 — disposable staging isolation proof

This is a separate human-approved test, never a production rehearsal.

1. Provision a new disposable PostgreSQL database and separate, non-shared
   migrator, runtime and bootstrap identities. Do not reuse a legacy Doorstar
   or Plant database, role, backup or connection string.
2. Apply only the immutable candidate migration lineage. Record migration and
   function hashes before testing.
3. Use the separately reviewed disposable-only two-scope fixture described in
   the A-phase ADR. It must be outside the production Prisma lineage, alter
   only the closed two-scope guard, record every changed function hash, and be
   destroyed with the test database.
   The runtime proof login also needs narrowly scoped `EXECUTE` on
   `pilot.doorstar_current_pilot_scope_id()` because the protected-table RLS
   policies invoke that helper. This is read-context support, not writer
   authority; bootstrap receives no corresponding grant unless a separately
   reviewed read policy requires it.
4. Prove with two distinct database PIDs and both source identities:
   RLS/ACL isolation, absent-or-wrong-scope denial, pool-context reset,
   routine-specific write authority, no raw-DML authority, first/last-manager
   protection, append-only audit behavior and serializable write-skew
   rejection.
5. Destroy the disposable database and fixture. Preserve only redacted test
   evidence and checksums; do not promote the fixture, its identities or its
   data to an RC.

Any failure or unrecorded divergence returns the work to source review.

## Gate 2 — release-candidate operations design

For a newly approved RC, the operations, identity and data owners must review
and record all of the following:

- a dedicated pilot database and backup/restore test, distinct from legacy
  Doorstar and Plant;
- a confidential OIDC authorization-code client, exact HTTPS callback origin,
  issuer, token/JWKS endpoints, approved asymmetric ID-token algorithms and
  server-side secret injection;
- a fixed single pilot scope, approved named roster and least-privilege
  database identities/mapping/ACLs required by the reviewed stored routines
  and RLS policies, including runtime-only `EXECUTE` on
  `pilot.doorstar_current_pilot_scope_id()` for protected-table reads;
- confirmation that the roster contains Doorstar Office roles only; Plant
  `SHOP_FLOOR` authority remains outside this database and BFF; and
- verified database TLS, BFF listener/TLS termination, host-only cookie origin
  and ingress rule; and
- logging, incident rollback, secret rotation and availability ownership.

No browser header, query field or client-supplied token may become a role,
scope, actor, station or Plant authority during this work.

## Gate 3 — controlled production activation

Only after Gates 0–2 are accepted may the authorised operator:

1. create the dedicated pilot database and apply the immutable RC migration;
2. create the separately approved database identities and exact writer-role
   mapping/grants documented by the migration;
3. configure the OIDC client and inject secrets through the approved secret
   store, never through source control or a browser;
4. deploy the BFF behind the approved HTTPS ingress, then run its fixed-scope
   preflight;
5. use the separate bootstrap CLI only for the reviewed, approved named roster
   operations; and
6. perform a documented named-user sign-in, logout, deactivation and recovery
   check without customer business-data or Plant authority.

The release record must include the final GO authority, source commit, masked
environment identifiers, preflight outcome, backup/restore evidence and
rollback decision. If any item is absent, the pilot remains inactive.
