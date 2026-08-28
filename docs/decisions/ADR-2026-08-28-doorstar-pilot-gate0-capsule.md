# ADR-2026-08-28 — Doorstar pilot Gate 0 source capsule

**Status:** Accepted for source-only implementation
**Date:** 2026-08-28

## Context

The pilot release gate requires an immutable, clean source candidate before an
operator may consider a disposable staging proof. The evidence must bind the
candidate commit to the three source packages that own this gate:

- `src/doorstar-pilot-foundation`;
- `src/doorstar-pilot-bff`; and
- `src/doorstar-pilot-bootstrap`.

The current checklist is manual. It does not provide a byte-reproducible,
redacted statement of the candidate, package-lock content and fixed source-check
plan. A generic source tool cannot safely prove arbitrary candidate scripts are
network- or side-effect-free simply by invoking `npm run`. The Gate 1 staging
harness and every legacy surface are deliberately outside this scope.

## Decision

1. Add a zero-dependency Node tool in `scripts/doorstar-pilot-gate0/`, with a
   versioned declarative policy, a capsule creator, a capsule verifier and
   native Node unit tests.
2. The creator accepts only a full commit SHA that equals a clean checked-out
   `HEAD` both before and after verification. It obtains the candidate tree,
   policy, `package.json` and `package-lock.json` bytes from Git blobs—not the
   working tree—so line-ending conversion cannot change the evidence.
3. The policy binds only the three named pilot packages and their fixed
   source-check plan. The creator and verifier execute **no package script**:
   they run only bounded Git read commands, never `npm`, Docker, database,
   HTTP, SSH, IdP, listener, migration or deployment command. The plan names
   the offline production dependency-tree check, but does not claim that it
   executed.
4. The creator emits one canonical JSON capsule to stdout only. It contains no
   timestamp, hostname, username, absolute path, command transcript, secret,
   token, DSN, OIDC subject or customer data. It keeps progress logs on stderr
   only and produces no partial capsule on failure.
5. The capsule is deterministic for the same clean candidate and policy, with
   status `CANDIDATE_BOUND_NOT_EXECUTED`. An approved, isolated human source
   verification must run and record the named commands separately before Gate
   0 can pass. The human approval record references the capsule SHA-256,
   reviewer, environment classification, redacted check outcomes and permitted
   next action. Those non-deterministic facts never belong in the capsule.
6. The verifier checks canonical form, schema, Git-blob hashes and policy
   correspondence from the same clean checkout. It does not rerun checks or
   contact an external service.

## Consequences

- Gate 0 gains reproducible technical candidate identity, but the capsule does
  **not** assert a passing build or turn a local commit into an approved RC.
  The isolated human verification and human release record remain required.
- The tool rejects inherited database, pilot, bootstrap, `PG*`, `GIT_*` and
  `NODE_OPTIONS` configuration before reading the candidate. It verifies that
  Git reports the requested repository root, preventing ambient Git routing.
  `NODE_OPTIONS` detection happens after Node starts, so it is fail-closed
  detection—not host-integrity protection. Operators must clear it before
  starting Node and use a trusted local Node/Git toolchain.
- A live vulnerability/advisory scan is intentionally not folded into the
  deterministic check plan. If required, it must be a separately versioned,
  human-reviewed advisory snapshot.
- Gate 1 remains a separate disposable-only human approval; Gate 2 and Gate 3
  remain operations gates.

## Verification design

Native tests must cover canonical output, Git-blob hashing, policy/path/command
rejection, dirty or candidate drift during both creation and verification,
forbidden runtime/Git environment names, repository-root mismatch, no package
execution, and an injected fake-runner integration path. An independent review
is required before this tool is relied upon for a release record.

## References

- [Operations and release gate](../projects/doorstar-isolated-pilot/OPERATIONS-RELEASE-GATE.md)
- [Gate 0 operator capsule guide](../projects/doorstar-isolated-pilot/GATE0-CAPSULE.md)
