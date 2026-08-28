import { canonicalJson, sha256 } from "./canonical.mjs";
import { assertSafeSourceEnvironment } from "./environment.mjs";
import { readExternalEvidenceFile } from "./evidenceFile.mjs";
import { fail } from "./errors.mjs";
import {
  EXPECTED_ENVIRONMENT_CLASS,
  EXPECTED_REVIEWED_TOOLCHAIN,
} from "./policy.mjs";
import { verifyGate0Capsule } from "./capsule.mjs";

const MARKER_KIND = "doorstar-pilot-gate0-human-acceptance";
const PROVENANCE_KIND = "doorstar-pilot-gate0-acceptance-provenance";
const NEXT_ACTION = "GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL";

/**
 * Verify externally stored, canonical evidence before binding it to a clean
 * candidate. The marker demonstrates only a structurally valid human-gated
 * record; authorization for its storage remains an external human control.
 */
export function verifyGate0AcceptanceArtifacts({
  repoRoot,
  candidate,
  capsulePath,
  acceptanceMarkerPath,
  runner,
  environment,
  fileSystem,
}) {
  assertSafeSourceEnvironment(environment);
  const capsuleText = readExternalEvidenceFile({
    evidencePath: capsulePath,
    repoRoot,
    fileSystem,
  });
  const acceptanceMarkerText = readExternalEvidenceFile({
    evidencePath: acceptanceMarkerPath,
    repoRoot,
    fileSystem,
  });
  return verifyGate0Acceptance({
    repoRoot,
    candidate,
    capsuleText,
    acceptanceMarkerText,
    runner,
    environment,
  });
}

/**
 * Bind an exact verified capsule to a strict, canonical human-acceptance
 * marker. It does not run an npm command, package code or network operation.
 */
export function verifyGate0Acceptance({
  repoRoot,
  candidate,
  capsuleText,
  acceptanceMarkerText,
  runner,
  environment,
}) {
  assertSafeSourceEnvironment(environment);
  const verifiedCapsuleText = verifyGate0Capsule({
    repoRoot,
    candidate,
    capsuleText,
    runner,
    environment,
  });
  const capsule = parseVerifiedCapsule(verifiedCapsuleText);
  const marker = parseAndValidateAcceptanceMarker(acceptanceMarkerText);
  assertMarkerBindsToCapsule(marker, capsule, capsuleText);
  return canonicalJson({
    schemaVersion: 1,
    kind: PROVENANCE_KIND,
    status: "GATE0_HUMAN_ACCEPTANCE_MARKER_BOUND",
    candidate: capsule.candidate,
    capsuleSha256: sha256(capsuleText),
    acceptanceMarkerSha256: sha256(acceptanceMarkerText),
    policySha256: capsule.policySha256,
    environmentClass: capsule.environmentClass,
    reviewedToolchain: capsule.reviewedToolchain,
    sourceCheckOutcomes: marker.sourceCheckOutcomes,
    permittedNextAction: marker.permittedNextAction,
  });
}

/** Parse an exact canonical marker without accepting arbitrary reviewer data. */
export function parseAndValidateAcceptanceMarker(markerText) {
  if (typeof markerText !== "string") {
    fail("gate0_acceptance_marker_invalid");
  }
  let marker;
  try {
    marker = JSON.parse(markerText);
  } catch {
    fail("gate0_acceptance_marker_invalid");
  }
  if (canonicalJson(marker) !== markerText) {
    fail("gate0_acceptance_marker_noncanonical");
  }
  if (!isPlainObject(marker)) {
    fail("gate0_acceptance_marker_invalid");
  }
  assertExactKeys(marker, [
    "schemaVersion",
    "kind",
    "status",
    "candidate",
    "capsuleSha256",
    "policySha256",
    "environmentClass",
    "reviewedToolchain",
    "sourceCheckOutcomes",
    "permittedNextAction",
  ]);
  if (marker.schemaVersion !== 1
    || marker.kind !== MARKER_KIND
    || marker.status !== "GATE0_HUMAN_ACCEPTED"
    || marker.environmentClass !== EXPECTED_ENVIRONMENT_CLASS
    || marker.permittedNextAction !== NEXT_ACTION
    || !isSha256(marker.capsuleSha256)
    || !isSha256(marker.policySha256)
    || !Array.isArray(marker.sourceCheckOutcomes)) {
    fail("gate0_acceptance_marker_invalid");
  }
  assertCandidate(marker.candidate);
  assertReviewedToolchain(marker.reviewedToolchain);
  marker.sourceCheckOutcomes.forEach(assertOutcomeShape);
  return marker;
}

function parseVerifiedCapsule(capsuleText) {
  try {
    return JSON.parse(capsuleText);
  } catch {
    // verifyGate0Capsule produces canonical JSON; this is defensive only.
    fail("gate0_capsule_mismatch");
  }
}

function assertMarkerBindsToCapsule(marker, capsule, capsuleText) {
  if (!sameCandidate(marker.candidate, capsule.candidate)
    || marker.capsuleSha256 !== sha256(capsuleText)
    || marker.policySha256 !== capsule.policySha256
    || marker.environmentClass !== capsule.environmentClass
    || !sameToolchain(marker.reviewedToolchain, capsule.reviewedToolchain)
    || marker.permittedNextAction !== NEXT_ACTION) {
    fail("gate0_acceptance_marker_mismatch");
  }
  const expectedOutcomes = capsule.components.flatMap((component) => component.checks.map((check) => ({
    componentId: component.id,
    checkId: check.id,
    outcome: "PASS",
  })));
  if (marker.sourceCheckOutcomes.length !== expectedOutcomes.length
    || marker.sourceCheckOutcomes.some((outcome, index) => !sameOutcome(outcome, expectedOutcomes[index]))) {
    fail("gate0_acceptance_marker_mismatch");
  }
}

function assertCandidate(candidate) {
  if (!isPlainObject(candidate)) {
    fail("gate0_acceptance_marker_invalid");
  }
  assertExactKeys(candidate, ["commitSha", "treeSha", "objectFormat"]);
  if ((candidate.objectFormat !== "sha1" && candidate.objectFormat !== "sha256")
    || !isObjectHash(candidate.commitSha, candidate.objectFormat)
    || !isObjectHash(candidate.treeSha, candidate.objectFormat)) {
    fail("gate0_acceptance_marker_invalid");
  }
}

function assertReviewedToolchain(toolchain) {
  if (!isPlainObject(toolchain)) {
    fail("gate0_acceptance_marker_invalid");
  }
  assertExactKeys(toolchain, ["node", "npm"]);
  if (!sameToolchain(toolchain, EXPECTED_REVIEWED_TOOLCHAIN)) {
    fail("gate0_acceptance_marker_invalid");
  }
}

function assertOutcomeShape(outcome) {
  if (!isPlainObject(outcome)) {
    fail("gate0_acceptance_marker_invalid");
  }
  assertExactKeys(outcome, ["componentId", "checkId", "outcome"]);
  if (!isSafeIdentifier(outcome.componentId)
    || !isSafeIdentifier(outcome.checkId)
    || outcome.outcome !== "PASS") {
    fail("gate0_acceptance_marker_invalid");
  }
}

function assertExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actualKeys.length !== expected.length || actualKeys.some((key, index) => key !== expected[index])) {
    fail("gate0_acceptance_marker_invalid");
  }
}

function sameCandidate(left, right) {
  return isPlainObject(right)
    && left.commitSha === right.commitSha
    && left.treeSha === right.treeSha
    && left.objectFormat === right.objectFormat;
}

function sameToolchain(left, right) {
  return isPlainObject(left)
    && isPlainObject(right)
    && left.node === right.node
    && left.npm === right.npm;
}

function sameOutcome(left, right) {
  return left.componentId === right.componentId
    && left.checkId === right.checkId
    && left.outcome === right.outcome;
}

function isObjectHash(value, objectFormat) {
  const length = objectFormat === "sha1" ? 40 : 64;
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function isSafeIdentifier(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
