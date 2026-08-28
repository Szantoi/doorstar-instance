# Doorstar pilot web deployment contract

This is the operations template for the new isolated pilot web composition.
The accountable owner releases it through the checklist in
[`OPERATIONS-RELEASE-GATE.md`](OPERATIONS-RELEASE-GATE.md). It must not be
combined with a historical Doorstar Board, SpaceOS, Plant, or shared-database
deployment.

## Candidate and release record

Deploy one clean candidate only. Record its commit and the redacted results of
the versioned Foundation, BFF, and Bootstrap source checks in the owner GO
record. The BFF package must contain a successful web build, including
`dist/web/main.js` and the copied `dist/web/static/` assets.

The release record is operations-owned and must include only redacted resource
identifiers, check outcomes, a backup reference, owner GO, operator, and the
rollback decision. Do not put a `.env`, secret, browser cookie, OIDC token,
raw OIDC subject, customer data, or email address in source control or the
record.

## Required dedicated resources

Before installation, identify these new pilot-only resources:

- one pilot PostgreSQL database with distinct migrator, runtime, and bootstrap
  logins; never a legacy Doorstar or Plant database, role, data set, backup,
  or connection string;
- one single approved pilot scope, the reviewed migrations, exact
  `PilotAuditWriterRole` mappings, and the narrow routine grants required by
  the reviewed RLS/writer policy;
- one dedicated Keycloak realm and confidential authorization-code client,
  management service account, and Brevo/Keycloak mail delivery configuration;
- one new least-privilege service account and secret file/store; and
- one new nginx vhost that exclusively owns the approved host for this pilot,
  and one loopback listener.

For this pilot, the public origin is
`https://doorstar.joinerytech.hu`; the Office entry path is
`https://doorstar.joinerytech.hu/login`. Configure:

```text
DOORSTAR_PILOT_PUBLIC_ORIGIN=https://doorstar.joinerytech.hu
DOORSTAR_PILOT_OIDC_REDIRECT_URI=https://doorstar.joinerytech.hu/auth/callback
DOORSTAR_PILOT_POST_LOGIN_PATH=/login
```

The Keycloak callback must reach the BFF unchanged as `GET /auth/callback`
with exactly one `code` and one `state`. Do not use nginx to discard
`session_state`, `iss`, error fields, fragments, or a form post. Configure the
IdP to meet the BFF's strict callback contract or stop the release; see
[`OIDC-CLIENT-COMPATIBILITY.md`](OIDC-CLIENT-COMPATIBILITY.md).

## Loopback service template

Start from
[`ops/doorstar-pilot/systemd/doorstar-pilot-web.service.template`](../../../ops/doorstar-pilot/systemd/doorstar-pilot-web.service.template).
Replace identity, path, Node executable, and listener-port placeholders only
in the operations-owned unit. Its `EnvironmentFile` supplies the BFF settings
from [`.env.example`](../../../src/doorstar-pilot-bff/.env.example) without
copying secrets into source control.

The Node listener is permanently `127.0.0.1`-only. Do not open its port in the
firewall. Run it under the new pilot service account, not the historical
Doorstar account or an nginx account. The secret file is mode `0600`, owned by
that account, and never copied into the release tree or git.

## HTTPS ingress template

Start from
[`ops/doorstar-pilot/nginx/doorstar-pilot.conf.template`](../../../ops/doorstar-pilot/nginx/doorstar-pilot.conf.template).
Replace public-host, certificate, and loopback-port placeholders only in the
operations-owned vhost. The public application is HTTPS-only; port 80 is
closed or redirects directly to the same HTTPS host. Do not expose the BFF
listener directly.

The vhost may proxy only to the new pilot loopback service. It must not serve
or proxy the historical `doorstar-production-service`, SpaceOS BFF, Board, or
Plant UI/service. `DOORSTAR_PILOT_PUBLIC_ORIGIN` and the OIDC redirect URI
must exactly match the TLS host above.

## Owner-GO activation and rollback

The authorised operator follows the owner-controlled checklist, in order:

1. record source-check results and prepare the dedicated pilot backup/rollback
   decision;
2. apply the reviewed pilot migration and identity mappings only to the new
   pilot database;
3. configure the dedicated IdP client, mail path, and server-side secret
   injection; provision the first administrator only through the reviewed
   server-side/bootstrap path;
4. start the loopback service, verify its expected listener and preflight,
   then validate the new nginx vhost, TLS host, and `/login` reachability; and
5. perform the documented named-user login, logout, invitation, deactivation,
   and recovery smoke checks, then record `GO` or `NO-GO`.

On any failure, stop before the next step. Use the recorded rollback decision:
disable only the new pilot ingress/service, revoke or disable only the new
pilot identity where appropriate, and restore only the dedicated pilot backup.
Never fall back to a shared, legacy, or Plant resource.

The historical A-03/Gate 1 staging material is optional supplementary
assurance. It neither authorises this deployment nor proves this candidate.
