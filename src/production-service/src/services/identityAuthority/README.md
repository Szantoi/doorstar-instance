# Identity Authority M0 client

This directory contains the **source-only** Doorstar client for the Kernel
identity-authority resolver. It is deliberately not mounted by the application
yet: no route, BFF composition, Prisma change, or runtime configuration has
been added in M0.

## Configuration boundary

The client is disabled when all four values are absent. Supplying only some of
them is an error; it must never silently fall back to a less privileged mode.

- `SPACEOS_IDENTITY_AUTHORITY_ISSUER` — canonical HTTPS Keycloak realm base URL
- `SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN` — canonical HTTPS Kernel origin
- `SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH` — server-held RS256 private-key path
- `SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID` — Keycloak client-key identifier

Secrets and key material do not belong in this repository, `.env` files, logs,
or browser responses.

## Contract and security

`client.ts` obtains an access token through `client_credentials` plus an RS256
`private_key_jwt`, then calls only the fixed Kernel resolver path. It accepts
only `{ subject, tenantId }`; a raw human bearer token is not part of the API.
The public factory owns the process transport. Dependency injection exists only
in `createIdentityAuthorityResolverClientForTest` for unit testing.

The strict parser, bounded response body, no-redirect policy, two-second shared
deadline, and TLS/proxy fail-closed checks are intentional. A later BFF slice
must compare the parsed authority state with server-derived, tokenless evidence
before issuing a Doorstar session.

## M2A passive HTTP boundary

`httpSecurity.ts` and `routeManifest.ts` remain source-only: neither is
imported or mounted by `app.ts` as a BFF route. A future composition layer must
create the preflight once from `DOORSTAR_BFF_CANONICAL_ORIGIN`; its closure then
accepts only raw Node headers and the actual request method. It never trusts
browser authority headers, normalized duplicate headers, a caller-selected
read/mutation label, or a request-supplied origin.

Accepted preflight decisions deliberately contain no enumerable cookie values.
The session selector and optional CSRF value are held privately until an
explicit server-side consumer callback uses them. The current route manifest
classifies all 85 OpenAPI operations (82 legacy-only, 3 public operational,
0 BFF-only), so no legacy endpoint has been switched.

## Verification and activation

Run the three `identityAuthority*.unit.test.ts` files through `npm run test:unit`
from `src/production-service`, followed by `npm run build` and
`npm run verify:openapi`.

Do not activate this client until the separately reviewed M1 control-plane/BFF
foundation, Kernel snapshot reconciliation and release attestation, and an
explicitly approved disposable local Keycloak/Kernel test stack are all ready.

The later M2B OIDC login-transaction persistence migration has a separate,
stronger opt-in proof command: `npm run test:migration:m2b-oidc`. It refuses
the M1B approval token, ordinary database environment variables and persistent
Docker port 5462; source changes alone do not run that migration.
