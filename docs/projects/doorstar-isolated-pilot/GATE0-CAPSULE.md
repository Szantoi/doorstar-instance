# Doorstar pilot — Gate 0 capsule operator guide

This guide describes source-only evidence generation. It does **not** approve
or perform a release, database, IdP, ingress, secret-store, VPS or deployment
operation. The approval authority remains
[OPERATIONS-RELEASE-GATE.md](OPERATIONS-RELEASE-GATE.md).

## Purpose

The Gate 0 capsule deterministically binds one clean candidate commit to:

- its Git commit, tree and object format;
- the SHA-256 of the versioned Gate 0 policy; and
- Git-blob SHA-256 values for `package.json` and `package-lock.json` in the
  foundation, BFF and bootstrap packages, together with the fixed source-only
  check plan, reviewed Node/npm tuple and exact production-dependency-tree
  command contract that a separate isolated human verification must execute.

Its status is `CANDIDATE_BOUND_NOT_EXECUTED`: it is deliberately neither a
passing test report nor an approval record. Reviewer identity, observed time,
environment record, redacted check outcomes and release authority are human
facts that must be recorded separately alongside the capsule SHA-256.

## Preconditions

1. Use a clean checkout with the candidate commit checked out as `HEAD`.
2. Ensure no database, pilot, bootstrap, `PG*`, `GIT_*` or `NODE_OPTIONS` environment
   variable is inherited by the process. The tool fails closed if it finds one.
   Clear `NODE_OPTIONS` **before** starting Node: its detector cannot undo a
   preload that has already run. Use a trusted local Node/Git toolchain; the
   capsule is not host-integrity attestation.
3. Do not include the Gate 1 staging harness, legacy `production-service`,
   legacy Board, Plant or a vulnerability feed scan in this capsule.

## Generate and preserve

Run the creator with the full candidate SHA as documented in the
[tool README](../../../scripts/doorstar-pilot-gate0/README.md). Its stdout is
the only capsule content; progress is stderr. Store the result only in the
approved evidence location and calculate its SHA-256 there.

The capsule's only permitted next action is
`HUMAN_SOURCE_CHECK_EVIDENCE_AND_GATE0_REVIEW_REQUIRED`. Before a Gate 0 human
record can permit Gate 1, an approved isolated verification environment must
run the policy's exact named source checks and preserve redacted outcomes. That
environment and its dependency provenance are separate human evidence; the
capsule never runs or attests to candidate code.

The authoritative human approval record must then name:

- the exact candidate commit and capsule SHA-256;
- the reviewer;
- the environment classification; and
- the accepted redacted source-check outcomes; and
- `GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL` as the only
  permitted next action after Gate 0 acceptance.

No evidence record may contain a credential, authorization code, `state`,
token, cookie, raw OIDC subject, DSN, hostname, absolute path or customer data.

For the separately approved Gate 1 proof, produce a canonical, redacted
acceptance marker outside the checkout and run
`verifyGate0Acceptance.mjs` against that marker and capsule. The marker may
contain only the exact candidate/tree identity, capsule/policy hashes, reviewed
toolchain, fixed PASS check matrix and the Gate 1 next-action value. It must be
a bounded regular file with no symbolic-link component; a path in the checkout
is rejected. The verifier's output proves that the structured marker binds the
candidate, not that a program can authenticate the human approver.

The current source helper accepts those files only from a trusted local path:
UNC/device paths are rejected, and on Windows the path must be on the same
volume as the operating-system root so a mapped approval share is not silently
treated as local evidence; NTFS alternate data streams and hard-linked files
are rejected as well. This is a fail-closed path policy under the trusted host
environment, not an OS-level attestation of `SystemRoot` or filesystem type
(and Unix network mounts are not distinguished from a local absolute path). A
remote or privileged approval store requires the separate external-trust-anchor
design; it must not be passed to this generic file reader as a workaround.

## Verification and failure handling

Run the capsule verifier before the human record is accepted, then run the
acceptance verifier against the same clean checkout and external marker before
Gate 1. A dirty checkout, changed candidate, policy/blob mismatch, missing
lockfile, forbidden environment name, noncanonical marker or evidence-path
violation is a stop condition. A failed or unrecorded isolated source check is
a separate Gate 0 stop condition. Preserve only stable failure codes and
redacted outcomes; do not edit the capsule or waive a failure.
