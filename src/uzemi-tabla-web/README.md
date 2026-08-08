# uzemi-tabla-web

Frontend for **Üzemi Tábla**, the door-manufacturing production whiteboard
(port 4611). Talks to `production-service` via `/api/production/*` (proxied
in dev, see `vite.config.ts`).

> Not to be confused with the fleet-wide **Datahaven** agent-management
> dashboard (`nexus-core/src/datahaven-web`, live at datahaven.joinerytech.hu,
> port 3461 per `doorstar-instance/config/federation.yaml`) — this app used
> to be named `datahaven-web` and squat on that port by mistake; it was
> renamed to avoid the collision.

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
`CORS_ORIGIN=http://localhost:4611`.

```bash
npm install
npm run dev   # http://localhost:4611
```

## Read-only demo build

The normal build retains the product role selector and does not show an
external Flow Lab link. For the release demo use `npm run build:readonly-demo`.
It sets `VITE_READ_ONLY_DEMO=true` and
`VITE_FLOW_LAB_READONLY_URL=https://doorstar.asztalostech.hu/flow-lab-demo/`
itself, then verifies the read-only marker and configured URL in the built
artifact. The profile fixes the browser UI to the reader role and replaces the
selector with a visible read-only context; it does not replace server-side
authorization.

`VITE_FLOW_LAB_READONLY_URL` is optional within the read-only demo profile; it
is ignored by normal builds. When set, it must be an absolute HTTPS URL without
credentials; otherwise the Flow Lab workspace hides the external new-tab link.
The app never embeds or proxies this URL.

## Known simplifications (v1)

- The work-order sheet (`ProjectDetailPage`) edits the epic/step grid locally
  and saves as one bulk `PUT .../epics` on demand, rather than autosaving
  every keystroke like the original mock — the backend's bulk-replace
  contract makes per-field autosave awkward without introducing per-row
  update endpoints first. The quantities/cutting/hardware sub-sheets
  (`ProjectSubSheets.tsx`) follow the same local-edit-then-save pattern.
- `TaskDetailModal`'s "next step" button uses each station's *default*
  workflow rather than fetching a possible per-station override
  (`StationWorkflow` override, e.g. Bürkle's 4-step flow) — status/done
  coloring is still correct either way since that's computed server-side.
