import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { A03ProofError } from "./a03Config.js";
import type { CandidateGitState } from "./candidateGitState.js";
import type { CommandRunner } from "./commandRunner.js";

const gate0AcceptanceVerifierPath = resolve(
  fileURLToPath(new URL("../../../../scripts/doorstar-pilot-gate0/verifyGate0Acceptance.mjs", import.meta.url)),
);
const gate0VerifierTimeoutMilliseconds = 30_000;
const maxVerifierOutputCharacters = 64 * 1024;

const expectedProvenanceKeys = [
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
] as const;

const expectedCandidateKeys = ["commitSha", "objectFormat", "treeSha"] as const;
const expectedToolchainKeys = ["node", "npm"] as const;
const expectedOutcomeKeys = ["checkId", "componentId", "outcome"] as const;

export type Gate0ProvenanceInput = Readonly<{
  capsulePath: string;
  acceptancePath: string;
}>;

/** The only Gate 0 values retained by the A-03 evidence writer. */
export type VerifiedGate0Provenance = Readonly<{
  candidateCommitSha: string;
  capsuleSha256: string;
  acceptanceMarkerSha256: string;
}>;

/**
 * A Gate 1 caller must explicitly name both external Gate 0 artifacts. There
 * is deliberately no environment fallback, default location or bypass flag.
 */
export function requireGate0ProvenanceInput(input: Gate0ProvenanceInput | undefined): Gate0ProvenanceInput {
  if (
    !isPlainObject(input)
    || !hasExactKeys(input, ["acceptancePath", "capsulePath"])
    || !isNonEmptyAbsolutePath(input.capsulePath)
    || !isNonEmptyAbsolutePath(input.acceptancePath)
  ) {
    throw new A03ProofError("a03_gate0_provenance_required");
  }
  return Object.freeze({
    capsulePath: resolve(input.capsulePath),
    acceptancePath: resolve(input.acceptancePath),
  });
}

/**
 * Start the Gate 0 verifier with a small, non-routing environment. The fixed
 * Node executable avoids PATH lookup for Node itself; PATH is retained solely
 * because the reviewed Gate 0 verifier needs to start its fixed Git command.
 * No Node, Git, PostgreSQL, Prisma, pilot or Doorstar pilot values cross this
 * process boundary.
 */
export function createGate0VerifierEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const name of safeChildEnvironmentNames()) {
    const value = lookupEnvironmentValue(environment, name);
    if (value !== undefined) sanitized[name] = value;
  }
  return Object.freeze(sanitized) as NodeJS.ProcessEnv;
}

/**
 * Invoke the source-only Gate 0 acceptance verifier as a child process. This
 * package never imports a Gate 0 module: keeping that boundary dynamic avoids
 * turning the disposable proof harness into a sibling-runtime dependency.
 */
export async function verifyAcceptedGate0Provenance({
  commandRunner,
  candidate,
  provenance,
  environment = process.env,
}: Readonly<{
  commandRunner: CommandRunner;
  candidate: CandidateGitState;
  provenance: Gate0ProvenanceInput;
  environment?: NodeJS.ProcessEnv;
}>): Promise<VerifiedGate0Provenance> {
  const input = requireGate0ProvenanceInput(provenance);
  let result;
  try {
    result = await commandRunner.run(
      process.execPath,
      [
        gate0AcceptanceVerifierPath,
        "--candidate", candidate.commitSha,
        "--capsule", input.capsulePath,
        "--acceptance", input.acceptancePath,
      ],
      gate0VerifierTimeoutMilliseconds,
      createGate0VerifierEnvironment(environment),
    );
  } catch {
    throw new A03ProofError("a03_gate0_provenance_verifier_failed");
  }
  if (result.exitCode !== 0 || result.stdout.length > maxVerifierOutputCharacters) {
    throw new A03ProofError("a03_gate0_provenance_verifier_failed");
  }
  return parseVerifiedGate0Provenance(result.stdout, candidate);
}

/** The second Gate prevents a valid artifact swap between checks. */
export function assertSameGate0Provenance(
  initial: VerifiedGate0Provenance,
  repeated: VerifiedGate0Provenance,
): void {
  if (
    initial.candidateCommitSha !== repeated.candidateCommitSha
    || initial.capsuleSha256 !== repeated.capsuleSha256
    || initial.acceptanceMarkerSha256 !== repeated.acceptanceMarkerSha256
  ) {
    throw new A03ProofError("a03_gate0_provenance_changed");
  }
}

function parseVerifiedGate0Provenance(
  output: string,
  candidate: CandidateGitState,
): VerifiedGate0Provenance {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new A03ProofError("a03_gate0_provenance_output_invalid");
  }
  if (!isPlainObject(parsed) || canonicalJson(parsed) !== output) {
    throw new A03ProofError("a03_gate0_provenance_output_invalid");
  }
  if (!hasExactKeys(parsed, expectedProvenanceKeys)
    || parsed.schemaVersion !== 1
    || parsed.kind !== "doorstar-pilot-gate0-acceptance-provenance"
    || parsed.status !== "GATE0_HUMAN_ACCEPTANCE_MARKER_BOUND"
    || parsed.environmentClass !== "SOURCE_ONLY_NO_EXTERNAL_RUNTIME"
    || parsed.permittedNextAction !== "GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL"
    || !isSha256(parsed.capsuleSha256)
    || !isSha256(parsed.acceptanceMarkerSha256)
    || !isSha256(parsed.policySha256)
    || !isCandidateIdentity(parsed.candidate, candidate)
    || !isReviewedToolchain(parsed.reviewedToolchain)
    || !isPassingOutcomeMatrix(parsed.sourceCheckOutcomes)
  ) {
    throw new A03ProofError("a03_gate0_provenance_output_invalid");
  }
  return Object.freeze({
    candidateCommitSha: parsed.candidate.commitSha,
    capsuleSha256: parsed.capsuleSha256,
    acceptanceMarkerSha256: parsed.acceptanceMarkerSha256,
  });
}

function isNonEmptyAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") && isAbsolute(value);
}

function safeChildEnvironmentNames(): readonly string[] {
  return process.platform === "win32"
    ? ["PATH", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]
    : ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TMP", "TEMP"];
}

function lookupEnvironmentValue(environment: NodeJS.ProcessEnv, expectedName: string): string | undefined {
  const matchingEntry = Object.entries(environment)
    .find(([name, value]) => name.toUpperCase() === expectedName.toUpperCase() && value !== undefined);
  return matchingEntry?.[1];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function isCandidateIdentity(value: unknown, expectedCandidate: CandidateGitState): value is Record<string, string> {
  return isPlainObject(value)
    && hasExactKeys(value, expectedCandidateKeys)
    && value.commitSha === expectedCandidate.commitSha
    && value.treeSha === expectedCandidate.treeSha
    && value.objectFormat === expectedCandidate.objectFormat
    && isObjectHash(value.commitSha, value.objectFormat)
    && isObjectHash(value.treeSha, value.objectFormat);
}

function isReviewedToolchain(value: unknown): boolean {
  return isPlainObject(value)
    && hasExactKeys(value, expectedToolchainKeys)
    && typeof value.node === "string"
    && /^v\d+\.\d+\.\d+$/.test(value.node)
    && typeof value.npm === "string"
    && /^\d+\.\d+\.\d+$/.test(value.npm);
}

function isPassingOutcomeMatrix(value: unknown): boolean {
  return Array.isArray(value)
    && value.length > 0
    && value.every((outcome) => (
      isPlainObject(outcome)
      && hasExactKeys(outcome, expectedOutcomeKeys)
      && isSafeIdentifier(outcome.componentId)
      && isSafeIdentifier(outcome.checkId)
      && outcome.outcome === "PASS"
    ));
}

function isObjectHash(value: unknown, objectFormat: unknown): boolean {
  const length = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function isSafeIdentifier(value: unknown): boolean {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}
