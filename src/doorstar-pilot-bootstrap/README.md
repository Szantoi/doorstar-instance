# Doorstar pilot bootstrap CLI

This is a source-only, fail-closed CLI for the isolated Doorstar pilot's
approved bootstrap boundary. It has exactly three operations:

- `preflight`
- `provision`
- `revoke`

It does not start a service, contact an IdP, run a migration, create a
PostgreSQL login, or change external runtime state during development.
Applying migrations, assigning the distinct bootstrap DB identity, configuring
secrets/ingress and invoking this CLI against any database all require the
separate human operations approval described by the pilot decision record.

## Configuration boundary

The executable accepts only these server-side environment values:

- `PILOT_BOOTSTRAP_DATABASE_URL` — the dedicated bootstrap database identity.
- `DOORSTAR_PILOT_SCOPE_KEY` — the fixed server scope key resolved inside each
  database transaction.

It rejects startup if `DOORSTAR_PILOT_RUNTIME_DATABASE_URL`, `DATABASE_URL` or
`DOORSTAR_PILOT_DATABASE_URL` is present. It also rejects every ambient `PG*`
connection variable, incomplete DSNs and all DSN query options. The DSN must
explicitly contain the bootstrap host, port, database, user and password. The
adapter constructs an explicit `pg` configuration and requires verified TLS,
so there is no runtime-DSN, ambient-identity or TLS-downgrade fallback. There
is no CLI argument for scope, database URL, actor key or correlation ID.

## Operations

All options use `--name value` syntax. The provision and revoke data is passed
only to the reviewed stored routines; the CLI never uses raw DML or an
operator-provided SQL string.

```powershell
# Proves the fixed configured scope and bootstrap DB identity through
# pilot.pilot_bootstrap_preflight_v1().
node dist/cli.js preflight

# The subject digest must already be a 64-hex, server-approved digest. The
# CLI generates the actor key and correlation UUID in memory and never prints
# the actor key.
node dist/cli.js provision `
  --issuer https://login.example.test/tenant `
  --subject-digest 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef `
  --display-name "Pilot administrator" `
  --role ADMINISTRATOR `
  --can-manage-pilot-roster true `
  --approval-reference CHG-1234

node dist/cli.js revoke `
  --binding-id 11111111-1111-4111-8111-111111111111 `
  --expected-audit-version 1 `
  --approval-reference CHG-1235
```

Provision intentionally accepts no raw OIDC subject, token, password, client
secret, actor key or correlation ID. Revoke intentionally accepts no role,
reactivation, session or arbitrary binding update. The returned operational log
contains only the operation, binding identifier and correlation identifier;
it never prints the DSN, subject digest or actor key.

## Database transaction boundary

Every database operation borrows one checkout from `pg`, then performs, on the
same connection and in this order:

1. `BEGIN ISOLATION LEVEL SERIALIZABLE`
2. resolve the fixed `DOORSTAR_PILOT_SCOPE_KEY` to exactly one scope ID
3. `set_config('app.current_pilot_scope_id', $1, true)`
4. `pilot.pilot_bootstrap_preflight_v1()`
5. the selected bootstrap routine, if any
6. `COMMIT`, or `ROLLBACK` on every failure

The only non-routine query is the fixed, parameterized scope lookup required
to establish the database-owned scope context. There is no generic query
surface or direct `INSERT`, `UPDATE`, `DELETE`, binding update, session
operation or direct-admin path in this package.

## Local source verification

```powershell
npm install --ignore-scripts
npm test
npm run build
npm run lint
```
