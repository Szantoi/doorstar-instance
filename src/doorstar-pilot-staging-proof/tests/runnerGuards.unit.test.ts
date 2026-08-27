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
import { ProofLedger, postSeedProofOperations } from "../src/runner/proofLedger.js";
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
      schemaVersion: 2,
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
      inFlightPostSeedOperation: "POST_SEED_FIRST_SESSION_ISSUE",
      cleanup: "container_not_started",
      failureCode: null,
    });
    try {
      const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
      expect(path.startsWith(resolve(packageRoot, "evidence"))).toBe(true);
      const evidence = await readFile(path, "utf8");
      expect(evidence).toContain('"status": "PASS"');
      expect(evidence).toContain('"inFlightPostSeedOperation": "POST_SEED_FIRST_SESSION_ISSUE"');
      expect(evidence).not.toContain("password");
      expect(evidence).not.toContain("postgresql://");
    } finally {
      await rm(path, { force: true });
    }
  });

  it("emits only stable public failure codes", () => {
    expect(publicFailureCode(new A03ProofError("a03_known"))).toBe("a03_known");
    expect(publicFailureCode(Object.assign(new Error("sensitive PostgreSQL error"), { code: "42501" })))
      .toBe("a03_postgres_sqlstate_42501");
    expect(publicFailureCode({ code: "42P01", message: "sensitive relation name" }))
      .toBe("a03_postgres_sqlstate_42P01");
    expect(publicFailureCode(new Error("sensitive details"))).toBe("a03_unexpected_failure");
    expect(publicFailureCode({ code: "4250", message: "sensitive details" })).toBe("a03_unexpected_failure");
    expect(publicFailureCode({ code: "42501; secret", message: "sensitive details" })).toBe("a03_unexpected_failure");
  });

  it("accepts only a concrete postgres image ID and optional immutable digest", () => {
    expect(parseVerifiedPostgresImageInspection(
      `sha256:${"a".repeat(64)}\n`,
      JSON.stringify([`postgres@sha256:${"b".repeat(64)}`]),
    ))
      .toEqual({
        imageId: `sha256:${"a".repeat(64)}`,
        immutableReference: `postgres@sha256:${"b".repeat(64)}`,
      });
    expect(parseVerifiedPostgresImageInspection(`sha256:${"c".repeat(64)}`, "null"))
      .toEqual({ imageId: `sha256:${"c".repeat(64)}`, immutableReference: null });
    expect(() => parseVerifiedPostgresImageInspection("postgres:16", "[]"))
      .toThrow("a03_postgres_image_id_invalid");
    expect(() => parseVerifiedPostgresImageInspection(`sha256:${"d".repeat(64)}`, "not-json"))
      .toThrow("a03_postgres_repo_digests_invalid");
  });

  it("uses separate Docker 29-safe image ID and RepoDigests JSON inspection", async () => {
    const plan = createDisposableProofPlan();
    const formats: string[] = [];
    const commandRunner: CommandRunner = {
      run: async (_command, argumentsList) => {
        if (argumentsList[0] === "version") return { exitCode: 0, stdout: "29.1.5\n", stderr: "" };
        if (argumentsList[0] === "image" && argumentsList[1] === "inspect") {
          formats.push(argumentsList[3] ?? "");
          if (argumentsList[3] === "{{.Id}}") {
            return { exitCode: 0, stdout: `sha256:${"e".repeat(64)}\n`, stderr: "" };
          }
          if (argumentsList[3] === "{{json .RepoDigests}}") {
            return { exitCode: 0, stdout: JSON.stringify([`postgres@sha256:${"f".repeat(64)}`]), stderr: "" };
          }
        }
        throw new Error("unexpected Docker command");
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    });
    await expect(container.assertDockerReadyAndImageAvailable()).resolves.toEqual({
      imageId: `sha256:${"e".repeat(64)}`,
      immutableReference: `postgres@sha256:${"f".repeat(64)}`,
    });
    expect(formats).toEqual(["{{.Id}}", "{{json .RepoDigests}}"]);
    expect(formats.join(" ")).not.toContain("join");
  });

  it("uses a type-resolved writer call for the non-serializable guard proof", async () => {
    const source = await readFile(new URL("../src/runner/databaseProofs.ts", import.meta.url), "utf8");
    expect(source).toContain('"BEGIN ISOLATION LEVEL READ COMMITTED"');
    expect(source).toContain('"SELECT pilot.pilot_revoke_opaque_session_v1($1::text)"');
    expect(source).toContain("(CURRENT_TIMESTAMP + INTERVAL '5 minutes')::timestamp(3)");
    expect(source).toContain("(CURRENT_TIMESTAMP + INTERVAL '30 minutes')::timestamp(3)");
    expect(source).toContain("a03_session_issue_execute_catalog_missing");
    expect(source).toContain(
      "'pilot.pilot_issue_opaque_session_v1(uuid, text, bytea, timestamp without time zone)'::pg_catalog.regprocedure",
    );
  });

  it("records only fixed post-seed operation names while a step is in flight", () => {
    const ledger = new ProofLedger();
    const [catalogAssertion, firstIssue] = postSeedProofOperations;

    ledger.beginPostSeedOperation(catalogAssertion);
    expect(ledger.inFlightPostSeedOperation()).toBe(catalogAssertion);
    ledger.completePostSeedOperation(catalogAssertion, "POST_SEED_SESSION_EXECUTE_CATALOG_CONFIRMED");
    expect(ledger.inFlightPostSeedOperation()).toBeNull();
    expect(ledger.markers()).toEqual(["POST_SEED_SESSION_EXECUTE_CATALOG_CONFIRMED"]);

    ledger.beginPostSeedOperation(firstIssue);
    expect(ledger.inFlightPostSeedOperation()).toBe(firstIssue);
    expect(() => ledger.beginPostSeedOperation("POST_SEED_SECOND_SESSION_ISSUE"))
      .toThrow("a03_post_seed_operation_state_invalid");
    expect(() => ledger.completePostSeedOperation("POST_SEED_SECOND_SESSION_ISSUE", "POST_SEED_SECOND_SESSION_ISSUED"))
      .toThrow("a03_post_seed_operation_state_invalid");
    expect(ledger.inFlightPostSeedOperation()).toBe(firstIssue);
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
