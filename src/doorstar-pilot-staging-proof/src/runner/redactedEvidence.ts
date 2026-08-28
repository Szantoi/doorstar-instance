import { A03ProofError } from "./a03Config.js";
import type { PolicyFunctionManifest, SourceMigrationEvidence } from "./databaseSetup.js";
import type {
  ImmutablePostgresImageReference,
  RedactedDockerRuntimeInput,
} from "./dockerRuntimeInput.js";
import type { PostSeedProofOperation } from "./proofLedger.js";

export type RedactedProofEvidence = Readonly<{
  schemaVersion: 4;
  status: "PASS" | "FAIL";
  startedAt: string;
  completedAt: string;
  runIdSha256: string;
  candidateCommitSha: string | null;
  candidateWorkingTreeClean: boolean | null;
  candidatePrismaSnapshotManifestSha256: string | null;
  gate0Provenance: Readonly<{
    candidateCommitSha: string;
    capsuleSha256: string;
    acceptanceMarkerSha256: string;
  }> | null;
  dockerRuntime: RedactedDockerRuntimeInput | null;
  image: ImmutablePostgresImageReference | null;
  imageId: string | null;
  imageImmutableReference: ImmutablePostgresImageReference | null;
  fixtureSha256: string;
  migrationEvidence: SourceMigrationEvidence | null;
  beforeFixtureManifest: PolicyFunctionManifest | null;
  afterFixtureManifest: PolicyFunctionManifest | null;
  finalFunctionManifest: PolicyFunctionManifest | null;
  passMarkers: readonly string[];
  inFlightPostSeedOperation: PostSeedProofOperation | null;
  cleanup: "container_destroyed" | "container_not_started" | "container_cleanup_failed";
  failureCode: string | null;
}>;

/**
 * Candidate checkout code may not choose or publish an evidence location.
 *
 * A package-local ignored directory is still inside mutable candidate source;
 * even a carefully sanitized filename cannot turn a replaced directory or
 * junction into an independently trusted evidence store. Until the external
 * Gate 1 verifier owns an authenticated, private evidence sink, fail before
 * any filesystem write. This helper remains typed so that the future verifier
 * contract is explicit, but it is intentionally not an evidence publisher.
 */
export async function writeRedactedEvidence(_evidence: RedactedProofEvidence): Promise<string> {
  throw new A03ProofError("a03_gate1_external_trust_anchor_required");
}
