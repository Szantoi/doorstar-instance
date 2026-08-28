import { createHash } from "node:crypto";
import { constants } from "node:fs";
import type { Dir } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { A03ProofError } from "./a03Config.js";
import type { CommandResult, CommandRunner } from "./commandRunner.js";

const candidateGitTimeoutMilliseconds = 10_000;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const candidateGitChildEnvironments = new WeakSet<object>();

// The proof checkout is intentionally small and source-only. These caps turn
// a poisoned tree, path, or file into a deterministic pre-Docker failure
// instead of letting it consume unbounded memory or disk I/O.
const maximumCandidateTreeEntries = 20_000;
const maximumCandidateTreeOutputBytes = 32 * 1024 * 1024;
const maximumCandidateScalarOutputBytes = 4 * 1024;
const maximumCandidatePathBytes = 4 * 1024;
const maximumCandidateFileBytes = 16 * 1024 * 1024;
const maximumCandidateTotalFileBytes = 128 * 1024 * 1024;
const fileReadBufferBytes = 64 * 1024;

/**
 * Fixed Git-wide arguments for every Gate 1 candidate read.
 *
 * They take precedence over repository, global and system configuration for
 * the helper-bearing behaviours relevant to these read-only commands. The
 * only candidate tree read is `ls-tree`: it reads committed objects and never
 * invokes checkout conversion, attributes, clean filters, status, or hooks.
 * The Git executable and host filesystem remain trusted-host prerequisites.
 */
export const candidateGitReadArgumentPrefix = Object.freeze([
  "--no-pager",
  "--no-replace-objects",
  "--no-lazy-fetch",
  "--no-optional-locks",
  "-c", "core.fsmonitor=false",
  "-c", "core.useBuiltinFSMonitor=false",
  "-c", "core.untrackedCache=false",
  "-c", "core.preloadIndex=false",
  "-c", "maintenance.auto=false",
  "-c", "gc.auto=0",
  "-c", "credential.helper=",
  "-c", "core.askPass=",
  "-c", "core.sshCommand=",
  "-c", "diff.external=",
  "-c", "alias.rev-parse=",
  "-c", "alias.ls-tree=",
  "-c", "alias.cat-file=",
] as const);

export type CandidateGitState = Readonly<{
  commitSha: string;
  treeSha: string;
  objectFormat: "sha1" | "sha256";
  clean: true;
}>;

/** One committed, non-symlink Git blob permitted in an A-03 candidate tree. */
export type CandidateGitTreeEntry = Readonly<{
  mode: "100644" | "100755";
  objectType: "blob";
  objectSha: string;
  path: string;
}>;

export type CandidateGitStateCheckOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  expectedCandidate?: CandidateGitState;
}>;

type ExpectedCandidateWorktree = Readonly<{
  filesByKey: ReadonlyMap<string, CandidateGitTreeEntry>;
  directoriesByKey: ReadonlyMap<string, string>;
}>;

type WorktreeWalkBudget = {
  entries: number;
  files: number;
  totalFileBytes: number;
};

/**
 * Retains only OS process-launch values required to find and execute Git.
 * Ambient Git routing/config values and Node runtime injection values never
 * cross this boundary. The returned object is an immutable snapshot; passing
 * it again returns the same snapshot for the pre-Docker recheck.
 */
export function createCandidateGitChildEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (candidateGitChildEnvironments.has(environment)) return environment;

  const childEnvironment: NodeJS.ProcessEnv = {};
  for (const name of candidateGitChildEnvironmentNames()) {
    const value = lookupEnvironmentValue(environment, name);
    if (value !== undefined) childEnvironment[name] = value;
  }
  // Never consult a user/global/system Git config while selecting or parsing
  // the candidate. Repository-local config is still constrained by the fixed
  // `-c` controls above, and these commands do not invoke hooks or filters.
  childEnvironment.GIT_CONFIG_NOSYSTEM = "1";
  childEnvironment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  childEnvironment.GIT_TERMINAL_PROMPT = "0";
  const frozen = Object.freeze(childEnvironment) as NodeJS.ProcessEnv;
  candidateGitChildEnvironments.add(frozen);
  return frozen;
}

/** Prepends fixed controls to one statically-selected, object-only Git read. */
export function createCandidateGitReadArguments(commandArguments: readonly string[]): readonly string[] {
  return Object.freeze([
    ...candidateGitReadArgumentPrefix,
    "-C", repositoryRoot,
    ...commandArguments,
  ]);
}

/**
 * Proves that one filesystem tree is an exact raw-byte materialisation of the
 * supplied committed Git tree. This deliberately does not call Git status,
 * diff, checkout, or any attribute/filter-aware command.
 *
 * Exported for focused tests; the production state check always passes the
 * fixed repository root declared above.
 */
export async function verifyCandidateWorkingTreeAgainstGitTree(
  worktreeRoot: string,
  entries: readonly CandidateGitTreeEntry[],
  objectFormat: CandidateGitState["objectFormat"],
): Promise<void> {
  const expected = createExpectedCandidateWorktree(entries, objectFormat);
  try {
    const rootPath = resolve(worktreeRoot);
    const rootMetadata = await lstat(rootPath);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
      throw new A03ProofError("a03_candidate_worktree_dirty");
    }
    const realRootPath = await realpath(rootPath);
    if (!sameFilesystemPath(realRootPath, rootPath)) {
      throw new A03ProofError("a03_candidate_worktree_dirty");
    }

    const budget: WorktreeWalkBudget = { entries: 0, files: 0, totalFileBytes: 0 };
    const seenFiles = new Set<string>();
    const seenDirectories = new Set<string>();
    await walkCandidateWorktree(
      rootPath,
      "",
      rootMetadata,
      realRootPath,
      expected,
      objectFormat,
      budget,
      seenFiles,
      seenDirectories,
    );
    if (
      seenFiles.size !== expected.filesByKey.size
      || seenDirectories.size !== expected.directoriesByKey.size
    ) {
      throw new A03ProofError("a03_candidate_worktree_dirty");
    }
  } catch (error) {
    if (error instanceof A03ProofError) throw error;
    throw new A03ProofError("a03_candidate_worktree_dirty");
  }
}

/**
 * Gate 0 binds evidence to a committed candidate. The working tree is checked
 * with a raw, bounded filesystem walk rather than `git status`, so ignored or
 * untracked paths, checkout conversion, and `.gitattributes` filters cannot
 * influence this pre-Docker gate.
 */
export async function requireCleanCandidateGitState(
  commandRunner: CommandRunner,
  options: CandidateGitStateCheckOptions = {},
): Promise<CandidateGitState> {
  const environment = createCandidateGitChildEnvironment(options.environment);
  const objectFormatResult = await runCandidateGitRead(
    commandRunner,
    ["rev-parse", "--show-object-format"],
    environment,
  );
  const objectFormat = parseObjectFormat(objectFormatResult);
  const expectedHashLength = objectFormat === "sha1" ? 40 : 64;
  const commitResult = await runCandidateGitRead(
    commandRunner,
    ["rev-parse", "--verify", "HEAD^{commit}"],
    environment,
  );
  const commitSha = parseObjectHash(commitResult, expectedHashLength, "a03_candidate_git_commit_invalid");
  const treeResult = await runCandidateGitRead(
    commandRunner,
    ["rev-parse", "--verify", `${commitSha}^{tree}`],
    environment,
  );
  const treeSha = parseObjectHash(treeResult, expectedHashLength, "a03_candidate_git_tree_invalid");

  const treeResultListing = await runCandidateGitRead(
    commandRunner,
    ["ls-tree", "-r", "-z", "--full-tree", commitSha, "--"],
    environment,
  );
  const treeEntries = parseCandidateGitTree(treeResultListing, objectFormat);
  await verifyCandidateWorkingTreeAgainstGitTree(repositoryRoot, treeEntries, objectFormat);
  await requireCandidateGitAnchorsUnchanged(
    commandRunner,
    environment,
    Object.freeze({ commitSha, treeSha, objectFormat, clean: true }),
  );

  const state: CandidateGitState = Object.freeze({ commitSha, treeSha, objectFormat, clean: true });
  if (
    options.expectedCandidate !== undefined
    && (
      state.commitSha !== options.expectedCandidate.commitSha
      || state.treeSha !== options.expectedCandidate.treeSha
      || state.objectFormat !== options.expectedCandidate.objectFormat
    )
  ) {
    throw new A03ProofError("a03_candidate_git_changed");
  }
  return state;
}

/**
 * The raw filesystem walk and the committed-tree reads are separate host
 * operations. Re-read every anchor after the walk so a checkout movement or
 * object-format switch during that window cannot be reported as one coherent
 * candidate. The caller still treats the Git executable and host filesystem
 * as trusted-host prerequisites.
 */
export async function requireCandidateGitAnchorsUnchanged(
  commandRunner: CommandRunner,
  environment: NodeJS.ProcessEnv,
  expected: CandidateGitState,
): Promise<void> {
  const currentObjectFormat = parseObjectFormat(await runCandidateGitRead(
    commandRunner,
    ["rev-parse", "--show-object-format"],
    environment,
  ));
  const expectedHashLength = currentObjectFormat === "sha1" ? 40 : 64;
  const currentCommitSha = parseObjectHash(await runCandidateGitRead(
    commandRunner,
    ["rev-parse", "--verify", "HEAD^{commit}"],
    environment,
  ), expectedHashLength, "a03_candidate_git_changed");
  const currentTreeSha = parseObjectHash(await runCandidateGitRead(
    commandRunner,
    ["rev-parse", "--verify", `${expected.commitSha}^{tree}`],
    environment,
  ), expectedHashLength, "a03_candidate_git_changed");
  if (
    currentObjectFormat !== expected.objectFormat
    || currentCommitSha !== expected.commitSha
    || currentTreeSha !== expected.treeSha
  ) {
    throw new A03ProofError("a03_candidate_git_changed");
  }
}

async function walkCandidateWorktree(
  directoryPath: string,
  relativeDirectoryPath: string,
  directoryMetadata: Stats,
  realRootPath: string,
  expected: ExpectedCandidateWorktree,
  objectFormat: CandidateGitState["objectFormat"],
  budget: WorktreeWalkBudget,
  seenFiles: Set<string>,
  seenDirectories: Set<string>,
): Promise<void> {
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new A03ProofError("a03_candidate_worktree_dirty");
  }
  const realDirectoryPath = await realpath(directoryPath);
  if (!isSameOrStrictDescendant(realDirectoryPath, realRootPath)) {
    throw new A03ProofError("a03_candidate_worktree_dirty");
  }

  let directory: Dir | undefined;
  try {
    directory = await opendir(directoryPath);
    while (true) {
      const entry = await directory.read();
      if (entry === null) break;
      if (relativeDirectoryPath === "" && entry.name === ".git") continue;
      const relativePath = relativeDirectoryPath === ""
        ? entry.name
        : `${relativeDirectoryPath}/${entry.name}`;
      const pathKey = canonicalPathKey(relativePath);
      if (!isSafeRepositoryPath(relativePath) || pathKey === ".git" || seenFiles.has(pathKey) || seenDirectories.has(pathKey)) {
        throw new A03ProofError("a03_candidate_worktree_dirty");
      }
      budget.entries += 1;
      if (budget.entries > maximumCandidateTreeEntries) {
        throw new A03ProofError("a03_candidate_worktree_dirty");
      }

      const fullPath = join(directoryPath, entry.name);
      const metadata = await lstat(fullPath);
      if (metadata.isSymbolicLink()) throw new A03ProofError("a03_candidate_worktree_dirty");
      if (metadata.isDirectory()) {
        const expectedDirectory = expected.directoriesByKey.get(pathKey);
        if (expectedDirectory !== relativePath) {
          throw new A03ProofError("a03_candidate_worktree_dirty");
        }
        seenDirectories.add(pathKey);
        await walkCandidateWorktree(
          fullPath,
          relativePath,
          metadata,
          realRootPath,
          expected,
          objectFormat,
          budget,
          seenFiles,
          seenDirectories,
        );
      } else if (metadata.isFile()) {
        const expectedFile = expected.filesByKey.get(pathKey);
        if (expectedFile === undefined || expectedFile.path !== relativePath) {
          throw new A03ProofError("a03_candidate_worktree_dirty");
        }
        const objectSha = await createRegularFileGitBlobObjectId(fullPath, metadata, objectFormat, budget);
        if (objectSha !== expectedFile.objectSha) {
          throw new A03ProofError("a03_candidate_worktree_dirty");
        }
        seenFiles.add(pathKey);
      } else {
        throw new A03ProofError("a03_candidate_worktree_dirty");
      }
    }
  } finally {
    if (directory !== undefined) await directory.close().catch(() => undefined);
  }

  const finalMetadata = await lstat(directoryPath);
  if (!sameDirectoryIdentity(directoryMetadata, finalMetadata)) {
    throw new A03ProofError("a03_candidate_worktree_dirty");
  }
}

async function createRegularFileGitBlobObjectId(
  filePath: string,
  expectedMetadata: Stats,
  objectFormat: CandidateGitState["objectFormat"],
  budget: WorktreeWalkBudget,
): Promise<string> {
  if (
    !expectedMetadata.isFile()
    || expectedMetadata.isSymbolicLink()
    || !isBoundedFileSize(expectedMetadata.size)
    || budget.files >= maximumCandidateTreeEntries
    || budget.totalFileBytes + expectedMetadata.size > maximumCandidateTotalFileBytes
  ) {
    throw new A03ProofError("a03_candidate_worktree_dirty");
  }

  let file: FileHandle | undefined;
  try {
    const flags = process.platform === "win32"
      ? constants.O_RDONLY
      : constants.O_RDONLY | constants.O_NOFOLLOW;
    file = await open(filePath, flags);
    const openedMetadata = await file.stat();
    if (!sameFileIdentity(expectedMetadata, openedMetadata) || !isBoundedFileSize(openedMetadata.size)) {
      throw new A03ProofError("a03_candidate_worktree_dirty");
    }
    const digest = createHash(objectFormat);
    digest.update(Buffer.from(`blob ${openedMetadata.size}\0`, "utf8"));
    const buffer = Buffer.allocUnsafe(Math.min(fileReadBufferBytes, Math.max(1, openedMetadata.size)));
    let remaining = openedMetadata.size;
    while (remaining > 0) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, remaining), null);
      if (bytesRead <= 0) throw new A03ProofError("a03_candidate_worktree_dirty");
      digest.update(buffer.subarray(0, bytesRead));
      remaining -= bytesRead;
    }
    // A file that grew during the bounded read is invalid even when its prefix
    // happened to hash to a committed blob.
    const probe = Buffer.allocUnsafe(1);
    if ((await file.read(probe, 0, 1, null)).bytesRead !== 0) {
      throw new A03ProofError("a03_candidate_worktree_dirty");
    }
    const finalOpenMetadata = await file.stat();
    const finalPathMetadata = await lstat(filePath);
    if (
      !sameFileIdentity(openedMetadata, finalOpenMetadata)
      || !sameFileIdentity(expectedMetadata, finalPathMetadata)
      || !sameFileMetadata(expectedMetadata, finalOpenMetadata)
      || !sameFileMetadata(expectedMetadata, finalPathMetadata)
    ) {
      throw new A03ProofError("a03_candidate_worktree_dirty");
    }
    budget.files += 1;
    budget.totalFileBytes += openedMetadata.size;
    return digest.digest("hex");
  } finally {
    if (file !== undefined) await file.close().catch(() => undefined);
  }
}

function createExpectedCandidateWorktree(
  entries: readonly CandidateGitTreeEntry[],
  objectFormat: CandidateGitState["objectFormat"],
): ExpectedCandidateWorktree {
  const expectedHashLength = objectFormat === "sha1" ? 40 : 64;
  if (entries.length > maximumCandidateTreeEntries) {
    throw new A03ProofError("a03_candidate_git_tree_invalid");
  }
  const filesByKey = new Map<string, CandidateGitTreeEntry>();
  const directoriesByKey = new Map<string, string>();
  for (const entry of entries) {
    if (
      (entry.mode !== "100644" && entry.mode !== "100755")
      || entry.objectType !== "blob"
      || !isObjectHash(entry.objectSha, expectedHashLength)
      || !isSafeRepositoryPath(entry.path)
    ) {
      throw new A03ProofError("a03_candidate_git_tree_invalid");
    }
    const fileKey = canonicalPathKey(entry.path);
    if (filesByKey.has(fileKey) || directoriesByKey.has(fileKey)) {
      throw new A03ProofError("a03_candidate_git_tree_invalid");
    }
    filesByKey.set(fileKey, Object.freeze({ ...entry }));
    const components = entry.path.split("/");
    for (let index = 1; index < components.length; index += 1) {
      const directoryPath = components.slice(0, index).join("/");
      const directoryKey = canonicalPathKey(directoryPath);
      const existingDirectory = directoriesByKey.get(directoryKey);
      if (
        filesByKey.has(directoryKey)
        || (existingDirectory !== undefined && existingDirectory !== directoryPath)
      ) {
        throw new A03ProofError("a03_candidate_git_tree_invalid");
      }
      directoriesByKey.set(directoryKey, directoryPath);
    }
  }
  for (const directoryKey of directoriesByKey.keys()) {
    if (filesByKey.has(directoryKey)) throw new A03ProofError("a03_candidate_git_tree_invalid");
  }
  return Object.freeze({ filesByKey, directoriesByKey });
}

async function runCandidateGitRead(
  commandRunner: CommandRunner,
  commandArguments: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  try {
    const result = await commandRunner.run(
      "git",
      createCandidateGitReadArguments(commandArguments),
      candidateGitTimeoutMilliseconds,
      environment,
    );
    if (result.exitCode !== 0 || !isBoundedCommandOutput(result, maximumCandidateTreeOutputBytes)) {
      throw new Error("candidate-git-read-failed");
    }
    return result;
  } catch {
    throw new A03ProofError("a03_candidate_git_unavailable");
  }
}

function parseObjectFormat(result: CommandResult): CandidateGitState["objectFormat"] {
  if (!isBoundedCommandOutput(result, maximumCandidateScalarOutputBytes)) {
    throw new A03ProofError("a03_candidate_git_object_format_invalid");
  }
  const objectFormat = parseSingleGitLine(result.stdout);
  if (objectFormat !== "sha1" && objectFormat !== "sha256") {
    throw new A03ProofError("a03_candidate_git_object_format_invalid");
  }
  return objectFormat;
}

function parseObjectHash(result: CommandResult, expectedHashLength: number, failureCode: string): string {
  if (!isBoundedCommandOutput(result, maximumCandidateScalarOutputBytes)) {
    throw new A03ProofError(failureCode);
  }
  const value = parseSingleGitLine(result.stdout);
  if (!isObjectHash(value, expectedHashLength)) throw new A03ProofError(failureCode);
  return value;
}

function parseCandidateGitTree(
  result: CommandResult,
  objectFormat: CandidateGitState["objectFormat"],
): readonly CandidateGitTreeEntry[] {
  if (!isBoundedCommandOutput(result, maximumCandidateTreeOutputBytes)) {
    throw new A03ProofError("a03_candidate_git_tree_invalid");
  }
  const output = result.stdout;
  if (output.length === 0) return Object.freeze([]);
  if (!output.endsWith("\0") || output.includes("\uFFFD")) {
    throw new A03ProofError("a03_candidate_git_tree_invalid");
  }
  const expectedHashLength = objectFormat === "sha1" ? 40 : 64;
  const records = output.slice(0, -1).split("\0");
  if (records.length > maximumCandidateTreeEntries || records.some((record) => record.length === 0)) {
    throw new A03ProofError("a03_candidate_git_tree_invalid");
  }
  const entries: CandidateGitTreeEntry[] = [];
  const paths = new Set<string>();
  for (const record of records) {
    const tabIndex = record.indexOf("\t");
    if (tabIndex < 0) throw new A03ProofError("a03_candidate_git_tree_invalid");
    const header = record.slice(0, tabIndex).split(" ");
    const path = record.slice(tabIndex + 1);
    const [mode, objectType, objectSha] = header;
    if (
      header.length !== 3
      || (mode !== "100644" && mode !== "100755")
      || objectType !== "blob"
      || !isObjectHash(objectSha, expectedHashLength)
      || !isSafeRepositoryPath(path)
    ) {
      throw new A03ProofError("a03_candidate_git_tree_invalid");
    }
    const pathKey = canonicalPathKey(path);
    if (paths.has(pathKey)) throw new A03ProofError("a03_candidate_git_tree_invalid");
    paths.add(pathKey);
    entries.push(Object.freeze({ mode, objectType, objectSha, path }));
  }
  return Object.freeze(entries);
}

function isBoundedCommandOutput(result: CommandResult, maximumBytes: number): boolean {
  return (
    typeof result.stdout === "string"
    && typeof result.stderr === "string"
    && Buffer.byteLength(result.stdout, "utf8") <= maximumBytes
    && Buffer.byteLength(result.stderr, "utf8") <= maximumBytes
  );
}

function parseSingleGitLine(value: string): string {
  if (!value.endsWith("\n") || value.slice(0, -1).includes("\n") || value.includes("\r") || value.includes("\0")) {
    return "";
  }
  return value.slice(0, -1);
}

function isSafeRepositoryPath(path: string): boolean {
  if (
    path.length === 0
    || Buffer.byteLength(path, "utf8") > maximumCandidatePathBytes
    || path.includes("\\")
    || path.includes("\0")
    || path.includes("\uFFFD")
    || /[\u0000-\u001F\u007F]/.test(path)
  ) {
    return false;
  }
  const components = path.split("/");
  return components.every((component) => (
    component.length > 0
    && component !== "."
    && component !== ".."
    && canonicalPathKey(component) !== ".git"
    && !/[<>:"|?*]/.test(component)
    && !component.endsWith(".")
    && !component.endsWith(" ")
    && !isWindowsDeviceName(component)
  ));
}

function isWindowsDeviceName(component: string): boolean {
  const stem = component.split(".", 1)[0]?.toUpperCase() ?? "";
  return stem === "CON"
    || stem === "PRN"
    || stem === "AUX"
    || stem === "NUL"
    || /^(?:COM|LPT)[1-9]$/.test(stem);
}

function canonicalPathKey(path: string): string {
  return path.normalize("NFC").toLowerCase();
}

function isBoundedFileSize(size: number): boolean {
  return Number.isSafeInteger(size) && size >= 0 && size <= maximumCandidateFileBytes;
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return (
    left.isFile()
    && !left.isSymbolicLink()
    && right.isFile()
    && !right.isSymbolicLink()
    && left.dev === right.dev
    && left.ino === right.ino
  );
}

function sameFileMetadata(left: Stats, right: Stats): boolean {
  return (
    sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
  );
}

function sameDirectoryIdentity(left: Stats, right: Stats): boolean {
  return (
    left.isDirectory()
    && !left.isSymbolicLink()
    && right.isDirectory()
    && !right.isSymbolicLink()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
  );
}

function isSameOrStrictDescendant(candidatePath: string, rootPath: string): boolean {
  const candidate = normalizeFilesystemPath(candidatePath);
  const root = normalizeFilesystemPath(rootPath);
  return candidate === root || candidate.startsWith(root.endsWith("/") ? root : `${root}/`);
}

function sameFilesystemPath(left: string, right: string): boolean {
  return normalizeFilesystemPath(left) === normalizeFilesystemPath(right);
}

function normalizeFilesystemPath(path: string): string {
  const normalized = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isObjectHash(value: unknown, expectedLength: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${expectedLength}}$`, "i").test(value);
}

function candidateGitChildEnvironmentNames(): readonly string[] {
  return process.platform === "win32"
    ? ["PATH", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]
    : ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TMP", "TEMP"];
}

function lookupEnvironmentValue(environment: NodeJS.ProcessEnv, expectedName: string): string | undefined {
  const matchingEntry = Object.entries(environment)
    .find(([name, value]) => name.toUpperCase() === expectedName.toUpperCase() && typeof value === "string");
  return matchingEntry?.[1];
}
