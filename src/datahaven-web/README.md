# datahaven-web

Frontend for **Üzemi Tábla** — "Datahaven Web" dashboard per
`doorstar-instance/CLAUDE.md` (port 3461). Talks to `production-service` via
`/api/production/*` (proxied in dev, see `vite.config.ts`).

## Why this exists

Ported from an interactive design mock (`Uzemi Tabla.dc.html`) built in
claude.ai/design — a whiteboard-styled production board for a door
manufacturer: a weekly grid (stations × days), per-station kanban, a
capacity/load heatmap, and per-project work-order sheets ("munkalap").

## Conventions (mirrors joinerytech-platform's joinerytech-portal)

Deliberately shaped like the platform's real frontend so pages/services can
be dropped in there later with minimal changes:

- **Stack**: React 19, Vite, TypeScript, React Router 7, TanStack Query 5,
  Zustand, Tailwind 4, `@dnd-kit` for drag-and-drop.
- **Structure**: `src/pages/<domain>/` + `src/services/<domain>/`
  (`config.ts` for the API base path, `types.ts`, `api.ts`, `hooks.ts`), plus
  a shared `src/services/apiClient.ts` (`apiFetch<T>`) and `src/components/ui`
  design-system primitives.
- **Data fetching**: plain REST through `apiFetch`, no GraphQL — matches the
  portal's `src/services/apiClient.ts` pattern.

## Visual identity — NOT the portal's enterprise look

Unlike the rest of the platform (stone/teal enterprise design system), this
feature intentionally recreates a physical marker-board: two layers — a white
"board" (Caveat handwriting, filctoll/marker-pen status colors) and a dark
"chrome" shell (Barlow Semi Condensed). See `src/theme/tokens.css`
(ported from the design project's `tokens/*.css`) and
`src/components/ui/{Button,Panel,StatusChip,TaskCard}.tsx` (ported from
`components/core/*.jsx`). Do not reskin this to the stone/teal palette —
that's the whole point of the mock.

## Local development

Requires `production-service` running (see its README) with
`CORS_ORIGIN=http://localhost:3461`.

```bash
npm install
npm run dev   # http://localhost:3461
```

## Known simplifications (v1)

- The work-order sheet (`ProjectDetailPage`) edits the epic/step grid locally
  and saves as one bulk `PUT .../epics` on demand, rather than autosaving
  every keystroke like the original mock — the backend's bulk-replace
  contract makes per-field autosave awkward without introducing per-row
  update endpoints first.
- `TaskDetailModal`'s "next step" button uses each station's *default*
  workflow rather than fetching a possible per-station override
  (`StationWorkflow` override, e.g. Bürkle's 4-step flow) — status/done
  coloring is still correct either way since that's computed server-side.
- Quantities / cutting-list / hardware sub-sheets (`ProjectSheet`, backend
  endpoints already exist) have no UI yet.
