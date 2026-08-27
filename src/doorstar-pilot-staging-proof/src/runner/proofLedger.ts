import { A03ProofError } from "./a03Config.js";

/**
 * Fixed, non-sensitive checkpoints for the narrow post-seed sequence. These
 * names intentionally describe only harness operations, never generated
 * identities, scope values, database roles, SQL, or PostgreSQL diagnostics.
 */
export const postSeedProofOperations = [
  "POST_SEED_SESSION_EXECUTE_CATALOG_ASSERTION",
  "POST_SEED_FIRST_SESSION_ISSUE",
  "POST_SEED_SECOND_SESSION_ISSUE",
  "POST_SEED_DIRECT_BINDING_UPDATE",
  "POST_SEED_TRANSITIONED_SESSION_ISSUE",
  "POST_SEED_DIRECT_AUDIT_ASSERTION",
] as const;

export type PostSeedProofOperation = (typeof postSeedProofOperations)[number];

const postSeedProofOperationSet = new Set<string>(postSeedProofOperations);

export class ProofLedger {
  private readonly completedMarkers: string[] = [];
  private inFlightPostSeedOperationMarker: PostSeedProofOperation | null = null;

  public constructor(private readonly onPass: (marker: string) => void = () => undefined) {}

  public pass(marker: string): void {
    this.assertPassMarker(marker);
    this.completedMarkers.push(marker);
    this.onPass(`A03-PASS:${marker}`);
  }

  /** Records one fixed operation until its corresponding success marker lands. */
  public beginPostSeedOperation(operation: PostSeedProofOperation): void {
    if (
      !postSeedProofOperationSet.has(operation)
      || this.inFlightPostSeedOperationMarker !== null
    ) {
      throw new A03ProofError("a03_post_seed_operation_state_invalid");
    }
    this.inFlightPostSeedOperationMarker = operation;
  }

  /** Completes exactly the operation that was previously marked in flight. */
  public completePostSeedOperation(operation: PostSeedProofOperation, passMarker: string): void {
    if (this.inFlightPostSeedOperationMarker !== operation) {
      throw new A03ProofError("a03_post_seed_operation_state_invalid");
    }
    this.pass(passMarker);
    this.inFlightPostSeedOperationMarker = null;
  }

  /** Null means no post-seed operation was active when the proof stopped. */
  public inFlightPostSeedOperation(): PostSeedProofOperation | null {
    return this.inFlightPostSeedOperationMarker;
  }

  public markers(): readonly string[] {
    return [...this.completedMarkers];
  }

  private assertPassMarker(marker: string): void {
    if (!/^[A-Z0-9_]{4,100}$/.test(marker) || this.completedMarkers.includes(marker)) {
      throw new A03ProofError("a03_proof_marker_invalid");
    }
  }
}
