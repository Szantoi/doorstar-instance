import * as fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { Gate0Error, fail } from "./errors.mjs";

/** Evidence is intentionally small, structured and free of command output. */
export const MAX_EXTERNAL_EVIDENCE_BYTES = 64 * 1024;

/**
 * Read a canonical evidence artifact only when it is an external, regular,
 * bounded file reached through no symbolic-link component. The repeated stat
 * checks make an observed replacement or growth fail closed.
 */
export function readExternalEvidenceFile({ evidencePath, repoRoot, fileSystem = fs }) {
  const absoluteEvidencePath = resolveAbsolutePath(evidencePath);
  const absoluteRepositoryRoot = resolveAbsolutePath(repoRoot);
  if (isSameOrDescendant(absoluteEvidencePath, absoluteRepositoryRoot)) {
    fail("gate0_evidence_inside_checkout");
  }

  assertNoSymbolicLinkComponents(absoluteEvidencePath, fileSystem);
  const realRepositoryRoot = realPath(absoluteRepositoryRoot, fileSystem);
  const realEvidencePath = realPath(absoluteEvidencePath, fileSystem);
  if (isSameOrDescendant(realEvidencePath, realRepositoryRoot)) {
    fail("gate0_evidence_inside_checkout");
  }

  const before = readRegularBoundedStat(absoluteEvidencePath, fileSystem);
  let descriptor;
  try {
    descriptor = fileSystem.openSync(absoluteEvidencePath, "r");
    const opened = readOpenedRegularBoundedStat(descriptor, fileSystem);
    if (!sameFileIdentity(before, opened)) {
      fail("gate0_evidence_file_changed");
    }
    const bytes = readBoundedBytes(descriptor, opened.size, fileSystem);
    const after = readRegularBoundedStat(absoluteEvidencePath, fileSystem);
    if (!sameFileIdentity(opened, after) || bytes.length !== opened.size) {
      fail("gate0_evidence_file_changed");
    }
    return decodeStrictUtf8(bytes);
  } catch (error) {
    if (error instanceof Gate0Error) {
      throw error;
    }
    fail("gate0_evidence_file_unavailable");
  } finally {
    if (descriptor !== undefined) {
      try {
        fileSystem.closeSync(descriptor);
      } catch {
        // The evidence was already read or rejected; never expose host detail.
      }
    }
  }
}

function resolveAbsolutePath(value) {
  if (typeof value !== "string" || !value || !path.isAbsolute(value) || value.includes("\0")) {
    fail("gate0_evidence_path_invalid");
  }
  const slashNormalized = value.replaceAll("\\", "/");
  if (
    slashNormalized.startsWith("//")
    || slashNormalized.startsWith("//?/")
    || (process.platform === "win32" && !/^[A-Za-z]:\//.test(slashNormalized))
  ) {
    fail("gate0_evidence_path_not_local");
  }
  // `C:` is the drive designator; every later colon is an NTFS alternate data
  // stream selector and must not be accepted as an evidence artifact path.
  if (process.platform === "win32" && slashNormalized.slice(2).includes(":")) {
    fail("gate0_evidence_path_not_local");
  }
  try {
    const resolved = path.resolve(value);
    assertWindowsSystemVolume(resolved);
    return resolved;
  } catch (error) {
    if (error instanceof Gate0Error) throw error;
    fail("gate0_evidence_path_invalid");
  }
}

/**
 * On Windows the source-only verifier accepts evidence only from the same
 * volume as the OS system root. This deliberately rejects UNC/device paths
 * and mapped shares (which could otherwise look like a drive-letter path).
 * A privileged remote approval store needs an explicit future adapter rather
 * than being silently treated as a local regular file. The host-provided
 * SystemRoot/WINDIR value and underlying filesystem type remain explicit
 * trusted-host prerequisites; this is not OS-level drive attestation.
 */
function assertWindowsSystemVolume(absolutePath) {
  if (process.platform !== "win32") return;
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (typeof systemRoot !== "string" || !path.isAbsolute(systemRoot)) {
    fail("gate0_evidence_host_root_unavailable");
  }
  const evidenceVolume = path.parse(absolutePath).root.toLowerCase();
  const systemVolume = path.parse(path.resolve(systemRoot)).root.toLowerCase();
  if (!evidenceVolume || evidenceVolume !== systemVolume) {
    fail("gate0_evidence_path_not_local");
  }
}

function assertNoSymbolicLinkComponents(absolutePath, fileSystem) {
  const parsed = path.parse(absolutePath);
  const relativePath = path.relative(parsed.root, absolutePath);
  const components = relativePath === "" ? [] : relativePath.split(path.sep);
  let currentPath = parsed.root;
  for (const component of components) {
    currentPath = path.join(currentPath, component);
    let stats;
    try {
      stats = fileSystem.lstatSync(currentPath);
    } catch {
      fail("gate0_evidence_file_unavailable");
    }
    if (stats.isSymbolicLink()) {
      fail("gate0_evidence_path_symlink");
    }
  }
}

function realPath(absolutePath, fileSystem) {
  try {
    if (typeof fileSystem.realpathSync.native === "function") {
      return fileSystem.realpathSync.native(absolutePath);
    }
    return fileSystem.realpathSync(absolutePath);
  } catch {
    fail("gate0_evidence_file_unavailable");
  }
}

function readRegularBoundedStat(absolutePath, fileSystem) {
  let stats;
  try {
    stats = fileSystem.lstatSync(absolutePath);
  } catch {
    fail("gate0_evidence_file_unavailable");
  }
  if (stats.isSymbolicLink()) {
    fail("gate0_evidence_path_symlink");
  }
  assertRegularBoundedStats(stats);
  return stats;
}

function readOpenedRegularBoundedStat(descriptor, fileSystem) {
  let stats;
  try {
    stats = fileSystem.fstatSync(descriptor);
  } catch {
    fail("gate0_evidence_file_unavailable");
  }
  assertRegularBoundedStats(stats);
  return stats;
}

function assertRegularBoundedStats(stats) {
  if (!stats.isFile()) {
    fail("gate0_evidence_file_invalid");
  }
  // A hard link can make an apparently external evidence path alias mutable
  // checkout content. Gate 0 accepts only a single-link artifact file.
  if (!Number.isSafeInteger(stats.nlink) || stats.nlink !== 1) {
    fail("gate0_evidence_file_invalid");
  }
  if (!Number.isSafeInteger(stats.size) || stats.size < 0) {
    fail("gate0_evidence_file_invalid");
  }
  if (stats.size > MAX_EXTERNAL_EVIDENCE_BYTES) {
    fail("gate0_evidence_file_oversize");
  }
}

function readBoundedBytes(descriptor, size, fileSystem) {
  const buffer = Buffer.alloc(size + 1);
  let offset = 0;
  while (offset < buffer.length) {
    let bytesRead;
    try {
      bytesRead = fileSystem.readSync(descriptor, buffer, offset, buffer.length - offset, null);
    } catch {
      fail("gate0_evidence_file_unavailable");
    }
    if (!Number.isSafeInteger(bytesRead) || bytesRead < 0) {
      fail("gate0_evidence_file_unavailable");
    }
    if (bytesRead === 0) {
      break;
    }
    offset += bytesRead;
  }
  if (offset !== size) {
    fail("gate0_evidence_file_changed");
  }
  return buffer.subarray(0, offset);
}

function decodeStrictUtf8(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      fail("gate0_evidence_encoding_invalid");
    }
    return text;
  } catch (error) {
    if (error instanceof Gate0Error) {
      throw error;
    }
    fail("gate0_evidence_encoding_invalid");
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mode === right.mode
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
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
