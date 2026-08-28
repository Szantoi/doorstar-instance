import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
  readSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fail } from "./errors.mjs";

const MAXIMUM_TREE_ENTRIES = 20_000;
const MAXIMUM_TREE_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAXIMUM_SCALAR_OUTPUT_BYTES = 4 * 1024;
const MAXIMUM_PATH_BYTES = 4 * 1024;
const MAXIMUM_FILE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_TOTAL_FILE_BYTES = 128 * 1024 * 1024;
const FILE_READ_BUFFER_BYTES = 64 * 1024;

/**
 * Minimal, object-only Git adapter.
 *
 * Candidate worktree validation never calls `git status`, `git show`, diff,
 * checkout, or any attribute/filter-aware command. It obtains the committed
 * file list from `ls-tree`, then compares the raw working-tree bytes to Git
 * blob object IDs with an independent bounded filesystem walk.
 */
export function createGitRepository({ repoRoot, runner }) {
  const resolvedRepositoryRoot = path.resolve(repoRoot);
  const treeCache = new Map();

  const assertRepositoryRoot = () => {
    const topLevel = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "--show-toplevel"]);
    if (!sameFilesystemPath(topLevel, resolvedRepositoryRoot)) {
      fail("gate0_repository_root_mismatch");
    }
  };

  const captureCleanCandidate = (candidate) => {
    assertRepositoryRoot();
    assertFullCommitSha(candidate);
    const resolvedCandidate = gitText(
      runner,
      resolvedRepositoryRoot,
      ["rev-parse", "--verify", `${candidate}^{commit}`],
    );
    const objectFormat = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "--show-object-format"]);
    assertCandidateHash(resolvedCandidate, objectFormat);

    const head = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
    if (resolvedCandidate !== head) {
      fail("gate0_candidate_not_head");
    }
    const treeSha = gitText(
      runner,
      resolvedRepositoryRoot,
      ["rev-parse", "--verify", `${resolvedCandidate}^{tree}`],
    );
    assertObjectHash(treeSha, objectFormat, "gate0_candidate_invalid");

    const treeEntries = readCandidateTree(resolvedCandidate, objectFormat);
    assertWorktreeMatchesCandidateTree(resolvedRepositoryRoot, treeEntries, objectFormat);

    // Bind the returned state to one still-current HEAD after the raw walk.
    // The second invocation remains mandatory before any Gate 1 caller uses
    // the candidate, but initial capture must not accept a moved checkout.
    const finalHead = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
    const finalTree = gitText(
      runner,
      resolvedRepositoryRoot,
      ["rev-parse", "--verify", `${resolvedCandidate}^{tree}`],
    );
    if (finalHead !== resolvedCandidate || finalTree !== treeSha) {
      fail("gate0_candidate_changed");
    }

    return Object.freeze({
      commitSha: resolvedCandidate,
      treeSha,
      objectFormat,
    });
  };

  const readCandidateTree = (candidateCommitSha, objectFormat) => {
    const cacheKey = `${objectFormat}:${candidateCommitSha}`;
    const cached = treeCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const output = gitBytes(
      runner,
      resolvedRepositoryRoot,
      ["-c", "alias.ls-tree=", "ls-tree", "-r", "-z", "--full-tree", candidateCommitSha, "--"],
      MAXIMUM_TREE_OUTPUT_BYTES,
    );
    const entries = parseCandidateTree(output, objectFormat);
    treeCache.set(cacheKey, entries);
    return entries;
  };

  return {
    captureCleanCandidate,

    readBlob(candidate, repositoryRelativePath) {
      assertRepositoryRelativePath(repositoryRelativePath);
      assertCandidateIdentity(candidate);
      const entry = readCandidateTree(candidate.commitSha, candidate.objectFormat).get(repositoryRelativePath);
      if (entry === undefined) fail("gate0_git_command_failed");
      const bytes = gitBytes(
        runner,
        resolvedRepositoryRoot,
        ["-c", "alias.cat-file=", "cat-file", "blob", entry.objectSha],
        MAXIMUM_FILE_BYTES,
      );
      if (gitBlobObjectId(bytes, candidate.objectFormat) !== entry.objectSha) {
        fail("gate0_git_command_failed");
      }
      return bytes;
    },

    assertStillCleanCandidate(candidate) {
      assertCandidateIdentity(candidate);
      const current = captureCleanCandidate(candidate.commitSha);
      if (current.treeSha !== candidate.treeSha || current.objectFormat !== candidate.objectFormat) {
        fail("gate0_candidate_changed");
      }
    },
  };
}

function assertWorktreeMatchesCandidateTree(repoRoot, treeEntries, objectFormat) {
  const expected = createExpectedWorktree(treeEntries, objectFormat);
  try {
    const rootPath = path.resolve(repoRoot);
    const rootMetadata = lstatSync(rootPath);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
      fail("gate0_worktree_not_clean");
    }
    const realRootPath = realpathSync(rootPath);
    if (!sameFilesystemPath(realRootPath, rootPath)) {
      fail("gate0_worktree_not_clean");
    }
    const budget = { entries: 0, files: 0, totalFileBytes: 0 };
    const seenFiles = new Set();
    const seenDirectories = new Set();
    walkWorktree(
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
    if (seenFiles.size !== expected.filesByKey.size || seenDirectories.size !== expected.directoriesByKey.size) {
      fail("gate0_worktree_not_clean");
    }
  } catch (error) {
    if (error?.code === "gate0_worktree_not_clean") throw error;
    fail("gate0_worktree_not_clean");
  }
}

function walkWorktree(
  directoryPath,
  relativeDirectoryPath,
  directoryMetadata,
  realRootPath,
  expected,
  objectFormat,
  budget,
  seenFiles,
  seenDirectories,
) {
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    fail("gate0_worktree_not_clean");
  }
  const realDirectoryPath = realpathSync(directoryPath);
  if (!isSameOrStrictDescendant(realDirectoryPath, realRootPath)) {
    fail("gate0_worktree_not_clean");
  }

  let directory;
  try {
    directory = opendirSync(directoryPath);
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      if (relativeDirectoryPath === "" && entry.name === ".git") continue;
      const relativePath = relativeDirectoryPath === ""
        ? entry.name
        : `${relativeDirectoryPath}/${entry.name}`;
      const pathKey = canonicalPathKey(relativePath);
      if (!isSafeRepositoryPath(relativePath)
        || pathKey === ".git"
        || seenFiles.has(pathKey)
        || seenDirectories.has(pathKey)) {
        fail("gate0_worktree_not_clean");
      }
      budget.entries += 1;
      if (budget.entries > MAXIMUM_TREE_ENTRIES) fail("gate0_worktree_not_clean");

      const fullPath = path.join(directoryPath, entry.name);
      const metadata = lstatSync(fullPath);
      if (metadata.isSymbolicLink()) fail("gate0_worktree_not_clean");
      if (metadata.isDirectory()) {
        if (expected.directoriesByKey.get(pathKey) !== relativePath) {
          fail("gate0_worktree_not_clean");
        }
        seenDirectories.add(pathKey);
        walkWorktree(
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
          fail("gate0_worktree_not_clean");
        }
        const objectSha = createRegularFileGitBlobObjectId(fullPath, metadata, objectFormat, budget);
        if (objectSha !== expectedFile.objectSha) fail("gate0_worktree_not_clean");
        seenFiles.add(pathKey);
      } else {
        fail("gate0_worktree_not_clean");
      }
    }
  } finally {
    try {
      directory?.closeSync();
    } catch {
      // The final identity check below is the authoritative outcome.
    }
  }

  const finalMetadata = lstatSync(directoryPath);
  if (!sameDirectoryIdentity(directoryMetadata, finalMetadata)) {
    fail("gate0_worktree_not_clean");
  }
}

function createRegularFileGitBlobObjectId(filePath, expectedMetadata, objectFormat, budget) {
  if (!expectedMetadata.isFile()
    || expectedMetadata.isSymbolicLink()
    || !isBoundedFileSize(expectedMetadata.size)
    || budget.files >= MAXIMUM_TREE_ENTRIES
    || budget.totalFileBytes + expectedMetadata.size > MAXIMUM_TOTAL_FILE_BYTES) {
    fail("gate0_worktree_not_clean");
  }

  let descriptor;
  try {
    const flags = process.platform === "win32"
      ? constants.O_RDONLY
      : constants.O_RDONLY | constants.O_NOFOLLOW;
    descriptor = openSync(filePath, flags);
    const openedMetadata = fstatSync(descriptor);
    if (!sameFileIdentity(expectedMetadata, openedMetadata) || !isBoundedFileSize(openedMetadata.size)) {
      fail("gate0_worktree_not_clean");
    }
    const digest = createHash(objectFormat);
    digest.update(Buffer.from(`blob ${openedMetadata.size}\0`, "utf8"));
    const buffer = Buffer.allocUnsafe(Math.min(FILE_READ_BUFFER_BYTES, Math.max(1, openedMetadata.size)));
    let remaining = openedMetadata.size;
    while (remaining > 0) {
      const bytesRead = readSync(descriptor, buffer, 0, Math.min(buffer.length, remaining), null);
      if (bytesRead <= 0) fail("gate0_worktree_not_clean");
      digest.update(buffer.subarray(0, bytesRead));
      remaining -= bytesRead;
    }
    if (readSync(descriptor, Buffer.allocUnsafe(1), 0, 1, null) !== 0) {
      fail("gate0_worktree_not_clean");
    }
    const finalOpenMetadata = fstatSync(descriptor);
    const finalPathMetadata = lstatSync(filePath);
    if (!sameFileIdentity(openedMetadata, finalOpenMetadata)
      || !sameFileIdentity(expectedMetadata, finalPathMetadata)
      || !sameFileMetadata(expectedMetadata, finalOpenMetadata)
      || !sameFileMetadata(expectedMetadata, finalPathMetadata)) {
      fail("gate0_worktree_not_clean");
    }
    budget.files += 1;
    budget.totalFileBytes += openedMetadata.size;
    return digest.digest("hex");
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The primary failure stays redacted and deterministic.
      }
    }
  }
}

function gitBlobObjectId(bytes, objectFormat) {
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function createExpectedWorktree(treeEntries, objectFormat) {
  if (treeEntries.size > MAXIMUM_TREE_ENTRIES) fail("gate0_git_command_failed");
  const filesByKey = new Map();
  const directoriesByKey = new Map();
  for (const entry of treeEntries.values()) {
    assertTreeEntry(entry, objectFormat);
    const fileKey = canonicalPathKey(entry.path);
    if (filesByKey.has(fileKey) || directoriesByKey.has(fileKey)) {
      fail("gate0_git_command_failed");
    }
    filesByKey.set(fileKey, entry);
    const components = entry.path.split("/");
    for (let index = 1; index < components.length; index += 1) {
      const directoryPath = components.slice(0, index).join("/");
      const directoryKey = canonicalPathKey(directoryPath);
      const existingDirectory = directoriesByKey.get(directoryKey);
      if (filesByKey.has(directoryKey)
        || (existingDirectory !== undefined && existingDirectory !== directoryPath)) {
        fail("gate0_git_command_failed");
      }
      directoriesByKey.set(directoryKey, directoryPath);
    }
  }
  for (const directoryKey of directoriesByKey.keys()) {
    if (filesByKey.has(directoryKey)) fail("gate0_git_command_failed");
  }
  return Object.freeze({ filesByKey, directoriesByKey });
}

function parseCandidateTree(output, objectFormat) {
  if (output.length === 0) return new Map();
  if (output.at(-1) !== 0) fail("gate0_git_command_failed");
  const entries = new Map();
  let start = 0;
  while (start < output.length) {
    const end = output.indexOf(0, start);
    if (end < 0 || end === start || entries.size >= MAXIMUM_TREE_ENTRIES) {
      fail("gate0_git_command_failed");
    }
    const record = output.subarray(start, end);
    const tabIndex = record.indexOf(0x09);
    if (tabIndex < 0) fail("gate0_git_command_failed");
    const header = record.subarray(0, tabIndex).toString("ascii").split(" ");
    const pathValue = record.subarray(tabIndex + 1).toString("utf8");
    const [mode, objectType, objectSha] = header;
    const entry = { mode, objectType, objectSha, path: pathValue };
    assertTreeEntry(entry, objectFormat);
    const pathKey = canonicalPathKey(pathValue);
    if (entries.has(pathKey)) fail("gate0_git_command_failed");
    entries.set(pathKey, Object.freeze(entry));
    start = end + 1;
  }
  return entries;
}

function assertTreeEntry(entry, objectFormat) {
  if ((entry.mode !== "100644" && entry.mode !== "100755")
    || entry.objectType !== "blob"
    || !isObjectHash(entry.objectSha, objectFormat)
    || !isSafeRepositoryPath(entry.path)) {
    fail("gate0_git_command_failed");
  }
}

function assertCandidateIdentity(candidate) {
  if (candidate === null || typeof candidate !== "object"
    || !isObjectHash(candidate.commitSha, candidate.objectFormat)
    || !isObjectHash(candidate.treeSha, candidate.objectFormat)) {
    fail("gate0_candidate_invalid");
  }
}

// A caller may name only one full Git object ID. Resolve it again below and
// validate it against the repository object format before accepting it; this
// early shape check only prevents abbreviated refs from being interpreted by
// Git during candidate selection.
function assertFullCommitSha(candidate) {
  if (typeof candidate !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(candidate)) {
    fail("gate0_candidate_invalid");
  }
}

function assertCandidateHash(candidate, objectFormat) {
  if ((objectFormat !== "sha1" && objectFormat !== "sha256")
    || !isObjectHash(candidate, objectFormat)) {
    fail("gate0_candidate_invalid");
  }
}

function assertObjectHash(value, objectFormat, failureCode) {
  if (!isObjectHash(value, objectFormat)) fail(failureCode);
}

function isObjectHash(value, objectFormat) {
  const length = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value);
}

function isSafeRepositoryPath(repositoryRelativePath) {
  if (typeof repositoryRelativePath !== "string"
    || repositoryRelativePath.length === 0
    || Buffer.byteLength(repositoryRelativePath, "utf8") > MAXIMUM_PATH_BYTES
    || repositoryRelativePath.includes("\\")
    || repositoryRelativePath.includes("\0")
    || repositoryRelativePath.includes("\uFFFD")
    || /[\u0000-\u001F\u007F]/.test(repositoryRelativePath)) {
    return false;
  }
  return repositoryRelativePath.split("/").every((component) => (
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

function assertRepositoryRelativePath(repositoryRelativePath) {
  if (!isSafeRepositoryPath(repositoryRelativePath)) {
    fail("gate0_policy_invalid");
  }
}

function isWindowsDeviceName(component) {
  const stem = component.split(".", 1)[0]?.toUpperCase() ?? "";
  return stem === "CON"
    || stem === "PRN"
    || stem === "AUX"
    || stem === "NUL"
    || /^(?:COM|LPT)[1-9]$/.test(stem);
}

function canonicalPathKey(value) {
  return value.normalize("NFC").toLowerCase();
}

function isBoundedFileSize(size) {
  return Number.isSafeInteger(size) && size >= 0 && size <= MAXIMUM_FILE_BYTES;
}

function sameFileIdentity(left, right) {
  return left.isFile()
    && !left.isSymbolicLink()
    && right.isFile()
    && !right.isSymbolicLink()
    && left.dev === right.dev
    && left.ino === right.ino;
}

function sameFileMetadata(left, right) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function sameDirectoryIdentity(left, right) {
  return left.isDirectory()
    && !left.isSymbolicLink()
    && right.isDirectory()
    && !right.isSymbolicLink()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function isSameOrStrictDescendant(candidatePath, rootPath) {
  const candidate = normalizedFilesystemPath(candidatePath);
  const root = normalizedFilesystemPath(rootPath);
  return candidate === root || candidate.startsWith(root.endsWith("/") ? root : `${root}/`);
}

function sameFilesystemPath(left, right) {
  return normalizedFilesystemPath(left) === normalizedFilesystemPath(right);
}

function normalizedFilesystemPath(value) {
  const resolved = path.resolve(value).replaceAll("\\", "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function gitText(runner, repoRoot, argumentsList) {
  const output = gitBytes(runner, repoRoot, argumentsList, MAXIMUM_SCALAR_OUTPUT_BYTES);
  const value = output.toString("utf8");
  if (value.includes("\uFFFD")
    || !value.endsWith("\n")
    || value.slice(0, -1).includes("\n")
    || value.includes("\r")
    || value.includes("\0")) {
    fail("gate0_git_command_failed");
  }
  return value.slice(0, -1);
}

function gitBytes(runner, repoRoot, argumentsList, maximumBytes) {
  const result = runner.run({ executable: "git", arguments: argumentsList, cwd: repoRoot });
  if (result.exitCode !== 0 || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)
    || result.stdout.length > maximumBytes || result.stderr.length > maximumBytes) {
    fail("gate0_git_command_failed");
  }
  return result.stdout;
}
