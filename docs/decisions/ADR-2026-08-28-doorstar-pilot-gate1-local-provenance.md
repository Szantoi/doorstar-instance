# ADR-2026-08-28 — Gate 1 local Docker and accepted Gate 0 provenance

**Status:** Accepted for source remediation
**Date:** 2026-08-28

## Context

The A-03 harness is a separately human-approved, disposable PostgreSQL proof.
Its safety claim is meaningful only if it can neither select a remote container
engine nor run against a source candidate that has not passed the preceding
Gate 0 process.

Source review found two gaps:

1. Ambient Docker endpoint/context settings could influence Docker CLI calls.
   A `DOCKER_HOST`, `DOCKER_CONTEXT`, equivalent container-runtime setting, or
   a remote current context must never make the disposable command contact a
   non-local daemon.
2. The harness checked only a clean `HEAD`. It did not verify the Git-only Gate
   0 capsule nor the structured record that a human accepted Gate 0 for that
   exact candidate. A clean but unaccepted commit could therefore reach Docker.

Neither source code nor a local marker can authenticate a human approver without
a separately approved signing/records system. The source boundary must not
pretend otherwise.

## Decision

The following is a source-level contract for a future independently released
verifier. It does not make the checked-out harness an execution authority; the
local CLI intentionally stops before Docker until the candidate-independent
trust anchor is externally provisioned. See
[`ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md`](ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md).

1. Before any Docker daemon operation, the A-03 harness must fail closed unless
   its Docker environment contains no endpoint/context override and the fixed
   `default` context resolves to an explicitly allowlisted local engine
   endpoint. Every Docker invocation must name that `default` context and use
   the guarded environment. It must not fall back to Podman, a remote context,
   a custom Docker configuration, or an ambient endpoint variable.
2. The Gate 0 tool owns a source-only verifier for an accepted Gate 0
   provenance pair: the canonical capsule and an externally stored canonical
   human-acceptance marker. It verifies the capsule again against the current
   clean candidate and validates that the marker binds the same candidate/tree,
   capsule digest, policy/toolchain/check-plan identity and the sole permitted
   next action for Gate 1.
3. The human-acceptance marker is an external, bounded regular file with no
   symlink accepted. It carries only structured hashes, fixed statuses and
   action names; it contains no person name, credential, token, DB value,
   customer value, path, raw check transcript or timestamp. The authoritative
   human record remains outside the repository.
4. A Gate 1 invocation must receive the exact capsule and acceptance paths as
   explicit inputs. There is no default file, environment fallback, `--force`
   or bypass. The harness verifies accepted provenance before Docker readiness
   or image inspection, and revalidates candidate cleanliness/provenance before
   container creation.
5. Redacted A-03 evidence may retain only the candidate identity and hashes of
   the capsule and marker. It must not retain input paths or marker content.
   The existing one-run A-03 disposable acknowledgement remains mandatory: a
   Gate 0 acceptance never authorizes Docker by itself.

## Consequences

- The disposable proof becomes fail-closed when the host's Docker targeting is
  ambiguous, remote, overridden or cannot be proven local. No Docker command
  is attempted in those cases.
- A Gate 1 result can be traced to a particular accepted Gate 0 candidate, but
  it remains a disposable test, not a deploy, database, IdP, ingress or final
  release approval.
- Gate 0's production dependency-tree plan must name literal command arguments,
  acceptance conditions and the reviewed Node/npm toolchain. The Git-only
  capsule still only binds the plan; an approved isolated environment performs
  and records the actual checks.
- Tests must cover remote/override rejection, default-context enforcement,
  no-Docker-on-provenance-failure behavior, noncanonical or mismatched marker
  rejection, candidate drift, and redacted evidence boundaries.
- A later production host adapter or Office UI cannot use the A-03 harness as
  a runtime, deployment or Docker shortcut.
