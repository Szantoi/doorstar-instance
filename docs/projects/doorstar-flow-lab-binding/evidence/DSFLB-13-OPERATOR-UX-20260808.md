# DSFLB-13 operator UX promotion — release evidence

**Status:** PASS — operator-facing, hosted read-only demonstration; this does
not open production-writing authority.

**Executed:** 2026-08-08
**Release commit:** `98b65ca`

## Delivered operator view

The project-bound Flow Lab page now opens as a Hungarian production-plan
overview rather than an audit console.

- The first screen says what the plan is, whether it is checked, whether it
  has reached the board, and what follows next.
- `snapshot`, `readiness`, `materialization`, evidence and provenance language
  is replaced by `tervverzió`, `terv állapota`, `a terv átvétele` and
  `munkalépések sorrendben` in the default view.
- The permanent, visible context is `Bemutató · csak megtekintés · mintaadat`.
- Work steps use human labels, sequence, station, quantity, planned time and
  understandable predecessor conditions. Raw correlation keys are not a
  fallback label.
- Hashes, UUIDs, pins, principals, raw server messages and typed payloads are
  retained only under collapsed `Technikai ellenőrzési adatok` sections.
- No review, import, materialize, deviation-writing or generic worksheet
  mutation control was introduced.

## Repository validation

| Check | Result |
| --- | --- |
| Flow Lab workspace unit tests | PASS — 7 focused tests |
| Full frontend unit suite | PASS — 43 files, 236 tests |
| Frontend lint | PASS |
| Deterministic `build:readonly-demo` | PASS — read-only artifact marker verified |
| Independent UX review | PASS — plain blocker messages, human dependency rules and no mutation regression |
| `git diff --check` | PASS |

## Hosted smoke after deployment

| Check | Result |
| --- | --- |
| Release checkout | `98b65ca` present in `/opt/doorstar-flow-lab-demo` |
| Password-protected Flow Lab SPA | `200` with the demo credential |
| Anonymous Flow Lab SPA | `401` |
| Snapshot and deviation reads | `200`, valid read payloads |
| Attempted Flow Lab POST | `405` at nginx |
| Demo backend | active and bound to `127.0.0.1:4612` |
| New operator copy in built assets | present |
| nginx worker access to rebuilt static assets | PASS |

The smoke request deliberately sent a client `X-Role: vezeto`; the protected
nginx boundary still replaced it with the demo's reader context before it
reached the backend. The credential itself is not recorded here.

## Static asset ownership guard

The build created files that the nginx `www-data` worker could not initially
read. The release applied `o+rX` only to the verified demo build directory
`/opt/doorstar-flow-lab-demo/src/uzemi-tabla-web/dist`, then verified actual
`www-data` read and traversal access. The deployment runbook must retain this
post-build verification for every static rebuild.

## Boundary retained

DSFLB-13 improves comprehension and presentation only. Independent review,
authentication, materialization and deviation-writing remain outside this
demo and still depend on the DSFLB-12 identity/policy increment.
