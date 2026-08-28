# ADR-2026-08-28 — Gate 1 immutable inputs and trusted-host boundary

**Status:** Accepted for source remediation
**Date:** 2026-08-28

## Context

The disposable A-03 proof must demonstrate the approved candidate, not a
mutable working tree, an ignored `node_modules` directory, an ambient Docker
configuration, or a mutable image tag. A security review found that a clean
Git check alone did not establish those facts:

- Prisma read its schema and migrations from the live checkout after the
  candidate check, so a concurrent edit or a new migration could be applied.
- The installed Prisma CLI and native engine are ignored build artifacts; a
  package-lock hash does not attest to their bytes.
- A bare `docker` command and ambient home/configuration could select a shim,
  credential helper, custom context or non-reviewed image.
- The source process cannot authenticate the host Node/Git/Docker binaries,
  daemon, external evidence store or the human approver without an independent
  host-attestation and approval system.

## Decision

The following controls are the reviewed specification for a future,
candidate-independent Gate 1 verifier. They are not an authorization for this
checkout to execute a proof. The local source runner is now deliberately
fail-closed until the external trust anchor described in
[`ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md`](ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md)
is provisioned.

1. Gate 1 materializes the reviewed Prisma schema, migration lock, and closed
   two-migration tree directly from the exact candidate's Git blobs into a
   fresh private snapshot. Prisma receives only that snapshot schema and
   working directory. The source snapshot has a canonical manifest hash,
   integrity check, and final cleanup.
2. Candidate Git reads use a frozen, minimal environment and fixed read-only
   Git options. They reject ambient `GIT_*` routing and disable helper-bearing
   behaviours such as fsmonitor, replacement objects, lazy fetch, aliases and
   external diff/credential configuration. This is hardening, not an
   attestation of the Git executable or host.
   The future verifier must compare the complete committed tree with a raw
   bounded filesystem walk, not `git status`; its proof checkout therefore
   contains no ignored build output, `node_modules`, evidence, symlink,
   junction, submodule, or untracked file.
3. Docker receives an explicit absolute CLI path, a new empty `--config`
   directory, an empty child environment, explicit `default` context, and an
   observed platform-default local endpoint. The CLI file must remain a
   regular non-symlink file with the same observed content hash before each
   invocation. The harness never uses `PATH` lookup, an ambient Docker config,
   a mutable `postgres:16` tag, or an image pull.
4. The PostgreSQL input is an exact lowercase
   `postgres@sha256:<digest>` reference. The observed local image must expose
   that same repository digest before a container can start.
5. A canonical external Gate 1 runtime-input manifest structurally binds the
   exact candidate and accepted Gate 0 artifacts to the Docker CLI content
   hash, immutable PostgreSQL reference, expected Prisma toolchain tree hash,
   and reviewed Node version. It contains no path, credential, token, database
   value, timestamp, user identity, or customer data. Its verifier emits only
   redacted binding evidence and never grants approval.
6. The external Prisma `node_modules` toolchain is copied into a second private
   no-symlink snapshot only after its deterministic tree hash matches the
   runtime-input manifest. The copied tree is rehashed before its fixed
   `prisma/build/index.js` entry point can run. The running Node executable
   remains an explicit trusted-host prerequisite.
7. A separate, recorded human Gate 1 approval must name the exact runtime
   manifest hash and one permitted disposable action. Neither an environment
   acknowledgement, a CLI flag, a Gate 0 acceptance marker, nor this source
   verifier can replace that approval.

## Consequences

- A changed checkout cannot alter the schema or SQL used after the final
  candidate check; a changed external Prisma toolchain cannot pass its manifest
  hash or private-copy integrity check.
- The source can enforce a narrow local Docker invocation shape and detect
  observed CLI-file changes, but cannot prove that an otherwise trusted
  executable, named pipe, Docker daemon, filesystem ACL, or Node runtime is
  uncompromised. Those facts remain explicit human operations preconditions.
- Earlier disposable-proof evidence is historical only. It is not evidence
  for a newer candidate or for this strengthened Gate 1 contract and must not
  be reused as release evidence.
- Any unavailable, malformed, mismatched, symlinked, oversized, changed, or
  unapproved runtime input is a fail-closed stop before Docker container
  creation.

## Verification design

Tests must cover the closed Git migration tree, snapshot tampering and cleanup,
Git environment isolation, Docker path/config/endpoint/image constraints,
runtime-manifest canonical binding, toolchain tree hashing/copying, and the
absence of Docker calls when any preceding gate fails. A fresh independent
security review is required after the integrated source tests pass.

## References

- [Gate 1 provenance ADR](ADR-2026-08-28-doorstar-pilot-gate1-local-provenance.md)
- [Candidate-independent execution ADR](ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md)
- [Operations and release gate](../projects/doorstar-isolated-pilot/OPERATIONS-RELEASE-GATE.md)
