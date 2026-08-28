import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
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
import {
  assertAllowlistedLocalDockerEndpoint,
  createLocalDockerInvocation,
  localDockerContextHostFormat,
  runLocalDockerCommand,
} from "../src/runner/dockerLocalEndpointGuard.js";
import {
  redactDockerRuntimeInput,
  requireDockerRuntimeInput,
} from "../src/runner/dockerRuntimeInput.js";
import {
  knownConcurrentDemotionPostgresFailureCode,
  knownDirectUpdatePostgresFailureCode,
} from "../src/runner/databaseProofs.js";
import { ProofLedger, postSeedProofOperations } from "../src/runner/proofLedger.js";
import { publicFailureCode, runDisposableA03Proof } from "../src/runner/proofRunner.js";
import { writeRedactedEvidence } from "../src/runner/redactedEvidence.js";

function dockerSubcommandArguments(argumentsList: readonly string[]): readonly string[] {
  if (
    argumentsList[0] === "--config"
    && argumentsList[2] === "--context"
    && argumentsList[3] === "default"
  ) {
    return argumentsList.slice(4);
  }
  return argumentsList[0] === "--context" && argumentsList[1] === "default"
    ? argumentsList.slice(2)
    : argumentsList;
}

function platformDefaultDockerEndpoint(): string {
  return process.platform === "win32"
    ? "npipe:////./pipe/docker_engine"
    : "unix:///var/run/docker.sock";
}

const testPostgresImageReference = `postgres@sha256:${"a".repeat(64)}`;

function testDockerCliPath(): string {
  // This is only a regular local file to exercise path/content guards. The
  // mock runner never executes it as Docker in a source-only test.
  return process.execPath;
}

function testDockerRuntimeInput() {
  return requireDockerRuntimeInput({
    dockerCliPath: testDockerCliPath(),
    postgresImageReference: testPostgresImageReference,
  });
}

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

  it("requires a candidate-independent Gate 1 trust anchor before any command can run", async () => {
    let calls = 0;
    const commandRunner: CommandRunner = {
      run: async () => {
        calls += 1;
        throw new Error("no_child_process_may_run_without_external_trust_anchor");
      },
    };

    await expect(runDisposableA03Proof({
      environment: {
        [disposableAcknowledgementEnvironment]: disposableAcknowledgement,
      },
      commandRunner,
      gate0Provenance: {
        capsulePath: "C:\\external\\gate0-capsule.json",
        acceptancePath: "C:\\external\\gate0-acceptance.json",
      },
      dockerRuntime: {
        dockerCliPath: "C:\\external\\docker.exe",
        postgresImageReference: testPostgresImageReference,
      },
    })).rejects.toMatchObject({ publicCode: "a03_gate1_external_trust_anchor_required" });

    expect(calls).toBe(0);
  });

  it("builds only a fresh loopback/tmpfs immutable PostgreSQL Docker command without running it", () => {
    const plan = createDisposableProofPlan();
    const args = buildDisposablePostgresRunArguments({
      containerName: plan.containerName,
      administrator: plan.administrator,
    }, testPostgresImageReference);
    expect(args).toContain("127.0.0.1:0:5432");
    expect(args).toContain("--tmpfs");
    expect(args).toContain(testPostgresImageReference);
    expect(args).toContain("--pull");
    expect(args).toContain("never");
    expect(args).not.toContain("postgres:16");
    expect(args).not.toContain("--volume");
    expect(args).not.toContain("--mount");
    expect(args.join(" ")).not.toContain("0.0.0.0");
    expect(args.join(" ")).not.toContain("compose");
  });

  it.each([
    ["DOCKER_HOST", "tcp://198.51.100.77:2376"],
    ["DOCKER_CONTEXT", "remote-staging"],
    ["DOCKER_CONFIG", "C:\\untrusted-docker-config"],
    ["DOCKER_TLS_VERIFY", "1"],
    ["docker_host", "ssh://example.invalid"],
    ["CONTAINER_HOST", "ssh://example.invalid"],
    ["PODMAN_CONNECTION", "remote-engine"],
  ])("rejects %s before it can invoke Docker", async (environmentName, environmentValue) => {
    const plan = createDisposableProofPlan();
    let calls = 0;
    const commandRunner: CommandRunner = {
      run: async () => {
        calls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    }, testDockerRuntimeInput(), {
      [environmentName]: environmentValue,
    });

    await expect(container.assertDockerReadyAndImageAvailable())
      .rejects.toMatchObject({ publicCode: "a03_docker_remote_endpoint_forbidden" });
    expect(calls).toBe(0);
  });

  it("uses an absolute CLI path and a fresh Docker config without HOME, PATH, or ambient routing", async () => {
    const sourceEnvironment: NodeJS.ProcessEnv = {
      PATH: "a03-test-path",
      HOME: "a03-test-home",
      USERPROFILE: "a03-test-profile",
    };
    const invocation = createLocalDockerInvocation(testDockerCliPath(), sourceEnvironment);
    sourceEnvironment.DOCKER_HOST = "tcp://198.51.100.99:2376";
    let receivedCommand: string | null = null;
    let receivedArguments: readonly string[] | null = null;
    let receivedEnvironment: NodeJS.ProcessEnv | undefined;
    const commandRunner: CommandRunner = {
      run: async (command, argumentsList, _timeoutMilliseconds, environment) => {
        receivedCommand = command;
        receivedArguments = [...argumentsList];
        receivedEnvironment = environment;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };

    try {
      await expect(runLocalDockerCommand(commandRunner, invocation, ["version"], 1_000))
        .resolves.toEqual({ exitCode: 0, stdout: "", stderr: "" });
      expect(receivedCommand).toBe(testDockerCliPath());
      expect(receivedArguments).toEqual([
        "--config",
        invocation.argumentsPrefix[1],
        "--context",
        "default",
        "version",
      ]);
      expect(receivedEnvironment).not.toBe(sourceEnvironment);
      expect(receivedEnvironment).not.toHaveProperty("HOME");
      expect(receivedEnvironment).not.toHaveProperty("USERPROFILE");
      expect(receivedEnvironment).not.toHaveProperty("PATH");
      expect(receivedEnvironment).not.toHaveProperty("DOCKER_CONFIG");
      expect(receivedEnvironment).not.toHaveProperty("DOCKER_HOST");
      expect(receivedEnvironment).not.toHaveProperty("DOCKER_CONTEXT");
      const isolatedConfigDirectory = invocation.argumentsPrefix[1];
      expect(isolatedConfigDirectory).toMatch(/doorstar-a03-docker-config-/);
      await expect(readdir(isolatedConfigDirectory ?? "")).resolves.toEqual([]);
    } finally {
      invocation.dispose();
    }
  });

  it("rejects a replaced generated Docker config and never recursively removes its replacement", async () => {
    const invocation = createLocalDockerInvocation(testDockerCliPath(), {});
    const configDirectory = invocation.argumentsPrefix[1];
    if (configDirectory === undefined) throw new Error("Docker config test fixture is missing");
    try {
      await rm(configDirectory, { recursive: true, force: true, maxRetries: 1 });
      await mkdir(configDirectory);
      expect(() => invocation.verifyIsolatedConfig())
        .toThrow("a03_docker_config_isolation_failed");
      invocation.dispose();
      await expect(readdir(configDirectory)).resolves.toEqual([]);
    } finally {
      await rm(configDirectory, { recursive: true, force: true, maxRetries: 1 });
    }
  });

  it("requires the generated Docker config to remain empty before every child command", async () => {
    const invocation = createLocalDockerInvocation(testDockerCliPath(), {});
    const configDirectory = invocation.argumentsPrefix[1];
    if (configDirectory === undefined) throw new Error("Docker config test fixture is missing");
    try {
      await writeFile(join(configDirectory, "config.json"), "{}\n", "utf8");
      expect(() => invocation.verifyIsolatedConfig())
        .toThrow("a03_docker_config_isolation_failed");
      invocation.dispose();
      await expect(readdir(configDirectory)).resolves.toEqual(["config.json"]);
    } finally {
      await rm(configDirectory, { recursive: true, force: true, maxRetries: 1 });
    }
  });

  it("rejects bare, relative, and mutable Docker inputs before a Docker command can form", () => {
    expect(() => createLocalDockerInvocation("docker", {}))
      .toThrow("a03_docker_cli_path_not_absolute");
    expect(() => requireDockerRuntimeInput({
      dockerCliPath: "docker",
      postgresImageReference: testPostgresImageReference,
    })).toThrow("a03_docker_cli_path_not_absolute");
    expect(() => requireDockerRuntimeInput({
      dockerCliPath: "./docker",
      postgresImageReference: testPostgresImageReference,
    })).toThrow("a03_docker_cli_path_not_absolute");
    expect(() => requireDockerRuntimeInput({
      dockerCliPath: testDockerCliPath(),
      postgresImageReference: "postgres:16",
    })).toThrow("a03_postgres_image_reference_invalid");
    expect(() => requireDockerRuntimeInput({
      dockerCliPath: testDockerCliPath(),
      postgresImageReference: `postgres@sha256:${"A".repeat(64)}`,
    })).toThrow("a03_postgres_image_reference_invalid");
    if (process.platform === "win32") {
      expect(() => requireDockerRuntimeInput({
        dockerCliPath: "C:\\approved\\docker.exe:alternate-stream",
        postgresImageReference: testPostgresImageReference,
      })).toThrow("a03_docker_cli_path_not_absolute");
    }
  });

  it("accepts only JSON-encoded standard local Docker endpoints", () => {
    expect(() => assertAllowlistedLocalDockerEndpoint(
      JSON.stringify("npipe:////./pipe/docker_engine"),
      "win32",
    )).not.toThrow();
    expect(() => assertAllowlistedLocalDockerEndpoint(
      JSON.stringify("unix:///var/run/docker.sock"),
      "linux",
    )).not.toThrow();
    expect(() => assertAllowlistedLocalDockerEndpoint(
      JSON.stringify("tcp://198.51.100.77:2376"),
      "win32",
    )).toThrow("a03_docker_local_endpoint_invalid");
    expect(() => assertAllowlistedLocalDockerEndpoint(
      "not-json",
      "linux",
    )).toThrow("a03_docker_local_endpoint_invalid");
  });

  it.each([
    ["remote", JSON.stringify("ssh://example.invalid")],
    ["malformed", "not-json"],
  ])("stops after a %s default-context endpoint inspection", async (_label, contextHost) => {
    const plan = createDisposableProofPlan();
    const calls: string[][] = [];
    const commandRunner: CommandRunner = {
      run: async (_command, argumentsList) => {
        calls.push([...argumentsList]);
        const dockerArguments = dockerSubcommandArguments(argumentsList);
        if (
          dockerArguments[0] === "context"
          && dockerArguments[1] === "inspect"
          && dockerArguments[2] === "default"
          && dockerArguments[3] === "--format"
          && dockerArguments[4] === localDockerContextHostFormat
        ) {
          return { exitCode: 0, stdout: contextHost, stderr: "" };
        }
        throw new Error("daemon_command_must_not_follow_rejected_context");
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    }, testDockerRuntimeInput(), { PATH: "a03-test-path" });

    await expect(container.assertDockerReadyAndImageAvailable())
      .rejects.toMatchObject({ publicCode: "a03_docker_local_endpoint_invalid" });
    await expect(container.startContainer())
      .rejects.toMatchObject({ publicCode: "a03_docker_local_endpoint_invalid" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("--config");
    expect(calls[0]?.slice(2)).toEqual([
      "--context",
      "default",
      "context",
      "inspect",
      "default",
      "--format",
      localDockerContextHostFormat,
    ]);
    expect(calls.flat().some((argument) => ["version", "pull", "run"].includes(argument))).toBe(false);
    await expect(container.destroy()).resolves.toBe("container_not_started");
  });

  it("does not let candidate checkout code publish redacted evidence", async () => {
    await expect(writeRedactedEvidence({
      schemaVersion: 4,
      status: "PASS",
      startedAt: "2026-08-27T00:00:00.000Z",
      completedAt: "2026-08-27T00:00:01.000Z",
      runIdSha256: "a".repeat(64),
      candidateCommitSha: "c".repeat(40),
      candidateWorkingTreeClean: true,
      candidatePrismaSnapshotManifestSha256: "h".repeat(64),
      gate0Provenance: {
        candidateCommitSha: "c".repeat(40),
        capsuleSha256: "f".repeat(64),
        acceptanceMarkerSha256: "g".repeat(64),
      },
      dockerRuntime: redactDockerRuntimeInput(testDockerRuntimeInput(), null),
      image: testPostgresImageReference,
      imageId: `sha256:${"d".repeat(64)}`,
      imageImmutableReference: testPostgresImageReference,
      fixtureSha256: "b".repeat(64),
      migrationEvidence: null,
      beforeFixtureManifest: null,
      afterFixtureManifest: null,
      finalFunctionManifest: null,
      passMarkers: ["FIXTURE_SOURCE_VERIFIED"],
      inFlightPostSeedOperation: "POST_SEED_FIRST_SESSION_ISSUE",
      cleanup: "container_not_started",
      failureCode: null,
    })).rejects.toMatchObject({ publicCode: "a03_gate1_external_trust_anchor_required" });
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

  it("accepts only a concrete image ID for the exact requested immutable digest", () => {
    expect(parseVerifiedPostgresImageInspection(
      `sha256:${"a".repeat(64)}\n`,
      JSON.stringify([`postgres@sha256:${"b".repeat(64)}`]),
      `postgres@sha256:${"b".repeat(64)}`,
    ))
      .toEqual({
        imageId: `sha256:${"a".repeat(64)}`,
        immutableReference: `postgres@sha256:${"b".repeat(64)}`,
      });
    expect(() => parseVerifiedPostgresImageInspection(
      `sha256:${"c".repeat(64)}`,
      JSON.stringify([`postgres@sha256:${"d".repeat(64)}`]),
      `postgres@sha256:${"e".repeat(64)}`,
    )).toThrow("a03_postgres_image_reference_mismatch");
    expect(() => parseVerifiedPostgresImageInspection("postgres:16", "[]", testPostgresImageReference))
      .toThrow("a03_postgres_image_id_invalid");
    expect(() => parseVerifiedPostgresImageInspection(
      `sha256:${"d".repeat(64)}`,
      "not-json",
      testPostgresImageReference,
    ))
      .toThrow("a03_postgres_repo_digests_invalid");
  });

  it("uses separate Docker 29-safe image ID and RepoDigests JSON inspection", async () => {
    const plan = createDisposableProofPlan();
    const formats: string[] = [];
    const calls: Array<Readonly<{
      command: string;
      argumentsList: readonly string[];
      environment: NodeJS.ProcessEnv | undefined;
    }>> = [];
    const suppliedEnvironment = { PATH: "a03-test-path", HOME: "a03-test-home" };
    const commandRunner: CommandRunner = {
      run: async (command, argumentsList, _timeoutMilliseconds, environment) => {
        calls.push({ command, argumentsList: [...argumentsList], environment });
        const dockerArguments = dockerSubcommandArguments(argumentsList);
        if (dockerArguments[0] === "context" && dockerArguments[1] === "inspect") {
          return { exitCode: 0, stdout: JSON.stringify(platformDefaultDockerEndpoint()), stderr: "" };
        }
        if (dockerArguments[0] === "version") return { exitCode: 0, stdout: "29.1.5\n", stderr: "" };
        if (dockerArguments[0] === "image" && dockerArguments[1] === "inspect") {
          formats.push(dockerArguments[3] ?? "");
          if (dockerArguments[3] === "{{.Id}}") {
            return { exitCode: 0, stdout: `sha256:${"e".repeat(64)}\n`, stderr: "" };
          }
          if (dockerArguments[3] === "{{json .RepoDigests}}") {
            return { exitCode: 0, stdout: JSON.stringify([testPostgresImageReference]), stderr: "" };
          }
        }
        throw new Error("unexpected Docker command");
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    }, testDockerRuntimeInput(), suppliedEnvironment);
    await expect(container.assertDockerReadyAndImageAvailable()).resolves.toEqual({
      imageId: `sha256:${"e".repeat(64)}`,
      immutableReference: testPostgresImageReference,
    });
    const expectedCliContentSha256 = createHash("sha256")
      .update(await readFile(testDockerCliPath()))
      .digest("hex");
    expect(container.dockerCliContentSha256()).toBe(expectedCliContentSha256);
    expect(formats).toEqual(["{{.Id}}", "{{json .RepoDigests}}"]);
    expect(formats.join(" ")).not.toContain("join");
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.command).toBe(testDockerCliPath());
      expect(call.argumentsList[0]).toBe("--config");
      expect(call.argumentsList.slice(2, 4)).toEqual(["--context", "default"]);
      expect(call.environment).not.toBe(suppliedEnvironment);
      expect(call.environment).not.toHaveProperty("HOME");
      expect(call.environment).not.toHaveProperty("PATH");
      expect(call.environment).not.toHaveProperty("DOCKER_HOST");
      expect(call.environment).not.toHaveProperty("DOCKER_CONTEXT");
      expect(call.environment).not.toHaveProperty("DOCKER_CONFIG");
    }
    const isolatedConfigDirectory = calls[0]?.argumentsList[1];
    await container.destroy();
    await expect(readdir(isolatedConfigDirectory ?? "")).rejects.toMatchObject({ code: "ENOENT" });
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

  it("maps only exact static direct-writer errors without leaking unknown database messages", async () => {
    const knownError = Object.assign(
      new Error("direct roster writer requires a live effective-manager session"),
      { code: "42501" },
    );
    const sensitiveSuffix = "sensitive-generated-session-hash";
    const unknownError = Object.assign(
      new Error(`permission denied while handling ${sensitiveSuffix}`),
      { code: "42501" },
    );

    expect(knownDirectUpdatePostgresFailureCode(knownError))
      .toBe("a03_direct_update_live_actor_session_rejected");
    expect(knownDirectUpdatePostgresFailureCode({
      code: "42501",
      message: `${knownError.message} ${sensitiveSuffix}`,
    })).toBeUndefined();
    expect(knownDirectUpdatePostgresFailureCode(unknownError)).toBeUndefined();
    const safeFailureCode = publicFailureCode(unknownError);
    expect(safeFailureCode).toBe("a03_postgres_sqlstate_42501");
    expect(JSON.stringify({ failureCode: safeFailureCode })).not.toContain(sensitiveSuffix);
  });

  it("uses a scoped RLS read to validate the direct actor session before the writer call", async () => {
    const source = await readFile(new URL("../src/runner/databaseProofs.ts", import.meta.url), "utf8");
    expect(source).toContain("await assertDirectWriterActorSessionVisible(");
    expect(source).toContain("POST_SEED_DIRECT_ACTOR_SESSION_CONFIRMED");
    expect(source).toContain('session_row."revokedAt" IS NULL');
    expect(source).toContain('session_row."expiresAt" > CURRENT_TIMESTAMP');
    expect(source).toContain('session_row."bindingEpoch" = binding."auditVersion"');
    expect(source).toContain("pilot.doorstar_is_effective_pilot_roster_manager(");
    expect(source).toContain('binding."active", binding."role", binding."canManagePilotRoster"');
    expect(source).toContain("runtime has only this non-writing EXECUTE support");
    expect(source).not.toContain("The runtime deliberately has no EXECUTE grant");
  });

  it("classifies exact concurrent-demotion diagnostics without changing accepted race outcomes", async () => {
    const deadlock = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const lockTimeout = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
    const directWriter = Object.assign(
      new Error("direct roster writer requires a live effective-manager session"),
      { code: "42501" },
    );
    const sensitiveSuffix = "sensitive-concurrent-diagnostic";
    const unknown = Object.assign(new Error(`unexpected ${sensitiveSuffix}`), { code: "42P01" });
    const source = await readFile(new URL("../src/runner/databaseProofs.ts", import.meta.url), "utf8");

    expect(knownConcurrentDemotionPostgresFailureCode(deadlock))
      .toBe("a03_concurrent_manager_demotion_deadlock_detected");
    expect(knownConcurrentDemotionPostgresFailureCode(lockTimeout))
      .toBe("a03_concurrent_manager_demotion_lock_timeout");
    expect(knownConcurrentDemotionPostgresFailureCode(directWriter))
      .toBe("a03_direct_update_live_actor_session_rejected");
    expect(knownConcurrentDemotionPostgresFailureCode({
      code: "40P01",
      message: `deadlock detected ${sensitiveSuffix}`,
    })).toBeUndefined();
    expect(knownConcurrentDemotionPostgresFailureCode(unknown)).toBeUndefined();
    const safeFailureCode = publicFailureCode(unknown);
    expect(safeFailureCode).toBe("a03_postgres_sqlstate_42P01");
    expect(JSON.stringify({ failureCode: safeFailureCode })).not.toContain(sensitiveSuffix);
    expect(source).toContain('if (code === "40001" || code === "23514") return "rejected";');
    expect(source).toContain("const publicCode = knownConcurrentDemotionPostgresFailureCode(error);");
    expect(source).toContain("throw error;");
  });

  it("grants only runtime the canonical non-writing manager predicate support", async () => {
    const [setup, proofs] = await Promise.all([
      readFile(new URL("../src/runner/databaseSetup.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/runner/databaseProofs.ts", import.meta.url), "utf8"),
    ]);
    const signature = 'pilot.doorstar_is_effective_pilot_roster_manager(boolean, pilot."PilotOfficeRole", boolean)';
    expect(setup).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO \${runtime}`);
    expect(setup).toContain("grants neither table DML nor any writer routine");
    expect(proofs).toContain("runtime_effective_manager_predicate !== true");
    expect(proofs).toContain("bootstrap_effective_manager_predicate !== false");
    expect(proofs).toContain("a03_bootstrap_effective_manager_predicate_not_denied");
    expect(proofs).toContain(
      '[plan.bootstrap.username, \'pilot.doorstar_is_effective_pilot_roster_manager(boolean,pilot."PilotOfficeRole",boolean)\']',
    );
  });

  it("grants only runtime the immutable roster lock-key trigger support", async () => {
    const [setup, proofs] = await Promise.all([
      readFile(new URL("../src/runner/databaseSetup.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/runner/databaseProofs.ts", import.meta.url), "utf8"),
    ]);
    const signature = "pilot.doorstar_pilot_roster_lock_key(uuid)";
    expect(setup).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO \${runtime}`);
    expect(setup).toContain("deterministic bigint and grants neither table DML nor writer authority");
    expect(proofs).toContain("runtime_roster_lock_key !== true");
    expect(proofs).toContain("bootstrap_roster_lock_key !== false");
    expect(proofs).toContain("a03_bootstrap_roster_lock_key_not_denied");
    expect(proofs).toContain('[plan.bootstrap.username, "pilot.doorstar_pilot_roster_lock_key(uuid)"]');
  });

  it("grants only runtime the non-writing effective-manager invariant support", async () => {
    const [setup, proofs] = await Promise.all([
      readFile(new URL("../src/runner/databaseSetup.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/runner/databaseProofs.ts", import.meta.url), "utf8"),
    ]);
    const signature = "pilot.doorstar_require_effective_pilot_roster_manager(uuid)";
    expect(setup).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO \${runtime}`);
    expect(setup).toContain("can only confirm the invariant or raise 23514");
    expect(proofs).toContain("runtime_require_effective_manager !== true");
    expect(proofs).toContain("bootstrap_require_effective_manager !== false");
    expect(proofs).toContain("a03_bootstrap_require_effective_manager_not_denied");
    expect(proofs).toContain('[plan.bootstrap.username, "pilot.doorstar_require_effective_pilot_roster_manager(uuid)"]');
  });

  it("claims and removes an exact labelled orphan after a non-zero Docker run", async () => {
    const plan = createDisposableProofPlan();
    const calls: string[][] = [];
    const commandRunner: CommandRunner = {
      run: async (_command, argumentsList) => {
        calls.push([...argumentsList]);
        const dockerArguments = dockerSubcommandArguments(argumentsList);
        if (dockerArguments[0] === "context" && dockerArguments[1] === "inspect") {
          return { exitCode: 0, stdout: JSON.stringify(platformDefaultDockerEndpoint()), stderr: "" };
        }
        if (dockerArguments[0] === "run") return { exitCode: 1, stdout: "", stderr: "daemon response lost" };
        if (dockerArguments[0] === "inspect") {
          return { exitCode: 0, stdout: `${testPostgresImageReference}|true\n`, stderr: "" };
        }
        if (dockerArguments[0] === "rm") return { exitCode: 0, stdout: "", stderr: "" };
        throw new Error("unexpected Docker command");
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    }, testDockerRuntimeInput(), {});
    await expect(container.startContainer()).rejects.toMatchObject({ publicCode: "a03_docker_run_failed" });
    await expect(container.destroy()).resolves.toBe("container_destroyed");
    expect(calls.some((argumentsList) => dockerSubcommandArguments(argumentsList)[0] === "inspect" && argumentsList.at(-1) === plan.containerName)).toBe(true);
    expect(calls.some((argumentsList) => dockerSubcommandArguments(argumentsList)[0] === "rm" && argumentsList.at(-1) === plan.containerName)).toBe(true);
  });

  it("settles a delayed exact-name orphan lookup after a failed Docker run", async () => {
    const plan = createDisposableProofPlan();
    let inspectionCount = 0;
    const commandRunner: CommandRunner = {
      run: async (_command, argumentsList) => {
        const dockerArguments = dockerSubcommandArguments(argumentsList);
        if (dockerArguments[0] === "context" && dockerArguments[1] === "inspect") {
          return { exitCode: 0, stdout: JSON.stringify(platformDefaultDockerEndpoint()), stderr: "" };
        }
        if (dockerArguments[0] === "run") return { exitCode: 1, stdout: "", stderr: "daemon response lost" };
        if (dockerArguments[0] === "inspect") {
          inspectionCount += 1;
          return inspectionCount === 1
            ? { exitCode: 1, stdout: "", stderr: `No such container: ${plan.containerName}` }
            : { exitCode: 0, stdout: `${testPostgresImageReference}|true\n`, stderr: "" };
        }
        if (dockerArguments[0] === "rm") return { exitCode: 0, stdout: "", stderr: "" };
        throw new Error("unexpected Docker command");
      },
    };
    const container = new DisposablePostgresContainer(commandRunner, {
      containerName: plan.containerName,
      administrator: plan.administrator,
    }, testDockerRuntimeInput(), {});
    await expect(container.startContainer()).rejects.toMatchObject({ publicCode: "a03_docker_run_failed" });
    await expect(container.destroy()).resolves.toBe("container_destroyed");
    expect(inspectionCount).toBe(2);
  });

});
