# Doorstar isolated named-user pilot

This project reconstructs the Doorstar login pilot in a clean worktree. Its
first outcome is a separate, empty-database authentication foundation; it is
not a replacement for the legacy operational application and it cannot issue
Plant authority.

The only approved external identity model is upstream OIDC handled by a
server-side BFF. Browser sessions will be opaque and host-only. No password,
shared account, browser role header, tenant selector, Plant token, or direct
database access is part of the pilot.

The F phase is deliberately data-model only. A later A phase adds the OIDC
BFF and the reviewed database writer boundary. Any Office business read model
requires a separate data-owner decision; writes are out of scope.

See [the architecture decision](../../decisions/ADR-2026-08-27-isolated-doorstar-pilot-foundation.md)
and [the task register](TASKS.yaml).
