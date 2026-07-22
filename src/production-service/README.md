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
```

Health check: `GET /healthz`.

## Tests

```bash
npm test
```

Tests run against the real Postgres from `docker compose up -d` (no mocking
of Prisma) — each test cleans up the rows it touches in `beforeEach`.

## API surface

All routes are mounted under `/api/production`:

| Route | Purpose |
|---|---|
| `GET /board?week=` | Tasks + sidebar (orders, week note) for one week |
| `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id` | Board card CRUD |
| `POST /tasks/:id/comments` | Add a comment to a card |
| `GET /kanban?station=&week=` | Per-station kanban lanes |
| `PUT /kanban/:station/workflow` | Rename/reorder a station's kanban columns |
| `GET /load?week=` | Capacity heatmap |
| `PUT /capacity` | Global hours/day/station assumption |
| `GET /projects`, `POST /projects` | Active project list / create |
| `GET/PUT/DELETE /projects/:key` | Project detail / scalar field edits / soft-delete archive |
| `PUT /projects/:key/epics` | Bulk-save the work-order epic/step tree |
| `POST /projects/:key/schedule` | Issue a session — create board Tasks from the sheet |
| `GET/PUT /projects/:key/sheets/:kind` | Quantities / cutting / hardware sub-sheets |
| `GET/POST /templates`, `POST /templates/:name/apply/:key` | Full-sheet templates |
| `GET/POST /epik-templates`, `POST /epik-templates/:name/apply/:key` | Single-epic templates |
| `GET /overview` | `ProductionOverviewDto`-shaped counts |
| `GET /stations` | Station config (name → stage → default workflow) |

## Logging

Structured JSON logs via `pino` (`pino-pretty` in dev). `LOG_LEVEL` env var
controls verbosity. Every request is logged via `pino-http`; mutating
operations additionally log a summary line (see `logger.info(...)` calls in
`src/routes/*`).
