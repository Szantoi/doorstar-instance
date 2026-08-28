import { lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { A03ProofError } from "./a03Config.js";

export type TrustedLocalTemporaryRoot = Readonly<{
  path: string;
  realPath: string;
  identity: Readonly<{
    device: number;
    inode: number;
  }>;
}>;

/**
 * Obtain the host's local temporary root without accepting a UNC, Windows
 * device path, symlink/junction route, or a non-directory. The OS temporary
 * volume itself remains a documented trusted-host prerequisite; this helper
 * removes avoidable environment-selected remote or redirected paths.
 */
export function requireTrustedLocalTemporaryRoot(failureCode: string): string {
  return captureTrustedLocalTemporaryRoot(failureCode).realPath;
}

/**
 * Capture the temporary parent directory's physical identity for a generated
 * child. Callers must recheck this immediately before and after `mkdtemp`, and
 * again before they trust or remove a generated child.
 */
export function captureTrustedLocalTemporaryRoot(failureCode: string): TrustedLocalTemporaryRoot {
  const configuredRoot = tmpdir();
  const resolvedRoot = requireLocalFilesystemPath(configuredRoot, failureCode);
  try {
    const before = lstatSync(resolvedRoot);
    const realRoot = realpathSync.native(resolvedRoot);
    const after = lstatSync(resolvedRoot);
    if (
      before.isSymbolicLink()
      || !before.isDirectory()
      || after.isSymbolicLink()
      || !after.isDirectory()
      || !sameDirectoryIdentity(before, after)
      || !sameFilesystemPath(resolvedRoot, realRoot)
    ) {
      throw new Error("temporary-root-not-local-directory");
    }
    assertWindowsSystemVolume(realRoot);
    return Object.freeze({
      path: resolvedRoot,
      realPath: realRoot,
      identity: Object.freeze({ device: before.dev, inode: before.ino }),
    });
  } catch {
    throw new A03ProofError(failureCode);
  }
}

/** Re-identify a captured temp parent before any child-sensitive operation. */
export function assertTrustedLocalTemporaryRoot(
  temporaryRoot: TrustedLocalTemporaryRoot,
  failureCode: string,
): void {
  try {
    const resolvedPath = requireLocalFilesystemPath(temporaryRoot?.path, failureCode);
    const before = lstatSync(resolvedPath);
    const realPath = realpathSync.native(resolvedPath);
    const after = lstatSync(resolvedPath);
    if (
      before.isSymbolicLink()
      || !before.isDirectory()
      || after.isSymbolicLink()
      || !after.isDirectory()
      || !sameDirectoryIdentity(before, after)
      || before.dev !== temporaryRoot.identity.device
      || before.ino !== temporaryRoot.identity.inode
      || !sameFilesystemPath(resolvedPath, temporaryRoot.path)
      || !sameFilesystemPath(realPath, temporaryRoot.realPath)
      || !sameFilesystemPath(resolvedPath, realPath)
    ) {
      throw new Error("temporary-root-identity-changed");
    }
    assertWindowsSystemVolume(realPath);
  } catch {
    throw new A03ProofError(failureCode);
  }
}

/** Exported pure path gate for focused UNC/device-path regression coverage. */
export function requireLocalFilesystemPath(value: unknown, failureCode: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    throw new A03ProofError(failureCode);
  }
  const slashNormalized = value.replaceAll("\\", "/");
  if (
    slashNormalized.startsWith("//")
    || slashNormalized.startsWith("//?/")
    || (process.platform === "win32" && !/^[A-Za-z]:\//.test(slashNormalized))
  ) {
    throw new A03ProofError(failureCode);
  }
  if (process.platform === "win32" && slashNormalized.slice(2).includes(":")) {
    throw new A03ProofError(failureCode);
  }
  return resolve(value);
}

/** Backwards-compatible semantic alias for callers/tests that validate a temp root. */
export const requireLocalTemporaryRootPath = requireLocalFilesystemPath;

function sameFilesystemPath(left: string, right: string): boolean {
  const normalize = (path: string): string => {
    const normalized = resolve(path).replaceAll("\\", "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}

function sameDirectoryIdentity(
  left: Readonly<{ dev: number; ino: number }>,
  right: Readonly<{ dev: number; ino: number }>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/**
 * Windows mapped network shares can use a drive-letter syntax. The disposable
 * proof supports Windows-native engines, so its generated private directories
 * are deliberately restricted to the OS system volume rather than treating
 * any drive letter as a trusted local filesystem.
 */
function assertWindowsSystemVolume(path: string): void {
  if (process.platform !== "win32") return;
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  const resolvedSystemRoot = requireLocalFilesystemPath(systemRoot, "a03_trusted_temp_host_root_invalid");
  const rootVolume = resolve(path).slice(0, 3).toLowerCase();
  const systemVolume = resolve(resolvedSystemRoot).slice(0, 3).toLowerCase();
  if (!/^[a-z]:\\?$/i.test(rootVolume) || rootVolume !== systemVolume) {
    throw new Error("temporary-root-not-system-volume");
  }
}
