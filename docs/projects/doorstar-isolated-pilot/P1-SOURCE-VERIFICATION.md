# P1 source verification contract

This is a source-only contract for the A-phase authorization policy. It is not
PostgreSQL evidence and must never be presented as a completed staging proof.

## Required source assertions

- The F initial migration is unchanged; the A migration is append-only and
  relocates the empty lineage into the `pilot` schema.
- `PrincipalBinding`, `OpaqueSession` and `BindingAudit` use `ENABLE` and
  `FORCE ROW LEVEL SECURITY`, with only `app.current_pilot_scope_id` as the
  scope context.
- The historical `SHOP_FLOOR` enum value is rejected by a database constraint
  on `PrincipalBinding` and explicit guards in both reviewed role writers. It
  is Plant execution vocabulary, never a Doorstar Office principal.
- Empty writer-role configuration fails closed. No credential, `CREATE ROLE`,
  hardcoded production login, `PUBLIC EXECUTE`, wildcard table grant, raw
  runtime/bootstrap binding-audit DML, `X-Role`, `X-Station` or
  `X-Principal` authority is permitted.
- The database manager helper is an explicit whitelist matching the TypeScript
  policy. `SHOP_FLOOR` is never an effective manager.
- Direct and bootstrap writers check original `session_user`, serializable
  transaction isolation, non-empty scope GUC, fixed `search_path`, and DB-owned
  source/audit witness fields. Bootstrap is limited to provision/revoke.
- Authorization transaction creation and consumption are also DB-owned runtime
  routines; the BFF receives no raw `AuthorizationTransaction` write path.
- The BFF has only the four authentication endpoints, fixed server scope,
  authorization-code + PKCE, opaque cookies and no JIT provisioning.

## Deferred evidence

Only a separately approved, disposable PostgreSQL staging database can prove
the actual role mapping, ACLs, RLS behavior, two-scope/two-PID isolation,
pool-context reset, first/last-manager protection, audit append-only behavior
and write-skew rejection. No source test may connect to that database.

The reviewed production migration intentionally requires one scope in every
writer transaction, so the two-scope exercise requires a future, separately
approved disposable proof fixture outside the production migration lineage.
That fixture is not implemented by P1 and must be hash-diffed against the RC,
limit its divergence to a closed two-scope test guard, and be destroyed with
the proof database. It may not be run against a release candidate or a
production database.
