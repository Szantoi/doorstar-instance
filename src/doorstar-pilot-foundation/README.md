# Doorstar pilot foundation

This package preserves the immutable F foundation capsule and owns the A-phase
PostgreSQL policy source for the isolated Doorstar named-user pilot. It remains
an identity/session/audit package only; the sibling BFF owns HTTP and OIDC.

It has deliberately **no** HTTP listener, port, OIDC client, cookie, UI,
business read model, legacy Office import, Plant integration, Flow/Calculation
integration, or direct database provisioning command.

## Data boundary

- `PilotScope` is the single immutable local tenant-equivalent.
- `AuthorizationTransaction` stores only hashed or encrypted callback state.
- `PrincipalBinding` records a named IdP person by issuer plus a protected
  subject digest; it stores no e-mail, password, MFA factor or raw subject.
- `OpaqueSession` stores a hash and server-side protected handle only.
- `BindingAudit` is append-only by design and contains no browser-selected
  actor, tenant or free-form writer source.

The initial F migration is hash-pinned and immutable. The append-only A
migration moves the empty lineage into the dedicated `pilot` schema and adds
DB-owned authorization-transaction, roster, bootstrap and session routines.
It seeds neither database login nor ACL mapping; an empty mapping fails closed.
Do not run either migration against a shared, legacy, staging or production
database without the separately approved operations gate.

A production preflight and every writer transaction require exactly one
configured `PilotScope`. A future two-scope isolation exercise needs a
separately approved disposable-only fixture outside this production lineage;
it is not an alternative tenant model and is never browser-selectable.

## Safe checks

```powershell
npm ci
npm run prisma:validate
npm test
npm run build
npm run lint
```

`prisma:validate` always overrides `DATABASE_URL` with an inert loopback value
and runs schema parsing only. `npm test` runs the F capsule verifier and the
A-policy source verifier before unit tests; the F verifier recreates ignored
local `dist/` output before inspection and the A verifier never opens a
PostgreSQL connection. None of these commands creates an IdP client, starts a
service, runs a migration, or changes an external system.
