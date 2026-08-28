import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  disposableAcknowledgement,
  disposableAcknowledgementEnvironment,
} from "../src/runner/a03Config.js";
import type { CandidateGitState } from "../src/runner/candidateGitState.js";
import type { CommandRunner } from "../src/runner/commandRunner.js";
import {
  assertSameGate0Provenance,
  createGate0VerifierEnvironment,
  requireGate0ProvenanceInput,
  verifyAcceptedGate0Provenance,
} from "../src/runner/gate0Provenance.js";
import { runDisposableA03Proof } from "../src/runner/proofRunner.js";
import { readDisposableProofCliArguments } from "../src/cli.js";

const candidate: CandidateGitState = Object.freeze({
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  objectFormat: "sha1",
  clean: true,
});

const provenanceInput = Object.freeze({
  capsulePath: join(tmpdir(), "doorstar-gate0-capsule.json"),
  acceptancePath: join(tmpdir(), "doorstar-gate0-acceptance.json"),
});
const postgresImageReference = `postgres@sha256:${"f".repeat(64)}`;

describe("A-03 Gate 0 provenance boundary", () => {
  it("requires the exact proof and external provenance CLI grammar", () => {
    expect(readDisposableProofCliArguments([
      "--disposable-docker-proof",
      "--gate0-capsule", "C:\\approved\\gate0-capsule.json",
      "--gate0-acceptance", "C:\\approved\\gate0-acceptance.json",
      "--docker-cli", "C:\\approved\\docker.exe",
      "--postgres-image", postgresImageReference,
    ])).toEqual({
      gate0Provenance: {
        capsulePath: "C:\\approved\\gate0-capsule.json",
        acceptancePath: "C:\\approved\\gate0-acceptance.json",
      },
      dockerRuntime: {
        dockerCliPath: "C:\\approved\\docker.exe",
        postgresImageReference,
      },
    });
    expect(readDisposableProofCliArguments(["--disposable-docker-proof"])).toBeUndefined();
    expect(() => requireGate0ProvenanceInput(undefined)).toThrow("a03_gate0_provenance_required");
    expect(() => requireGate0ProvenanceInput({
      capsulePath: "relative-capsule.json",
      acceptancePath: provenanceInput.acceptancePath,
    })).toThrow("a03_gate0_provenance_required");
  });

  it("uses only a sanitized child environment for the standalone Gate 0 verifier", async () => {
    const calls: Array<Readonly<{
      command: string;
      argumentsList: readonly string[];
      environment: NodeJS.ProcessEnv | undefined;
    }>> = [];
    const commandRunner: CommandRunner = {
      run: async (command, argumentsList, _timeoutMilliseconds, environment) => {
        calls.push({ command, argumentsList: [...argumentsList], environment });
        return { exitCode: 0, stdout: canonicalGate0Provenance(candidate), stderr: "" };
      },
    };
    const environment: NodeJS.ProcessEnv = {
      PATH: "safe-git-path",
      NODE_OPTIONS: "--require=untrusted",
      NODE_PATH: "untrusted-node-path",
      GIT_DIR: "untrusted-git-dir",
      PGHOST: "untrusted-postgres-host",
      DATABASE_URL: "postgresql://untrusted",
      DIRECT_URL: "postgresql://untrusted-direct",
      PRISMA_SCHEMA_PATH: "untrusted-schema",
      DOORSTAR_PILOT_OIDC_SECRET: "untrusted-secret",
      PILOT_BOOTSTRAP_TOKEN: "untrusted-token",
    };

    await expect(verifyAcceptedGate0Provenance({
      commandRunner,
      candidate,
      provenance: provenanceInput,
      environment,
    })).resolves.toEqual({
      candidateCommitSha: candidate.commitSha,
      capsuleSha256: "c".repeat(64),
      acceptanceMarkerSha256: "d".repeat(64),
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.command).toBe(process.execPath);
    expect(call?.argumentsList[0]).toMatch(/[\\/]scripts[\\/]doorstar-pilot-gate0[\\/]verifyGate0Acceptance\.mjs$/);
    expect(call?.argumentsList.slice(1)).toEqual([
      "--candidate", candidate.commitSha,
      "--capsule", provenanceInput.capsulePath,
      "--acceptance", provenanceInput.acceptancePath,
    ]);
    expect(call?.environment).toEqual({ PATH: "safe-git-path" });
    expect(call?.environment).not.toBe(environment);
    for (const forbiddenName of [
      "NODE_OPTIONS",
      "NODE_PATH",
      "GIT_DIR",
      "PGHOST",
      "DATABASE_URL",
      "DIRECT_URL",
      "PRISMA_SCHEMA_PATH",
      "DOORSTAR_PILOT_OIDC_SECRET",
      "PILOT_BOOTSTRAP_TOKEN",
    ]) {
      expect(call?.environment).not.toHaveProperty(forbiddenName);
    }
    expect(createGate0VerifierEnvironment(environment)).toEqual({ PATH: "safe-git-path" });
  });

  it("rejects noncanonical verifier output and provenance swaps", async () => {
    const commandRunner: CommandRunner = {
      run: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify(JSON.parse(canonicalGate0Provenance(candidate)))}\n`,
        stderr: "",
      }),
    };
    await expect(verifyAcceptedGate0Provenance({
      commandRunner,
      candidate,
      provenance: provenanceInput,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_gate0_provenance_output_invalid" });

    expect(() => assertSameGate0Provenance(
      {
        candidateCommitSha: candidate.commitSha,
        capsuleSha256: "c".repeat(64),
        acceptanceMarkerSha256: "d".repeat(64),
      },
      {
        candidateCommitSha: candidate.commitSha,
        capsuleSha256: "e".repeat(64),
        acceptanceMarkerSha256: "d".repeat(64),
      },
    )).toThrow("a03_gate0_provenance_changed");
  });

  it("does not call Gate 0, Git, Docker, or Prisma from an untrusted checkout", async () => {
    let calls = 0;
    const commandRunner: CommandRunner = {
      run: async () => {
        calls += 1;
        throw new Error("no_command_may_run_before_external_trust_anchor");
      },
    };

    await expect(runDisposableA03Proof({
      environment: {
        [disposableAcknowledgementEnvironment]: disposableAcknowledgement,
      },
      commandRunner,
      gate0Provenance: provenanceInput,
      dockerRuntime: {
        dockerCliPath: "C:\\approved\\docker.exe",
        postgresImageReference,
      },
    })).rejects.toMatchObject({ publicCode: "a03_gate1_external_trust_anchor_required" });

    expect(calls).toBe(0);
  });
});

function canonicalGate0Provenance(expectedCandidate: CandidateGitState): string {
  return `${JSON.stringify({
    acceptanceMarkerSha256: "d".repeat(64),
    candidate: {
      commitSha: expectedCandidate.commitSha,
      objectFormat: expectedCandidate.objectFormat,
      treeSha: expectedCandidate.treeSha,
    },
    capsuleSha256: "c".repeat(64),
    environmentClass: "SOURCE_ONLY_NO_EXTERNAL_RUNTIME",
    kind: "doorstar-pilot-gate0-acceptance-provenance",
    permittedNextAction: "GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL",
    policySha256: "e".repeat(64),
    reviewedToolchain: { node: "v24.13.0", npm: "11.6.2" },
    schemaVersion: 1,
    sourceCheckOutcomes: [{ checkId: "build", componentId: "foundation", outcome: "PASS" }],
    status: "GATE0_HUMAN_ACCEPTANCE_MARKER_BOUND",
  }, null, 2)}\n`;
}
