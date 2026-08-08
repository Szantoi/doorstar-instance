# Doorstar Flow Lab binding

This release line publishes a password-protected, read-only demonstration of the
Doorstar Flow Lab projection. It is deliberately separate from the normal
production-board service and its `public` schema.

## Demonstration boundary

- Synthetic fixture only: `UX-REFERENCE-RETROFIT-001`.
- Public access is HTTPS plus nginx Basic Auth; no IP allowlist is used.
- nginx permits only `GET` and `HEAD` to `/api/production/`, supplies the
  temporary `reader` context, and removes browser-supplied identity headers.
- The backend listens only on loopback. The demo service uses its own database
  schema and database role.
- Import, review, materialization, deviations and issued work packages are not
  exposed by the demo proxy. The code keeps the narrow Flow Lab API for the
  authenticated product increment that follows.

## Product path after the demonstration

The release retains the durable Flow Lab aggregate, provenance and formal API;
the later production increment replaces the proxy's fixed reader context with
OIDC/JWT policy and opens only the reviewed mutation routes. It does not turn
the board into a second scheduler or create work packages automatically.

The operational procedure and rollback boundary are in
[DEMO-RELEASE.md](DEMO-RELEASE.md). Machine-readable delivery state is in
[TASKS.yaml](TASKS.yaml).
