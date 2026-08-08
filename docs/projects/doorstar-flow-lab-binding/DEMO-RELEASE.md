# DSFLB-10/11 — hosted, password-protected Flow Lab demo

## Purpose and boundary

This is a product-quality demonstration release, not a production cutover.
It proves the read path from a synthetic Flow Lab snapshot to immutable
Epic/EpicStep provenance in the Doorstar board. It does not accept a real
artifact, issue production work, or expose Flow Lab writes.

The public entry route is:

```
/projects/UX-REFERENCE-RETROFIT-001/flow-lab
```

The canonical public host is `doorstar.asztalostech.hu`. HTTPS and nginx Basic
Auth are the only entry controls; there is intentionally no IP allowlist.

## Named runtime boundary

| Resource | Demo value | Protection |
| --- | --- | --- |
| Backend service | `doorstar-flow-lab-demo.service` | loopback `127.0.0.1:4612` only |
| Release checkout | `/opt/doorstar-flow-lab-demo` | separate from the active `/opt/doorstar` checkout |
| Database | `doorstar_production` | existing loopback-only PostgreSQL container |
| Demo schema | `doorstar_flow_lab_demo` | owned by `doorstar_flow_lab_demo_app`; not `public` |
| Fixture | `seed:flow-lab-local-demo` | synthetic `UX-REFERENCE-RETROFIT-001` only |
| Password hash | `/etc/doorstar/doorstar-demo.htpasswd` | bcrypt, `root:www-data`, mode `0640` |

No credential, complete database URL or password belongs in this repository or
in the run record.

## Release procedure

1. Build the committed release candidate and run its backend and frontend
   validations before reaching the VPS.
2. Clone the exact release commit into the separate checkout. Do not reset,
   clean or pull the active `/opt/doorstar` checkout.
3. Create the named schema and least-privilege application role using
   [`ops/provision-demo-schema.sql.example`](ops/provision-demo-schema.sql.example).
   Create `/etc/doorstar/doorstar-flow-lab-demo.env` from
   [`ops/doorstar-flow-lab-demo.env.example`](ops/doorstar-flow-lab-demo.env.example),
   with a generated password substituted only on the VPS. Run the privilege
   verification query in the SQL template. Run all Prisma migrations against
   that schema only, then seed the synthetic fixture.
4. Start the separate loopback-only service on port `4612`; verify `/healthz`
   directly over loopback and confirm the listener PID belongs to the unit.
5. Build the static frontend with `npm run build:readonly-demo`. The command
   sets the profile itself and fails unless the built `index.html` contains the
   deterministic read-only marker. Vite may create build output readable only
   by the deploy user, so after every build run:

   ```bash
   sudo chmod -R o+rX /opt/doorstar-flow-lab-demo/src/uzemi-tabla-web/dist
   sudo -u www-data sh -c 'cd /tmp && test -x /opt/doorstar-flow-lab-demo/src/uzemi-tabla-web/dist/assets && test -r /opt/doorstar-flow-lab-demo/src/uzemi-tabla-web/dist/index.html'
   ```

   A normal frontend build is not an acceptable hosted-demo artifact because it
   leaves the legacy role picker in the presentation.
6. Create the Basic Auth file with `htpasswd -B -C 12` interactively on the
   VPS. Do not put the password in a command line, environment file or history.
7. Back up the active nginx Doorstar vhost, then merge/replace its single
   existing 80/443 server pair using the supplied template. There must never be
   a second enabled vhost with the same `server_name`.
8. Run `nginx -t`, reload nginx, and complete every smoke check below.

## Required smoke checks

| Check | Expected result |
| --- | --- |
| Anonymous HTTPS GET | `401` plus Basic challenge |
| Authenticated HTTPS GET `/` | `200` SPA |
| Authenticated snapshot/deviation GET | `200`, synthetic fixture only |
| Authenticated POST/PATCH/DELETE under `/api/production/` | `405`; no database change |
| Client `X-Role: vezeto` | upstream still receives `reader` only |
| API upstream request | no `Authorization`, `X-Principal` or `X-Station` header |
| `ss -tlnp` | only `127.0.0.1:4612` for demo Node service |
| `sudo -u www-data` | can read `dist/index.html` and the bcrypt hash file |
| Browser | dedicated Flow Lab route renders without an editable control |

## Rollback

The data reset is schema-local: stop `doorstar-flow-lab-demo.service`, drop and
recreate only `doorstar_flow_lab_demo`, rerun the provisioning verification,
migrations and the synthetic seed.
Never reset, clean or migrate the active `public` schema as part of this demo.

For an HTTP rollback, restore the timestamped nginx vhost backup and reload
nginx. The pre-existing `doorstar-production-service` and its port `4610`
remain untouched throughout the demo deployment, so the previous board can be
returned immediately. Revoking the demo removes the dedicated service, vhost
configuration and Basic Auth file; the synthetic schema may then be dropped
only after confirming no demo process still uses it.

## Next product increment

The post-demo upgrade is DSFLB-12, not a broad rewrite: attach OIDC/JWT claims
to the existing narrow Flow Lab API; enforce project/station policy and named
creator-versus-reviewer separation; then expose the reviewed mutation UI. A
new snapshot's supersede/compare lifecycle needs a product decision before a
second materialization is allowed.
