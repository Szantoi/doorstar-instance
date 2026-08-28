# ADR-2026-08-28 — Doorstar pilot admin and named-user invitation

**Status:** Accepted for isolated source implementation
**Date:** 2026-08-28

## Context

The first Doorstar pilot is intentionally a small, single-company Office
surface. Its first practical business requirement is not a multi-tenant
identity platform: one named administrator must be able to sign in and give a
named colleague access, change that colleague's Office role, or disable that
access.

The existing isolated BFF can authenticate only pre-provisioned people. Its
bootstrap CLI can create the first binding, but is not a browser admin
experience. The local UI preview is deliberately static and must remain
non-authenticating. Therefore neither is sufficient for the requested
administrator workflow.

## Decision

1. The first administrator remains a server-side, approved bootstrap action.
   It is a named active `ADMINISTRATOR` binding with the separate
   `canManagePilotRoster` capability. There is no shared Doorstar account,
   application password, self-registration, tenant chooser, or browser role
   header.
2. The BFF receives a small, same-origin admin roster surface:
   `GET /admin/users`, `POST /admin/users`, and
   `PUT /admin/users/:bindingId`. Every route resolves the opaque session on
   the server and requires the current effective roster-manager capability.
   The browser may submit only display data and the requested Office policy;
   it never submits an actor, scope, subject, token, capability, or audit
   source.
3. Adding a person is a server-to-server Keycloak directory action. A
   narrowly scoped, server-only Keycloak management client first creates the
   named IdP account in a disabled state, obtains the immutable Keycloak user
   identifier that will be the OIDC subject, and requests Keycloak's
   password-setup/verification invitation. Doorstar never creates, stores,
   displays, or sends a password.
4. After the directory returns a subject, the BFF derives the existing
   server-side subject digest and calls a new DB-owned direct-admin provision
   writer. The writer derives the admin actor from the live opaque session,
   creates the local binding, and appends the immutable audit record. It does
   not accept raw identity, scope, actor, role source, or audit version from
   the browser.
5. The directory account is enabled only after the local binding commits. A
   failed local binding write keeps the just-created account unavailable; a
   failed enable operation best-effort disables that directory account and
   deactivates the new local binding. The browser receives only a generic
   availability failure; logs and audit DTOs do not contain the e-mail address,
   Keycloak access token, secret, or raw OIDC subject.
6. The initial scope intentionally excludes bulk import, self-service
   registration, SCIM, multi-company tenancy, password reset UX, or Plant and
   legacy execution authority. A later change may add invitation resend or
   richer account lifecycle only after its own decision and tests.

## Consequences

- The pilot remains small enough for one Doorstar company, while its one
  important security boundary stays reliable: user identity and authority are
  resolved on the server.
- The local preview may show an explicitly labelled, disconnected admin
  workflow for visual review. It cannot call these BFF routes, create a
  session, or send an invitation.
- A later operations change still owns Keycloak realm/client/service-account
  configuration, mail delivery, PostgreSQL migration, secret injection,
  HTTPS ingress, first-admin bootstrap, and deployment. This ADR authorises
  source work only and performs none of those actions.
