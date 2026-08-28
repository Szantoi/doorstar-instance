import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { A03ProofError } from "./a03Config.js";
import {
  createCandidateGitChildEnvironment,
  createCandidateGitReadArguments,
  type CandidateGitState,
} from "./candidateGitState.js";
import type { CommandRunner } from "./commandRunner.js";
import {
  assertTrustedLocalTemporaryRoot,
  captureTrustedLocalTemporaryRoot,
  type TrustedLocalTemporaryRoot,
} from "./trustedLocalTempRoot.js";

const candidateGitTimeoutMilliseconds = 10_000;
const snapshotPrefix = "doorstar-a03-prisma-";
const foundationPrismaRepositoryPath = "src/doorstar-pilot-foundation/prisma";
const stagingFixtureRepositoryPath = "src/doorstar-pilot-staging-proof/fixture/two-scope-preflight.fixture.sql";
const policyMigrationPath = "20260827120000_pilot_a_phase_authorization_policy/migration.sql";
const expectedSchemaSha256 = "7b67b12fef4dcf60f4bd5f2ec7e46e3ac5e4bab04bed3b62ccecc873b2e1d615";
const expectedFixtureSha256 = "2f10c5caa31b3caf17bb38e9f55d65d03c57dcb0e2e525f4be5f911f0697fc4e";

const expectedMigrationHashes = Object.freeze({
  "20260827000000_pilot_foundation/migration.sql": "b0408b3caba4d868cae2fcbcec39fb0442897ca17f877b7b09f0dd54809ba382",
  [policyMigrationPath]: "94d3c2e993802f440daf684038f8b39a97febf97da097ee9df5c63341964b348",
});

const expectedSourceFiles = Object.freeze([
  Object.freeze({
    repositoryPath: `${foundationPrismaRepositoryPath}/schema.prisma`,
    snapshotPath: "schema.prisma",
    kind: "schema" as const,
  }),
  Object.freeze({
    repositoryPath: `${foundationPrismaRepositoryPath}/migrations/migration_lock.toml`,
    snapshotPath: "migrations/migration_lock.toml",
    kind: "migration-lock" as const,
  }),
  ...Object.keys(expectedMigrationHashes).map((migrationPath) => Object.freeze({
    repositoryPath: `${foundationPrismaRepositoryPath}/migrations/${migrationPath}`,
    snapshotPath: `migrations/${migrationPath}`,
    kind: "migration" as const,
    migrationPath,
  })),
  Object.freeze({
    repositoryPath: stagingFixtureRepositoryPath,
    snapshotPath: "fixture/two-scope-preflight.fixture.sql",
    kind: "fixture" as const,
  }),
] as const);

const expectedSnapshotDirectories = Object.freeze([
  "fixture",
  "migrations",
  ...Object.keys(expectedMigrationHashes).map((migrationPath) => `migrations/${dirname(migrationPath)}`),
].sort());

export type CandidatePrismaSnapshotManifestFile = Readonly<{
  path: string;
  gitBlobSha: string;
  contentSha256: string;
}>;

export type CandidatePrismaSnapshotManifest = Readonly<{
  schemaVersion: 1;
  candidate: Readonly<{
    commitSha: string;
    treeSha: string;
    objectFormat: "sha1" | "sha256";
  }>;
  files: readonly CandidatePrismaSnapshotManifestFile[];
}>;

/**
 * A private, source-only Prisma tree derived entirely from immutable Git
 * blobs. The paths are intentionally exposed only for the fixed Prisma child
 * invocation; the fixture and policy bytes remain candidate-derived in-memory
 * values. Callers must verify immediately before each use and dispose it in a
 * finally block.
 */
export type CandidatePrismaSnapshot = Readonly<{
  prismaRootPath: string;
  schemaPath: string;
  migrationsDirectoryPath: string;
  /** Candidate Git-blob bytes; never read from the staging working tree. */
  fixtureTemplate: string;
  /** Candidate Git-blob bytes for the approved policy migration. */
  policyMigrationContents: string;
  migrationHashes: Readonly<Record<string, string>>;
  prismaMigrationChecksums: Readonly<Record<string, string>>;
  manifest: CandidatePrismaSnapshotManifest;
  manifestSha256: string;
  verifyIntegrity: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

export type CandidatePrismaSnapshotInput = Readonly<{
  commandRunner: CommandRunner;
  candidate: CandidateGitState;
  environment: NodeJS.ProcessEnv;
}>;

type GitTreeEntry = Readonly<{
  mode: "100644";
  objectType: "blob";
  objectSha: string;
  path: string;
}>;

type SourceBlob = Readonly<{
  repositoryPath: string;
  snapshotPath: string;
  kind: "schema" | "migration-lock" | "migration" | "fixture";
  migrationPath?: string;
  gitBlobSha: string;
  contents: string;
  contentSha256: string;
}>;

type PrivateSnapshotRoot = Readonly<{
  rootPath: string;
  temporaryRootPath: string;
  realTemporaryRootPath: string;
  temporaryRoot: TrustedLocalTemporaryRoot;
  realRootPath: string;
  identity: Readonly<{
    device: number;
    inode: number;
  }>;
}>;

/**
 * Creates a new private temporary Prisma source tree for exactly one clean
 * candidate. It never reads `process.env` or the working-tree Prisma files.
 * Every source byte comes from `git cat-file blob <candidate-tree-object>`.
 */
export async function createCandidatePrismaSnapshot(
  input: CandidatePrismaSnapshotInput,
): Promise<CandidatePrismaSnapshot> {
  const candidate = requireCandidateIdentity(input.candidate);
  const gitEnvironment = createCandidateGitChildEnvironment(input.environment);
  const blobs = await readCandidatePrismaBlobs(input.commandRunner, candidate, gitEnvironment);
  validateSourceBlobs(blobs);

  const manifest = createManifest(candidate, blobs);
  const manifestSha256 = sha256(canonicalJson(manifest));
  let snapshotRoot: PrivateSnapshotRoot | undefined;
  try {
    snapshotRoot = await createPrivateSnapshotRoot();
    await writeSnapshotFiles(snapshotRoot, blobs);
    return createSnapshotHandle(snapshotRoot, manifest, manifestSha256, blobs);
  } catch (error) {
    if (snapshotRoot !== undefined) await removePrivateSnapshotRoot(snapshotRoot);
    if (error instanceof A03ProofError) throw error;
    throw new A03ProofError("a03_candidate_prisma_snapshot_create_failed");
  }
}

async function readCandidatePrismaBlobs(
  commandRunner: CommandRunner,
  candidate: CandidateGitState,
  environment: NodeJS.ProcessEnv,
): Promise<readonly SourceBlob[]> {
  const resolvedCommit = (await runGitRead(
    commandRunner,
    ["rev-parse", "--verify", `${candidate.commitSha}^{commit}`],
    environment,
  )).trim();
  const objectFormat = (await runGitRead(
    commandRunner,
    ["rev-parse", "--show-object-format"],
    environment,
  )).trim();
  const resolvedTree = (await runGitRead(
    commandRunner,
    ["rev-parse", "--verify", `${candidate.commitSha}^{tree}`],
    environment,
  )).trim();
  if (
    resolvedCommit !== candidate.commitSha
    || objectFormat !== candidate.objectFormat
    || resolvedTree !== candidate.treeSha
  ) {
    throw new A03ProofError("a03_candidate_prisma_candidate_mismatch");
  }

  const treeOutput = await runGitRead(
    commandRunner,
    [
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      candidate.commitSha,
      "--",
      foundationPrismaRepositoryPath,
      stagingFixtureRepositoryPath,
    ],
    environment,
  );
  const treeEntries = parseAndValidateGitTree(treeOutput, candidate.objectFormat);
  const sourceBlobs: SourceBlob[] = [];
  for (const sourceFile of expectedSourceFiles) {
    const entry = treeEntries.get(sourceFile.repositoryPath);
    if (entry === undefined) throw new A03ProofError("a03_candidate_prisma_tree_invalid");
    const contents = await runGitRead(commandRunner, ["cat-file", "blob", entry.objectSha], environment);
    assertTextBlob(contents);
    assertGitBlobObjectId(contents, entry.objectSha, candidate.objectFormat);
    sourceBlobs.push(Object.freeze({
      repositoryPath: sourceFile.repositoryPath,
      snapshotPath: sourceFile.snapshotPath,
      kind: sourceFile.kind,
      ...(sourceFile.kind === "migration" ? { migrationPath: sourceFile.migrationPath } : {}),
      gitBlobSha: entry.objectSha,
      contents,
      contentSha256: sha256(contents),
    }));
  }
  return Object.freeze(sourceBlobs);
}

function requireCandidateIdentity(candidate: CandidateGitState): CandidateGitState {
  const expectedHashLength = candidate?.objectFormat === "sha1" ? 40 : candidate?.objectFormat === "sha256" ? 64 : 0;
  if (
    candidate?.clean !== true
    || !isObjectHash(candidate.commitSha, expectedHashLength)
    || !isObjectHash(candidate.treeSha, expectedHashLength)
  ) {
    throw new A03ProofError("a03_candidate_prisma_candidate_invalid");
  }
  return Object.freeze({
    commitSha: candidate.commitSha,
    treeSha: candidate.treeSha,
    objectFormat: candidate.objectFormat,
    clean: true,
  });
}

async function runGitRead(
  commandRunner: CommandRunner,
  commandArguments: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  let result;
  try {
    result = await commandRunner.run(
      "git",
      createCandidateGitReadArguments(commandArguments),
      candidateGitTimeoutMilliseconds,
      environment,
    );
  } catch {
    throw new A03ProofError("a03_candidate_prisma_git_read_failed");
  }
  if (result.exitCode !== 0) throw new A03ProofError("a03_candidate_prisma_git_read_failed");
  return result.stdout;
}

function parseAndValidateGitTree(output: string, objectFormat: CandidateGitState["objectFormat"]): ReadonlyMap<string, GitTreeEntry> {
  if (!output.endsWith("\0")) throw new A03ProofError("a03_candidate_prisma_tree_invalid");
  const expectedHashLength = objectFormat === "sha1" ? 40 : 64;
  const entries = new Map<string, GitTreeEntry>();
  const records = output.slice(0, -1).split("\0");
  if (records.length !== expectedSourceFiles.length || records.some((record) => record.length === 0)) {
    throw new A03ProofError("a03_candidate_prisma_tree_invalid");
  }
  for (const record of records) {
    const tabIndex = record.indexOf("\t");
    if (tabIndex < 0) throw new A03ProofError("a03_candidate_prisma_tree_invalid");
    const [mode, objectType, objectSha] = record.slice(0, tabIndex).split(" ");
    const path = record.slice(tabIndex + 1);
    if (
      mode !== "100644"
      || objectType !== "blob"
      || !isObjectHash(objectSha, expectedHashLength)
      || !expectedSourceFiles.some((sourceFile) => sourceFile.repositoryPath === path)
      || entries.has(path)
    ) {
      throw new A03ProofError("a03_candidate_prisma_tree_invalid");
    }
    entries.set(path, Object.freeze({ mode, objectType, objectSha, path }));
  }
  if (entries.size !== expectedSourceFiles.length) throw new A03ProofError("a03_candidate_prisma_tree_invalid");
  return entries;
}

function validateSourceBlobs(blobs: readonly SourceBlob[]): void {
  const schema = blobs.find((blob) => blob.kind === "schema");
  const migrationLock = blobs.find((blob) => blob.kind === "migration-lock");
  const fixture = blobs.find((blob) => blob.kind === "fixture");
  const policyMigration = blobs.find((blob) => blob.migrationPath === policyMigrationPath);
  if (
    blobs.length !== expectedSourceFiles.length
    || schema === undefined
    || migrationLock === undefined
    || fixture === undefined
    || policyMigration === undefined
    || !isClosedDatabaseUrlSchema(schema.contents)
  ) {
    throw new A03ProofError("a03_candidate_prisma_schema_invalid");
  }
  if (!isPostgresMigrationLock(migrationLock.contents)) {
    throw new A03ProofError("a03_candidate_prisma_migration_lock_invalid");
  }
  if (schema.contentSha256 !== expectedSchemaSha256) {
    throw new A03ProofError("a03_immutable_schema_hash_mismatch");
  }
  if (fixture.contentSha256 !== expectedFixtureSha256) {
    throw new A03ProofError("a03_immutable_fixture_hash_mismatch");
  }
  for (const blob of blobs.filter((entry) => entry.kind === "migration")) {
    const expectedHash = blob.migrationPath === undefined ? undefined : expectedMigrationHashes[blob.migrationPath as keyof typeof expectedMigrationHashes];
    if (expectedHash === undefined || blob.contentSha256 !== expectedHash) {
      throw new A03ProofError("a03_immutable_migration_hash_mismatch");
    }
  }
}

function isClosedDatabaseUrlSchema(schema: string): boolean {
  const withoutComments = stripPrismaComments(schema);
  if (/\b(?:directUrl|shadowDatabaseUrl)\b/.test(withoutComments)) return false;
  const dataSources = [...withoutComments.matchAll(/\bdatasource\s+[A-Za-z_][A-Za-z0-9_]*\s*\{([\s\S]*?)\}/g)];
  if (dataSources.length !== 1) return false;
  const body = dataSources[0]?.[1];
  if (body === undefined) return false;
  const fields = new Map<string, string>();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
    if (match === null || fields.has(match[1])) return false;
    fields.set(match[1], match[2].replace(/\s+/g, ""));
  }
  return fields.size === 3
    && fields.get("provider") === '"postgresql"'
    && fields.get("url") === 'env("DATABASE_URL")'
    && fields.get("schemas") === '["pilot"]';
}

function stripPrismaComments(source: string): string {
  let result = "";
  let index = 0;
  let quoted = false;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (quoted) {
      result += current;
      if (current === "\\" && next !== undefined) {
        result += next;
        index += 2;
        continue;
      }
      if (current === '"') quoted = false;
      index += 1;
      continue;
    }
    if (current === '"') {
      quoted = true;
      result += current;
      index += 1;
      continue;
    }
    if (current === "/" && next === "/") {
      const lineEnd = source.indexOf("\n", index);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }
    if (current === "/" && next === "*") {
      const blockEnd = source.indexOf("*/", index + 2);
      if (blockEnd === -1) return "";
      index = blockEnd + 2;
      continue;
    }
    result += current;
    index += 1;
  }
  return quoted ? "" : result;
}

function isPostgresMigrationLock(contents: string): boolean {
  const directives = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return directives.length === 1 && directives[0] === 'provider = "postgresql"';
}

async function createPrivateSnapshotRoot(): Promise<PrivateSnapshotRoot> {
  const temporaryRoot = captureTrustedLocalTemporaryRoot("a03_candidate_prisma_snapshot_create_failed");
  const temporaryRootPath = temporaryRoot.realPath;
  let rootPath: string | undefined;
  let snapshotRoot: PrivateSnapshotRoot | undefined;
  try {
    assertTrustedLocalTemporaryRoot(temporaryRoot, "a03_candidate_prisma_snapshot_create_failed");
    rootPath = await mkdtemp(join(temporaryRootPath, snapshotPrefix));
    assertTrustedLocalTemporaryRoot(temporaryRoot, "a03_candidate_prisma_snapshot_create_failed");
    await chmod(rootPath, 0o700);
    const metadata = await lstat(rootPath);
    const [realRootPath, realTemporaryRootPath] = await Promise.all([
      realpath(rootPath),
      realpath(temporaryRootPath),
    ]);
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || !isGeneratedSnapshotRoot(rootPath, temporaryRootPath)
      || !isStrictDescendant(realRootPath, realTemporaryRootPath)
    ) {
      throw new Error("snapshot-root-invalid");
    }
    snapshotRoot = Object.freeze({
      rootPath,
      temporaryRootPath,
      realTemporaryRootPath,
      temporaryRoot,
      realRootPath,
      identity: createDirectoryIdentity(metadata),
    });
    return snapshotRoot;
  } catch {
    if (snapshotRoot !== undefined) {
      try {
        await removePrivateSnapshotRoot(snapshotRoot);
      } catch {
        // The caller receives the stable creation failure. If the generated
        // root cannot be re-identified safely, it is intentionally left in
        // place rather than recursively deleting a replacement target.
      }
    }
    throw new A03ProofError("a03_candidate_prisma_snapshot_create_failed");
  }
}

async function writeSnapshotFiles(snapshotRoot: PrivateSnapshotRoot, blobs: readonly SourceBlob[]): Promise<void> {
  await assertPrivateSnapshotRoot(snapshotRoot, "a03_candidate_prisma_snapshot_create_failed");
  for (const directory of expectedSnapshotDirectories) {
    const directoryPath = resolveSnapshotPath(snapshotRoot.rootPath, directory);
    await mkdir(directoryPath, { mode: 0o700 });
    await chmod(directoryPath, 0o700);
    const metadata = await lstat(directoryPath);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new A03ProofError("a03_candidate_prisma_snapshot_create_failed");
    }
  }
  for (const blob of blobs) {
    const destination = resolveSnapshotPath(snapshotRoot.rootPath, blob.snapshotPath);
    await writeFile(destination, blob.contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const metadata = await lstat(destination);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new A03ProofError("a03_candidate_prisma_snapshot_create_failed");
    }
  }
  await assertPrivateSnapshotRoot(snapshotRoot, "a03_candidate_prisma_snapshot_create_failed");
}

function createManifest(
  candidate: CandidateGitState,
  blobs: readonly SourceBlob[],
): CandidatePrismaSnapshotManifest {
  return deepFreeze({
    schemaVersion: 1,
    candidate: {
      commitSha: candidate.commitSha,
      treeSha: candidate.treeSha,
      objectFormat: candidate.objectFormat,
    },
    files: blobs
      .map((blob) => ({
        path: blob.snapshotPath,
        gitBlobSha: blob.gitBlobSha,
        contentSha256: blob.contentSha256,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  });
}

function createSnapshotHandle(
  snapshotRoot: PrivateSnapshotRoot,
  manifest: CandidatePrismaSnapshotManifest,
  manifestSha256: string,
  blobs: readonly SourceBlob[],
): CandidatePrismaSnapshot {
  let disposed = false;
  const fixtureTemplate = blobs.find((blob) => blob.kind === "fixture")?.contents;
  const policyMigrationContents = blobs.find((blob) => blob.migrationPath === policyMigrationPath)?.contents;
  if (fixtureTemplate === undefined || policyMigrationContents === undefined) {
    throw new A03ProofError("a03_candidate_prisma_tree_invalid");
  }
  const migrationHashes = Object.freeze(Object.fromEntries(
    blobs
      .filter((blob): blob is SourceBlob & { migrationPath: string } => blob.kind === "migration" && blob.migrationPath !== undefined)
      .map((blob) => [blob.migrationPath, blob.contentSha256]),
  ));
  const prismaMigrationChecksums = Object.freeze(Object.fromEntries(
    blobs
      .filter((blob): blob is SourceBlob & { migrationPath: string } => blob.kind === "migration" && blob.migrationPath !== undefined)
      .map((blob) => [dirname(blob.migrationPath), blob.contentSha256]),
  ));
  const verifyIntegrity = async (): Promise<void> => {
    if (disposed) throw new A03ProofError("a03_candidate_prisma_snapshot_disposed");
    await verifySnapshotFiles(snapshotRoot, manifest, manifestSha256);
  };
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    await removePrivateSnapshotRoot(snapshotRoot);
    disposed = true;
  };
  return Object.freeze({
    prismaRootPath: snapshotRoot.rootPath,
    schemaPath: join(snapshotRoot.rootPath, "schema.prisma"),
    migrationsDirectoryPath: join(snapshotRoot.rootPath, "migrations"),
    fixtureTemplate,
    policyMigrationContents,
    migrationHashes,
    prismaMigrationChecksums,
    manifest,
    manifestSha256,
    verifyIntegrity,
    dispose,
  });
}

async function verifySnapshotFiles(
  snapshotRoot: PrivateSnapshotRoot,
  manifest: CandidatePrismaSnapshotManifest,
  expectedManifestSha256: string,
): Promise<void> {
  try {
    await assertPrivateSnapshotRoot(snapshotRoot, "a03_candidate_prisma_snapshot_integrity_invalid");
    if (sha256(canonicalJson(manifest)) !== expectedManifestSha256) {
      throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
    }
    const actualTree = await listSnapshotTree(snapshotRoot.rootPath);
    const expectedFiles = manifest.files.map((file) => file.path).sort();
    if (
      JSON.stringify(actualTree.directories) !== JSON.stringify(expectedSnapshotDirectories)
      || JSON.stringify(actualTree.files) !== JSON.stringify(expectedFiles)
    ) {
      throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
    }
    for (const file of manifest.files) {
      const path = resolveSnapshotPath(snapshotRoot.rootPath, file.path);
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
      }
      const contents = await readFile(path, "utf8");
      if (sha256(contents) !== file.contentSha256) {
        throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
      }
    }
  } catch (error) {
    if (error instanceof A03ProofError) throw error;
    throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
  }
}

async function listSnapshotTree(snapshotRoot: string): Promise<Readonly<{ directories: readonly string[]; files: readonly string[] }>> {
  const rootMetadata = await lstat(snapshotRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
  }
  const directories: string[] = [];
  const files: string[] = [];
  const visit = async (directoryPath: string): Promise<void> => {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directoryPath, entry.name);
      const snapshotPath = relative(snapshotRoot, fullPath).replaceAll("\\", "/");
      const metadata = await lstat(fullPath);
      if (metadata.isSymbolicLink()) throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
      if (metadata.isDirectory()) {
        directories.push(snapshotPath);
        await visit(fullPath);
      } else if (metadata.isFile()) {
        files.push(snapshotPath);
      } else {
        throw new A03ProofError("a03_candidate_prisma_snapshot_integrity_invalid");
      }
    }
  };
  await visit(snapshotRoot);
  return Object.freeze({ directories: directories.sort(), files: files.sort() });
}

async function removePrivateSnapshotRoot(snapshotRoot: PrivateSnapshotRoot): Promise<void> {
  try {
    await assertPrivateSnapshotRoot(snapshotRoot, "a03_candidate_prisma_snapshot_cleanup_failed");
    // The recursive operation is always scoped to the one re-identified,
    // generated child directory, never to the ambient temporary root.
    await rm(snapshotRoot.rootPath, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    throw new A03ProofError("a03_candidate_prisma_snapshot_cleanup_failed");
  }
}

async function assertPrivateSnapshotRoot(snapshotRoot: PrivateSnapshotRoot, failureCode: string): Promise<void> {
  try {
    assertTrustedLocalTemporaryRoot(snapshotRoot.temporaryRoot, failureCode);
    if (!isGeneratedSnapshotRoot(snapshotRoot.rootPath, snapshotRoot.temporaryRootPath)) {
      throw new Error("snapshot-root-outside-generated-temporary-directory");
    }
    const beforeMetadata = await lstat(snapshotRoot.rootPath);
    const [currentRealRootPath, currentRealTemporaryRootPath] = await Promise.all([
      realpath(snapshotRoot.rootPath),
      realpath(snapshotRoot.temporaryRootPath),
    ]);
    const afterMetadata = await lstat(snapshotRoot.rootPath);
    if (
      beforeMetadata.isSymbolicLink()
      || !beforeMetadata.isDirectory()
      || afterMetadata.isSymbolicLink()
      || !afterMetadata.isDirectory()
      || !sameDirectoryIdentity(beforeMetadata, afterMetadata)
      || !sameDirectoryIdentity(beforeMetadata, snapshotRoot.identity)
      || !sameFilesystemPath(currentRealRootPath, snapshotRoot.realRootPath)
      || !sameFilesystemPath(currentRealTemporaryRootPath, snapshotRoot.realTemporaryRootPath)
      || !isStrictDescendant(currentRealRootPath, currentRealTemporaryRootPath)
    ) {
      throw new Error("snapshot-root-physical-identity-changed");
    }
  } catch {
    throw new A03ProofError(failureCode);
  }
}

function createDirectoryIdentity(metadata: Stats): PrivateSnapshotRoot["identity"] {
  return Object.freeze({ device: metadata.dev, inode: metadata.ino });
}

function sameDirectoryIdentity(left: Stats, right: Stats | PrivateSnapshotRoot["identity"]): boolean {
  const rightDevice = "device" in right ? right.device : right.dev;
  const rightInode = "inode" in right ? right.inode : right.ino;
  return left.dev === rightDevice && left.ino === rightInode;
}

function isGeneratedSnapshotRoot(rootPath: string, temporaryRootPath: string): boolean {
  const root = resolve(rootPath);
  const temporaryRoot = resolve(temporaryRootPath);
  const relativeRoot = relative(temporaryRoot, root);
  return (
    relativeRoot !== ""
    && !relativeRoot.startsWith("..")
    && !isAbsolute(relativeRoot)
    && sameFilesystemPath(resolve(temporaryRoot, relativeRoot), root)
    && basenameIsSnapshotRoot(root)
  );
}

function isStrictDescendant(candidatePath: string, ancestorPath: string): boolean {
  const candidate = normalizeFilesystemPath(candidatePath);
  const ancestor = normalizeFilesystemPath(ancestorPath);
  const prefix = ancestor.endsWith("/") ? ancestor : `${ancestor}/`;
  return candidate.startsWith(prefix);
}

function basenameIsSnapshotRoot(path: string): boolean {
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? "";
  return new RegExp(`^${snapshotPrefix}[A-Za-z0-9_-]+$`).test(name);
}

function sameFilesystemPath(left: string, right: string): boolean {
  return normalizeFilesystemPath(left) === normalizeFilesystemPath(right);
}

function normalizeFilesystemPath(path: string): string {
  const normalized = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function resolveSnapshotPath(snapshotRoot: string, snapshotRelativePath: string): string {
  const root = resolve(snapshotRoot);
  const path = resolve(root, snapshotRelativePath);
  if (
    !/^[A-Za-z0-9_./-]+$/.test(snapshotRelativePath)
    || snapshotRelativePath.startsWith("/")
    || snapshotRelativePath.includes("..")
    || relative(root, path).startsWith("..")
  ) {
    throw new A03ProofError("a03_candidate_prisma_snapshot_create_failed");
  }
  return path;
}

function assertTextBlob(contents: string): void {
  if (contents.includes("\0") || contents.includes("\uFFFD")) {
    throw new A03ProofError("a03_candidate_prisma_tree_invalid");
  }
}

/**
 * `git cat-file` output is accepted only when its raw UTF-8 bytes recreate
 * the exact object ID advertised by the committed `ls-tree` entry. This keeps
 * the snapshot bound to a Git blob rather than merely trusting a child-process
 * label for candidate-derived schema or fixture bytes.
 */
function assertGitBlobObjectId(
  contents: string,
  expectedObjectSha: string,
  objectFormat: CandidateGitState["objectFormat"],
): void {
  const bytes = Buffer.from(contents, "utf8");
  const actualObjectSha = createHash(objectFormat)
    .update(`blob ${bytes.length}\0`, "utf8")
    .update(bytes)
    .digest("hex");
  if (actualObjectSha !== expectedObjectSha) {
    throw new A03ProofError("a03_candidate_prisma_tree_invalid");
  }
}

function isObjectHash(value: unknown, expectedLength: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${expectedLength}}$`, "i").test(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
