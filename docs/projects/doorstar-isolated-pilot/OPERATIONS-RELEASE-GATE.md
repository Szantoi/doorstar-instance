# Doorstar pilot — operations and release gate

This is an execution checklist for the isolated named-user pilot. It is not an
instruction to perform any of these actions automatically. Every external
action remains subject to a separately recorded human operations approval.

The runtime source implementation is deliberately unable to create an IdP
client, database login, database, mapping, ingress, listener or deployment.
The checked-out A-03 proof source is not an exception: it is intentionally
unable to start Docker or create a database, even after an exact human
acknowledgement. It stops before any candidate, provenance, Git, Docker,
Prisma, PostgreSQL, or evidence operation until a separately released verifier
and independently administered authenticated approval anchor exist. It cannot
receive a production connection string or perform a deploy. The legacy
Doorstar operational surface and JoineryTech Plant are outside this pilot.

## A-03 source harness

`src/doorstar-pilot-staging-proof` is reviewed source material for a future,
disposable-only Gate 1 verifier. Its `npm test`, build and lint commands are
source-only checks and must not start Docker. Its guarded `proof:docker` CLI
is intentionally fail-closed with
`a03_gate1_external_trust_anchor_required`; it does not presently verify Gate
0, inspect Docker, create a container, or write proof evidence. The exact
operator acknowledgement remains an intent signal, not an approval credential.
The future independent verifier must bind the clean candidate, authenticated
one-run approval, immutable runtime inputs, and local Docker constraints before
it can create a loopback-only tmpfs PostgreSQL 16 container. The package README
and the external-trust-anchor ADR are the detailed source references; this
document remains the approval authority.

## Gate 0 — immutable source candidate

Before any staging environment exists, bind one clean candidate commit to the
versioned check plan and its package-lock hashes with the source-only
[`GATE0-CAPSULE.md`](GATE0-CAPSULE.md) tool. Its
`CANDIDATE_BOUND_NOT_EXECUTED` capsule is technical identity evidence only; it
does not run or attest to candidate package code.

In a separately approved, isolated source-verification environment, the same
clean candidate must then pass:

- `src/doorstar-pilot-foundation`: source verifier, unit tests, Prisma
  validation/generation, build and lint;
- `src/doorstar-pilot-bff`: unit tests, build, lint and production-dependency
  audit;
- `src/doorstar-pilot-bootstrap`: unit tests, build, lint and
  production-dependency audit.

The Gate 0 approval record must name the candidate commit, capsule SHA-256,
reviewer, environment classification, redacted source-check outcomes and the
permitted next action. It must not contain credentials, raw OIDC subjects,
browser tokens or customer data. Only after that human Gate 0 acceptance may
the record permit the separate human-approved Gate 1 proof.

## Gate 1 — disposable staging isolation proof

This is a separate human-approved test, never a production rehearsal.

**Current state: blocked before execution.** No checked-out source command may
perform the following steps. They are the required contract for a future
candidate-independent verifier after a separate operations/security decision
has provisioned an immutable verifier artifact and authenticated approval
anchor.

1. Supply the exact Gate 0 capsule and its separately recorded human acceptance
   marker for the immutable candidate. The source verifier must bind both to
   the clean candidate before any Docker command. This proves structured
   provenance, not the identity of the approver; the external human record
   remains authoritative.
2. Use only a proven local Docker `default` context with no endpoint/context
   override inherited from the environment. A remote, custom or ambiguous
   container engine is a stop condition; the proof must never fall back to
   Podman or another runtime.
3. Provision a new disposable PostgreSQL database and separate, non-shared
   migrator, runtime and bootstrap identities. Do not reuse a legacy Doorstar
   or Plant database, role, backup or connection string.
4. Apply only the immutable candidate migration lineage. Record migration and
   function hashes before testing.
5. Use the separately reviewed disposable-only two-scope fixture described in
   the A-phase ADR. It must be outside the production Prisma lineage, alter
   only the closed two-scope guard, record every changed function hash, and be
   destroyed with the test database.
   The runtime proof login also needs narrowly scoped `EXECUTE` on
   `pilot.doorstar_current_pilot_scope_id()` because the protected-table RLS
   policies invoke that helper, and on
   `pilot.doorstar_is_effective_pilot_roster_manager(boolean, pilot."PilotOfficeRole", boolean)`
   because the direct writer's DB-owned invariant invokes that immutable,
   non-writing predicate, and on `pilot.doorstar_pilot_roster_lock_key(uuid)`
   because its serializable manager-loss trigger invokes that immutable pure
   helper, plus `pilot.doorstar_require_effective_pilot_roster_manager(uuid)`
   for that trigger chain's RLS-scoped, non-writing void/`23514` invariant
   check. These are not EXECUTE grants on trigger functions and none is writer
   authority; bootstrap receives no corresponding grant unless a separately
   reviewed policy requires it.
6. Prove with two distinct database PIDs and both source identities:
   RLS/ACL isolation, absent-or-wrong-scope denial, pool-context reset,
   routine-specific write authority, no raw-DML authority, first/last-manager
   protection, append-only audit behavior and serializable write-skew
   rejection.
7. Destroy the disposable database and fixture. Preserve only redacted test
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
- a redacted callback-compatibility proof against the BFF's exact `GET`
  `code` + `state` contract. The proof may name only accepted/rejected
  parameter names, never their values, tokens, cookies or subjects. A provider
  that emits `session_state`, `iss`, error fields or a form post is not
  compatible until separately reviewed source work changes the contract; it
  must not be rewritten away at an ingress or proxy. See
  [`OIDC-CLIENT-COMPATIBILITY.md`](OIDC-CLIENT-COMPATIBILITY.md);
- a fixed single pilot scope, approved named roster and least-privilege
  database identities/mapping/ACLs required by the reviewed stored routines
  and RLS policies, including runtime-only `EXECUTE` on
  `pilot.doorstar_current_pilot_scope_id()` for protected-table reads and on
  `pilot.doorstar_is_effective_pilot_roster_manager(boolean, pilot."PilotOfficeRole", boolean)`
  as direct-writer, non-writing predicate support, plus
  `pilot.doorstar_pilot_roster_lock_key(uuid)` as non-writing serializable
  manager-loss-trigger support and
  `pilot.doorstar_require_effective_pilot_roster_manager(uuid)` as its
  RLS-scoped non-writing void/`23514` invariant-check support;
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
