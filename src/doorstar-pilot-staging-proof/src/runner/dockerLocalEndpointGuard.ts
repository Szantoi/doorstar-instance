import { lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, parse, relative, resolve } from "node:path";
import { A03ProofError } from "./a03Config.js";
import type { CommandResult, CommandRunner } from "./commandRunner.js";
import {
  requireTrustedDockerCliPath,
  type TrustedDockerCliPath,
} from "./dockerRuntimeInput.js";
import {
  assertTrustedLocalTemporaryRoot,
  captureTrustedLocalTemporaryRoot,
  type TrustedLocalTemporaryRoot,
} from "./trustedLocalTempRoot.js";

/**
 * The built-in Docker `default` context resolves to the platform-local socket
 * when the Docker routing environment is absent. Passing it explicitly avoids
 * inheriting a user-selected context from Docker's configuration file.
 */
const localDockerContextArguments = ["--context", "default"] as const;
export const localDockerContextHostFormat = "{{json .Endpoints.docker.Host}}";

const windowsDefaultDockerPipe = "npipe:////./pipe/docker_engine";
const unixDefaultDockerSocket = "unix:///var/run/docker.sock";
const isolatedDockerConfigPrefix = "doorstar-a03-docker-config-";
const maximumDockerCliBytes = 128 * 1024 * 1024;

/**
 * A normal Docker CLI only honours the `DOCKER_*` variables, but a local
 * `docker` compatibility executable can be backed by another engine. These
 * extra endpoint selectors are rejected too, rather than trusting a wrapper
 * to interpret them safely.
 */
const alternateEngineEndpointVariables = new Set([
  "CONTAINER_HOST",
  "CONTAINER_CONNECTION",
  "PODMAN_HOST",
  "PODMAN_CONNECTION",
  "CONTAINERS_CONF",
]);

export type LocalDockerInvocation = Readonly<{
  dockerCliPath: TrustedDockerCliPath;
  dockerCliContentSha256: string;
  argumentsPrefix: readonly string[];
  environment: NodeJS.ProcessEnv;
  /** Re-identifies the generated `--config` directory before every child call. */
  verifyIsolatedConfig: () => void;
  dispose: () => void;
}>;

type IsolatedDockerConfigDirectory = Readonly<{
  path: string;
  realPath: string;
  identity: Readonly<{
    device: number;
    inode: number;
  }>;
  temporaryRoot: TrustedLocalTemporaryRoot;
}>;

/**
 * Establishes the only Docker invocation shape the disposable proof accepts.
 *
 * Any Docker-specific ambient environment value is fail-closed, including a
 * local `DOCKER_HOST`: accepting a custom route would make it impossible for
 * this harness to prove that it did not select a remote daemon. The child gets
 * one new empty Docker config directory and no inherited HOME, PATH, or Docker
 * routing values. The config directory is passed with Docker's `--config`
 * flag, leaving the child environment free of `DOCKER_CONFIG` too. Its command
 * is an already validated absolute executable path, so no PATH lookup can
 * select a wrapper or compatibility executable.
 *
 * The absolute executable path is a separately documented host-trust input.
 * This function intentionally does not claim to attest that binary, any
 * wrapper it starts, or the selected daemon.
 */
export function createLocalDockerInvocation(
  dockerCliPath: string,
  environment: NodeJS.ProcessEnv = process.env,
): LocalDockerInvocation {
  const validatedDockerCliPath = requireTrustedDockerCliPath(dockerCliPath);
  for (const [environmentName, value] of Object.entries(environment)) {
    if (value !== undefined && isForbiddenDockerRoutingEnvironment(environmentName)) {
      throw new A03ProofError("a03_docker_remote_endpoint_forbidden");
    }
  }

  const dockerCliContentSha256 = readRegularDockerCliContentSha256(validatedDockerCliPath);
  const dockerConfigDirectory = createIsolatedDockerConfigDirectory();
  try {
    // Do not preserve HOME, USERPROFILE, PATH, DOCKER_CONFIG, or arbitrary
    // host variables. Docker CLI sees the fresh config only through its
    // explicit global option. Direct execution of dockerCliPath means PATH is
    // neither required nor accepted.
    const environmentSnapshot: NodeJS.ProcessEnv = Object.freeze({}) as NodeJS.ProcessEnv;
    return Object.freeze({
      dockerCliPath: validatedDockerCliPath,
      dockerCliContentSha256,
      argumentsPrefix: ["--config", dockerConfigDirectory.path, ...localDockerContextArguments],
      environment: environmentSnapshot,
      verifyIsolatedConfig: () => assertIsolatedDockerConfigDirectory(dockerConfigDirectory),
      dispose: createDockerConfigDisposer(dockerConfigDirectory),
    });
  } catch (error) {
    removeIsolatedDockerConfigDirectory(dockerConfigDirectory);
    throw error;
  }
}

/** Runs one Docker subcommand through the local-only context/environment. */
export async function runLocalDockerCommand(
  commandRunner: CommandRunner,
  invocation: LocalDockerInvocation,
  argumentsList: readonly string[],
  timeoutMilliseconds: number,
): Promise<CommandResult> {
  invocation.verifyIsolatedConfig();
  if (readRegularDockerCliContentSha256(invocation.dockerCliPath) !== invocation.dockerCliContentSha256) {
    throw new A03ProofError("a03_docker_cli_content_changed");
  }
  return commandRunner.run(
    invocation.dockerCliPath,
    [...invocation.argumentsPrefix, ...argumentsList],
    timeoutMilliseconds,
    invocation.environment,
  );
}

/**
 * Accepts only Docker's standard platform-local default endpoint. The proof
 * intentionally does not accept an arbitrary local-looking socket: a narrow,
 * reviewed allowlist is what lets evidence claim the daemon selection was
 * disposable-machine local rather than operator-configured.
 */
export function assertAllowlistedLocalDockerEndpoint(
  jsonHost: string,
  platform: NodeJS.Platform = process.platform,
): void {
  const host = parseJsonHost(jsonHost);
  const allowlisted = platform === "win32"
    ? host.toLowerCase() === windowsDefaultDockerPipe
    : host === unixDefaultDockerSocket;
  if (!allowlisted) {
    throw new A03ProofError("a03_docker_local_endpoint_invalid");
  }
}

function isForbiddenDockerRoutingEnvironment(environmentName: string): boolean {
  const normalized = environmentName.toUpperCase();
  return normalized.startsWith("DOCKER_") || alternateEngineEndpointVariables.has(normalized);
}

function parseJsonHost(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value.trim());
    if (typeof parsed !== "string" || parsed.length === 0) {
      throw new Error("docker_context_host_not_string");
    }
    return parsed;
  } catch {
    // Do not reveal context metadata in a proof failure or its evidence.
    throw new A03ProofError("a03_docker_local_endpoint_invalid");
  }
}

function createIsolatedDockerConfigDirectory(): IsolatedDockerConfigDirectory {
  const temporaryRoot = captureTrustedLocalTemporaryRoot("a03_docker_config_isolation_failed");
  try {
    assertTrustedLocalTemporaryRoot(temporaryRoot, "a03_docker_config_isolation_failed");
    const path = mkdtempSync(join(temporaryRoot.realPath, isolatedDockerConfigPrefix));
    assertTrustedLocalTemporaryRoot(temporaryRoot, "a03_docker_config_isolation_failed");
    const before = lstatSync(path);
    const realPath = realpathSync.native(path);
    const after = lstatSync(path);
    if (
      before.isSymbolicLink()
      || !before.isDirectory()
      || after.isSymbolicLink()
      || !after.isDirectory()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || !isGeneratedDockerConfigDirectory(path, temporaryRoot.realPath)
      || !sameFilesystemPath(realPath, path)
      || !isStrictDescendant(realPath, temporaryRoot.realPath)
    ) {
      throw new Error("docker-config-directory-invalid");
    }
    return Object.freeze({
      path,
      realPath,
      identity: Object.freeze({ device: before.dev, inode: before.ino }),
      temporaryRoot,
    });
  } catch {
    throw new A03ProofError("a03_docker_config_isolation_failed");
  }
}

function createDockerConfigDisposer(dockerConfigDirectory: IsolatedDockerConfigDirectory): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    removeIsolatedDockerConfigDirectory(dockerConfigDirectory);
  };
}

function removeIsolatedDockerConfigDirectory(dockerConfigDirectory: IsolatedDockerConfigDirectory): void {
  try {
    assertIsolatedDockerConfigDirectory(dockerConfigDirectory);
    rmSync(dockerConfigDirectory.path, {
      recursive: true,
      force: true,
      maxRetries: 1,
    });
  } catch {
    // The directory is intentionally fresh and contains no supplied
    // credentials. A cleanup failure must not mask a Docker/container cleanup
    // result or disclose a local path in public proof evidence.
  }
}

function assertIsolatedDockerConfigDirectory(dockerConfigDirectory: IsolatedDockerConfigDirectory): void {
  try {
    assertTrustedLocalTemporaryRoot(dockerConfigDirectory.temporaryRoot, "a03_docker_config_isolation_failed");
    const before = lstatSync(dockerConfigDirectory.path);
    const realPath = realpathSync.native(dockerConfigDirectory.path);
    const after = lstatSync(dockerConfigDirectory.path);
    const entries = readdirSync(dockerConfigDirectory.path, { withFileTypes: true });
    if (
      before.isSymbolicLink()
      || !before.isDirectory()
      || after.isSymbolicLink()
      || !after.isDirectory()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.dev !== dockerConfigDirectory.identity.device
      || before.ino !== dockerConfigDirectory.identity.inode
      || !sameFilesystemPath(realPath, dockerConfigDirectory.realPath)
      || !isGeneratedDockerConfigDirectory(dockerConfigDirectory.path, dockerConfigDirectory.temporaryRoot.realPath)
      || !isStrictDescendant(realPath, dockerConfigDirectory.temporaryRoot.realPath)
      // The proof accepts no persisted context, credential-helper, config, or
      // plugin state. If Docker itself writes here, later invocations stop
      // rather than consuming that state; an external verifier may instead
      // create a fresh immutable config for every child.
      || entries.length !== 0
    ) {
      throw new Error("docker-config-directory-identity-changed");
    }
  } catch {
    throw new A03ProofError("a03_docker_config_isolation_failed");
  }
}

function isGeneratedDockerConfigDirectory(path: string, temporaryRootPath: string): boolean {
  const relativePath = relative(resolve(temporaryRootPath), resolve(path));
  return (
    relativePath !== ""
    && !relativePath.startsWith("..")
    && !isAbsolute(relativePath)
    && new RegExp(`^${isolatedDockerConfigPrefix}[A-Za-z0-9_-]+$`).test(relativePath)
  );
}

function isStrictDescendant(candidatePath: string, ancestorPath: string): boolean {
  const candidate = normalizeFilesystemPath(candidatePath);
  const ancestor = normalizeFilesystemPath(ancestorPath);
  return candidate.startsWith(ancestor.endsWith("/") ? ancestor : `${ancestor}/`);
}

function sameFilesystemPath(left: string, right: string): boolean {
  return normalizeFilesystemPath(left) === normalizeFilesystemPath(right);
}

function normalizeFilesystemPath(path: string): string {
  const normalized = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * Binds a command invocation to a regular, non-symlink executable file and
 * detects a replaced path before each Docker CLI launch. It is a local content
 * consistency check only, not binary attestation or a guarantee against every
 * filesystem race; the external Gate 1 approval records host trust separately.
 */
function readRegularDockerCliContentSha256(dockerCliPath: TrustedDockerCliPath): string {
  try {
    assertNoSymbolicLinkPathComponents(dockerCliPath);
    const before = lstatSync(dockerCliPath);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maximumDockerCliBytes) {
      throw new Error("docker_cli_file_invalid");
    }
    const contents = readFileSync(dockerCliPath);
    assertNoSymbolicLinkPathComponents(dockerCliPath);
    const after = lstatSync(dockerCliPath);
    if (
      !after.isFile()
      || after.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
    ) {
      throw new Error("docker_cli_file_changed");
    }
    return createHash("sha256").update(contents).digest("hex");
  } catch {
    throw new A03ProofError("a03_docker_cli_file_invalid");
  }
}

/**
 * A non-symlink final file is insufficient when an ancestor can redirect the
 * executable path through a junction. Every component must be physical and
 * the fully resolved path must remain the supplied local path.
 */
function assertNoSymbolicLinkPathComponents(path: string): void {
  const parsed = parse(resolve(path));
  const components = relative(parsed.root, resolve(path)).split(/[\\/]/).filter(Boolean);
  let currentPath = parsed.root;
  for (const component of components) {
    currentPath = join(currentPath, component);
    const metadata = lstatSync(currentPath);
    if (metadata.isSymbolicLink()) throw new Error("docker-cli-path-symlink");
  }
  if (!sameFilesystemPath(realpathSync.native(path), path)) {
    throw new Error("docker-cli-path-physical-route-changed");
  }
}
