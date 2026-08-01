# production-service

Backend for **Üzemi Tábla** — the door-manufacturing production board (weekly
whiteboard, per-station kanban, capacity/load monitor, project work-order
sheets). Serves `uzemi-tabla-web` at `/api/production/*`.

## Why this exists

This started from an interactive design mock (`Uzemi Tabla.dc.html`, imported
via claude.ai/design) that already encoded the full product logic — task
states, dependencies, scheduling, capacity math. This service is that logic
ported to a real, persisted backend.

The domain vocabulary is deliberately kept close to
`joinerytech-platform/src/spaceos-modules-production` (the .NET Production
module) — `Stage`/`ProductionStatus` enum names mirror its `WorkflowStepName`
(6-stage workflow) and `ProductionStatus`, and `GET /overview` returns a
payload shaped like its `ProductionOverviewDto` — so this can be reconciled
with, or merged into, that module later. See `prisma/schema.prisma` header
comments for specifics of what maps to what.

## Design decisions

- **Stations are config, not code.** `src/config/stations.json` lists the
  physical workshop stations (Körfűrész, CNC, Asztalos, ...) and maps each to
  one of the 6 macro stages. Add/rename a station there — no code change
  needed. `src/config/stations.ts` is the typed accessor.
- **`ProjectSheet.data` is JSON, not normalized tables.** The quantities /
  cutting-list / hardware sub-sheets on a work-order vary a lot by product
  type (door vs. furniture vs. wall panel) and are edited as free-form grids
  in the UI. Normalizing them would mean a schema migration for every new
  product type; a JSON blob per (project, kind) avoids that at the cost of
  DB-level validation, which is fine since the frontend owns the shape.
- **Epic/EpicStep vs. Task.** `Epic`/`EpicStep` are the *plan* (a project's
  work-order sheet rows). `Task` is a *card actually on the board* — created
  either by "issuing" a session (`POST /projects/:key/schedule`, one Task per
  EpicStep) or typed straight onto the board as a free task. This mirrors the
  mock's distinction between the munkalap grid and the physical board.

## Local development

```bash
cp .env.example .env
docker compose up -d          # Postgres on localhost:5462
npm install
npm run prisma:migrate        # creates tables
npm run prisma:seed           # demo data (matches the original mock)
npm run dev                   # http://localhost:4610
npm run dev:test              # same service, forced to doorstar_test
```

Health check: `GET /healthz`.

### UX reference project

`npm run seed:ux-reference` rebuilds exactly one fictitious, stable project:
`UX-REFERENCE-RETROFIT-001`. It uses the existing HTTP commands, so survey,
document/evidence review, order approval, component hashes and operation-plan
hashes are evaluated by the same authority code as the browser. Revision 1 is
historical (`SUPERSEDED`); revision 2 is the current `APPROVED` revision with
three positions, a reviewed wall-panel candidate, a manual accessory, a
`VERIFIED` ComponentSnapshot and a `VERIFIED` OperationPlanSnapshot.

The fixture is not a manufacturing rule set. Its component dimensions,
durations and operations are explicitly labelled demonstration inputs. It
does not infer SIDE_A/SIDE_B, casing roles, handing, blende dimensions or
production release. `PRODUCTION_RELEASE` remains `NOT_AVAILABLE`.

Preferred isolated schema:

```powershell
$env:DATABASE_URL='postgresql://doorstar:doorstar@localhost:5462/doorstar_production?schema=doorstar_ux_reference'
npm exec prisma db push -- --skip-generate
npm run seed:ux-reference -- --confirm-ux-reference-seed
```

The already-migrated local `public` development schema is also supported only
with a second explicit confirmation. Existing projects are preserved; only the
reserved fixture key is replaced:

```powershell
$env:DATABASE_URL='postgresql://doorstar:doorstar@localhost:5462/doorstar_production?schema=public'
npm run seed:ux-reference -- --confirm-ux-reference-seed --confirm-local-development-database
```

Only the explicitly allowlisted `doorstar_production` development database is
accepted. Remote hosts, another database name and every other schema fail
before Prisma is loaded. This database-name guard remains mandatory even when
both public-schema confirmations are present.

The same process also serves its machine-readable API contract at
`GET /openapi.json`. It is the exact checked-in OpenAPI 3.1 document, not a
separate hand-maintained runtime variant.

## Tests

```bash
npm test
```

Tests run against the real Postgres from `docker compose up -d` (no mocking
of Prisma), but each Vitest run receives a generated
`doorstar_test_vitest_*` schema. Global teardown drops that schema even after
a failed suite, so fixtures cannot reach the browsable `doorstar_test` review
database. Production and local operational data are therefore never touched
by the test suite.

## API surface

The formal OpenAPI 3.1 source of truth is
[`openapi/production-service.openapi.json`](openapi/production-service.openapi.json).
Run `npm run verify:openapi` after every route change: it discovers Express
route declarations and fails on missing or stale OpenAPI operations. The
current `X-Role` / `X-Station` headers are only documented compatibility
hints, not an authentication mechanism.

All routes are mounted under `/api/production`:

| Route | Purpose |
|---|---|
| `GET /openapi.json` | Checked-in OpenAPI 3.1 contract |
| `GET /board?week=` | Tasks + sidebar (orders, week note) for one week |
| `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id` | Board card CRUD |
| `POST /tasks/:id/comments` | Add a comment to a card |
| `GET /kanban?station=` | Per-station live status lanes, without a date filter |
| `PUT /kanban/:station/workflow` | Rename/reorder a station's kanban columns |
| `GET /load?week=` | Capacity heatmap |
| `PUT /capacity` | Global hours/day/station assumption |
| `GET /projects`, `POST /projects` | Active project list / create |
| `GET/PUT/DELETE /projects/:key` | Project detail / scalar field edits / soft-delete archive |
| `PUT /projects/:key/epics` | Bulk-save the work-order epic/step tree |
| `POST /projects/:key/schedule` | Issue a fully planned session; missing step dates reject the entire operation |
| `GET/PUT /projects/:key/sheets/:kind` | Quantities / cutting / hardware sub-sheets |
| `GET/POST /templates`, `POST /templates/:name/apply/:key` | Full-sheet templates |
| `GET/POST /epik-templates`, `POST /epik-templates/:name/apply/:key` | Single-epic templates |
| `GET /overview` | `ProductionOverviewDto`-shaped counts |
| `GET /stations` | Station config (name → stage → default workflow) |
| `GET /component-calculator-profiles` | Active calculator profiles with per-profile and technical-catalog fingerprints |
| `GET /production-orders/:projectKey/revisions/:revision/readiness` | Authoritative exact-revision readiness from one repeatable-read snapshot, blockers, role-filtered commands and one deterministic next action |
| `GET /projects/:projectKey/workflow` | Latest project workflow from one repeatable-read snapshot; missing planning/release/runtime contracts remain explicit |
| `GET/POST /production-orders/:projectKey/revisions/:revision/operation-plan-snapshots` | Exact-revision OperationPlan history/readiness and idempotent explicit materialization |
| `PATCH /production-orders/:projectKey/revisions/:revision/operation-plan-snapshots/:snapshotId/review` | One-way, hash-tokened VERIFIED/REJECTED review with principal separation |

An `OperationPlanSnapshot` is a reviewed planning input, not a release. It
does not create a PlanningProposal, `IssuedWorkPackage`, runtime Task,
inspection result or nonconformance record. The explicit v1 adapter selects no
standard, resource or duration automatically; missing authority stays blocked.

Readiness is read-only and exact-revision. Historical revisions remain visible,
but `latest_revision_required` prevents continuation actions. Position links to
superseded document versions block the shared order-review predicate. The
project workflow reuses the same order/component/operation authority and marks
PlanningProposal, immutable `IssuedWorkPackage`, 6-stage runtime and handover
as `CONTRACT_REQUIRED`; it never upgrades legacy `Task` rows into release
authority.

Both readiness endpoints evaluate every contributing read inside one PostgreSQL
`REPEATABLE READ` transaction and re-check the exact revision/latest-revision
identity before returning. The `PRODUCTION_RELEASE` gate is explicitly
`NOT_AVAILABLE` (never merely `BLOCKED`) until its missing authority aggregates
exist.

## Logging

Structured JSON logs via `pino` (`pino-pretty` in dev). `LOG_LEVEL` env var
controls verbosity. Every request is logged via `pino-http`; mutating
operations additionally log a summary line (see `logger.info(...)` calls in
`src/routes/*`).
