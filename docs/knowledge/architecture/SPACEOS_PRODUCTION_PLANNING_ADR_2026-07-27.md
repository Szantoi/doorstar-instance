# ADR — SpaceOS Production Planning: C# platform module, Doorstar tenant

**Date:** 2026-07-27  
**Status:** accepted for architecture and specification; implementation waits for the listed platform contracts  
**Decision owner:** SpaceOS platform owner, with Doorstar as first consumer tenant

## Context

Doorstar accepted the pilot Üzemi Tábla. The next requested capability is an
automatic calculation of production hours and a capacity-aware production
calendar. The existing Doorstar service already stores a task-level
`quantity` and `unitHours` snapshot, but it has no tenant boundary, shared
planning contract, work-calendar model, or finite-capacity scheduler.

The existing Doorstar `Folyamatok.xlsm` workbook provides a verified legacy
behaviour baseline: volume and unit time drive duration, workforce drives
labour demand, typed dependencies determine date constraints, and a daily
department-load view reports the resulting plan. Its detailed translation is
in `DOORSTAR_LEGACY_SCHEDULING_MODEL_ANALYSIS_2026-07-27.md`.

The same capability will be useful to later SpaceOS tenants. It must therefore
not become a second, Doorstar-only scheduling engine in the Node service.

## Decision

Create **Production Planning** as a versioned, tenant-aware SpaceOS module,
owned and served by the C# / ASP.NET Core platform. It owns the generic
calculation, calendar, scheduling, audit and tenant-isolation rules.

Doorstar consumes it as a tenant:

- Doorstar owns its station list, routing template, shift pattern, holidays,
  capacity values and operation standards as a versioned instance pack.
- The C# module resolves the authenticated tenant from the JWT and loads only
  that tenant's configuration and work items.
- The Doorstar React application calls the published OpenAPI client. During
  migration the Node production service may be an anti-corruption adapter, but
  it must not become a second source of truth for calendar reservations or
  calculated plans.
- Production Planning receives neutral `WorkItemRef` and `OperationRequest`
  values. It does not decide the final ownership of Doorstar's current
  `Project` / `Epic` / `EpicStep` types.

## Boundaries

| Owner | Responsibility |
|---|---|
| SpaceOS C# platform | JWT validation, tenant context, policy enforcement, Planning API, planning persistence, PostgreSQL RLS/query isolation, calculation and scheduling engine, audit events |
| Doorstar instance pack | station/resource definitions, 6-stage routing, operation standards, shift calendars, non-working days, tenant terminology and permitted planning policies |
| Doorstar UI | show estimates, calendar and overloads; request recalculation; collect authorised manual overrides; never infer tenant or calculate authoritative dates locally |
| Transitional adapter | maps legacy Doorstar records to the neutral contract; performs dry-run/shadow comparison and rollback-safe migration only |

## Domain model

The C# module uses these generic aggregates. Every persisted aggregate is
tenant-scoped and has an immutable identifier.

| Aggregate | Purpose |
|---|---|
| `PlanningPolicy` | tenant-level defaults: timezone, calculation behaviour, scheduling horizon and publish policy |
| `Resource` | schedulable capacity, such as a Doorstar station, machine or skill pool |
| `WorkCalendar` | recurring shifts, breaks and normal availability for a resource or resource group |
| `CalendarException` | holiday, shutdown, extra shift, maintenance or approved capacity override |
| `OperationStandard` | versioned norm-time rule for an operation/resource combination |
| `PlanningRun` | immutable calculation/scheduling input, result, warnings and algorithm version |
| `PlannedOperation` | estimated minutes, planned start/end, selected resource and manual-override state for a work item operation |
| `CapacityReservation` | published allocation that consumes a resource's available capacity |

`OperationStandard` and `WorkCalendar` changes create new versions. A
published `PlanningRun` records the exact policy, calendar and standard
versions used, so an old plan remains explainable after a norm-time update.

## Estimation and scheduling semantics

The first release is deterministic and explainable, not an opaque optimiser.

For each operation:

```text
estimatedMinutes = setupMinutes
                 + ceil(quantity × minutesPerUnit)
                 + fixedAllowanceMinutes
```

For a legacy-compatible operation without setup/allowance, this reduces to
`quantity × minutesPerUnit`. Required workforce is stored separately and
produces `estimatedLabourMinutes = estimatedMinutes × workforceUnits`; it does
not by itself lengthen elapsed time when the required capacity is available.

Optional, explicitly configured modifiers may multiply or add time for a
material, finish, dimension class or complexity class. Missing standards do
not silently default to zero: the operation is returned as `needs_standard`
and cannot be published automatically.

Scheduling is a forward, finite-capacity allocation:

1. preserve the approved routing/dependency order;
2. find the first calendar slots with enough capacity after all predecessors;
3. skip breaks, exceptions and non-working time;
4. split work across shifts only when the tenant policy permits it;
5. create a proposal with conflicts and overload warnings;
6. publish only an explicitly approved proposal, producing reservations.

The dependency contract supports the Doorstar legacy `FS`, `SS`, `FF` and
`SF` edge types, plus a policy-controlled partial-release threshold. A
compatibility policy preserves the legacy `FS` next-working-day convention;
the tenant may later choose a finer-grained shift-level handoff rule.

Manual duration or date overrides are allowed only to a policy-authorised
role. They retain the calculated value, reason, actor, timestamp and planning
run for audit. Recalculation creates a new proposal; it never rewrites a
published plan without an explicit replace action.

## Tenant and security rules

- The platform derives `TenantId`, user and permissions from a validated JWT;
  no request body, query parameter or `X-Role` / `X-Station` header can choose
  a tenant or authorise an action.
- All Planning API queries receive server-side tenant filtering. PostgreSQL RLS
  provides defence in depth for the application database role.
- Cross-tenant identifiers, unknown resource references and stale planning
  revisions return a non-disclosing `403` or `404` according to the platform
  security contract.
- Audit entries include tenant, actor, correlation id, module, action and
  before/after revision identifiers, never credentials or tokens.

## Public contract shape

The final paths and schemas belong to the platform OpenAPI, but the minimum
contract must support:

- reading calendars, resources, standards and capacity summaries;
- authorised CRUD for tenant configuration with optimistic concurrency;
- `POST` calculation of an estimate proposal from neutral operation input;
- `POST` scheduling of an ordered set of operations into a proposal;
- reading warnings, overloads and a calendar timeline;
- publishing, superseding and manually overriding a plan with audit evidence;
- idempotency keys for plan generation and publication.

The OpenAPI specification is the sole client contract. The Doorstar client is
generated from it; handwritten duplicate transport DTOs are not retained.

## Migration strategy

1. Publish the platform OpenAPI and tenant/security contracts.
2. Introduce the Doorstar instance pack in a non-production environment.
3. Map legacy `Task.quantity` and `Task.unitHours` as historical estimate
   snapshots, not as standards. Map each legacy station to a `Resource`.
4. Run the C# planner in shadow mode and compare estimates and proposed dates
   against selected Doorstar projects without writing reservations.
5. Reconcile unmapped records and approve standards with Doorstar.
6. Enable proposal display in the Doorstar UI.
7. After UAT, enable explicit publication; retain rollback to the prior
   published run and preserve legacy data until equivalence is proven.

No bulk data move, production switch or dual-write is permitted without a
backup, a dry-run report, reconciliation evidence and a human release gate.

## Consequences

**Positive:** Doorstar gets a useful planning feature now, subsequent tenants
reuse the same C# module, and the tenant boundary becomes enforceable in one
place.

**Costs:** the platform must publish the auth, module/instance and work-item
contracts before Doorstar integration can start; norm times need real workshop
input and a calibration period; the existing Node API is transitional rather
than the long-term authoritative planning backend.

## Required platform decisions and gates

Implementation may start only after these are published with versions and
hashes:

1. `STAB-RLS-PROOF` and `ERPSEP-06`: JWT, tenant resolution, policy and RLS
   contract;
2. `ERPSEP-01` / `PROJECT-CORE-ADR`: canonical work-item and dependency
   references;
3. `ERPSEP-02`, `ERPSEP-03` and `ERPSEP-07`: module, extension and instance
   pack contracts;
4. Production Planning OpenAPI and its C# package compatibility manifest.

This ADR supplies the Doorstar consumer requirement to those platform
artifacts. It does not authorise platform code, credential changes, production
deployment or migration in this repository.

## Acceptance evidence for the first release

- one tenant cannot read or reserve another tenant's capacity;
- fixed example inputs produce stable estimate minutes and calendar slots;
- holidays, breaks, DST boundaries, capacity exceptions and chained steps are
  covered by integration tests;
- a manual override and plan replacement have complete audit trails;
- Doorstar shadow comparison reports estimate/date differences before any
  reservation is published;
- generated Doorstar client and C# OpenAPI contract have no drift.
