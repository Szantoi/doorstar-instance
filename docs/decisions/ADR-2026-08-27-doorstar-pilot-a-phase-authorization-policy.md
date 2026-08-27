# ADR-2026-08-27 — Doorstar pilot A-phase authorization policy

**Status:** Accepted for isolated source implementation
**Date:** 2026-08-27

## Context

The isolated F foundation is committed at `fcfd9d4`. It intentionally created
an empty initial Prisma lineage with unqualified PostgreSQL objects because no
database was provisioned or run in F. The approved A-phase security decision
now requires a separate physical `pilot` schema, fixed pilot-scope context,
separate runtime and bootstrap identities, and DB-owned roster writers.

The F migration is immutable evidence. It must not be rebased or edited. The
new physical schema is therefore introduced only through one append-only A
migration that moves the empty F objects into `pilot` before adding policy
objects and routines.

## Decision

1. The A migration creates `pilot` and moves all five F tables, their enums,
   and F trigger functions into it. Prisma thereafter maps every model and
   enum to `pilot`; no historical `Tenant`, `public` authorization object, or
   `app.current_tenant_id` contract is inherited.
2. The only application scope setting is transaction-local
   `app.current_pilot_scope_id`. The BFF resolves a fixed configured scope on
   the server. A browser never chooses a scope or GUC value.
3. Production startup must require exactly one persisted `PilotScope` matching
   the configured scope key. Multiple immutable scopes are permitted only in a
   separately approved, disposable staging isolation proof.
4. `PilotAuditWriterRole` is non-tenant policy configuration. It binds exactly
   `DIRECT_ADMIN` to the runtime login and `BOOTSTRAP_CLI` to the bootstrap
   login after a later DBA/operations step. The migration seeds no role names,
   credentials, users, or fallback mapping; an empty mapping fails closed.
5. Runtime may call only the DB-owned authorization-transaction, direct roster
   and session writers. Bootstrap may call only DB-owned provision/revoke writers and must use a
   distinct `PILOT_BOOTSTRAP_DATABASE_URL`. It has no role-change,
   reactivation, direct-admin or raw-DML path. Neither URL is inferred from
   the other.
6. The only public BFF routes are `GET /auth/login`, `GET /auth/callback`,
   `GET /auth/session`, and `POST /auth/logout`. It uses OIDC
   authorization-code + PKCE, validates a signed ID-token nonce by hashing it
   and comparing it to the stored nonce hash, and issues only an opaque,
   host-only browser cookie. It never JIT-provisions a binding or accepts a
   browser-selected role, actor, capability, scope, tenant, station or bearer
   token as authority.
7. `SHOP_FLOOR` remains only as immutable historical vocabulary in the F enum.
   It is Plant execution authority, not a Doorstar Office role: a database
   constraint and both reviewed role-writer routines reject it, and neither
   the BFF nor bootstrap CLI accepts it as an Office principal.
8. The P1 migration and BFF are source-only work. No migration, role creation,
   mapping seed, IdP client, secret, VPS, ingress, account, customer-data or
   deployment action is part of this decision.

## Consequences

- The prior F verifier remains a preserved foundation capsule; A receives its
  own strict boundary and P1-policy source verification. Neither verifier may
  be weakened to admit a new route, dependency, database writer, or legacy
  import.
- The resulting source is not proof that PostgreSQL ACLs or RLS are effective
  in a real database. The later, separately approved staging gate must prove
  two scopes, two runtime PIDs, empty-context reset, source-specific routine
  ACLs, first/last-manager behavior and write-skew rejection.
- The preserved enum value does not create a future Doorstar authority seam:
  any unexpected persisted `SHOP_FLOOR` row fails closed in the BFF, while the
  database rejects new or updated Office bindings carrying that role.
- The production A migration deliberately rejects any scope count other than
  one in both preflight and writer transactions. Therefore the two-scope
  staging exercise cannot run by silently weakening or parameterising the
  production policy. Before A-03, a separately reviewed and human-approved,
  disposable-only proof fixture must be designed outside the production Prisma
  lineage. It may change only the test database's one-scope guard to a closed
  two-scope test allow-list, must record the exact altered function hashes,
  and must be destroyed with the staging database. It must never be eligible
  for an RC or production migration.
- Actual production activation remains blocked by that staging proof, IdP and
  named-roster approval, DB/backup/ingress evidence, immutable RC and final
  human release GO.
