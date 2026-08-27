import { rm, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  A03ProofError,
  createDisposableProofPlan,
  disposableAcknowledgement,
  disposableAcknowledgementEnvironment,
  requireDisposableAcknowledgement,
} from "../src/runner/a03Config.js";
import type { CommandRunner } from "../src/runner/commandRunner.js";
import {
  buildDisposablePostgresRunArguments,
  DisposablePostgresContainer,
  parseVerifiedPostgresImageInspection,
} from "../src/runner/dockerPostgres.js";
import { requireCleanCandidateGitState } from "../src/runner/candidateGitState.js";
import { publicFailureCode, runDisposableA03Proof } from "../src/runner/proofRunner.js";
import { writeRedactedEvidence } from "../src/runner/redactedEvidence.js";

describe("A-03 disposable-run guards", () => {
  it("requires an exact environment acknowledgement before a runner can invoke Docker", async () => {
    const commandRunner: CommandRunner = {
      run: async () => {
        throw new Error("docker_must_not_be_called_in_this_test");
      },
    };
    expect(() => requireDisposableAcknowledgement({})).toThrow("a03_disposable_acknowledgement_required");
    expect(() => requireDisposableAcknowledgement({
      [disposableAcknowledgementEnvironment]: disposableAcknowledgement,
    })).not.toThrow();
    await expect(runDisposableA03Proof({ environment: {}, commandRunner }))
      .rejects.toMatchObject({ publicCode: "a03_disposable_acknowledgement_required" });
  });

  it("builds only a fresh loopback/tmpfs postgres:16 Docker command without running it", () => {
    const plan = createDisposableProofPlan();
    const args = buildDisposablePostgresRunArguments({
      containerName: plan.containerName,
      administrator: plan.administrator,
    });
    expect(args).toContain("127.0.0.1:0:5432");
    expect(args).toContain("--tmpfs");
    expect(args).toContain("postgres:16");
    expect(args).not.toContain("--volume");
    expect(args).not.toContain("--mount");
    expect(args.join(" ")).not.toContain("0.0.0.0");
    expect(args.join(" ")).not.toContain("compose");
  });

  it("writes evidence only under the package-local ignored evidence directory", async () => {
    const path = await writeRedactedEvidence({
      schemaVersion: 1,
      status: "PASS",
      startedAt: "2026-08-27T00:00:00.000Z",
      completedAt: "2026-08-27T00:00:01.000Z",
      runIdSha256: "a".repeat(64),
      candidateCommitSha: "c".repeat(40),
      candidateWorkingTreeClean: true,
      image: "postgres:16",
      imageId: `sha256:${"d".repeat(64)}`,
      imageImmutableReference: `postgres@sha256:${"e".repeat(64)}`,
      fixtureSha256: "b".repeat(64),
      migrationEvidence: null,
      beforeFixtureManifest: null,
      afterFixtureManifest: null,
      finalFunctionManifest: null,
      passMarkers: ["FIXTURE_SOURCE_VERIFIED"],
      cleanup: "container_not_started",
      failureCode: null,
    });
    try {
      const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
      expect(path.startsWith(resolve(packageRoot, "evidence"))).toBe(true);
      const evidence = await readFile(path, "utf8");
      expect(evidence).toContain('"status": "PASS"');
      expect(evidence).not.toContain("password");
      expect(evidence).not.toContain("postgresql://");
    } finally {
      await rm(path, { force: true });
    }
  });

  it("emits only stable public failure codes", () => {
    expect(publicFailureCode(new A03ProofError("a03_known"))).toBe("a03_known");
    expect(publicFailureCode(new Error("sensitive details"))).toBe("a03_unexpected_failure");
  });

  it("accepts only a concrete postgres image ID and optional immutable digest", () => {
    expect(parseVerifiedPostgresImageInspection(`sha256:${"a".repeat(64)}|postgres@sha256:${"b".repeat(64)}\n`))
      .toEqual({
        imageId: `sha256:${"a".repeat(64)}`,
        immutableReference: `postgres@sha256:${"b".repeat(64)}`,
      });
    expect(() => parseVerifiedPostgresImageInspection("postgres:16|"))
      .toThrow("a03_postgres_image_id_invalid");
  });

  it("claims and removes an exact labelled orphan after a non-zero Docker run", async () => {
    const plan = createDisposableProofPlan();
    const calls: string[][] = [];
    const commandRunner: CommandRunner = {
      run: async (_command, argumentsList) => {
        calls.push([...argumentsList]);
        if (argumentsList[0] === "run") return { exitCode: 1, stdout: "", stderr: "daemon response lost" };
        if (argumentsList[0] === "inspect") {
          return { exitCode: 0, stdout: "postgres:16|true\n", stderr: "" };
        }
        if (argumentsList[0] === "rm") return { exitCode: 0, stdout: "", stderr: "" };
        throw new Error("unexpected Docker command");
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    });
    await expect(container.startContainer()).rejects.toMatchObject({ publicCode: "a03_docker_run_failed" });
    await expect(container.destroy()).resolves.toBe("container_destroyed");
    expect(calls.some((argumentsList) => argumentsList[0] === "inspect" && argumentsList.at(-1) === plan.containerName)).toBe(true);
    expect(calls.some((argumentsList) => argumentsList[0] === "rm" && argumentsList.at(-1) === plan.containerName)).toBe(true);
  });

  it("settles a delayed exact-name orphan lookup after a failed Docker run", async () => {
    const plan = createDisposableProofPlan();
    let inspectionCount = 0;
    const commandRunner: CommandRunner = {
      run: async (_command, argumentsList) => {
        if (argumentsList[0] === "run") return { exitCode: 1, stdout: "", stderr: "daemon response lost" };
        if (argumentsList[0] === "inspect") {
          inspectionCount += 1;
          return inspectionCount === 1
            ? { exitCode: 1, stdout: "", stderr: `No such container: ${plan.containerName}` }
            : { exitCode: 0, stdout: "postgres:16|true\n", stderr: "" };
        }
        if (argumentsList[0] === "rm") return { exitCode: 0, stdout: "", stderr: "" };
        throw new Error("unexpected Docker command");
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    });
    await expect(container.startContainer()).rejects.toMatchObject({ publicCode: "a03_docker_run_failed" });
    await expect(container.destroy()).resolves.toBe("container_destroyed");
    expect(inspectionCount).toBe(2);
  });

  it("requires a clean committed candidate before any disposable Docker step", async () => {
    const cleanRunner: CommandRunner = {
      run: async (_command, argumentsList) => ({
        exitCode: 0,
        stdout: argumentsList.includes("rev-parse") ? `${"d".repeat(40)}\n` : "",
        stderr: "",
      }),
    };
    await expect(requireCleanCandidateGitState(cleanRunner)).resolves.toEqual({
      commitSha: "d".repeat(40),
      clean: true,
    });
    const dirtyRunner: CommandRunner = {
      run: async (_command, argumentsList) => ({
        exitCode: 0,
        stdout: argumentsList.includes("rev-parse") ? `${"e".repeat(40)}\n` : " M src/file.ts\n",
        stderr: "",
      }),
    };
    await expect(requireCleanCandidateGitState(dirtyRunner))
      .rejects.toMatchObject({ publicCode: "a03_candidate_worktree_dirty" });
  });
});
