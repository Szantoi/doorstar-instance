# DSFLB hosted read-only demo — release evidence

**Status:** PASS — hosted synthetic demonstration, not a G0–G6 production
record.

**Executed:** 2026-08-08T08:24:27Z
**Release commit:** `16353c3d8ded5c198d445d3d3973b731063947d6`

## Published surface

- URL: `https://doorstar.asztalostech.hu/projects/UX-REFERENCE-RETROFIT-001/flow-lab`
- Gate: HTTPS + nginx Basic Auth, no IP allowlist.
- API boundary: nginx accepts only `GET`/`HEAD` below `/api/production/`;
  it overwrites `X-Role` to `reader` and clears `Authorization`, `X-Station`
  and `X-Principal` before the Node upstream.
- Backend: `doorstar-flow-lab-demo.service`, active, listener
  `127.0.0.1:4612`; the pre-existing 4610 service was not replaced.

The shared demonstration credential is stored only in the VPS root-owned
credential file. It is not present in this repository, an environment template,
the evidence, or the command transcript.

## Isolated data boundary

| Item | Recorded result |
| --- | --- |
| Database/schema | `doorstar_production` / `doorstar_flow_lab_demo` |
| Application role | `doorstar_flow_lab_demo_app`, non-superuser, noinherit |
| Completed Prisma migrations | `24` in the demo schema |
| Schema guard | `true|true|false|0` = demo USAGE, demo CREATE, public CREATE, writable public tables |
| Fixture guard | `1|1|4|8` = project, VERIFIED snapshot, Flow Lab epics, Flow Lab steps |
| Fixture | `UX-REFERENCE-RETROFIT-001`, synthetic only |

The application role has no public-schema CREATE privilege and no writable
public table according to the recorded guard query. The normal `public` schema
was not migrated or seeded by this release.

## Validation results

Repository validation before deployment:

- backend `prisma validate`, build and `verify:openapi` passed (91 documented
  operations);
- Flow Lab/OpenAPI focused tests passed: 8 files, 35 tests;
- frontend focused tests passed: 17 tests; full frontend suite: 233 tests;
- `npm run lint`, normal frontend build and deterministic
  `npm run build:readonly-demo` passed;
- an independent release audit reported no P0/P1 blocker.

VPS deployment validation:

| Check | Result |
| --- | --- |
| Isolated migration + seed | PASS |
| Loopback `/healthz` | PASS |
| Loopback snapshot GET with `reader` | PASS, one VERIFIED snapshot |
| Anonymous HTTPS request | `401` |
| Authenticated HTTPS SPA request | `200` |
| Authenticated Flow Lab GET with client `X-Role: vezeto` | `200`, proving nginx replaced it with `reader` |
| Workspace's three GETs (snapshots, deviations, project provenance) | PASS: `1` / `0` / `4` Flow Lab epics |
| Authenticated Flow Lab POST | `405` |
| Native public hostname route | `200` |
| nginx vhost declarations for Doorstar hosts | exactly two (80 and 443) |
| `www-data` reads built index and bcrypt hash | PASS |
| HTTP root / ACME probe | `308` / `404`, preserving ACME location routing |

The browser smoke without credentials stopped at the expected Basic Auth gate.

## Rollback record

- nginx backup on the host:
  `/etc/nginx/sites-available/doorstar.pre-flow-lab-demo.20260808T082253Z`
- Restore that file to `/etc/nginx/sites-available/doorstar`, validate with
  `nginx -t`, then reload nginx to return traffic to the pre-existing 4610
  board.
- To reset only the demonstration data: stop
  `doorstar-flow-lab-demo.service`, recreate only `doorstar_flow_lab_demo`,
  rerun the documented role/schema verification, migrations and synthetic seed.
  Do not reset, clean, drop, migrate or seed `public` as part of this action.

## Known non-blocking caveats

- The broad backend no-DB unit run has two unchanged historical Planning/RAG
  fixture failures; no Flow Lab test failed and none of their sources changed
  in this release.
- Basic Auth is a shared demo gate, not DSFLB-06 identity. DSFLB-12 remains the
  next product increment: OIDC/JWT policy, named independent reviewer,
  project/station scope and selectively opened narrow mutation controls.
