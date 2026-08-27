# Doorstar isolated named-user pilot

This project reconstructs the Doorstar login pilot in a clean worktree. Its
first outcome is a separate, empty-database authentication foundation; it is
not a replacement for the legacy operational application and it cannot issue
Plant authority.

The only approved external identity model is upstream OIDC handled by a
server-side BFF. Browser sessions will be opaque and host-only. No password,
shared account, browser role header, tenant selector, Plant token, or direct
database access is part of the pilot.

`SHOP_FLOOR` is Plant execution vocabulary retained only in the immutable
foundation enum for historical compatibility; it is database-rejected as a
Doorstar Office binding and cannot become a BFF or bootstrap role.

The F phase is deliberately data-model only. A later A phase adds the OIDC
BFF and the reviewed database writer boundary. Any Office business read model
requires a separate data-owner decision; writes are out of scope.

A-01 and A-02 are source-ready: the BFF and separate bootstrap CLI are
implemented and independently reviewed, but no database, IdP client, ingress
or listener has been activated. A-03 disposable staging proof and the release
gate remain mandatory before a real named-user pilot can go live.

For development-time visual review, the separate
[`doorstar-pilot-ui-preview`](../../../src/doorstar-pilot-ui-preview/README.md)
package provides only static, loopback-only login and Office-dashboard views.
It has no authentication, BFF, database, OIDC, cookie, or Plant connection;
the visible notice and disabled sign-in control make this boundary explicit.

See [the architecture decision](../../decisions/ADR-2026-08-27-isolated-doorstar-pilot-foundation.md)
and [the local-preview decision](../../decisions/ADR-2026-08-27-doorstar-pilot-local-visual-preview.md),
then [the task register](TASKS.yaml). The exact external staging and release
preconditions are recorded in the [operations release gate](OPERATIONS-RELEASE-GATE.md).
