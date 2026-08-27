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

## The separately approved disposable run

The only command capable of Docker activity is `npm run proof:docker`. It
refuses to start unless both the CLI argument (provided by the script) and this
exact, one-run environment acknowledgement are present:

```powershell
$env:DOORSTAR_A03_ACKNOWLEDGEMENT = "I_CONFIRM_A03_DISPOSABLE_POSTGRES_16_PROOF"
npm run proof:docker
Remove-Item Env:DOORSTAR_A03_ACKNOWLEDGEMENT
```

Running that command requires separate human approval for the disposable
staging proof. It is never part of normal build, lint, unit-test, deploy, or
application startup behavior.

Prerequisites after that approval:

- Docker Desktop is ready for Linux containers;
- `postgres:16` can be inspected or pulled by Docker;
- the sibling `doorstar-pilot-foundation` package has its reviewed Prisma CLI
  dependencies installed (`npm ci` or equivalent);
- no secrets, production DSNs, IdP credentials, or customer data are supplied.

The guarded runner creates a new generated-name `postgres:16` container with:

- `127.0.0.1:0:5432` only — a dynamically allocated loopback port, never a
  fixed or public port;
- a tmpfs data directory, no bind, named, or anonymous volume accepted;
- a generated disposable cluster admin plus distinct generated
  `NOSUPERUSER NOBYPASSRLS NOINHERIT` migrator, runtime, and bootstrap logins;
- a fresh database owned by the non-superuser migrator.

It runs the immutable migrations through the foundation Prisma CLI as that
migrator, then checks the real `public._prisma_migrations` ledger/checksums.
Before Docker activity it also requires a clean Git worktree and records the
candidate commit SHA in redacted evidence; source drift fails closed.
It captures every `pilot` function's definition, owner, ACL, security-definer
flag, and configuration before and after the fixture. Exactly the three
approved definitions must change; all other function manifests stay identical.

The proof captures the concrete immutable PostgreSQL image ID and, when Docker
provides one, the `postgres@sha256:…` repository digest in redacted evidence.
It also grants the runtime identity (and only that identity) narrow EXECUTE on
`pilot.doorstar_current_pilot_scope_id()`: the reviewed RLS read policies call
that helper. This is RLS-read support, not writer authority; the bootstrap
identity remains denied. A real DBA/operations runtime grant must preserve the
same boundary outside this disposable harness.

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
