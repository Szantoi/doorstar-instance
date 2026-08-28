import { canonicalJson, sha256 } from "./canonical.mjs";
import { fail } from "./errors.mjs";

export const REQUIRED_NODE_VERSION = "v24.13.0";
export const RUNTIME_MANIFEST_KIND = "doorstar-pilot-gate1-runtime-input-manifest";
export const RUNTIME_PROVENANCE_KIND = "doorstar-pilot-gate1-runtime-input-provenance";
export const BOUND_NOT_APPROVED_STATUS = "GATE1_RUNTIME_INPUTS_BOUND_NOT_APPROVED";

const manifestKeys = [
  "candidate",
  "dockerCliContentSha256",
  "gate0AcceptanceMarkerSha256",
  "gate0CapsuleSha256",
  "kind",
  "nodeVersion",
  "postgresImageReference",
  "prismaToolchainTreeSha256",
  "schemaVersion",
  "status",
];

const runtimeProvenanceKeys = [
  "candidate",
  "dockerCliContentSha256",
  "gate0AcceptanceMarkerSha256",
  "gate0CapsuleSha256",
  "kind",
  "nodeVersion",
  "postgresImageReference",
  "prismaToolchainTreeSha256",
  "runtimeManifestSha256",
  "schemaVersion",
  "status",
];

/** Parse only a byte-canonical, small runtime-input binding without approval fields. */
export function parseAndValidateRuntimeManifest(manifestText) {
  if (typeof manifestText !== "string") {
    fail("gate1_runtime_manifest_invalid");
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    fail("gate1_runtime_manifest_invalid");
  }
  if (canonicalJson(manifest) !== manifestText) {
    fail("gate1_runtime_manifest_noncanonical");
  }
  if (!isPlainObject(manifest) || !hasExactKeys(manifest, manifestKeys)) {
    fail("gate1_runtime_manifest_invalid");
  }
  if (manifest.schemaVersion !== 1
    || manifest.kind !== RUNTIME_MANIFEST_KIND
    || manifest.status !== BOUND_NOT_APPROVED_STATUS
    || manifest.nodeVersion !== REQUIRED_NODE_VERSION
    || !isCandidateIdentity(manifest.candidate)
    || !isLowerSha256(manifest.gate0CapsuleSha256)
    || !isLowerSha256(manifest.gate0AcceptanceMarkerSha256)
    || !isLowerSha256(manifest.dockerCliContentSha256)
    || !isLowerSha256(manifest.prismaToolchainTreeSha256)
    || !isImmutablePostgresReference(manifest.postgresImageReference)) {
    fail("gate1_runtime_manifest_invalid");
  }
  return Object.freeze(manifest);
}

/** Create the only safe public output: bindings and integrity IDs, never paths. */
export function createRedactedRuntimeProvenance({
  candidate,
  manifestText,
  dockerCliContentSha256,
  prismaToolchainTreeSha256,
}) {
  const manifest = parseAndValidateRuntimeManifest(manifestText);
  if (!sameCandidate(manifest.candidate, candidate)
    || manifest.dockerCliContentSha256 !== dockerCliContentSha256
    || manifest.prismaToolchainTreeSha256 !== prismaToolchainTreeSha256) {
    fail("gate1_runtime_manifest_binding_mismatch");
  }
  return canonicalJson({
    schemaVersion: 1,
    kind: RUNTIME_PROVENANCE_KIND,
    status: BOUND_NOT_APPROVED_STATUS,
    candidate: manifest.candidate,
    gate0CapsuleSha256: manifest.gate0CapsuleSha256,
    gate0AcceptanceMarkerSha256: manifest.gate0AcceptanceMarkerSha256,
    runtimeManifestSha256: sha256(manifestText),
    dockerCliContentSha256: manifest.dockerCliContentSha256,
    postgresImageReference: manifest.postgresImageReference,
    prismaToolchainTreeSha256: manifest.prismaToolchainTreeSha256,
    nodeVersion: manifest.nodeVersion,
  });
}

/** Parse the exact redacted result of verifyGate1RuntimeInputs before Gate 1 approval binding. */
export function parseGate1RuntimeInputProvenance(provenanceText) {
  if (typeof provenanceText !== "string") {
    fail("gate1_runtime_provenance_invalid");
  }
  let provenance;
  try {
    provenance = JSON.parse(provenanceText);
  } catch {
    fail("gate1_runtime_provenance_invalid");
  }
  if (canonicalJson(provenance) !== provenanceText
    || !isPlainObject(provenance)
    || !hasExactKeys(provenance, runtimeProvenanceKeys)
    || provenance.schemaVersion !== 1
    || provenance.kind !== RUNTIME_PROVENANCE_KIND
    || provenance.status !== BOUND_NOT_APPROVED_STATUS
    || provenance.nodeVersion !== REQUIRED_NODE_VERSION
    || !isCandidateIdentity(provenance.candidate)
    || !isLowerSha256(provenance.gate0CapsuleSha256)
    || !isLowerSha256(provenance.gate0AcceptanceMarkerSha256)
    || !isLowerSha256(provenance.runtimeManifestSha256)
    || !isLowerSha256(provenance.dockerCliContentSha256)
    || !isLowerSha256(provenance.prismaToolchainTreeSha256)
    || !isImmutablePostgresReference(provenance.postgresImageReference)) {
    fail("gate1_runtime_provenance_invalid");
  }
  return Object.freeze(provenance);
}

export function assertManifestBindsGate0(manifest, gate0Provenance) {
  if (!sameCandidate(manifest.candidate, gate0Provenance.candidate)
    || manifest.gate0CapsuleSha256 !== gate0Provenance.capsuleSha256
    || manifest.gate0AcceptanceMarkerSha256 !== gate0Provenance.acceptanceMarkerSha256) {
    fail("gate1_runtime_manifest_gate0_binding_mismatch");
  }
}

export function assertFixedNodeVersion(nodeVersion) {
  if (nodeVersion !== REQUIRED_NODE_VERSION) {
    fail("gate1_node_version_unexpected");
  }
}

export function parseGate0AcceptanceProvenance(provenanceText) {
  if (typeof provenanceText !== "string") {
    fail("gate1_gate0_acceptance_invalid");
  }
  let provenance;
  try {
    provenance = JSON.parse(provenanceText);
  } catch {
    fail("gate1_gate0_acceptance_invalid");
  }
  const expectedKeys = [
    "acceptanceMarkerSha256",
    "candidate",
    "capsuleSha256",
    "environmentClass",
    "kind",
    "permittedNextAction",
    "policySha256",
    "reviewedToolchain",
    "schemaVersion",
    "sourceCheckOutcomes",
    "status",
  ];
  if (canonicalJson(provenance) !== provenanceText
    || !isPlainObject(provenance)
    || !hasExactKeys(provenance, expectedKeys)
    || provenance.schemaVersion !== 1
    || provenance.kind !== "doorstar-pilot-gate0-acceptance-provenance"
    || provenance.status !== "GATE0_HUMAN_ACCEPTANCE_MARKER_BOUND"
    || provenance.environmentClass !== "SOURCE_ONLY_NO_EXTERNAL_RUNTIME"
    || provenance.permittedNextAction !== "GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL"
    || !isCandidateIdentity(provenance.candidate)
    || !isLowerSha256(provenance.capsuleSha256)
    || !isLowerSha256(provenance.acceptanceMarkerSha256)
    || !isLowerSha256(provenance.policySha256)
    || !isReviewedToolchain(provenance.reviewedToolchain)
    || !isPassingOutcomes(provenance.sourceCheckOutcomes)) {
    fail("gate1_gate0_acceptance_invalid");
  }
  return Object.freeze(provenance);
}

export function isCandidateIdentity(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["commitSha", "objectFormat", "treeSha"])) {
    return false;
  }
  const length = value.objectFormat === "sha1" ? 40 : value.objectFormat === "sha256" ? 64 : 0;
  return length > 0
    && typeof value.commitSha === "string"
    && typeof value.treeSha === "string"
    && new RegExp(`^[0-9a-f]{${length}}$`).test(value.commitSha)
    && new RegExp(`^[0-9a-f]{${length}}$`).test(value.treeSha);
}

function sameCandidate(left, right) {
  return isCandidateIdentity(left)
    && isCandidateIdentity(right)
    && left.commitSha === right.commitSha
    && left.treeSha === right.treeSha
    && left.objectFormat === right.objectFormat;
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function isLowerSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isImmutablePostgresReference(value) {
  return typeof value === "string" && /^postgres@sha256:[a-f0-9]{64}$/.test(value);
}

function isReviewedToolchain(value) {
  return isPlainObject(value)
    && hasExactKeys(value, ["node", "npm"])
    && value.node === REQUIRED_NODE_VERSION
    && typeof value.npm === "string"
    && /^\d+\.\d+\.\d+$/.test(value.npm);
}

function isPassingOutcomes(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((outcome) => isPlainObject(outcome)
      && hasExactKeys(outcome, ["checkId", "componentId", "outcome"])
      && typeof outcome.componentId === "string"
      && /^[a-z][a-z0-9_]*$/.test(outcome.componentId)
      && typeof outcome.checkId === "string"
      && /^[a-z][a-z0-9_]*$/.test(outcome.checkId)
      && outcome.outcome === "PASS");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
