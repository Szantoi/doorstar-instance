import { verifyGate0AcceptanceArtifacts } from "../../doorstar-pilot-gate0/lib/acceptance.mjs";
import { readExternalEvidenceFile } from "../../doorstar-pilot-gate0/lib/evidenceFile.mjs";
import { assertSafeGate1Environment } from "./environment.mjs";
import { Gate1Error, fail } from "./errors.mjs";
import {
  assertLocalExternalPath,
  hashExternalDockerCli,
  hashExternalPrismaToolchain,
} from "./externalContent.mjs";
import {
  assertFixedNodeVersion,
  assertManifestBindsGate0,
  createRedactedRuntimeProvenance,
  parseAndValidateRuntimeManifest,
  parseGate0AcceptanceProvenance,
} from "./runtimeManifest.mjs";

/**
 * Verify Gate 0 first, then bind its exact outcome to a canonical external
 * runtime-input manifest and the actual bounded local input contents. No
 * candidate package, npm, Docker, database, or network operation is started.
 */
export function verifyGate1RuntimeInputs({
  repoRoot,
  candidate,
  capsulePath,
  acceptanceMarkerPath,
  runtimeManifestPath,
  dockerCliPath,
  prismaToolchainPath,
  runner,
  environment = process.env,
  fileSystem,
  nodeVersion = process.version,
  gate0AcceptanceVerifier = verifyGate0AcceptanceArtifacts,
}) {
  assertSafeGate1Environment(environment);
  assertLocalExternalPath({ inputPath: capsulePath, repoRoot, prefix: "gate1_capsule" });
  assertLocalExternalPath({ inputPath: acceptanceMarkerPath, repoRoot, prefix: "gate1_acceptance" });
  assertLocalExternalPath({ inputPath: runtimeManifestPath, repoRoot, prefix: "gate1_runtime_manifest" });
  assertLocalExternalPath({ inputPath: dockerCliPath, repoRoot, prefix: "gate1_docker_cli" });
  assertLocalExternalPath({ inputPath: prismaToolchainPath, repoRoot, prefix: "gate1_prisma_toolchain" });
  const gate0ProvenanceText = verifyGate0First({
    repoRoot,
    candidate,
    capsulePath,
    acceptanceMarkerPath,
    runner,
    environment,
    fileSystem,
    gate0AcceptanceVerifier,
  });
  const gate0Provenance = parseGate0AcceptanceProvenance(gate0ProvenanceText);
  assertFixedNodeVersion(nodeVersion);

  const runtimeManifestText = readRuntimeManifest({ runtimeManifestPath, repoRoot, fileSystem });
  const runtimeManifest = parseAndValidateRuntimeManifest(runtimeManifestText);
  assertManifestBindsGate0(runtimeManifest, gate0Provenance);

  const dockerCli = hashExternalDockerCli({ dockerCliPath, repoRoot, fileSystem });
  const prismaToolchain = hashExternalPrismaToolchain({ prismaToolchainPath, repoRoot, fileSystem });
  return createRedactedRuntimeProvenance({
    candidate: gate0Provenance.candidate,
    manifestText: runtimeManifestText,
    dockerCliContentSha256: dockerCli.sha256,
    prismaToolchainTreeSha256: prismaToolchain.treeSha256,
  });
}

function verifyGate0First({
  repoRoot,
  candidate,
  capsulePath,
  acceptanceMarkerPath,
  runner,
  environment,
  fileSystem,
  gate0AcceptanceVerifier,
}) {
  try {
    return gate0AcceptanceVerifier({
      repoRoot,
      candidate,
      capsulePath,
      acceptanceMarkerPath,
      runner,
      environment,
      fileSystem,
    });
  } catch (error) {
    if (error instanceof Gate1Error) throw error;
    fail("gate1_gate0_acceptance_invalid");
  }
}

function readRuntimeManifest({ runtimeManifestPath, repoRoot, fileSystem }) {
  try {
    return readExternalEvidenceFile({
      evidencePath: runtimeManifestPath,
      repoRoot,
      fileSystem,
    });
  } catch (error) {
    if (error instanceof Gate1Error) throw error;
    fail("gate1_runtime_manifest_unavailable");
  }
}
