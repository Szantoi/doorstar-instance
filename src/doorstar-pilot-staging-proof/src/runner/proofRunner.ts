import { A03ProofError, requireDisposableAcknowledgement } from "./a03Config.js";
import type { CommandRunner } from "./commandRunner.js";
import type { DockerRuntimeInputCandidate } from "./dockerRuntimeInput.js";
import { requireCandidateIndependentGate1TrustAnchor } from "./externalTrustAnchor.js";
import type { Gate0ProvenanceInput } from "./gate0Provenance.js";

export type DisposableProofRunOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  /**
   * Retained solely for source compatibility. A checked-out candidate may not
   * use a caller-provided runner to bypass the independent Gate 1 authority.
   */
  commandRunner?: CommandRunner;
  gate0Provenance?: Gate0ProvenanceInput;
  dockerRuntime?: DockerRuntimeInputCandidate;
  onPass?: (marker: string) => void;
}>;

export type DisposableProofRunResult = Readonly<{
  evidencePath: string;
  passMarkers: readonly string[];
}>;

/**
 * Intentionally non-executable from this checkout.
 *
 * The historical runner and its Gate 0/Gate 1 helper sources are useful input
 * to a future independently released verifier, but a candidate repository
 * cannot authenticate the verifier binary, the approver, or the approval
 * record that would authorize Docker. Keeping an in-repository execution path
 * would let a changed candidate weaken its own checks. Therefore this function
 * acknowledges the explicit disposable intent and then fails before reading
 * candidate files, external provenance, Git, Docker, Prisma, PostgreSQL, or
 * writing proof evidence. An external trusted verifier must own any eventual
 * execution and evidence emission.
 */
export async function runDisposableA03Proof(
  options: DisposableProofRunOptions = {},
): Promise<DisposableProofRunResult> {
  requireDisposableAcknowledgement(options.environment ?? process.env);
  return requireCandidateIndependentGate1TrustAnchor();
}

export function publicFailureCode(error: unknown): string {
  if (error instanceof A03ProofError) return error.publicCode;
  const sqlState = postgresSqlState(error);
  return sqlState === undefined ? "a03_unexpected_failure" : `a03_postgres_sqlstate_${sqlState}`;
}

/** Only the standardized five-character SQLSTATE is safe diagnostic output. */
function postgresSqlState(error: unknown): string | undefined {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && /^[0-9A-Z]{5}$/.test(error.code)
  ) {
    return error.code;
  }
  return undefined;
}
