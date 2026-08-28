# Doorstar pilot web deployment contract

This is an operations template for the new isolated pilot web composition. It
does not authorise or execute a release. It must not be combined with any
historical Doorstar Board, SpaceOS, Plant, or shared database deployment.

## Immutable source input

Deploy only a clean, accepted release candidate. The BFF package must have
passed `npm test` and `npm run lint`, and its compiled `dist/web/main.js` plus
the three copied `dist/web/static/` assets must be present. Record the commit
and build output checksum in the release record.

## Required external resources

Before a process is installed, the approved release record must name:

- one new public HTTPS host name, not inferred from a historical Doorstar
  vhost;
- one fresh, dedicated pilot PostgreSQL database, migrator login, runtime
  login and bootstrap login; never a legacy Doorstar or Plant database;
- all three immutable pilot migrations, the exact `PilotAuditWriterRole`
  mappings, narrow routine grants and a single approved scope seed;
- a dedicated Keycloak realm with the exact confidential authorization-code
  client, management service account, mail delivery and callback behaviour
  required by [`OIDC-CLIENT-COMPATIBILITY.md`](OIDC-CLIENT-COMPATIBILITY.md);
- a secret store/environment file that is readable only by the new service
  account; and
- the approved first administrator's IdP identity and bootstrap evidence.

The Keycloak callback must reach the BFF unchanged as `GET /auth/callback`
with exactly one `code` and one `state`. Do not use an nginx rewrite to remove
`session_state`, `iss`, error fields, a fragment, or a form post: configure the
IdP not to send incompatible values.

## Loopback service template

Start from
[`ops/doorstar-pilot/systemd/doorstar-pilot-web.service.template`](../../../ops/doorstar-pilot/systemd/doorstar-pilot-web.service.template).
Replace the identity/path and Node executable placeholders only in the generated
operational unit, never in source control. Its `EnvironmentFile` must supply every BFF
variable from [`.env.example`](../../../src/doorstar-pilot-bff/.env.example),
including a unique non-privileged `DOORSTAR_PILOT_LISTENER_PORT`.

The Node listener is permanently `127.0.0.1`-only. Do not open its port in the
firewall. The service must run under a new least-privilege account, not the
historical Doorstar or an nginx account. Its secret file must be mode `0600`,
owned by that account, and must never be copied into the release tree or git.

## HTTPS ingress template

Start from
[`ops/doorstar-pilot/nginx/doorstar-pilot.conf.template`](../../../ops/doorstar-pilot/nginx/doorstar-pilot.conf.template).
Replace all public-host, certificate and loopback-port placeholders in the
operations-owned vhost. Keep it a new vhost; it must not proxy or serve the
historical `doorstar-production-service`, SpaceOS BFF, Board, or Plant UI.

The only externally reachable service is HTTPS. The origin configured in
`DOORSTAR_PILOT_PUBLIC_ORIGIN` must exactly equal the new HTTPS origin, and
`DOORSTAR_PILOT_OIDC_REDIRECT_URI` must exactly equal that origin plus
`/auth/callback`.

## Controlled activation evidence

After the required Gates 0–2 and a separate activation GO, the authorised
operator performs the steps in
[`OPERATIONS-RELEASE-GATE.md`](OPERATIONS-RELEASE-GATE.md), in order. The
release record must include only redacted evidence:

1. migration and scope/mapping preflight result;
2. service started with a loopback listener owned by the expected process;
3. nginx syntax and HTTPS reachability result;
4. exact callback-shape proof;
5. approved first-admin bootstrap result; and
6. named-user login, logout, invite, deactivation and recovery checks.

On any failure, stop before the next stage and use the approved rollback
decision. Do not fall back to a shared database, browser-supplied role, legacy
Keycloak realm, or an Office-to-Plant workaround.
