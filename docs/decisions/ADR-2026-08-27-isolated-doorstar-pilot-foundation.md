# ADR-2026-08-27 — Isolated Doorstar named-user pilot foundation

**Status:** Accepted for source reconstruction
**Date:** 2026-08-27

## Context

Doorstar needs a real, named-user sign-in path, but the historical
`production-service` and its database ledger are not a safe pilot baseline.
They contain retired operational concerns, legacy browser authority seams and
business-domain data that do not belong in the first authentication release.

The approved foundation design is recorded in the isolated-foundation packet
with SHA-256 `49162BC1047E378D8247385A990CE9989325A9A053CBB035B161609EAC95921C`.
It requires a clean, linear F → A → O → R reconstruction. The source
reconstruction was explicitly authorised on 2026-08-27. It does not authorise
any database, IdP, VPS, ingress, deployment or customer-data change.

## Decision

1. Create an independent `src/doorstar-pilot-foundation` package. It must not
   import the historical `production-service`, its Prisma client, or its
   routes.
2. Give the package its own Prisma schema and migration lineage for an empty,
   dedicated Doorstar pilot database. Historical migrations, tenant records
   and business aggregates are not copied or replayed.
3. The F phase contains only the isolated persistence/domain boundary:
   `PilotScope`, `AuthorizationTransaction`, `PrincipalBinding`,
   `OpaqueSession`, and append-only `BindingAudit`.
4. F contains no HTTP server, OIDC start/callback/logout route, IdP client,
   cookie, UI, Office business data, read model, Plant/Flow/Calculation
   connector, schedule write, or legacy authority fallback.
5. The role × capability policy remains server-side code. A browser, request
   header, URL, query parameter, or database caller-supplied audit label may
   not select a scope, role, station, capability, actor, or writer source.
6. The subsequent A phase must implement the approved DB-policy parity work:
   distinct migrator/runtime/bootstrap identities, DB-owned constrained writer
   routines, ACL/RLS proof and the separate bootstrap DSN. Those are source
   work now, but no migration is executed outside an approved disposable
   staging database.

## Consequences

- The new package is intentionally smaller than the historical application;
  this is isolation, not a refactor of the operational system.
- The only permissible external sign-in path in A will be server-side OIDC
  authorization-code + PKCE with an opaque browser session. There is no
  application-managed password or shared account.
- The first user-facing Office read model remains blocked until a separate
  data-owner decision. F/A alone therefore cannot expose customer business
  records.
- A production database must contain exactly one configured `PilotScope`.
  The F schema deliberately permits multiple immutable scopes only for a
  disposable staging isolation proof; the A startup preflight must reject any
  other production cardinality and may never accept a scope from browser input.
- Production activation remains blocked by an immutable RC, the completed
  P1 implementation and evidence, IdP/roster/DB/backup/ingress approvals, and
  the final release GO.
