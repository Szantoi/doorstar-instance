import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "./canonical.mjs";
import { Gate1Error, fail } from "./errors.mjs";

export const MAX_DOCKER_CLI_BYTES = 128 * 1024 * 1024;
export const MAX_PRISMA_TOOLCHAIN_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_PRISMA_TOOLCHAIN_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_PRISMA_TOOLCHAIN_FILES = 20_000;
export const MAX_PRISMA_TOOLCHAIN_DIRECTORIES = 10_000;
export const MAX_PRISMA_TOOLCHAIN_DEPTH = 64;
export const MAX_PRISMA_TOOLCHAIN_RELATIVE_PATH_BYTES = 4_096;

/**
 * Hash a bounded, external executable without following a symlink component.
 * The descriptor and post-read metadata checks reject observed replacement or
 * growth instead of trusting a path name alone.
 */
export function hashExternalDockerCli({ dockerCliPath, repoRoot, fileSystem = fs }) {
  return hashExternalRegularFile({
    inputPath: dockerCliPath,
    repoRoot,
    fileSystem,
    prefix: "gate1_docker_cli",
    maxBytes: MAX_DOCKER_CLI_BYTES,
  });
}

/**
 * Gate 1 never opens runtime inputs through a network/Windows-device path.
 * This pure gate is also used before Gate 0 evidence reads, whose general
 * external-evidence helper intentionally has a broader source-only scope.
 */
export function assertLocalExternalPath({ inputPath, repoRoot, prefix }) {
  return assertExternalAbsolutePath({ inputPath, repoRoot, prefix });
}

/**
 * Produce a deterministic content tree for an externally staged Prisma
 * toolchain. Only regular files and real directories are allowed: the tree
 * deliberately rejects symlinks, devices, sockets, and an empty directory.
 */
export function hashExternalPrismaToolchain({ prismaToolchainPath, repoRoot, fileSystem = fs }) {
  const rootPath = assertExternalAbsolutePath({
    inputPath: prismaToolchainPath,
    repoRoot,
    prefix: "gate1_prisma_toolchain",
  });
  assertNoSymbolicLinkComponents(rootPath, fileSystem, "gate1_prisma_toolchain");
  const realRepositoryRoot = realPath(repoRoot, fileSystem, "gate1_prisma_toolchain");
  const realRootPath = realPath(rootPath, fileSystem, "gate1_prisma_toolchain");
  if (isSameOrDescendant(realRootPath, realRepositoryRoot)) {
    fail("gate1_prisma_toolchain_inside_checkout");
  }

  const initial = collectToolchainSnapshot(rootPath, fileSystem);
  if (initial.files.length === 0) {
    fail("gate1_prisma_toolchain_empty");
  }

  const files = initial.files.map((entry) => {
    const hashed = hashExternalRegularFile({
      inputPath: entry.absolutePath,
      repoRoot,
      fileSystem,
      prefix: "gate1_prisma_toolchain",
      maxBytes: MAX_PRISMA_TOOLCHAIN_FILE_BYTES,
    });
    if (!sameFileIdentity(entry.identity, hashed.identity)) {
      fail("gate1_prisma_toolchain_changed");
    }
    return {
      path: entry.relativePath,
      size: hashed.size,
      sha256: hashed.sha256,
    };
  });

  const final = collectToolchainSnapshot(rootPath, fileSystem);
  if (!sameToolchainSnapshot(initial, final)) {
    fail("gate1_prisma_toolchain_changed");
  }
  const treeDefinition = canonicalJson({
    schemaVersion: 1,
    kind: "doorstar-pilot-gate1-prisma-toolchain-tree",
    files,
  });
  return Object.freeze({
    treeSha256: sha256(treeDefinition),
    fileCount: files.length,
    totalBytes: initial.totalBytes,
  });
}

/** Shared protocol name for callers that need only the canonical v1 tree ID. */
export function calculatePrismaToolchainMerkleSha256(options) {
  return hashExternalPrismaToolchain(options).treeSha256;
}

/** Exported for tests and for a small, auditable regular-file boundary. */
export function hashExternalRegularFile({ inputPath, repoRoot, fileSystem = fs, prefix, maxBytes }) {
  const absolutePath = assertExternalAbsolutePath({ inputPath, repoRoot, prefix });
  assertNoSymbolicLinkComponents(absolutePath, fileSystem, prefix);
  const realRepositoryRoot = realPath(repoRoot, fileSystem, prefix);
  const realInputPath = realPath(absolutePath, fileSystem, prefix);
  if (isSameOrDescendant(realInputPath, realRepositoryRoot)) {
    fail(`${prefix}_inside_checkout`);
  }

  const before = readRegularFileStats(absolutePath, fileSystem, prefix, maxBytes);
  let descriptor;
  try {
    descriptor = fileSystem.openSync(absolutePath, "r");
    const opened = readOpenedRegularFileStats(descriptor, fileSystem, prefix, maxBytes);
    if (!sameFileIdentity(before, opened)) {
      fail(`${prefix}_file_changed`);
    }
    const contentSha256 = hashOpenedFile(descriptor, opened.size, fileSystem, prefix);
    assertNoSymbolicLinkComponents(absolutePath, fileSystem, prefix);
    const after = readRegularFileStats(absolutePath, fileSystem, prefix, maxBytes);
    if (!sameFileIdentity(opened, after)) {
      fail(`${prefix}_file_changed`);
    }
    return Object.freeze({ sha256: contentSha256, size: opened.size, identity: opened });
  } catch (error) {
    if (error instanceof Gate1Error) {
      throw error;
    }
    fail(`${prefix}_file_unavailable`);
  } finally {
    if (descriptor !== undefined) {
      try {
        fileSystem.closeSync(descriptor);
      } catch {
        // The result was already accepted or rejected without path details.
      }
    }
  }
}

function collectToolchainSnapshot(rootPath, fileSystem) {
  const rootIdentity = readDirectoryStats(rootPath, fileSystem);
  const directories = [{ relativePath: "", identity: rootIdentity }];
  const files = [];
  let totalBytes = 0;

  const visit = (directoryPath, relativeSegments, depth) => {
    if (depth > MAX_PRISMA_TOOLCHAIN_DEPTH) {
      fail("gate1_prisma_toolchain_depth_exceeded");
    }
    let names;
    try {
      names = fileSystem.readdirSync(directoryPath, { encoding: "utf8" });
    } catch (error) {
      if (error instanceof Gate1Error) throw error;
      fail("gate1_prisma_toolchain_unavailable");
    }
    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      fail("gate1_prisma_toolchain_unavailable");
    }
    const orderedNames = [...names].sort(compareUtf8);
    if (orderedNames.some((name, index) => index > 0 && name === orderedNames[index - 1])) {
      fail("gate1_prisma_toolchain_invalid");
    }
    for (const name of orderedNames) {
      assertSafeEntryName(name);
      const nextSegments = [...relativeSegments, name];
      const relativePath = nextSegments.join("/");
      if (Buffer.byteLength(relativePath, "utf8") > MAX_PRISMA_TOOLCHAIN_RELATIVE_PATH_BYTES) {
        fail("gate1_prisma_toolchain_path_too_long");
      }
      const childPath = path.join(directoryPath, name);
      const stats = readLstat(childPath, fileSystem, "gate1_prisma_toolchain");
      if (stats.isSymbolicLink()) {
        fail("gate1_prisma_toolchain_path_symlink");
      }
      if (stats.isDirectory()) {
        if (directories.length >= MAX_PRISMA_TOOLCHAIN_DIRECTORIES) {
          fail("gate1_prisma_toolchain_directory_limit_exceeded");
        }
        const identity = fileIdentity(stats);
        directories.push({ relativePath, identity });
        visit(childPath, nextSegments, depth + 1);
        continue;
      }
      if (!stats.isFile()) {
        fail("gate1_prisma_toolchain_file_invalid");
      }
      assertBoundedFileSize(stats.size, MAX_PRISMA_TOOLCHAIN_FILE_BYTES, "gate1_prisma_toolchain");
      if (files.length >= MAX_PRISMA_TOOLCHAIN_FILES) {
        fail("gate1_prisma_toolchain_file_limit_exceeded");
      }
      if (totalBytes > MAX_PRISMA_TOOLCHAIN_TOTAL_BYTES - stats.size) {
        fail("gate1_prisma_toolchain_total_oversize");
      }
      totalBytes += stats.size;
      files.push({
        absolutePath: childPath,
        relativePath,
        identity: fileIdentity(stats),
      });
    }
  };

  visit(rootPath, [], 0);
  files.sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
  directories.sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
  return Object.freeze({ rootIdentity, directories, files, totalBytes });
}

function sameToolchainSnapshot(left, right) {
  return sameFileIdentity(left.rootIdentity, right.rootIdentity)
    && left.totalBytes === right.totalBytes
    && sameSnapshotEntries(left.directories, right.directories)
    && sameSnapshotEntries(left.files, right.files);
}

function sameSnapshotEntries(left, right) {
  return left.length === right.length
    && left.every((entry, index) => entry.relativePath === right[index].relativePath
      && sameFileIdentity(entry.identity, right[index].identity));
}

function assertExternalAbsolutePath({ inputPath, repoRoot, prefix }) {
  if (typeof inputPath !== "string" || inputPath.length === 0 || inputPath.includes("\0") || !path.isAbsolute(inputPath)) {
    fail(`${prefix}_path_invalid`);
  }
  if (typeof repoRoot !== "string" || repoRoot.length === 0 || repoRoot.includes("\0") || !path.isAbsolute(repoRoot)) {
    fail(`${prefix}_repository_root_invalid`);
  }
  if (!isLocalFilesystemPath(inputPath) || !isLocalFilesystemPath(repoRoot)) {
    fail(`${prefix}_remote_path_forbidden`);
  }
  let absolutePath;
  let absoluteRepositoryRoot;
  try {
    absolutePath = path.resolve(inputPath);
    absoluteRepositoryRoot = path.resolve(repoRoot);
  } catch {
    fail(`${prefix}_path_invalid`);
  }
  if (isSameOrDescendant(absolutePath, absoluteRepositoryRoot)) {
    fail(`${prefix}_inside_checkout`);
  }
  return absolutePath;
}

function isLocalFilesystemPath(value) {
  const slashNormalized = value.replaceAll("\\", "/");
  if (
    slashNormalized.startsWith("//")
    || slashNormalized.startsWith("//?/")
    || (process.platform === "win32" && !/^[A-Za-z]:\//.test(slashNormalized))
    || (process.platform === "win32" && slashNormalized.slice(2).includes(":"))
  ) {
    return false;
  }
  if (process.platform !== "win32") return true;
  // Drive letters alone can name a mapped share. This remains a host-policy
  // boundary, not an OS drive-type attestation: constrain source-only runtime
  // inputs to the same boot-volume route as the host's trusted system root.
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (typeof systemRoot !== "string" || !/^[A-Za-z]:[\\/]/.test(systemRoot)) {
    return false;
  }
  return path.parse(path.resolve(value)).root.toLowerCase()
    === path.parse(path.resolve(systemRoot)).root.toLowerCase();
}

function assertNoSymbolicLinkComponents(absolutePath, fileSystem, prefix) {
  const parsed = path.parse(absolutePath);
  const relativePath = path.relative(parsed.root, absolutePath);
  const components = relativePath === "" ? [] : relativePath.split(path.sep);
  let currentPath = parsed.root;
  for (const component of components) {
    currentPath = path.join(currentPath, component);
    const stats = readLstat(currentPath, fileSystem, prefix);
    if (stats.isSymbolicLink()) {
      fail(`${prefix}_path_symlink`);
    }
  }
}

function readLstat(inputPath, fileSystem, prefix) {
  try {
    return fileSystem.lstatSync(inputPath);
  } catch {
    fail(`${prefix}_file_unavailable`);
  }
}

function realPath(inputPath, fileSystem, prefix) {
  try {
    if (typeof fileSystem.realpathSync?.native === "function") {
      return fileSystem.realpathSync.native(inputPath);
    }
    return fileSystem.realpathSync(inputPath);
  } catch {
    fail(`${prefix}_file_unavailable`);
  }
}

function readRegularFileStats(inputPath, fileSystem, prefix, maxBytes) {
  const stats = readLstat(inputPath, fileSystem, prefix);
  if (stats.isSymbolicLink()) {
    fail(`${prefix}_path_symlink`);
  }
  if (!stats.isFile()) {
    fail(`${prefix}_file_invalid`);
  }
  if (!Number.isSafeInteger(stats.nlink) || stats.nlink !== 1) {
    fail(`${prefix}_file_invalid`);
  }
  assertBoundedFileSize(stats.size, maxBytes, prefix);
  return fileIdentity(stats);
}

function readOpenedRegularFileStats(descriptor, fileSystem, prefix, maxBytes) {
  let stats;
  try {
    stats = fileSystem.fstatSync(descriptor);
  } catch {
    fail(`${prefix}_file_unavailable`);
  }
  if (!stats.isFile()) {
    fail(`${prefix}_file_invalid`);
  }
  if (!Number.isSafeInteger(stats.nlink) || stats.nlink !== 1) {
    fail(`${prefix}_file_invalid`);
  }
  assertBoundedFileSize(stats.size, maxBytes, prefix);
  return fileIdentity(stats);
}

function readDirectoryStats(inputPath, fileSystem) {
  const stats = readLstat(inputPath, fileSystem, "gate1_prisma_toolchain");
  if (stats.isSymbolicLink()) {
    fail("gate1_prisma_toolchain_path_symlink");
  }
  if (!stats.isDirectory()) {
    fail("gate1_prisma_toolchain_directory_invalid");
  }
  return fileIdentity(stats);
}

function assertBoundedFileSize(size, maximum, prefix) {
  if (!Number.isSafeInteger(size) || size < 0) {
    fail(`${prefix}_file_invalid`);
  }
  if (size > maximum) {
    fail(`${prefix}_file_oversize`);
  }
}

function hashOpenedFile(descriptor, size, fileSystem, prefix) {
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(64 * 1024);
  let remaining = size;
  try {
    while (remaining > 0) {
      const bytesRead = fileSystem.readSync(descriptor, buffer, 0, Math.min(buffer.length, remaining), null);
      if (!Number.isSafeInteger(bytesRead) || bytesRead <= 0 || bytesRead > remaining) {
        fail(`${prefix}_file_changed`);
      }
      hash.update(buffer.subarray(0, bytesRead));
      remaining -= bytesRead;
    }
  } catch (error) {
    if (error instanceof Gate1Error) throw error;
    fail(`${prefix}_file_unavailable`);
  }
  return hash.digest("hex");
}

function fileIdentity(stats) {
  return Object.freeze({
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mode: stats.mode,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  });
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mode === right.mode
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function assertSafeEntryName(name) {
  if (name.length === 0 || name === "." || name === ".."
    || name.includes("\0") || name.includes("/") || name.includes("\\")) {
    fail("gate1_prisma_toolchain_invalid");
  }
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isSameOrDescendant(candidatePath, parentPath) {
  const comparableCandidatePath = normalizeFilesystemPath(candidatePath);
  const comparableParentPath = normalizeFilesystemPath(parentPath);
  const relativePath = path.relative(comparableParentPath, comparableCandidatePath);
  return relativePath === ""
    || (!relativePath.startsWith(`..${path.sep}`)
      && relativePath !== ".."
      && !path.isAbsolute(relativePath));
}

function normalizeFilesystemPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
