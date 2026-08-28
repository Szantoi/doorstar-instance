import { readExternalEvidenceFile } from "../../doorstar-pilot-gate0/lib/evidenceFile.mjs";
import { canonicalJson, sha256 } from "./canonical.mjs";
import { Gate1Error, fail } from "./errors.mjs";
import { assertLocalExternalPath } from "./externalContent.mjs";
import {
  REQUIRED_NODE_VERSION,
  parseGate1RuntimeInputProvenance,
} from "./runtimeManifest.mjs";
import { verifyGate1RuntimeInputs } from "./verifier.mjs";

export const APPROVAL_RECORD_KIND = "doorstar-pilot-gate1-human-approval";
export const APPROVAL_RECORD_STATUS = "GATE1_HUMAN_APPROVED";
export const APPROVAL_PROVENANCE_KIND = "doorstar-pilot-gate1-approval-provenance";
export const APPROVAL_PROVENANCE_STATUS = "GATE1_HUMAN_APPROVAL_RECORD_BOUND";
export const PERMITTED_APPROVAL_ACTION = "A03_DISPOSABLE_DOCKER_POSTGRES16_PROOF";

const approvalRecordKeys = [
  "candidate",
  "dockerCliContentSha256",
  "kind",
  "nodeVersion",
  "permittedAction",
  "postgresImageReference",
  "prismaToolchainTreeSha256",
  "runtimeManifestSha256",
  "schemaVersion",
  "status",
];

/**
 * Bind a separately stored human Gate 1 record to freshly verified source and
 * runtime inputs. The record is only structural evidence: this source tool
 * cannot authenticate a person or grant an execution authorization itself.
 */
export function verifyGate1Approval({
  repoRoot,
  candidate,
  capsulePath,
  acceptanceMarkerPath,
  runtimeManifestPath,
  dockerCliPath,
  prismaToolchainPath,
  approvalPath,
  runner,
  environment = process.env,
  fileSystem,
  nodeVersion = process.version,
  runtimeInputVerifier = verifyGate1RuntimeInputs,
}) {
  const runtimeProvenanceText = runtimeInputVerifier({
    repoRoot,
    candidate,
    capsulePath,
    acceptanceMarkerPath,
    runtimeManifestPath,
    dockerCliPath,
    prismaToolchainPath,
    runner,
    environment,
    fileSystem,
    nodeVersion,
  });
  const runtimeProvenance = parseGate1RuntimeInputProvenance(runtimeProvenanceText);
  const approvalText = readApprovalRecord({ approvalPath, repoRoot, fileSystem });
  const approvalRecord = parseAndValidateGate1ApprovalRecord(approvalText);
  assertApprovalRecordBindsRuntime(approvalRecord, runtimeProvenance);
  return canonicalJson({
    schemaVersion: 1,
    kind: APPROVAL_PROVENANCE_KIND,
    status: APPROVAL_PROVENANCE_STATUS,
    candidate: runtimeProvenance.candidate,
    gate0CapsuleSha256: runtimeProvenance.gate0CapsuleSha256,
    gate0AcceptanceMarkerSha256: runtimeProvenance.gate0AcceptanceMarkerSha256,
    runtimeManifestSha256: runtimeProvenance.runtimeManifestSha256,
    dockerCliContentSha256: runtimeProvenance.dockerCliContentSha256,
    postgresImageReference: runtimeProvenance.postgresImageReference,
    prismaToolchainTreeSha256: runtimeProvenance.prismaToolchainTreeSha256,
    nodeVersion: runtimeProvenance.nodeVersion,
    approvalRecordSha256: sha256(approvalText),
    permittedAction: approvalRecord.permittedAction,
  });
}

/** Parse only the minimal canonical human-record binding; identities are forbidden. */
export function parseAndValidateGate1ApprovalRecord(approvalText) {
  if (typeof approvalText !== "string") {
    fail("gate1_approval_record_invalid");
  }
  let approvalRecord;
  try {
    approvalRecord = JSON.parse(approvalText);
  } catch {
    fail("gate1_approval_record_invalid");
  }
  if (canonicalJson(approvalRecord) !== approvalText) {
    fail("gate1_approval_record_noncanonical");
  }
  if (!isPlainObject(approvalRecord) || !hasExactKeys(approvalRecord, approvalRecordKeys)) {
    fail("gate1_approval_record_invalid");
  }
  if (approvalRecord.schemaVersion !== 1
    || approvalRecord.kind !== APPROVAL_RECORD_KIND
    || approvalRecord.status !== APPROVAL_RECORD_STATUS
    || approvalRecord.nodeVersion !== REQUIRED_NODE_VERSION
    || approvalRecord.permittedAction !== PERMITTED_APPROVAL_ACTION
    || !isCandidateIdentity(approvalRecord.candidate)
    || !isLowerSha256(approvalRecord.runtimeManifestSha256)
    || !isLowerSha256(approvalRecord.dockerCliContentSha256)
    || !isLowerSha256(approvalRecord.prismaToolchainTreeSha256)
    || !isImmutablePostgresReference(approvalRecord.postgresImageReference)) {
    fail("gate1_approval_record_invalid");
  }
  return Object.freeze(approvalRecord);
}

export function assertApprovalRecordBindsRuntime(approvalRecord, runtimeProvenance) {
  if (!sameCandidate(approvalRecord.candidate, runtimeProvenance.candidate)
    || approvalRecord.runtimeManifestSha256 !== runtimeProvenance.runtimeManifestSha256
    || approvalRecord.dockerCliContentSha256 !== runtimeProvenance.dockerCliContentSha256
    || approvalRecord.postgresImageReference !== runtimeProvenance.postgresImageReference
    || approvalRecord.prismaToolchainTreeSha256 !== runtimeProvenance.prismaToolchainTreeSha256
    || approvalRecord.nodeVersion !== runtimeProvenance.nodeVersion
    || approvalRecord.permittedAction !== PERMITTED_APPROVAL_ACTION) {
    fail("gate1_approval_record_binding_mismatch");
  }
}

function readApprovalRecord({ approvalPath, repoRoot, fileSystem }) {
  try {
    assertLocalExternalPath({ inputPath: approvalPath, repoRoot, prefix: "gate1_approval_record" });
    return readExternalEvidenceFile({
      evidencePath: approvalPath,
      repoRoot,
      fileSystem,
    });
  } catch (error) {
    if (error instanceof Gate1Error) throw error;
    fail("gate1_approval_record_unavailable");
  }
}

function isCandidateIdentity(value) {
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
