# ADR-2026-08-28 — Doorstar pilot web composition

**Status:** Accepted for isolated source implementation
**Date:** 2026-08-28

## Context

The pilot BFF has reviewed OIDC and named-user routes, but it is deliberately
a library: it has no listener, process lifecycle, or same-origin browser UI.
The existing `doorstar-pilot-ui-preview` is a disconnected loopback visual
fixture and must stay that way. It cannot be configured into an authentication
surface.

The user has requested a real, testable sign-in path for one small Doorstar
company. The pilot needs a deployable source composition without reviving the
legacy Board, reusing its database, or treating any historical Keycloak realm
as authority.

## Decision

1. The pilot BFF package receives a small, reviewed Node composition root. It
   creates the validated BFF runtime before binding an HTTP listener, serves a
   same-origin Office shell, and closes the BFF pool on controlled shutdown.
2. The composition binds only to `127.0.0.1`. Its port is an explicit runtime
   configuration value. TLS and public exposure remain the responsibility of a
   separately approved HTTPS ingress; this source never binds a public
   interface.
3. The Office shell uses browser navigation to `GET /auth/login`, reads
   `GET /auth/session`, invokes `POST /auth/logout`, and exposes the reviewed
   roster endpoints only after an authenticated session. It neither receives
   nor stores an application password, OIDC token, role header, or scope
   value.
4. The disconnected preview remains a separate package with its `connect-src
   'none'` restriction and disabled sign-in control. It is not a fallback for
   the real application.
5. First-admin provisioning remains a controlled server-side bootstrap action
   using a separately created IdP identity. Runtime code must not turn a
   browser request into first-admin authority.

## Consequences

The result is source-ready for a normal systemd/nginx deployment and allows
real browser sign-in once the dedicated pilot database, Keycloak realm and
clients, secret injection, first admin, HTTPS ingress, and release gates are
approved. It does not itself create those external resources or grant a
release GO.
