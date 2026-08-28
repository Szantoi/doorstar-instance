import { A03ProofError } from "./a03Config.js";

/**
 * The checked-out candidate must never be the authority that approves or
 * verifies itself. Until a separately released verifier and an independently
 * administered approval/signing anchor are supplied, this package has no
 * executable Gate 1 path.
 *
 * This is deliberately a hard stop rather than an injectable callback: an
 * option implemented by the candidate process would only recreate the
 * self-attestation boundary that Gate 1 is intended to prevent.
 */
export function requireCandidateIndependentGate1TrustAnchor(): never {
  throw new A03ProofError("a03_gate1_external_trust_anchor_required");
}
