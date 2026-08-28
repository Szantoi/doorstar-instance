import type { DisposableDatabaseIdentity } from "./a03Config.js";
import { A03ProofError } from "./a03Config.js";
import type { CommandResult, CommandRunner } from "./commandRunner.js";
import {
  assertAllowlistedLocalDockerEndpoint,
  createLocalDockerInvocation,
  localDockerContextHostFormat,
  runLocalDockerCommand,
  type LocalDockerInvocation,
} from "./dockerLocalEndpointGuard.js";
import {
  requireImmutablePostgresImageReference,
  type DockerRuntimeInput,
  type ImmutablePostgresImageReference,
} from "./dockerRuntimeInput.js";

const disposableLabelKey = "doorstar.a03.disposable";
const disposableLabelValue = "true";
const postgresDataTmpfsTarget = "/var/lib/postgresql/data";
const postgresDataTmpfsOptions = "rw,nosuid,nodev,noexec,size=256m";
const orphanSettleAttempts = 8;
const orphanSettleDelayMilliseconds = 250;

export type DisposablePostgresStart = Readonly<{
  containerName: string;
  administrator: DisposableDatabaseIdentity;
}>;

export type VerifiedPostgresImage = Readonly<{
  imageId: string;
  immutableReference: ImmutablePostgresImageReference;
}>;

export type DisposableContainerCleanup = "container_destroyed" | "container_not_started";

type PostgresImageInspection = Readonly<{
  imageId: CommandResult;
  repoDigests: CommandResult | null;
}>;

/** Build-only data: calling this does not invoke Docker. */
export function buildDisposablePostgresRunArguments(
  start: DisposablePostgresStart,
  postgresImageReference: string,
): readonly string[] {
  assertDockerName(start.containerName);
  const immutableReference = requireImmutablePostgresImageReference(postgresImageReference);
  return [
    "run",
    "--detach",
    "--name", start.containerName,
    "--label", `${disposableLabelKey}=${disposableLabelValue}`,
    "--pull", "never",
    "--publish", "127.0.0.1:0:5432",
    "--tmpfs", `${postgresDataTmpfsTarget}:${postgresDataTmpfsOptions}`,
    "--env", `POSTGRES_USER=${start.administrator.username}`,
    "--env", `POSTGRES_PASSWORD=${start.administrator.password}`,
    // `postgres` is a disposable control database. The proof database itself
    // is created later with the non-runtime migrator as owner.
    "--env", "POSTGRES_DB=postgres",
    immutableReference,
  ];
}

/**
 * Parses Docker image metadata without revealing a connection value or any
 * generated identity. The image ID and repo digest are immutable hashes, so
 * they are safe to retain in redacted proof evidence.
 */
export function parseVerifiedPostgresImageInspection(
  imageIdOutput: string,
  repoDigestsJsonOutput: string,
  postgresImageReference: string,
): VerifiedPostgresImage {
  const immutableReference = requireImmutablePostgresImageReference(postgresImageReference);
  const imageId = imageIdOutput.trim();
  if (!/^sha256:[a-f0-9]{64}$/i.test(imageId)) {
    throw new A03ProofError("a03_postgres_image_id_invalid");
  }
  const digests = parseRepoDigestsJson(repoDigestsJsonOutput);
  if (!digests.includes(immutableReference)) {
    throw new A03ProofError("a03_postgres_image_reference_mismatch");
  }
  return { imageId, immutableReference };
}

/** A container lifecycle owns exactly one freshly generated, loopback-only container. */
export class DisposablePostgresContainer {
  private started = false;
  private startMayHaveCreatedContainer = false;
  private startOutcomeUncertain = false;
  private localDockerInvocation: LocalDockerInvocation | null = null;
  private localDockerEndpointVerification: Promise<void> | null = null;

  public constructor(
    private readonly commandRunner: CommandRunner,
    private readonly start: DisposablePostgresStart,
    private readonly dockerRuntime: DockerRuntimeInput,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  public async assertDockerReadyAndImageAvailable(): Promise<VerifiedPostgresImage> {
    const version = await this.requireSuccessfulDockerCommand("version", [
      "version",
      "--format",
      "{{.Server.Version}}",
    ], 10_000);
    if (version.stdout.trim() === "") {
      throw new A03ProofError("a03_docker_not_ready");
    }

    const inspection = await this.inspectImage();
    if (
      inspection.imageId.exitCode !== 0
      || inspection.repoDigests === null
      || inspection.repoDigests.exitCode !== 0
    ) {
      throw new A03ProofError("a03_docker_image_not_available");
    }
    return parseVerifiedPostgresImageInspection(
      inspection.imageId.stdout,
      inspection.repoDigests.stdout,
      this.dockerRuntime.postgresImageReference,
    );
  }

  public async startContainer(): Promise<void> {
    let result: CommandResult;
    try {
      result = await this.runDocker(
        buildDisposablePostgresRunArguments(this.start, this.dockerRuntime.postgresImageReference),
        30_000,
      );
      // A non-zero result can still follow daemon-side container creation.
      this.startMayHaveCreatedContainer = true;
    } catch (error) {
      // A timed-out client may have lost its response after Docker created the
      // exact generated container. Claim/inspect it in finally before cleanup.
      if (error instanceof A03ProofError && error.publicCode === "a03_docker_command_timeout") {
        this.startMayHaveCreatedContainer = true;
        this.startOutcomeUncertain = true;
      }
      throw error;
    }
    if (result.exitCode !== 0) {
      this.startOutcomeUncertain = true;
      throw new A03ProofError("a03_docker_run_failed");
    }
    this.started = true;
    await this.assertExactDisposableContainerSafety();
  }

  public async loopbackPort(): Promise<number> {
    if (!this.started) throw new A03ProofError("a03_container_not_started");
    const inspection = await this.requireSuccessfulDockerCommand("inspect", [
      "inspect",
      "--format",
      "{{range (index .NetworkSettings.Ports \"5432/tcp\")}}{{.HostIp}}:{{.HostPort}}{{end}}",
      this.start.containerName,
    ]);
    const match = /^127\.0\.0\.1:(\d+)$/.exec(inspection.stdout.trim());
    const port = match === null ? Number.NaN : Number(match[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new A03ProofError("a03_loopback_port_not_assigned");
    }
    return port;
  }

  /**
   * Returns only the content hash observed for the explicit CLI file. The
   * filesystem path and the temporary Docker config directory never leave this
   * runner boundary. A null value means Docker was never reached.
   */
  public dockerCliContentSha256(): string | null {
    return this.localDockerInvocation?.dockerCliContentSha256 ?? null;
  }

  /**
   * Claims a possible orphan by its exact generated name, immutable image, and
   * disposable label before removal. It never searches legacy containers.
   */
  public async destroy(): Promise<DisposableContainerCleanup> {
    try {
      if (!this.startMayHaveCreatedContainer) return "container_not_started";
      const exists = this.startOutcomeUncertain
        ? await this.settleAndInspectClaimedContainer()
        : await this.inspectClaimedContainer();
      if (!exists) return "container_not_started";
      await this.requireSuccessfulDockerCommand("remove", ["rm", "--force", this.start.containerName], 30_000);
      return "container_destroyed";
    } finally {
      this.started = false;
      this.startMayHaveCreatedContainer = false;
      this.startOutcomeUncertain = false;
      this.localDockerInvocation?.dispose();
    }
  }

  private async inspectImage(): Promise<PostgresImageInspection> {
    const imageId = await this.runDocker(
      ["image", "inspect", "--format", "{{.Id}}", this.dockerRuntime.postgresImageReference],
      15_000,
    );
    if (imageId.exitCode !== 0) return { imageId, repoDigests: null };
    const repoDigests = await this.runDocker(
      ["image", "inspect", "--format", "{{json .RepoDigests}}", this.dockerRuntime.postgresImageReference],
      15_000,
    );
    return { imageId, repoDigests };
  }

  private async assertExactDisposableContainerSafety(): Promise<void> {
    const claim = await this.inspectContainerFormat(
      "{{.Config.Image}}|{{index .Config.Labels \"doorstar.a03.disposable\"}}",
    );
    if (claim.trim() !== `${this.dockerRuntime.postgresImageReference}|${disposableLabelValue}`) {
      throw new A03ProofError("a03_container_claim_invalid");
    }
    const mounts = parseJsonInspection(await this.inspectContainerFormat("{{json .Mounts}}"));
    if (!Array.isArray(mounts) || mounts.length !== 0) {
      throw new A03ProofError("a03_container_persistent_mount_forbidden");
    }
    const tmpfs = parseJsonInspection(await this.inspectContainerFormat("{{json .HostConfig.Tmpfs}}"));
    if (!isExactProofTmpfs(tmpfs)) {
      throw new A03ProofError("a03_container_tmpfs_contract_invalid");
    }
  }

  private async inspectClaimedContainer(): Promise<boolean> {
    const inspection = await this.runDocker(
      [
        "inspect",
        "--format",
        "{{.Config.Image}}|{{index .Config.Labels \"doorstar.a03.disposable\"}}",
        this.start.containerName,
      ],
      15_000,
    );
    if (inspection.exitCode !== 0) {
      if (/\bno such (?:container|object)\b/i.test(`${inspection.stdout}\n${inspection.stderr}`)) return false;
      throw new A03ProofError("a03_docker_inspect_failed");
    }
    if (inspection.stdout.trim() !== `${this.dockerRuntime.postgresImageReference}|${disposableLabelValue}`) {
      throw new A03ProofError("a03_container_cleanup_claim_invalid");
    }
    return true;
  }

  /** A daemon can complete a timed-out run shortly after the client exits. */
  private async settleAndInspectClaimedContainer(): Promise<boolean> {
    for (let attempt = 0; attempt < orphanSettleAttempts; attempt += 1) {
      if (await this.inspectClaimedContainer()) return true;
      if (attempt < orphanSettleAttempts - 1) await sleep(orphanSettleDelayMilliseconds);
    }
    return false;
  }

  private async inspectContainerFormat(format: string): Promise<string> {
    const inspection = await this.requireSuccessfulDockerCommand("inspect", [
      "inspect",
      "--format",
      format,
      this.start.containerName,
    ]);
    return inspection.stdout;
  }

  /**
   * Every Docker request, including cleanup and image inspection, goes through
   * this one local-only gate. It is deliberately lazy so a rejected
   * environment becomes a normal redacted proof failure instead of a
   * constructor-time side effect.
   */
  private runDocker(
    argumentsList: readonly string[],
    timeoutMilliseconds: number,
  ): Promise<CommandResult> {
    return this.runDockerAfterLocalEndpointVerification(argumentsList, timeoutMilliseconds);
  }

  private async runDockerAfterLocalEndpointVerification(
    argumentsList: readonly string[],
    timeoutMilliseconds: number,
  ): Promise<CommandResult> {
    await this.assertLocalDockerEndpoint();
    return this.runDockerWithoutEndpointAssertion(argumentsList, timeoutMilliseconds);
  }

  /**
   * Context inspection is the single pre-daemon Docker operation. It runs
   * through the existing environment/context guard, then proves that the
   * selected context resolves to the narrow platform-local endpoint allowlist.
   */
  private assertLocalDockerEndpoint(): Promise<void> {
    return this.localDockerEndpointVerification ??= this.inspectLocalDockerEndpoint();
  }

  private async inspectLocalDockerEndpoint(): Promise<void> {
    const inspection = await this.runDockerWithoutEndpointAssertion([
      "context",
      "inspect",
      "default",
      "--format",
      localDockerContextHostFormat,
    ], 10_000);
    if (inspection.exitCode !== 0) {
      throw new A03ProofError("a03_docker_local_context_inspection_failed");
    }
    assertAllowlistedLocalDockerEndpoint(inspection.stdout);
  }

  private runDockerWithoutEndpointAssertion(
    argumentsList: readonly string[],
    timeoutMilliseconds: number,
  ): Promise<CommandResult> {
    const invocation = this.localDockerInvocation ??= createLocalDockerInvocation(
      this.dockerRuntime.dockerCliPath,
      this.environment,
    );
    return runLocalDockerCommand(this.commandRunner, invocation, argumentsList, timeoutMilliseconds);
  }

  private async requireSuccessfulDockerCommand(
    category: "version" | "image" | "run" | "inspect" | "remove",
    argumentsList: readonly string[],
    timeoutMilliseconds = 30_000,
  ): Promise<CommandResult> {
    const result = await this.runDocker(argumentsList, timeoutMilliseconds);
    if (result.exitCode !== 0) {
      throw new A03ProofError(`a03_docker_${category}_failed`);
    }
    return result;
  }
}

function parseJsonInspection(value: string): unknown {
  try {
    return JSON.parse(value.trim());
  } catch {
    throw new A03ProofError("a03_container_mount_inspection_invalid");
  }
}

function parseRepoDigestsJson(value: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.trim());
  } catch {
    throw new A03ProofError("a03_postgres_repo_digests_invalid");
  }
  if (parsed === null) return [];
  if (!Array.isArray(parsed) || parsed.some((digest) => typeof digest !== "string")) {
    throw new A03ProofError("a03_postgres_repo_digests_invalid");
  }
  return parsed;
}

function isExactProofTmpfs(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length === 1
    && entries[0]?.[0] === postgresDataTmpfsTarget
    && entries[0]?.[1] === postgresDataTmpfsOptions;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function assertDockerName(value: string): void {
  if (!/^doorstar-a03-[a-z0-9-]{8,40}$/.test(value)) {
    throw new A03ProofError("a03_container_name_invalid");
  }
}
