import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, open, readdir, realpath, rm, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { A03ProofError } from "./a03Config.js";
import {
  requireLocalFilesystemPath,
  assertTrustedLocalTemporaryRoot,
  captureTrustedLocalTemporaryRoot,
  type TrustedLocalTemporaryRoot,
} from "./trustedLocalTempRoot.js";

const snapshotPrefix = "doorstar-a03-prisma-toolchain-";
const childTempPrefix = "doorstar-a03-prisma-child-temp-";
const prismaCliRelativePath = "prisma/build/index.js";
const prismaPackageManifestRelativePath = "prisma/package.json";
const prismaLauncherFilename = "doorstar-prisma-launcher.cjs";
const checkoutRootPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const prismaManifestMaximumBytes = 64 * 1024;
const prismaLauncherMaximumResolvedPathBytes = 4_096;
const prismaLauncherMaximumResolvedPathSegments = 256;

/**
 * These bounds intentionally cover a reviewed Prisma-only node_modules tree,
 * not a general application dependency directory. Keeping them public lets
 * the independent source verifier apply the same acceptance envelope.
 */
export const prismaToolchainSnapshotLimits = Object.freeze({
  maxFiles: 20_000,
  maxDirectories: 10_000,
  maxDepth: 64,
  maxRelativePathBytes: 4_096,
  maxFileBytes: 128 * 1024 * 1024,
  maxTotalFileBytes: 512 * 1024 * 1024,
});

export type PrismaToolchainSnapshotInput = Readonly<{
  /** Absolute external directory containing `prisma/build/index.js`. */
  sourceRootPath: string;
  /** V1 Merkle SHA-256 supplied by the independently reviewed verifier. */
  expectedTreeSha256: string;
}>;

/**
 * A private copy of a verified Prisma node_modules tree. `rootPath` is the
 * generated snapshot directory, never the external evidence/source path.
 */
export type PrismaToolchainSnapshot = Readonly<{
  rootPath: string;
  prismaCliPath: string;
  /** Fixed trusted launcher that rejects module resolution outside node_modules. */
  prismaLauncherPath: string;
  /** Private generated directory for Prisma child TEMP/TMP only. */
  childTempPath: string;
  treeSha256: string;
  verifyIntegrity: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

type TreeFile = Readonly<{
  relativePath: string;
  byteLength: number;
  contentSha256: string;
  identity: FileIdentity;
}>;

type ToolchainTree = Readonly<{
  treeSha256: string;
  directories: readonly string[];
  files: readonly TreeFile[];
}>;

type FileIdentity = Readonly<{
  device: number;
  inode: number;
  byteLength: number;
  mode: number;
  modifiedMilliseconds: number;
  changedMilliseconds: number;
}>;

type GeneratedSnapshotRoot = Readonly<{
  rootPath: string;
  temporaryRootPath: string;
  temporaryRoot: TrustedLocalTemporaryRoot;
  realRootPath: string;
  identity: DirectoryIdentity;
  prefix: string;
}>;

type SnapshotNodeModulesRoot = Readonly<{
  rootPath: string;
  realRootPath: string;
  identity: DirectoryIdentity;
}>;

type PrismaLauncherFile = Readonly<{
  path: string;
  identity: FileIdentity;
  byteLength: number;
  contentSha256: string;
}>;

type DirectoryIdentity = Readonly<{
  device: number;
  inode: number;
}>;

type TraversalFailureCodes = Readonly<{
  invalid: string;
  symlink: string;
  tooDeep: string;
  tooLarge: string;
  changed: string;
}>;

const sourceTraversalFailureCodes = Object.freeze({
  invalid: "a03_prisma_toolchain_source_invalid",
  symlink: "a03_prisma_toolchain_source_symlink_forbidden",
  tooDeep: "a03_prisma_toolchain_source_tree_depth_exceeded",
  tooLarge: "a03_prisma_toolchain_source_tree_oversized",
  changed: "a03_prisma_toolchain_source_changed",
});

const snapshotTraversalFailureCodes = Object.freeze({
  invalid: "a03_prisma_toolchain_snapshot_integrity_invalid",
  symlink: "a03_prisma_toolchain_snapshot_integrity_invalid",
  tooDeep: "a03_prisma_toolchain_snapshot_integrity_invalid",
  tooLarge: "a03_prisma_toolchain_snapshot_integrity_invalid",
  changed: "a03_prisma_toolchain_snapshot_integrity_invalid",
});

/**
 * Calculates the exact v1 Merkle SHA-256 that a verifier must place in the
 * Gate 1 input. It is intentionally read-only, requires an external absolute
 * tree and rejects every symlink, junction, special node and out-of-envelope
 * tree before returning a hash.
 *
 * V1 rule: file bytes are SHA-256 hashed and then serialized as canonical
 * UTF-8 JSON: recursively sorted object keys, two-space indentation, trailing
 * LF, and a UTF-8-bytewise path-sorted `files` array. The value is exactly
 * `{schemaVersion:1,kind:"doorstar-pilot-gate1-prisma-toolchain-tree",files:
 * [{path,size,sha256}]}` before the canonical JSON serializer runs.
 */
export async function calculatePrismaToolchainMerkleSha256(sourceRootPath: string): Promise<string> {
  const externalSourceRoot = await requireExternalSourceRoot(sourceRootPath);
  const tree = await readToolchainTree(externalSourceRoot, sourceTraversalFailureCodes);
  return tree.treeSha256;
}

/**
 * Copies an independently verified external Prisma toolchain into a private
 * generated directory. Both the source and the completed snapshot must equal
 * the supplied Merkle digest; a future Prisma process must call
 * `verifyIntegrity()` immediately before it uses `prismaCliPath`.
 */
export async function createPrismaToolchainSnapshot(
  input: PrismaToolchainSnapshotInput,
): Promise<PrismaToolchainSnapshot> {
  const expectedTreeSha256 = requireExpectedTreeSha256(input?.expectedTreeSha256);
  const externalSourceRoot = await requireExternalSourceRoot(input?.sourceRootPath);
  const initialSourceTree = await readToolchainTree(externalSourceRoot, sourceTraversalFailureCodes);
  await requirePrismaCliCjsEntrypoint(
    externalSourceRoot,
    initialSourceTree,
    sourceTraversalFailureCodes,
    "a03_prisma_toolchain_entrypoint_invalid",
    "a03_prisma_toolchain_cli_cjs_required",
  );
  if (initialSourceTree.treeSha256 !== expectedTreeSha256) {
    throw new A03ProofError("a03_prisma_toolchain_source_tree_hash_mismatch");
  }

  let snapshotRoot: GeneratedSnapshotRoot | undefined;
  let childTempRoot: GeneratedSnapshotRoot | undefined;
  try {
    snapshotRoot = await createPrivateSnapshotRoot();
    const nodeModulesRoot = await createPrivateNodeModulesRoot(snapshotRoot);
    await copySourceTreeToSnapshot(externalSourceRoot, initialSourceTree, nodeModulesRoot.rootPath);
    const launcher = await writePrismaLauncher(snapshotRoot, nodeModulesRoot);

    // A source swap during the copy is never silently accepted. Rebuilding the
    // Merkle tree also detects added/deleted nodes, not only changed bytes.
    const finalSourceTree = await readToolchainTree(externalSourceRoot, sourceTraversalFailureCodes);
    await requirePrismaCliCjsEntrypoint(
      externalSourceRoot,
      finalSourceTree,
      sourceTraversalFailureCodes,
      "a03_prisma_toolchain_entrypoint_invalid",
      "a03_prisma_toolchain_cli_cjs_required",
    );
    if (!sameDirectoryLayout(initialSourceTree, finalSourceTree) || finalSourceTree.treeSha256 !== expectedTreeSha256) {
      throw new A03ProofError("a03_prisma_toolchain_source_tree_changed");
    }

    const snapshotTree = await readToolchainTree(nodeModulesRoot.rootPath, snapshotTraversalFailureCodes);
    await requirePrismaCliCjsEntrypoint(
      nodeModulesRoot.rootPath,
      snapshotTree,
      snapshotTraversalFailureCodes,
      "a03_prisma_toolchain_snapshot_integrity_invalid",
      "a03_prisma_toolchain_snapshot_integrity_invalid",
    );
    if (!sameDirectoryLayout(initialSourceTree, snapshotTree) || snapshotTree.treeSha256 !== expectedTreeSha256) {
      throw new A03ProofError("a03_prisma_toolchain_snapshot_integrity_invalid");
    }

    childTempRoot = await createPrivateChildTempRoot();
    return createSnapshotHandle(
      snapshotRoot,
      childTempRoot,
      nodeModulesRoot,
      expectedTreeSha256,
      initialSourceTree.directories,
      launcher,
    );
  } catch (error) {
    const generatedRoots = [childTempRoot, snapshotRoot].filter((root): root is GeneratedSnapshotRoot => root !== undefined);
    if (generatedRoots.length > 0) {
      try {
        await removeGeneratedRoots(generatedRoots);
      } catch {
        throw new A03ProofError("a03_prisma_toolchain_snapshot_cleanup_failed");
      }
    }
    if (error instanceof A03ProofError) throw error;
    throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
  }
}

function createSnapshotHandle(
  snapshotRoot: GeneratedSnapshotRoot,
  childTempRoot: GeneratedSnapshotRoot,
  nodeModulesRoot: SnapshotNodeModulesRoot,
  expectedTreeSha256: string,
  expectedDirectories: readonly string[],
  launcher: PrismaLauncherFile,
): PrismaToolchainSnapshot {
  let disposed = false;
  let snapshotRootDisposed = false;
  let childTempRootDisposed = false;
  const verifyIntegrity = async (): Promise<void> => {
    if (disposed) throw new A03ProofError("a03_prisma_toolchain_snapshot_disposed");
    await assertGeneratedPrivateDirectory(snapshotRoot, "a03_prisma_toolchain_snapshot_integrity_invalid");
    await assertGeneratedPrivateDirectory(childTempRoot, "a03_prisma_toolchain_snapshot_integrity_invalid");
    await assertPrivateNodeModulesRoot(
      snapshotRoot,
      nodeModulesRoot,
      "a03_prisma_toolchain_snapshot_integrity_invalid",
    );
    const tree = await readToolchainTree(nodeModulesRoot.rootPath, snapshotTraversalFailureCodes);
    await requirePrismaCliCjsEntrypoint(
      nodeModulesRoot.rootPath,
      tree,
      snapshotTraversalFailureCodes,
      "a03_prisma_toolchain_snapshot_integrity_invalid",
      "a03_prisma_toolchain_snapshot_integrity_invalid",
    );
    if (!sameDirectoryPaths(tree.directories, expectedDirectories) || tree.treeSha256 !== expectedTreeSha256) {
      throw new A03ProofError("a03_prisma_toolchain_snapshot_integrity_invalid");
    }
    await assertPrismaLauncherIntegrity(launcher, "a03_prisma_toolchain_snapshot_integrity_invalid");
  };
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    let cleanupFailed = false;
    if (!childTempRootDisposed) {
      try {
        await removeGeneratedPrivateDirectory(childTempRoot);
        childTempRootDisposed = true;
      } catch {
        cleanupFailed = true;
      }
    }
    if (!snapshotRootDisposed) {
      try {
        await removeGeneratedPrivateDirectory(snapshotRoot);
        snapshotRootDisposed = true;
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) throw new A03ProofError("a03_prisma_toolchain_snapshot_cleanup_failed");
    disposed = true;
  };
  return Object.freeze({
    rootPath: snapshotRoot.rootPath,
    prismaCliPath: join(nodeModulesRoot.rootPath, "prisma", "build", "index.js"),
    prismaLauncherPath: launcher.path,
    childTempPath: childTempRoot.rootPath,
    treeSha256: expectedTreeSha256,
    verifyIntegrity,
    dispose,
  });
}

async function requireExternalSourceRoot(sourceRootPath: unknown): Promise<string> {
  const resolvedSourceRoot = requireLocalFilesystemPath(sourceRootPath, "a03_prisma_toolchain_input_invalid");
  if (pathsOverlap(resolvedSourceRoot, checkoutRootPath)) {
    throw new A03ProofError("a03_prisma_toolchain_source_inside_checkout");
  }

  let realSourceRoot: string;
  let realCheckoutRoot: string;
  let sourceMetadata: Stats;
  try {
    [realSourceRoot, realCheckoutRoot, sourceMetadata] = await Promise.all([
      realpath(resolvedSourceRoot),
      realpath(checkoutRootPath),
      lstat(resolvedSourceRoot),
    ]);
  } catch {
    throw new A03ProofError("a03_prisma_toolchain_source_invalid");
  }
  if (pathsOverlap(realSourceRoot, realCheckoutRoot)) {
    throw new A03ProofError("a03_prisma_toolchain_source_inside_checkout");
  }
  // A source route through an ancestor symlink/junction is rejected too: the
  // proof must receive one physical, independently reviewed external tree.
  if (!sameFilesystemPath(resolvedSourceRoot, realSourceRoot) || sourceMetadata.isSymbolicLink()) {
    throw new A03ProofError("a03_prisma_toolchain_source_symlink_forbidden");
  }
  if (!sourceMetadata.isDirectory()) throw new A03ProofError("a03_prisma_toolchain_source_invalid");
  return resolvedSourceRoot;
}

function requireExpectedTreeSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new A03ProofError("a03_prisma_toolchain_input_invalid");
  }
  return value.toLowerCase();
}

async function readToolchainTree(
  rootPath: string,
  failureCodes: TraversalFailureCodes,
): Promise<ToolchainTree> {
  const budget = new TraversalBudget();
  const files: TreeFile[] = [];
  const directories: string[] = [];
  try {
    const rootMetadata = await lstat(rootPath);
    assertDirectory(rootMetadata, failureCodes);
    await visitDirectory(rootPath, "", 0, budget, files, directories, failureCodes);
    const orderedFiles = [...files].sort((left, right) => compareCanonicalPath(left.relativePath, right.relativePath));
    return Object.freeze({
      treeSha256: calculateToolchainTreeSha256(orderedFiles),
      directories: Object.freeze([...directories].sort(compareCanonicalPath)),
      files: Object.freeze(orderedFiles),
    });
  } catch (error) {
    if (error instanceof A03ProofError) throw error;
    throw new A03ProofError(failureCodes.invalid);
  }
}

async function visitDirectory(
  directoryPath: string,
  relativeDirectoryPath: string,
  depth: number,
  budget: TraversalBudget,
  files: TreeFile[],
  directories: string[],
  failureCodes: TraversalFailureCodes,
): Promise<void> {
  if (depth > prismaToolchainSnapshotLimits.maxDepth) {
    throw new A03ProofError(failureCodes.tooDeep);
  }
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const canonicalEntries = entries
    .map((entry) => ({ name: requireSafeEntryName(entry.name, failureCodes) }))
    .sort((left, right) => compareCanonicalPath(left.name, right.name));
  if (canonicalEntries.some((entry, index) => index > 0 && entry.name === canonicalEntries[index - 1]?.name)) {
    throw new A03ProofError(failureCodes.invalid);
  }

  for (const { name } of canonicalEntries) {
    const relativePath = relativeDirectoryPath.length === 0 ? name : `${relativeDirectoryPath}/${name}`;
    if (Buffer.byteLength(relativePath, "utf8") > prismaToolchainSnapshotLimits.maxRelativePathBytes) {
      throw new A03ProofError(failureCodes.tooLarge);
    }
    const childPath = resolveTreeChild(directoryPath, name, failureCodes);
    const metadata = await lstat(childPath);
    if (metadata.isSymbolicLink()) throw new A03ProofError(failureCodes.symlink);
    if (metadata.isDirectory()) {
      if (depth + 1 > prismaToolchainSnapshotLimits.maxDepth) {
        throw new A03ProofError(failureCodes.tooDeep);
      }
      budget.consumeDirectory(failureCodes);
      directories.push(relativePath);
      await visitDirectory(
        childPath,
        relativePath,
        depth + 1,
        budget,
        files,
        directories,
        failureCodes,
      );
      continue;
    }
    if (!metadata.isFile()) throw new A03ProofError(failureCodes.invalid);
    budget.consumeFile(failureCodes);
    const stableFile = await readStableRegularFile(childPath, metadata, failureCodes);
    budget.consumeFileBytes(stableFile.contents.byteLength, failureCodes);
    files.push(Object.freeze({
      relativePath,
      byteLength: stableFile.contents.byteLength,
      contentSha256: stableFile.contentSha256,
      identity: createFileIdentity(stableFile.metadata),
    }));
  }
}

async function readStableRegularFile(
  path: string,
  initialMetadata: Stats,
  failureCodes: TraversalFailureCodes,
): Promise<Readonly<{ contents: Buffer; contentSha256: string; metadata: Stats }>> {
  if (initialMetadata.isSymbolicLink() || !initialMetadata.isFile()) {
    throw new A03ProofError(initialMetadata.isSymbolicLink() ? failureCodes.symlink : failureCodes.invalid);
  }
  if (initialMetadata.size > prismaToolchainSnapshotLimits.maxFileBytes) {
    throw new A03ProofError(failureCodes.tooLarge);
  }
  let handle: FileHandle | undefined;
  let contents: Buffer;
  let openedMetadata: Stats;
  let finalDescriptorMetadata: Stats;
  let finalPathMetadata: Stats;
  try {
    handle = await open(path, "r");
    openedMetadata = await handle.stat();
    if (
      !openedMetadata.isFile()
      || !sameFileIdentity(createFileIdentity(initialMetadata), createFileIdentity(openedMetadata))
    ) {
      throw new A03ProofError(failureCodes.changed);
    }
    contents = await handle.readFile();
    finalDescriptorMetadata = await handle.stat();
    finalPathMetadata = await lstat(path);
  } catch (error) {
    if (error instanceof A03ProofError) throw error;
    throw new A03ProofError(failureCodes.changed);
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        // The descriptor has no authority beyond this private read. A read
        // result is accepted only after all metadata comparisons below.
      }
    }
  }
  if (
    finalPathMetadata.isSymbolicLink()
    || !finalPathMetadata.isFile()
    || !sameFileIdentity(createFileIdentity(initialMetadata), createFileIdentity(finalDescriptorMetadata))
    || !sameFileIdentity(createFileIdentity(initialMetadata), createFileIdentity(finalPathMetadata))
    || contents.byteLength !== initialMetadata.size
  ) {
    throw new A03ProofError(finalPathMetadata.isSymbolicLink() ? failureCodes.symlink : failureCodes.changed);
  }
  return Object.freeze({
    contents,
    contentSha256: createHash("sha256").update(contents).digest("hex"),
    metadata: finalDescriptorMetadata,
  });
}

async function copySourceTreeToSnapshot(
  sourceRootPath: string,
  sourceTree: ToolchainTree,
  snapshotRootPath: string,
): Promise<void> {
  const orderedDirectories = [...sourceTree.directories].sort((left, right) => (
    depthOfRelativePath(left) - depthOfRelativePath(right) || compareCanonicalPath(left, right)
  ));
  for (const directory of orderedDirectories) {
    const destination = resolveRelativeSnapshotPath(snapshotRootPath, directory);
    await mkdir(destination, { mode: 0o700 });
    await chmod(destination, 0o700);
    const metadata = await lstat(destination);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
    }
  }

  for (const expectedFile of sourceTree.files) {
    const sourcePath = resolveRelativeSnapshotPath(sourceRootPath, expectedFile.relativePath);
    const sourceMetadata = await lstat(sourcePath).catch(() => undefined);
    if (sourceMetadata === undefined || sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) {
      throw new A03ProofError("a03_prisma_toolchain_source_changed");
    }
    const stableFile = await readStableRegularFile(sourcePath, sourceMetadata, sourceTraversalFailureCodes);
    if (
      !sameFileIdentity(expectedFile.identity, createFileIdentity(stableFile.metadata))
      || stableFile.contents.byteLength !== expectedFile.byteLength
      || stableFile.contentSha256 !== expectedFile.contentSha256
    ) {
      throw new A03ProofError("a03_prisma_toolchain_source_changed");
    }

    const destination = resolveRelativeSnapshotPath(snapshotRootPath, expectedFile.relativePath);
    await writeFile(destination, stableFile.contents, { flag: "wx", mode: 0o600 });
    await chmod(destination, 0o600);
    const destinationMetadata = await lstat(destination);
    if (destinationMetadata.isSymbolicLink() || !destinationMetadata.isFile()) {
      throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
    }
  }
}

async function requirePrismaCliCjsEntrypoint(
  rootPath: string,
  tree: ToolchainTree,
  traversalFailureCodes: TraversalFailureCodes,
  entrypointFailureCode: string,
  moduleFormatFailureCode: string,
): Promise<void> {
  const requiredFiles = [
    prismaCliRelativePath,
    prismaPackageManifestRelativePath,
    "@prisma/engines/package.json",
    ...requiredPrismaEngineRelativePaths(),
  ];
  const filePaths = new Set(tree.files
    .filter((file) => file.byteLength > 0)
    .map((file) => file.relativePath));
  if (requiredFiles.some((requiredFile) => !filePaths.has(requiredFile))) {
    throw new A03ProofError(entrypointFailureCode);
  }

  const manifestFile = tree.files.find((file) => file.relativePath === prismaPackageManifestRelativePath);
  const cliFile = tree.files.find((file) => file.relativePath === prismaCliRelativePath);
  if (manifestFile === undefined || cliFile === undefined) {
    throw new A03ProofError(entrypointFailureCode);
  }
  if (manifestFile.byteLength > prismaManifestMaximumBytes) {
    throw new A03ProofError(moduleFormatFailureCode);
  }

  const manifestContents = await readVerifiedTreeFile(
    rootPath,
    manifestFile,
    traversalFailureCodes,
  );
  const cliContents = await readVerifiedTreeFile(rootPath, cliFile, traversalFailureCodes);
  const manifest = parsePrismaCjsManifest(manifestContents, moduleFormatFailureCode);
  if (manifest.type !== "commonjs") {
    throw new A03ProofError(moduleFormatFailureCode);
  }
  requireStaticCommonJsCliSource(cliContents, moduleFormatFailureCode);
}

async function readVerifiedTreeFile(
  rootPath: string,
  expectedFile: TreeFile,
  failureCodes: TraversalFailureCodes,
): Promise<Buffer> {
  const path = resolveTreeFilePath(rootPath, expectedFile.relativePath, failureCodes);
  const metadata = await lstat(path).catch(() => undefined);
  if (metadata === undefined || metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new A03ProofError(metadata?.isSymbolicLink() ? failureCodes.symlink : failureCodes.changed);
  }
  const stableFile = await readStableRegularFile(path, metadata, failureCodes);
  if (
    !sameFileIdentity(expectedFile.identity, createFileIdentity(stableFile.metadata))
    || stableFile.contents.byteLength !== expectedFile.byteLength
    || stableFile.contentSha256 !== expectedFile.contentSha256
  ) {
    throw new A03ProofError(failureCodes.changed);
  }
  return stableFile.contents;
}

function parsePrismaCjsManifest(contents: Buffer, failureCode: string): Readonly<{ type: string }> {
  const text = contents.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(contents)) {
    throw new A03ProofError(failureCode);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new A03ProofError(failureCode);
  }
  if (!isPlainObject(value) || typeof value.type !== "string") {
    throw new A03ProofError(failureCode);
  }
  return Object.freeze({ type: value.type });
}

/**
 * The harness only supports the reviewed CJS Prisma CLI entrypoint. A static
 * ESM declaration in `build/index.js` is rejected during snapshot creation,
 * before the future Prisma child is started. Dynamic `import()` remains code
 * inside the independently reviewed, Merkle-pinned toolchain; it is not a
 * general-purpose sandbox boundary and is never claimed to be one.
 */
function requireStaticCommonJsCliSource(contents: Buffer, failureCode: string): void {
  if (contents.byteLength > prismaToolchainSnapshotLimits.maxFileBytes) {
    throw new A03ProofError(failureCode);
  }
  const source = contents.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(contents)) {
    throw new A03ProofError(failureCode);
  }
  const cjsParserSource = source.startsWith("#!")
    ? source.replace(/^#![^\r\n]*(?:\r\n|\n|\r)?/, "")
    : source;
  try {
    // `Function` compiles only; it does not execute toolchain code. It rejects
    // static ESM imports/exports under the CJS grammar while preserving normal
    // CJS syntax accepted by Node's loader. Node strips one leading shebang
    // before compilation, so this preflight does the same.
    new Function(cjsParserSource);
  } catch {
    throw new A03ProofError(failureCode);
  }
}

/**
 * `migrate deploy` delegates to Prisma's schema engine. Only the supported
 * local proof host is admitted; an unknown platform is rejected before Prisma
 * can try its download fallback. The selected binary remains part of the
 * reviewed external Merkle tree and the private snapshot integrity check.
 */
function requiredPrismaEngineRelativePaths(): readonly string[] {
  if (process.platform === "win32" && process.arch === "x64") {
    return [
      "@prisma/engines/schema-engine-windows.exe",
      "@prisma/engines/query_engine-windows.dll.node",
    ];
  }
  throw new A03ProofError("a03_prisma_toolchain_host_platform_unsupported");
}

function sameDirectoryLayout(left: ToolchainTree, right: ToolchainTree): boolean {
  return sameDirectoryPaths(left.directories, right.directories);
}

function sameDirectoryPaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

async function createPrivateSnapshotRoot(): Promise<GeneratedSnapshotRoot> {
  return createPrivateGeneratedDirectory(snapshotPrefix);
}

async function createPrivateChildTempRoot(): Promise<GeneratedSnapshotRoot> {
  return createPrivateGeneratedDirectory(childTempPrefix);
}

/**
 * Preserve Node's dependency-resolution contract: a copied `prisma` package
 * must sit below a controlled `node_modules` ancestor, never beside it. The
 * Merkle tree intentionally remains rooted at this directory, so the extra
 * enclosing private directory and child temp directory cannot alter its hash.
 */
async function createPrivateNodeModulesRoot(
  snapshotRoot: GeneratedSnapshotRoot,
): Promise<SnapshotNodeModulesRoot> {
  const nodeModulesRootPath = join(snapshotRoot.rootPath, "node_modules");
  try {
    await assertGeneratedPrivateDirectory(snapshotRoot, "a03_prisma_toolchain_snapshot_create_failed");
    await mkdir(nodeModulesRootPath, { mode: 0o700 });
    await chmod(nodeModulesRootPath, 0o700);
    const metadata = await lstat(nodeModulesRootPath);
    const snapshotMetadata = await lstat(snapshotRoot.rootPath);
    const realSnapshotRootPath = await realpath(snapshotRoot.rootPath);
    const realNodeModulesRootPath = await realpath(nodeModulesRootPath);
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || !sameDirectoryIdentity(snapshotRoot.identity, snapshotMetadata)
      || !sameFilesystemPath(realSnapshotRootPath, snapshotRoot.realRootPath)
      || !isSameOrDescendant(realNodeModulesRootPath, realSnapshotRootPath)
      || sameFilesystemPath(realNodeModulesRootPath, realSnapshotRootPath)
      || !sameFilesystemPath(realNodeModulesRootPath, nodeModulesRootPath)
    ) {
      throw new Error("snapshot-node-modules-root-invalid");
    }
    return Object.freeze({
      rootPath: nodeModulesRootPath,
      realRootPath: realNodeModulesRootPath,
      identity: createDirectoryIdentity(metadata),
    });
  } catch {
    throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
  }
}

async function assertPrivateNodeModulesRoot(
  snapshotRoot: GeneratedSnapshotRoot,
  nodeModulesRoot: SnapshotNodeModulesRoot,
  failureCode: string,
): Promise<void> {
  try {
    if (
      !sameFilesystemPath(nodeModulesRoot.rootPath, join(snapshotRoot.rootPath, "node_modules"))
      || !isSameOrDescendant(nodeModulesRoot.rootPath, snapshotRoot.rootPath)
      || sameFilesystemPath(nodeModulesRoot.rootPath, snapshotRoot.rootPath)
    ) {
      throw new Error("snapshot-node-modules-root-route-invalid");
    }
    const [snapshotMetadata, nodeModulesMetadata, realSnapshotRootPath, realNodeModulesRootPath] = await Promise.all([
      lstat(snapshotRoot.rootPath),
      lstat(nodeModulesRoot.rootPath),
      realpath(snapshotRoot.rootPath),
      realpath(nodeModulesRoot.rootPath),
    ]);
    if (
      snapshotMetadata.isSymbolicLink()
      || !snapshotMetadata.isDirectory()
      || !sameDirectoryIdentity(snapshotRoot.identity, snapshotMetadata)
      || nodeModulesMetadata.isSymbolicLink()
      || !nodeModulesMetadata.isDirectory()
      || !sameDirectoryIdentity(nodeModulesRoot.identity, nodeModulesMetadata)
      || !sameFilesystemPath(realSnapshotRootPath, snapshotRoot.realRootPath)
      || !sameFilesystemPath(realNodeModulesRootPath, nodeModulesRoot.realRootPath)
      || !sameFilesystemPath(realNodeModulesRootPath, nodeModulesRoot.rootPath)
      || !isSameOrDescendant(realNodeModulesRootPath, realSnapshotRootPath)
      || sameFilesystemPath(realNodeModulesRootPath, realSnapshotRootPath)
    ) {
      throw new Error("snapshot-node-modules-root-integrity-invalid");
    }
  } catch {
    throw new A03ProofError(failureCode);
  }
}

/** The launcher is fixed harness code, not an external toolchain input. */
async function writePrismaLauncher(
  snapshotRoot: GeneratedSnapshotRoot,
  nodeModulesRoot: SnapshotNodeModulesRoot,
): Promise<PrismaLauncherFile> {
  const launcherPath = join(snapshotRoot.rootPath, prismaLauncherFilename);
  const launcherContents = createPrismaLauncherContents(snapshotRoot, nodeModulesRoot, launcherPath);
  try {
    await writeFile(launcherPath, launcherContents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(launcherPath, 0o600);
    const metadata = await lstat(launcherPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("prisma-launcher-invalid");
    }
    const stableFile = await readStableRegularFile(launcherPath, metadata, snapshotTraversalFailureCodes);
    const expectedContents = Buffer.from(launcherContents, "utf8");
    if (!stableFile.contents.equals(expectedContents)) {
      throw new Error("prisma-launcher-content-invalid");
    }
    return Object.freeze({
      path: launcherPath,
      identity: createFileIdentity(stableFile.metadata),
      byteLength: stableFile.contents.byteLength,
      contentSha256: stableFile.contentSha256,
    });
  } catch {
    throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
  }
}

async function assertPrismaLauncherIntegrity(
  launcher: PrismaLauncherFile,
  failureCode: string,
): Promise<void> {
  try {
    const metadata = await lstat(launcher.path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("prisma-launcher-not-regular");
    }
    const stableFile = await readStableRegularFile(launcher.path, metadata, snapshotTraversalFailureCodes);
    if (
      !sameFileIdentity(launcher.identity, createFileIdentity(stableFile.metadata))
      || stableFile.contents.byteLength !== launcher.byteLength
      || stableFile.contentSha256 !== launcher.contentSha256
    ) {
      throw new Error("prisma-launcher-integrity-invalid");
    }
  } catch {
    throw new A03ProofError(failureCode);
  }
}

function createPrismaLauncherContents(
  snapshotRoot: GeneratedSnapshotRoot,
  nodeModulesRoot: SnapshotNodeModulesRoot,
  launcherPath: string,
): string {
  const launchContract = JSON.stringify({
    launcherPath,
    snapshotRootPath: snapshotRoot.rootPath,
    snapshotRootRealPath: snapshotRoot.realRootPath,
    snapshotRootDevice: snapshotRoot.identity.device,
    snapshotRootInode: snapshotRoot.identity.inode,
    nodeModulesRootPath: nodeModulesRoot.rootPath,
    nodeModulesRootRealPath: nodeModulesRoot.realRootPath,
    nodeModulesRootDevice: nodeModulesRoot.identity.device,
    nodeModulesRootInode: nodeModulesRoot.identity.inode,
  });
  return `"use strict";
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const contract = Object.freeze(${launchContract});
const normalizePath = (value) => {
  let normalized = path.resolve(value).replaceAll("\\\\", "/");
  if (normalized.startsWith("//?/")) normalized = normalized.slice(4);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};
const samePath = (left, right) => normalizePath(left) === normalizePath(right);
const isStrictDescendant = (candidate, ancestor) => {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedAncestor = normalizePath(ancestor);
  const prefix = normalizedAncestor.endsWith("/") ? normalizedAncestor : normalizedAncestor + "/";
  return normalizedCandidate.startsWith(prefix);
};
const fail = (code) => {
  const error = new Error(code);
  error.code = code;
  throw error;
};
const lstatOrFail = (target, code) => {
  try {
    return fs.lstatSync(target);
  } catch {
    fail(code);
  }
};
const realpathOrFail = (target, code) => {
  try {
    return fs.realpathSync.native(target);
  } catch {
    fail(code);
  }
};
const assertExpectedDirectory = (target, expectedPath, expectedRealPath, expectedDevice, expectedInode, code) => {
  if (!samePath(target, expectedPath)) fail(code);
  const metadata = lstatOrFail(target, code);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.dev !== expectedDevice || metadata.ino !== expectedInode) {
    fail(code);
  }
  const realTarget = realpathOrFail(target, code);
  if (!samePath(realTarget, expectedRealPath) || !samePath(realTarget, target)) fail(code);
  return realTarget;
};
const assertRegularFileBelow = (rootPath, realRootPath, target, code) => {
  const resolvedTarget = path.resolve(target);
  if (!isStrictDescendant(resolvedTarget, rootPath)) fail(code);
  const relativePath = path.relative(rootPath, resolvedTarget);
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(path.sep).some((part) => part.length === 0 || part === "." || part === "..")) {
    fail(code);
  }
  let currentPath = rootPath;
  const parts = relativePath.split(path.sep);
  if (Buffer.byteLength(relativePath, "utf8") > ${prismaLauncherMaximumResolvedPathBytes} || parts.length > ${prismaLauncherMaximumResolvedPathSegments}) {
    fail(code);
  }
  for (let index = 0; index < parts.length; index += 1) {
    currentPath = path.join(currentPath, parts[index]);
    const metadata = lstatOrFail(currentPath, code);
    if (metadata.isSymbolicLink()) fail(code);
    if (index === parts.length - 1) {
      if (!metadata.isFile()) fail(code);
    } else if (!metadata.isDirectory()) {
      fail(code);
    }
  }
  const realTarget = realpathOrFail(resolvedTarget, code);
  if (!isStrictDescendant(realTarget, realRootPath) || !samePath(realTarget, resolvedTarget)) fail(code);
  return resolvedTarget;
};
const snapshotRootPath = path.resolve(__dirname);
const realSnapshotRootPath = assertExpectedDirectory(
  snapshotRootPath,
  contract.snapshotRootPath,
  contract.snapshotRootRealPath,
  contract.snapshotRootDevice,
  contract.snapshotRootInode,
  "a03_prisma_launcher_snapshot_integrity_invalid",
);
const launcherPath = path.resolve(__filename);
if (!samePath(launcherPath, contract.launcherPath) || !isStrictDescendant(launcherPath, snapshotRootPath)) {
  fail("a03_prisma_launcher_snapshot_integrity_invalid");
}
assertRegularFileBelow(
  snapshotRootPath,
  realSnapshotRootPath,
  launcherPath,
  "a03_prisma_launcher_snapshot_integrity_invalid",
);
const nodeModulesRoot = path.join(snapshotRootPath, "node_modules");
if (!isStrictDescendant(nodeModulesRoot, snapshotRootPath)) fail("a03_prisma_launcher_snapshot_integrity_invalid");
const realNodeModulesRoot = assertExpectedDirectory(
  nodeModulesRoot,
  contract.nodeModulesRootPath,
  contract.nodeModulesRootRealPath,
  contract.nodeModulesRootDevice,
  contract.nodeModulesRootInode,
  "a03_prisma_launcher_snapshot_integrity_invalid",
);
if (!isStrictDescendant(realNodeModulesRoot, realSnapshotRootPath)) {
  fail("a03_prisma_launcher_snapshot_integrity_invalid");
}
if (typeof process.env.NODE_PATH === "string" && process.env.NODE_PATH.length > 0) {
  fail("a03_prisma_launcher_untrusted_node_environment");
}
if (typeof process.env.NODE_OPTIONS === "string" && process.env.NODE_OPTIONS.length > 0) {
  fail("a03_prisma_launcher_untrusted_node_environment");
}
const builtins = new Set(Module.builtinModules.concat(Module.builtinModules.map((name) => "node:" + name)));
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  const resolved = originalResolveFilename.call(this, request, parent, isMain, options);
  if (typeof resolved !== "string" || builtins.has(request) || builtins.has(resolved)) return resolved;
  return assertRegularFileBelow(
    nodeModulesRoot,
    realNodeModulesRoot,
    resolved,
    "a03_prisma_module_outside_snapshot_forbidden",
  );
};
const prismaCliPath = assertRegularFileBelow(
  nodeModulesRoot,
  realNodeModulesRoot,
  path.join(nodeModulesRoot, "prisma", "build", "index.js"),
  "a03_prisma_module_outside_snapshot_forbidden",
);
require(prismaCliPath);
`;
}

async function createPrivateGeneratedDirectory(prefix: string): Promise<GeneratedSnapshotRoot> {
  const temporaryRoot = captureTrustedLocalTemporaryRoot("a03_prisma_toolchain_snapshot_create_failed");
  const temporaryRootPath = temporaryRoot.realPath;
  let generatedRoot: GeneratedSnapshotRoot | undefined;
  try {
    assertTrustedLocalTemporaryRoot(temporaryRoot, "a03_prisma_toolchain_snapshot_create_failed");
    const rootPath = await mkdtemp(join(temporaryRootPath, prefix));
    assertTrustedLocalTemporaryRoot(temporaryRoot, "a03_prisma_toolchain_snapshot_create_failed");
    await chmod(rootPath, 0o700);
    const metadata = await lstat(rootPath);
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || !isGeneratedPrivateDirectory(rootPath, temporaryRootPath, prefix)) {
      throw new Error("generated-snapshot-root-invalid");
    }
    const realRootPath = await realpath(rootPath);
    const realTemporaryRootPath = await realpath(temporaryRootPath);
    if (!isSameOrDescendant(realRootPath, realTemporaryRootPath)) {
      throw new Error("generated-snapshot-root-outside-temporary-root");
    }
    generatedRoot = Object.freeze({
      rootPath,
      temporaryRootPath,
      temporaryRoot,
      realRootPath,
      identity: createDirectoryIdentity(metadata),
      prefix,
    });
    return generatedRoot;
  } catch {
    if (generatedRoot !== undefined) {
      try {
        await removeGeneratedPrivateDirectory(generatedRoot);
      } catch {
        // The caller receives a stable creation failure. A path whose initial
        // physical identity was not fully established is deliberately not
        // deleted, because cleanup must never widen a destructive target.
      }
    }
    throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
  }
}

async function assertGeneratedPrivateDirectory(
  generatedRoot: GeneratedSnapshotRoot,
  failureCode: string,
): Promise<void> {
  try {
    await validateGeneratedPrivateDirectory(generatedRoot);
  } catch {
    throw new A03ProofError(failureCode);
  }
}

async function removeGeneratedPrivateDirectory(generatedRoot: GeneratedSnapshotRoot): Promise<void> {
  try {
    await validateGeneratedPrivateDirectory(generatedRoot);
    await rm(generatedRoot.rootPath, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    throw new A03ProofError("a03_prisma_toolchain_snapshot_cleanup_failed");
  }
}

async function removeGeneratedRoots(generatedRoots: readonly GeneratedSnapshotRoot[]): Promise<void> {
  let cleanupFailed = false;
  for (const generatedRoot of generatedRoots) {
    try {
      await removeGeneratedPrivateDirectory(generatedRoot);
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) throw new A03ProofError("a03_prisma_toolchain_snapshot_cleanup_failed");
}

async function validateGeneratedPrivateDirectory(generatedRoot: GeneratedSnapshotRoot): Promise<void> {
  assertTrustedLocalTemporaryRoot(generatedRoot.temporaryRoot, "a03_prisma_toolchain_snapshot_integrity_invalid");
  if (!isGeneratedPrivateDirectory(generatedRoot.rootPath, generatedRoot.temporaryRootPath, generatedRoot.prefix)) {
    throw new Error("snapshot-root-outside-generated-temporary-directory");
  }
  const metadata = await lstat(generatedRoot.rootPath);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("snapshot-root-not-regular-directory");
  }
  if (!sameDirectoryIdentity(generatedRoot.identity, metadata)) {
    throw new Error("snapshot-root-identity-changed");
  }
  const currentRealRootPath = await realpath(generatedRoot.rootPath);
  if (!sameFilesystemPath(currentRealRootPath, generatedRoot.realRootPath)) {
    throw new Error("snapshot-root-physical-path-changed");
  }
}

function isGeneratedPrivateDirectory(rootPath: string, temporaryRootPath: string, prefix: string): boolean {
  const normalizedRootPath = resolve(rootPath);
  return isSameOrDescendant(normalizedRootPath, resolve(temporaryRootPath))
    && !sameFilesystemPath(normalizedRootPath, resolve(temporaryRootPath))
    && new RegExp(`^${prefix}[A-Za-z0-9_-]+$`).test(lastPathSegment(normalizedRootPath));
}

function resolveTreeChild(parentPath: string, name: string, failureCodes: TraversalFailureCodes): string {
  const childPath = resolve(parentPath, name);
  if (!isSameOrDescendant(childPath, parentPath) || sameFilesystemPath(childPath, parentPath)) {
    throw new A03ProofError(failureCodes.invalid);
  }
  return childPath;
}

function resolveTreeFilePath(
  rootPath: string,
  relativePath: string,
  failureCodes: TraversalFailureCodes,
): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new A03ProofError(failureCodes.invalid);
  }
  const filePath = resolve(rootPath, ...relativePath.split("/"));
  if (!isSameOrDescendant(filePath, rootPath) || sameFilesystemPath(filePath, rootPath)) {
    throw new A03ProofError(failureCodes.invalid);
  }
  return filePath;
}

function resolveRelativeSnapshotPath(rootPath: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
  }
  const destination = resolve(rootPath, ...relativePath.split("/"));
  if (!isSameOrDescendant(destination, rootPath) || sameFilesystemPath(destination, rootPath)) {
    throw new A03ProofError("a03_prisma_toolchain_snapshot_create_failed");
  }
  return destination;
}

function requireSafeEntryName(name: string, failureCodes: TraversalFailureCodes): string {
  if (
    name.length === 0
    || name === "."
    || name === ".."
    || name.includes("\0")
    || name.includes("/")
    || name.includes("\\")
    || name.includes("\uFFFD")
  ) {
    throw new A03ProofError(failureCodes.invalid);
  }
  return name;
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && !value.includes("\0")
    && !value.startsWith("/")
    && !value.startsWith("\\")
    && value.split("/").every((segment) => (
      segment.length > 0
      && segment !== "."
      && segment !== ".."
      && !segment.includes("\\")
      && !segment.includes("\uFFFD")
    ));
}

function assertDirectory(metadata: Stats, failureCodes: TraversalFailureCodes): void {
  if (metadata.isSymbolicLink()) throw new A03ProofError(failureCodes.symlink);
  if (!metadata.isDirectory()) throw new A03ProofError(failureCodes.invalid);
}

function calculateToolchainTreeSha256(files: readonly TreeFile[]): string {
  const treeDefinition = canonicalJson({
    schemaVersion: 1,
    kind: "doorstar-pilot-gate1-prisma-toolchain-tree",
    files: files.map((file) => ({
      path: file.relativePath,
      size: file.byteLength,
      sha256: file.contentSha256,
    })),
  });
  return createHash("sha256").update(treeDefinition, "utf8").digest("hex");
}

function createFileIdentity(metadata: Stats): FileIdentity {
  return Object.freeze({
    device: metadata.dev,
    inode: metadata.ino,
    byteLength: metadata.size,
    mode: metadata.mode,
    modifiedMilliseconds: metadata.mtimeMs,
    changedMilliseconds: metadata.ctimeMs,
  });
}

function createDirectoryIdentity(metadata: Stats): DirectoryIdentity {
  return Object.freeze({ device: metadata.dev, inode: metadata.ino });
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device
    && left.inode === right.inode
    && left.byteLength === right.byteLength
    && left.mode === right.mode
    && left.modifiedMilliseconds === right.modifiedMilliseconds
    && left.changedMilliseconds === right.changedMilliseconds;
}

function sameDirectoryIdentity(left: DirectoryIdentity, right: Stats): boolean {
  return left.device === right.dev && left.inode === right.ino;
}

function compareCanonicalPath(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function depthOfRelativePath(value: string): number {
  return value.split("/").length;
}

function pathsOverlap(left: string, right: string): boolean {
  return isSameOrDescendant(left, right) || isSameOrDescendant(right, left);
}

function isSameOrDescendant(candidatePath: string, ancestorPath: string): boolean {
  const candidate = normalizeFilesystemPath(candidatePath);
  const ancestor = normalizeFilesystemPath(ancestorPath);
  const descendantPrefix = ancestor.endsWith("/") ? ancestor : `${ancestor}/`;
  return candidate === ancestor || candidate.startsWith(descendantPrefix);
}

function sameFilesystemPath(left: string, right: string): boolean {
  return normalizeFilesystemPath(left) === normalizeFilesystemPath(right);
}

function normalizeFilesystemPath(path: string): string {
  let normalized = resolve(path).replaceAll("\\", "/");
  if (normalized.startsWith("//?/")) normalized = normalized.slice(4);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function lastPathSegment(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? "";
}

class TraversalBudget {
  private files = 0;
  private directories = 1;
  private totalFileBytes = 0;

  public consumeDirectory(failureCodes: TraversalFailureCodes): void {
    this.directories += 1;
    if (this.directories > prismaToolchainSnapshotLimits.maxDirectories) {
      throw new A03ProofError(failureCodes.tooLarge);
    }
  }

  public consumeFile(failureCodes: TraversalFailureCodes): void {
    this.files += 1;
    if (this.files > prismaToolchainSnapshotLimits.maxFiles) {
      throw new A03ProofError(failureCodes.tooLarge);
    }
  }

  public consumeFileBytes(byteLength: number, failureCodes: TraversalFailureCodes): void {
    if (byteLength > prismaToolchainSnapshotLimits.maxFileBytes) {
      throw new A03ProofError(failureCodes.tooLarge);
    }
    this.totalFileBytes += byteLength;
    if (this.totalFileBytes > prismaToolchainSnapshotLimits.maxTotalFileBytes) {
      throw new A03ProofError(failureCodes.tooLarge);
    }
  }
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
