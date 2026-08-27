import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PolicyFunctionManifest, SourceMigrationEvidence } from "./databaseSetup.js";
import type { PostSeedProofOperation } from "./proofLedger.js";

export type RedactedProofEvidence = Readonly<{
  schemaVersion: 2;
  status: "PASS" | "FAIL";
  startedAt: string;
  completedAt: string;
  runIdSha256: string;
  candidateCommitSha: string | null;
  candidateWorkingTreeClean: boolean | null;
  image: "postgres:16";
  imageId: string | null;
  imageImmutableReference: string | null;
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

/** Evidence contains only hashes, fixed marker names and timestamps. */
export async function writeRedactedEvidence(evidence: RedactedProofEvidence): Promise<string> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const evidenceDirectory = join(packageRoot, "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  const filename = `a03-${evidence.completedAt.replaceAll(/[:.]/g, "-")}-${evidence.runIdSha256.slice(0, 12)}.json`;
  const path = join(evidenceDirectory, filename);
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return path;
}
