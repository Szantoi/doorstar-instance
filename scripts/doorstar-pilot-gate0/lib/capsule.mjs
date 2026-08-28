import { canonicalJson, sha256 } from "./canonical.mjs";
import { assertSafeSourceEnvironment } from "./environment.mjs";
import { fail } from "./errors.mjs";
import { createGitRepository } from "./gitRepository.mjs";
import { POLICY_PATH, parseAndValidatePolicy, validatePackageManifest } from "./policy.mjs";

const CAPSULE_KIND = "doorstar-pilot-gate0-source-capsule";
const CAPSULE_SCHEMA_VERSION = 1;

/**
 * Bind a fixed source-check plan to Git blobs, then return a canonical JSON
 * capsule. It never executes candidate package code; a human records those
 * checks separately from an approved isolated verification environment.
 */
export function createGate0Capsule({ repoRoot, candidate, runner, environment, onProgress }) {
  assertSafeSourceEnvironment(environment);
  onProgress?.("gate0_candidate_snapshot_started");
  const repository = createGitRepository({ repoRoot, runner });
  const snapshot = readCandidateSnapshot(repository, candidate);
  repository.assertStillCleanCandidate(snapshot.candidate);
  onProgress?.("gate0_candidate_snapshot_bound");
  return canonicalJson(buildCapsule(snapshot));
}

/**
 * Validate a previously saved capsule against the same clean candidate. This
 * reads Git blobs only and intentionally does not rerun any package command.
 */
export function verifyGate0Capsule({ repoRoot, candidate, capsuleText, runner, environment }) {
  assertSafeSourceEnvironment(environment);
  const repository = createGitRepository({ repoRoot, runner });
  const snapshot = readCandidateSnapshot(repository, candidate);
  const expected = canonicalJson(buildCapsule(snapshot));
  if (typeof capsuleText !== "string" || capsuleText !== expected) {
    fail("gate0_capsule_mismatch");
  }
  repository.assertStillCleanCandidate(snapshot.candidate);
  return expected;
}

function readCandidateSnapshot(repository, candidate) {
  const candidateIdentity = repository.captureCleanCandidate(candidate);
  const policyBytes = repository.readBlob(candidateIdentity, POLICY_PATH);
  const policy = parseAndValidatePolicy(policyBytes);
  const components = policy.components.map((component) => {
    const packageJsonPath = `${component.directory}/package.json`;
    const packageLockPath = `${component.directory}/package-lock.json`;
    const packageJsonBytes = repository.readBlob(candidateIdentity, packageJsonPath);
    const packageLockBytes = repository.readBlob(candidateIdentity, packageLockPath);
    validatePackageManifest(component, packageJsonBytes);
    return Object.freeze({
      id: component.id,
      directory: component.directory,
      packageName: component.packageName,
      packageJsonSha256: sha256(packageJsonBytes),
      packageLockSha256: sha256(packageLockBytes),
      checks: component.checks.map((check) => ({
        id: check.id,
        kind: check.kind,
        ...(check.kind === "npm_run" ? { script: check.script } : {}),
      })),
    });
  });

  return Object.freeze({
    candidate: candidateIdentity,
    policy,
    policySha256: sha256(policyBytes),
    components,
  });
}

function buildCapsule(snapshot) {
  return {
    schemaVersion: CAPSULE_SCHEMA_VERSION,
    kind: CAPSULE_KIND,
    status: "CANDIDATE_BOUND_NOT_EXECUTED",
    candidate: {
      commitSha: snapshot.candidate.commitSha,
      treeSha: snapshot.candidate.treeSha,
      objectFormat: snapshot.candidate.objectFormat,
    },
    policySha256: snapshot.policySha256,
    environmentClass: snapshot.policy.environmentClass,
    components: snapshot.components,
    permittedNextAction: snapshot.policy.permittedNextAction,
  };
}
