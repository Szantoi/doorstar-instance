# Doorstar pilot BFF

This is the source-only named-user OIDC backend-for-frontend (BFF) for the
isolated Doorstar Office pilot. It exposes these seven routes when a separately
approved host adapts its `handle()` function to HTTP:

- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/session`
- `POST /auth/logout`
- `GET /admin/users`
- `POST /admin/users`
- `PUT /admin/users/:bindingId`

The administrator routes are a small same-origin roster surface, not a general
identity platform. They require the live opaque session to resolve to an
active binding with the database-defined effective `canManagePilotRoster`
capability; browser role,
scope, actor, capability and bearer headers are rejected. The database stored
routines independently repeat that authority check before listing or writing.

`GET /admin/users` returns only `bindingId`, `displayName`, `role`, `active`,
`canManagePilotRoster` and `auditVersion`. It intentionally never returns an
e-mail address, OIDC subject/digest, actor key, session or audit record.

`POST /admin/users` accepts this exact JSON object over a same-origin request:

```json
{
  "displayName": "Named colleague",
  "email": "colleague@example.invalid",
  "role": "SALES",
  "canManagePilotRoster": false
}
```

The BFF creates the Keycloak directory account through its server-only
management client in a disabled state, asks Keycloak to send
verification/password-setup actions, derives the OIDC subject digest and
writes the local binding through the database-owned direct-admin provision
routine. Only after that local write succeeds does it enable the directory
account. If the local write or directory activation fails, it best-effort keeps
the account disabled; an activation failure also best-effort deactivates the
just-created local binding using its audit version. A missing, malformed or
foreign Keycloak `Location` cannot leave a usable account because the account
was created disabled. No password, invite token or raw directory subject is
returned to the browser.
The very first roster manager remains a separately approved server-side
bootstrap action; this endpoint does not create a shared or self-registered
first administrator.

`PUT /admin/users/:bindingId` is a complete policy replacement, rather than a
partial PATCH. It accepts exactly:

```json
{
  "expectedAuditVersion": 1,
  "role": "READER",
  "active": true,
  "canManagePilotRoster": false
}
```

The optimistic audit version prevents silent overwrite. The BFF supplies the
audit correlation and update reason itself; neither belongs in a browser body.
All JSON admin bodies are limited to 8 KiB, require `application/json` (or
`application/json; charset=utf-8`), and reject unknown fields.

`createPilotBffRuntime()` composes the real Node crypto, OIDC and PostgreSQL
adapters and performs the fixed-scope database preflight. It intentionally does
not open a listener, run a migration, contact an IdP during startup, configure
an ingress, or deploy anything. The existing Node handler remains an adapter;
process lifecycle and TLS are outside this package.

## Security boundary

- The BFF uses authorization-code + PKCE with server-generated state, nonce
  and browser-binding values. The server persists only SHA-256 hashes of the
  state, nonce, browser binding and session token; raw opaque values remain in
  the browser or redirect exchange. The PKCE verifier is the sole callback
  secret retained in versioned AES-256-GCM ciphertext. The database generates
  transaction IDs.
- `NodeOidcAuthorizationClient` exchanges the code at an explicit HTTPS token
  endpoint, validates signed ID tokens with `jose` against the configured JWKS,
  checks issuer, audience, required expiry/issued-at, optional `nbf`, an
  explicit asymmetric algorithm allowlist, and `azp` for multiple audiences.
  The verified nonce is
  SHA-256 hashed and compared in constant time. Only issuer and subject return
  to the application layer; no raw ID, access or refresh token is logged or
  persisted.
- The raw OIDC subject is transformed with a separate HMAC-SHA-256 key before
  binding lookup. The OIDC callback never just-in-time provisions a binding
  and there is no IdP profile-to-role import. A new binding is possible only
  through the separately authorised, same-origin administrator flow.
- `PostgresPilotRepositories` uses one checked-out client for each database
  boundary: `BEGIN ISOLATION LEVEL SERIALIZABLE`, transaction-local
  `app.current_pilot_scope_id`, runtime preflight, work, then `COMMIT` or
  `ROLLBACK`. It calls only the A-phase stored routines for authorization
  transaction creation/consumption, opaque-session issue/revoke, and the
  guarded direct-admin list/provision/update routines. It never performs raw
  mutations of `AuthorizationTransaction`, `PrincipalBinding`, `OpaqueSession`
  or `BindingAudit`.
- The runtime DSN is accepted only through
  `DOORSTAR_PILOT_RUNTIME_DATABASE_URL`, then parsed into explicit host, port,
  database, user and password fields before the Pool is created. Every `PG*`
  variable, bootstrap/generic DSN variable and URI query/fragment is rejected.
  The Pool is explicitly configured with TLS certificate verification
  (`ssl.rejectUnauthorized: true`), so neither `PGSSLMODE` nor `.pgpass` can
  weaken or complete the runtime connection.
- Session lookup joins the active binding in the fixed scope and requires a
  matching binding epoch. Browser-supplied bearer, role, scope and actor
  headers are rejected by every route. The callback clears its short-lived
  browser-binding cookie while issuing the `SameSite=Strict` session cookie.
- Keycloak management uses a distinct confidential service account only on the
  server. Its token endpoint must be exactly
  `<issuer>/protocol/openid-connect/token`, preventing its credential from
  being sent to an arbitrary HTTPS endpoint through configuration. It first
  obtains a client-credentials access token in local memory, creates the
  account disabled and requests `VERIFY_EMAIL` plus `UPDATE_PASSWORD`; only a
  successful local binding permits a subsequent enable. It never stores, logs
  or returns that token, an e-mail address or the raw Keycloak subject. The
  source adapter is constructed at runtime but makes no network request during
  composition.
- Bootstrap remains a separate identity and executable boundary; the BFF
  fail-closes if a bootstrap or generic database variable is present.

## Required runtime configuration

Copy only the variable names from [`.env.example`](.env.example) into the
approved secret/configuration mechanism. It requires:

- one complete runtime PostgreSQL DSN (explicit host, port, database, user and
  password; no query or fragment);
- the fixed server-owned scope key;
- the exact HTTPS `DOORSTAR_PILOT_OIDC_REDIRECT_URI`, equal to
  `DOORSTAR_PILOT_PUBLIC_ORIGIN` plus `/auth/callback`, with no query or
  fragment;
- explicit HTTPS OIDC authorization, token and JWKS endpoints;
- a confidential-client secret and ID-token algorithm allowlist;
- a separate Keycloak realm-admin base URL plus narrowly scoped management
  client ID and secret for disabled-account creation, invitation delivery and
  post-binding activation; the configured OIDC token endpoint must be the
  standard endpoint of that same issuer realm;
- independent 32-byte unpadded-base64url encryption and subject-digest keys.

No real values belong in this repository or in a browser.

## IdP callback compatibility

The callback is deliberately fail-closed: it accepts only a `GET` query with
one non-empty `code` and one non-empty `state`. It does not support
`response_mode=form_post`, fragments, `session_state`, `iss`, or error fields.
An IdP client must be configured to return exactly this shape; the BFF must not
be made permissive at an ingress or proxy. The source-only compatibility
contract and the Gate 2 redacted-proof requirement are in
[`docs/projects/doorstar-isolated-pilot/OIDC-CLIENT-COMPATIBILITY.md`](../../docs/projects/doorstar-isolated-pilot/OIDC-CLIENT-COMPATIBILITY.md).

## Explicitly not an activation guide

Before an environment may be enabled, a separate approved operations change is
still required for the A and admin-roster migrations, isolated runtime database
login and grants, `PilotAuditWriterRole` mapping, IdP browser and management
clients, mail delivery, secret injection, first-admin bootstrap,
listener/ingress and staging isolation proof. This package neither performs nor
authorizes those external changes.

## Local verification

```powershell
npm install --ignore-scripts
npm test
npm run build
npm run lint
```
