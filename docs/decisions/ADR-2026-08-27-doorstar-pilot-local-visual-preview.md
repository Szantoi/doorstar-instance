# ADR-2026-08-27 — Doorstar pilot local visual preview

**Status:** Accepted for local source development
**Date:** 2026-08-27

## Context

The isolated Doorstar pilot has a source-ready named-user OIDC BFF, but it has
no configured IdP client, runtime database, listener, ingress, or Office read
model. Consequently a developer cannot safely use a real sign-in to review
the first Office-facing appearance yet.

The historical `uzemi-tabla-web` is a retired execution surface. Restarting it
or attaching a development login bypass would blur the Office/Plant boundary
and would not be a valid way to review the new pilot.

## Decision

1. Provide a separate `src/doorstar-pilot-ui-preview` package for local visual
   review only. It is not a BFF route, not a deployable application artefact,
   and not a replacement for the future Office read model.
2. The preview binds only to loopback and exposes no database, OIDC, BFF, or
   Plant connection. It carries no external-service or sensitive runtime
   configuration, secret, credential, customer record, or production URL. Its
   local listener port is the sole non-sensitive development setting.
3. Its sample screens may show a static sign-in state and a static Office
   dashboard state. Each screen must visibly state that it is a local visual
   preview with neither sign-in nor data connection. The sign-in control must
   not start an authorization flow or create a session.
4. The preview owns its own small static server and verification command, so
   visual work can be checked locally without changing the BFF's four-route
   public contract.
5. A real Office UI remains a later, separately designed data-owner decision.
   It must use the same-origin BFF session boundary and may not inherit preview
   sample data, preview controls, or any authentication shortcut.

## Consequences

- Developers can inspect the intended login and Office visual direction at a
  local URL before R-01, without weakening the fail-closed named-user path.
- The BFF continues to expose only `GET /auth/login`, `GET /auth/callback`,
  `GET /auth/session`, and `POST /auth/logout`.
- This decision creates no IdP client, database role, listener outside the
  developer machine, ingress, deployment, or Plant authority.
