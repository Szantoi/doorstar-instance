# ADR-2026-08-28 — Gate 1 candidate-independent trust anchor

**Status:** Accepted — execution remains blocked pending external provisioning
**Date:** 2026-08-28

## Context

The A-03 disposable proof must be able to demonstrate that a reviewed
candidate, rather than a modified checkout, authorized its own verification
and Docker invocation. A Gate 0 acceptance JSON file can bind hashes, but its
presence and fields do not authenticate a human approver. Likewise, a verifier
loaded from the candidate checkout can be changed by that candidate before it
starts Git, Prisma, or Docker.

No in-repository TypeScript/JavaScript check can close that authority loop.

## Decision

1. `src/doorstar-pilot-staging-proof` is deliberately non-executable for
   Gate 1. After the exact disposable acknowledgement it returns the stable
   failure `a03_gate1_external_trust_anchor_required` before reading candidate
   files, Gate 0 artifacts, Git, Docker, Prisma, PostgreSQL, or writing proof
   evidence.
2. The candidate checkout's historical harness, Gate 0 helpers, runtime-input
   manifest helper, and approval-record helper are source-review material only.
   They are not a release verifier and may not be used as a trust anchor.
3. Any future A-03 execution requires a separately released, immutable
   verifier artifact whose identity is pinned outside the candidate checkout,
   plus an independently administered approval anchor. The verifier must own
   the candidate-byte, fixture, toolchain, Docker, cleanup, and evidence
   checks; the candidate may supply no code or configuration that weakens them.
   Its local-input resolver must bind physical paths/handles rather than trust
   only drive-letter syntax, and its evidence publisher must be outside the
   candidate checkout.
4. The approval anchor must authenticate the specific one-run human decision.
   An unsigned JSON record is insufficient. An approved design must use either
   a signature verified with a public key pinned outside the checkout, or a
   privileged operations/audit store with equivalent independently administered
   access control and immutable audit evidence.
5. The external verifier and approval store are an operations/security
   architecture change. Provisioning, signing, Docker invocation, and any
   release action require a separate human GO; this ADR authorizes none of
   them.

## Consequences

- Accidental use of the local `proof:docker` command cannot create a Docker
  container or produce misleading proof evidence.
- Existing Gate 1 source-hardening work remains useful as a specification for
  the future independent verifier, but it is not sufficient to claim a
  completed disposable proof.
- Historical A-03 runtime evidence is retained only as historical evidence. It
  cannot satisfy this strengthened candidate-independent execution contract.
- The isolated named-user pilot remains inactive until Gate 1 has an approved,
  provisioned external trust anchor and all later release gates are accepted.

## Verification

The staging-proof unit suite must assert that a valid acknowledgement plus
otherwise well-formed Gate 0/Docker inputs makes zero child-process calls and
returns `a03_gate1_external_trust_anchor_required`.

## References

- [Immutable-input boundary](ADR-2026-08-28-doorstar-pilot-gate1-immutable-inputs.md)
- [Gate 1 provenance boundary](ADR-2026-08-28-doorstar-pilot-gate1-local-provenance.md)
- [Operations and release gate](../projects/doorstar-isolated-pilot/OPERATIONS-RELEASE-GATE.md)
