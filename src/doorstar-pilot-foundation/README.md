# Doorstar pilot foundation

This package is the F phase of the isolated Doorstar named-user pilot. It owns
only the empty-database Prisma lineage and pure domain rules required before a
future OIDC BFF can exist.

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

The initial migration is source evidence only. Do not run it against a shared,
legacy, staging or production database. A later approved A phase adds the
database-owned writer routines, RLS/ACL boundary, separate bootstrap identity,
OIDC BFF and staging proof.

A production preflight will require exactly one configured `PilotScope`. The
schema permits two immutable scopes only in a disposable staging isolation
proof, never as a browser-selectable tenant mechanism.

## Safe checks

```powershell
npm ci
npm run prisma:validate
npm run verify:foundation
npm run test:unit
npm run build
```

`prisma:validate` always overrides `DATABASE_URL` with an inert loopback value
and runs schema parsing only. `verify:foundation` recreates the ignored local
`dist/` output before it inspects it; this rejects stale or extra runtime
artifacts. None of these commands creates an IdP client, starts a service,
runs a migration, or changes an external system.
