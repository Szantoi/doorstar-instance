# Doorstar A-03 disposable staging proof

This package is a **disposable proof harness**, not Doorstar runtime code. It
is intentionally outside the production Prisma lineage and is not imported by
`doorstar-pilot-foundation`, `doorstar-pilot-bff`, or
`doorstar-pilot-bootstrap`.

It exists to demonstrate that the approved one-scope authorization policy can
be exercised with exactly two generated scopes in an isolated test database.
It must never be pointed at a historical, shared, customer, Plant, staging, or
production database.

## What source-only commands do

These commands never invoke Docker, PostgreSQL, an IdP, a VPS, or an external
database:

```powershell
npm run lint
npm run build
npm run verify:fixture
npm run verify:boundary
npm run test:gate0
npm run test:gate1
npm test
```

`verify:fixture` reads the two immutable foundation migrations and proves that
the fixture replaces only these three functions:

1. `pilot.doorstar_require_pilot_write_context(p_source pilot."BindingAuditSource")`
2. `pilot.pilot_runtime_preflight_v1()`
3. `pilot.pilot_bootstrap_preflight_v1()`

It compares each replacement with the A-phase source and permits one change
only: the production one-scope guard becomes a literal, closed two-scope guard.
The runner generates fresh UUID/scope-key pairs per run and renders them only
in memory. No production-like scope values are hard-coded.

## Current Gate 1 execution status

The local `proof:docker` entry point is intentionally **disabled**. It is a
tracked, import-free hard stop that always reports
`a03_gate1_external_trust_anchor_required`; it does not parse an
acknowledgement, read a candidate or external artifact, start a child process,
write evidence, or contact Docker. The package exposes no `main` or `bin`
entry point, and its package whitelist excludes `dist`. It cannot be used to
create a disposable database today.

This is deliberate: a verifier loaded from the candidate checkout and an
unsigned approval JSON file cannot authenticate their own authority. A future
run requires a separately released verifier artifact and an independently
administered, authenticated one-run approval anchor. See
[`ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md`](../../docs/decisions/ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md).

## Historical execution design — not an operator procedure

The following describes constraints that the future independent verifier must
enforce. It is not a command to run from this checkout and cannot authorize or
start Docker here. There is deliberately no local command line for this
historical sequence.

The capsule and acceptance marker must already be verified by the Gate 0 tool
for the exact, clean candidate. The marker binds the approved source-check
evidence structurally; the authoritative human Gate 0 record stays external.
The acknowledgement is deliberately not an approval credential and may not be
used as one. A future execution requires a separately recorded, authenticated
one-run human approval for the disposable staging proof. It is never part of
normal build, lint, unit-test, deploy, or application startup behavior.

Prerequisites for a future external verifier only:

- Docker Desktop is ready for Linux containers;
- `postgres:16` can be inspected or pulled by Docker;
- the sibling `doorstar-pilot-foundation` package has its reviewed Prisma CLI
  dependencies installed (`npm ci` or equivalent);
- no secrets, production DSNs, IdP credentials, or customer data are supplied.

The future external verifier would create a new generated-name `postgres:16`
container with:

- `127.0.0.1:0:5432` only — a dynamically allocated loopback port, never a
  fixed or public port;
- a tmpfs data directory, no bind, named, or anonymous volume accepted;
- a generated disposable cluster admin plus distinct generated
  `NOSUPERUSER NOBYPASSRLS NOINHERIT` migrator, runtime, and bootstrap logins;
- a fresh database owned by the non-superuser migrator.

It would run the immutable migrations through the foundation Prisma CLI as that
migrator, then check the real `public._prisma_migrations` ledger/checksums.
Before Docker activity it must require a clean Git worktree and verify the
external Gate 0 capsule plus acceptance marker against that exact candidate;
source drift or an unaccepted candidate fails closed. It proves that Docker's
fixed `default` context resolves to the allowlisted local engine endpoint with
no inherited Docker/container-runtime endpoint override. The candidate and
provenance are verified again immediately before container creation.
It would capture every `pilot` function's definition, owner, ACL, security-definer
flag, and configuration before and after the fixture. Exactly the three
approved definitions must change; all other function manifests stay identical.

The proof would capture the concrete immutable PostgreSQL image ID and, when Docker
provides one, the `postgres@sha256:…` repository digest in redacted evidence.
It also grants the runtime identity (and only that identity) narrow EXECUTE on
`pilot.doorstar_current_pilot_scope_id()` for the reviewed RLS read policies,
and on
`pilot.doorstar_is_effective_pilot_roster_manager(boolean, pilot."PilotOfficeRole", boolean)`.
The latter is the immutable, non-writing boolean predicate required by the
direct writer's DB-owned invariant. It also grants runtime-only EXECUTE on
`pilot.doorstar_pilot_roster_lock_key(uuid)`, the immutable pure helper used by
the direct writer's serializable manager-loss trigger. None of these grants
confers table DML or writer authority. Runtime also has EXECUTE on
`pilot.doorstar_require_effective_pilot_roster_manager(uuid)`, the RLS-scoped
non-writing void/`23514` invariant check used by that trigger chain; it is not
an EXECUTE grant on a trigger function. The bootstrap identity remains denied
all of them. A real DBA/operations runtime grant must preserve the same boundary
outside this disposable harness and remains separately approved.

The executable proof includes separate-session/PID two-scope RLS checks,
transaction-local GUC reset via a real `pg.Pool({ max: 1 })`, absent/wrong GUC
and non-serializable writer denial, six-table raw-DML denial, source-specific
ACL denial, role/PUBLIC/ownership/BYPASSRLS/`SET ROLE` checks, bootstrap and
direct-manager audit checks, one-time authorization-transaction consumption,
append-only audit enforcement, last-manager revoke denial, and concurrent
serializable manager write-skew protection.

The container is destroyed in `finally`, including failed proofs. The runner
writes a local ignored `evidence/*.json` record containing only hashes,
timestamps, fixed PASS markers, and a safe failure code. It never records a
connection string, role name, password, scope UUID/key, token, raw SQL, or
customer data.

## Deliberate limits

This proof does not deploy Doorstar, create a real user, contact an IdP,
change ingress/VPS/Plant state, or make login live. Passing it is a necessary
disposable-staging gate, not authorization for a production migration or
release.
