# Doorstar pilot BFF

This is the source-only named-user OIDC backend-for-frontend (BFF) for the
isolated Doorstar Office pilot. It exposes exactly four routes when a separately
approved host adapts its `handle()` function to HTTP:

- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/session`
- `POST /auth/logout`

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
  binding lookup. There is no just-in-time binding provisioning and no IdP
  profile-to-role import.
- `PostgresPilotRepositories` uses one checked-out client for each database
  boundary: `BEGIN ISOLATION LEVEL SERIALIZABLE`, transaction-local
  `app.current_pilot_scope_id`, runtime preflight, work, then `COMMIT` or
  `ROLLBACK`. It calls only the A-phase stored routines for authorization
  transaction creation/consumption and opaque-session issue/revoke. It never
  performs raw mutations of `AuthorizationTransaction`, `PrincipalBinding`,
  `OpaqueSession` or `BindingAudit`.
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
- Bootstrap remains a separate identity and executable boundary; the BFF
  fail-closes if a bootstrap or generic database variable is present.

## Required runtime configuration

Copy only the variable names from [`.env.example`](.env.example) into the
approved secret/configuration mechanism. It requires:

- one complete runtime PostgreSQL DSN (explicit host, port, database, user and
  password; no query or fragment);
- the fixed server-owned scope key;
- explicit HTTPS OIDC authorization, token and JWKS endpoints;
- a confidential-client secret and ID-token algorithm allowlist;
- independent 32-byte unpadded-base64url encryption and subject-digest keys.

No real values belong in this repository or in a browser.

## Explicitly not an activation guide

Before an environment may be enabled, a separate approved operations change is
still required for the A migration, isolated runtime database login and grants,
`PilotAuditWriterRole` mapping, IdP confidential client/redirect URI, secret
injection, listener/ingress and staging isolation proof. This package neither
performs nor authorizes those external changes.

## Local verification

```powershell
npm install --ignore-scripts
npm test
npm run build
npm run lint
```
