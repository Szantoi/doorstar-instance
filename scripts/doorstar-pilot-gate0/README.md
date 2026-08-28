# Doorstar pilot Gate 0 capsule tool

This zero-dependency Node tool creates and verifies **source-only** candidate
evidence for the isolated Doorstar pilot. It is governed by
[`gate0-policy.v1.json`](gate0-policy.v1.json) and the release decision in
[`ADR-2026-08-28-doorstar-pilot-gate0-capsule.md`](../../docs/decisions/ADR-2026-08-28-doorstar-pilot-gate0-capsule.md).

It is not a deploy, database, Docker, IdP, listener, migration or secret
management tool. It does not invoke `npm` or any candidate package script. It
uses only bounded, read-only Git commands without a shell.

## Create a capsule

From a clean checkout at the candidate commit, use a full commit SHA and write
stdout only to the separately approved evidence location:

```powershell
node scripts/doorstar-pilot-gate0/createGate0Capsule.mjs --candidate <full-commit-sha> > <approved-evidence-path>\gate0-capsule.json
```

Progress appears on stderr. The JSON output is canonical, has no timestamp or
machine/user data, and is byte-identical for the same clean candidate. The tool
fails before producing JSON when the worktree is dirty, `HEAD` differs from the
candidate, the policy changes, a Git blob is missing, or a forbidden runtime
or Git environment variable is present.

The output intentionally contains no test transcript, credentials, DSN, token,
OIDC subject, cookie, absolute path, hostname or customer data. It records the
commit/tree identity, policy SHA-256, Git-blob SHA-256 values for the three
package files, and the fixed check plan only. Its status is
`CANDIDATE_BOUND_NOT_EXECUTED`; it never asserts that a package check passed.

## Toolchain boundary

Run this only with a trusted local Node/Git toolchain. Clear `NODE_OPTIONS`
before starting the Node process: the tool detects and rejects that variable
before reading Git, but a Node preload can already have run before the tool is
able to inspect its environment. The same principle applies to the operator's
Git executable and host integrity; this capsule is source identity evidence,
not a host attestation.

## Verify a stored capsule

```powershell
node scripts/doorstar-pilot-gate0/verifyGate0Capsule.mjs --candidate <full-commit-sha> --capsule <approved-evidence-path>\gate0-capsule.json
```

Verification requires the same clean candidate checkout and compares the saved
canonical bytes against the candidate's Git blobs and policy. It does not run
candidate code, package checks or contact an external service.

## Human release record remains mandatory

The capsule does not grant a release or a passing source verification. An
approved, isolated human verification must run the fixed check plan and record
redacted outcomes alongside the capsule SHA-256. Only after that Gate 0 review
may a human release record permit the separately approved disposable Gate 1
proof.

## Tool tests

```powershell
node --test scripts/doorstar-pilot-gate0/test/*.test.mjs
```

The tests use an injected fake process runner. They do not invoke Git, npm,
Docker, a database, an IdP, a network service or a real package command.
