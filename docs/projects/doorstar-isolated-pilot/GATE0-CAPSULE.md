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
  check plan that a separate isolated human verification must execute.

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

The human approval record must then name:

- the exact candidate commit and capsule SHA-256;
- the reviewer;
- the environment classification; and
- the accepted redacted source-check outcomes; and
- `GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL` as the only
  permitted next action after Gate 0 acceptance.

No evidence record may contain a credential, authorization code, `state`,
token, cookie, raw OIDC subject, DSN, hostname, absolute path or customer data.

## Verification and failure handling

Run the verifier against the same clean checkout and the stored capsule before
the human record is accepted. A dirty checkout, changed candidate, policy/blob
mismatch, missing lockfile or forbidden environment name is a capsule stop
condition. A failed or unrecorded isolated source check is a separate Gate 0
stop condition. Preserve only stable failure codes and redacted outcomes; do
not edit the capsule or waive a failure.
