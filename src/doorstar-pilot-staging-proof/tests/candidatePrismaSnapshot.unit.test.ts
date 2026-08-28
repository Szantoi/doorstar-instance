import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { A03ProofError } from "../src/runner/a03Config.js";
import {
  candidateGitReadArgumentPrefix,
  type CandidateGitState,
} from "../src/runner/candidateGitState.js";
import { createCandidatePrismaSnapshot } from "../src/runner/candidatePrismaSnapshot.js";
import type { CommandRunner } from "../src/runner/commandRunner.js";

const candidate: CandidateGitState = Object.freeze({
  commitSha: "1".repeat(40),
  treeSha: "2".repeat(40),
  objectFormat: "sha1",
  clean: true,
});

const prismaRepositoryPath = "src/doorstar-pilot-foundation/prisma";
const fixtureRepositoryPath = "src/doorstar-pilot-staging-proof/fixture/two-scope-preflight.fixture.sql";

type FakeGitFile = Readonly<{
  path: string;
  contents: string;
  objectSha: string;
  mode?: string;
  objectType?: string;
}>;

type GitCall = Readonly<{
  command: string;
  argumentsList: readonly string[];
  environment: NodeJS.ProcessEnv | undefined;
}>;

describe("candidate-bound Prisma snapshot", () => {
  it("reads only exact candidate Git blobs and produces a disposable private snapshot", async () => {
    const files = await loadCurrentCandidateFiles();
    const candidateFixtureTemplate = files.find((file) => file.path === fixtureRepositoryPath)?.contents;
    if (candidateFixtureTemplate === undefined) throw new Error("candidate fixture test fixture is missing");
    const { commandRunner, calls } = createFakeGitRunner(files);
    const environment: NodeJS.ProcessEnv = {
      PATH: "safe-git-path",
      GIT_DIR: "untrusted-git-directory",
      GIT_CONFIG_GLOBAL: "untrusted-git-config",
      NODE_OPTIONS: "--require=untrusted-node-hook",
      DATABASE_URL: "postgresql://untrusted",
    };

    const snapshot = await createCandidatePrismaSnapshot({ commandRunner, candidate, environment });
    try {
      expect(snapshot.prismaRootPath.startsWith(resolve(tmpdir()))).toBe(true);
      expect(await readFile(snapshot.schemaPath, "utf8")).toBe(files[0]?.contents);
      expect(snapshot.fixtureTemplate).toBe(candidateFixtureTemplate);
      expect(await readFile(join(snapshot.prismaRootPath, "fixture", "two-scope-preflight.fixture.sql"), "utf8"))
        .toBe(candidateFixtureTemplate);
      expect(snapshot.policyMigrationContents).toBe(files.find((file) => (
        file.path.endsWith("/20260827120000_pilot_a_phase_authorization_policy/migration.sql")
      ))?.contents);
      expect(snapshot.migrationHashes).toEqual({
        "20260827000000_pilot_foundation/migration.sql": "b0408b3caba4d868cae2fcbcec39fb0442897ca17f877b7b09f0dd54809ba382",
        "20260827120000_pilot_a_phase_authorization_policy/migration.sql": "94d3c2e993802f440daf684038f8b39a97febf97da097ee9df5c63341964b348",
      });
      expect(snapshot.prismaMigrationChecksums).toEqual({
        "20260827000000_pilot_foundation": "b0408b3caba4d868cae2fcbcec39fb0442897ca17f877b7b09f0dd54809ba382",
        "20260827120000_pilot_a_phase_authorization_policy": "94d3c2e993802f440daf684038f8b39a97febf97da097ee9df5c63341964b348",
      });
      expect(snapshot.manifest.files).toContainEqual({
        path: "fixture/two-scope-preflight.fixture.sql",
        gitBlobSha: gitBlobSha1(candidateFixtureTemplate),
        contentSha256: sha256(candidateFixtureTemplate),
      });
      await expect(snapshot.verifyIntegrity()).resolves.toBeUndefined();

      expect(calls.every((call) => call.command === "git")).toBe(true);
      expect(calls.map((call) => logicalGitArguments(call.argumentsList)[0])).toEqual([
        "rev-parse",
        "rev-parse",
        "rev-parse",
        "ls-tree",
        "cat-file",
        "cat-file",
        "cat-file",
        "cat-file",
        "cat-file",
      ]);
      const lsTreeCall = calls.find((call) => logicalGitArguments(call.argumentsList)[0] === "ls-tree");
      expect(logicalGitArguments(lsTreeCall?.argumentsList ?? [])).toEqual([
        "ls-tree",
        "-r",
        "-z",
        "--full-tree",
        candidate.commitSha,
        "--",
        prismaRepositoryPath,
        fixtureRepositoryPath,
      ]);
      expect(calls.some((call) => logicalGitArguments(call.argumentsList)[0] === "show")).toBe(false);
      expect(calls.every((call) => call.environment === calls[0]?.environment)).toBe(true);
      expect(calls[0]?.environment).toEqual({
        PATH: "safe-git-path",
        GIT_CONFIG_GLOBAL: "NUL",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      });
      expect(Object.isFrozen(calls[0]?.environment)).toBe(true);
      expect(calls[0]?.environment).not.toHaveProperty("GIT_DIR");
      expect(calls[0]?.environment).not.toHaveProperty("NODE_OPTIONS");
      expect(calls[0]?.environment).not.toHaveProperty("DATABASE_URL");
    } finally {
      await snapshot.dispose();
    }
    await expect(access(snapshot.prismaRootPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(snapshot.verifyIntegrity()).rejects.toMatchObject({ publicCode: "a03_candidate_prisma_snapshot_disposed" });
  });

  it("rejects an extra candidate migration before it reads any blob", async () => {
    const files = await loadCurrentCandidateFiles();
    const { commandRunner, calls } = createFakeGitRunner([
      ...files,
      {
        path: `${prismaRepositoryPath}/migrations/20260827120000_pilot_a_phase_authorization_policy/unreviewed.sql`,
        contents: "SELECT 1;\n",
        objectSha: "f".repeat(40),
      },
    ]);

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_candidate_prisma_tree_invalid" });
    expect(calls.map((call) => logicalGitArguments(call.argumentsList)[0])).toEqual([
      "rev-parse",
      "rev-parse",
      "rev-parse",
      "ls-tree",
    ]);
  });

  it("rejects a schema datasource that names a direct or shadow route", async () => {
    const files = await loadCurrentCandidateFiles();
    const invalidFiles = files.map((file) => (
      file.path.endsWith("/schema.prisma")
        ? { ...file, contents: file.contents.replace(
          'url      = env("DATABASE_URL")',
          'url      = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")',
        ) }
        : file
    ));
    const { commandRunner } = createFakeGitRunner(invalidFiles);

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_candidate_prisma_schema_invalid" });
  });

  it("detects a tampered snapshot before a future Prisma child can use it", async () => {
    const { commandRunner } = createFakeGitRunner(await loadCurrentCandidateFiles());
    const snapshot = await createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    });
    try {
      await writeFile(snapshot.schemaPath, "datasource db { url = env(\"DATABASE_URL\") }\n", "utf8");
      await expect(snapshot.verifyIntegrity()).rejects.toMatchObject({
        publicCode: "a03_candidate_prisma_snapshot_integrity_invalid",
      });
    } finally {
      await snapshot.dispose();
    }
  });

  it("fails closed for a symlink-mode Git blob and leaves no temporary snapshot", async () => {
    const files = await loadCurrentCandidateFiles();
    const { commandRunner } = createFakeGitRunner(files.map((file) => (
      file.path.endsWith("/migration_lock.toml") ? { ...file, mode: "120000" } : file
    )));

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_candidate_prisma_tree_invalid" });
  });

  it("fails closed before reading blobs when the candidate fixture is missing", async () => {
    const files = (await loadCurrentCandidateFiles()).filter((file) => file.path !== fixtureRepositoryPath);
    const { commandRunner, calls } = createFakeGitRunner(files);

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_candidate_prisma_tree_invalid" });
    expect(calls.map((call) => logicalGitArguments(call.argumentsList)[0])).toEqual([
      "rev-parse",
      "rev-parse",
      "rev-parse",
      "ls-tree",
    ]);
  });

  it("fails closed for a nonregular candidate fixture entry", async () => {
    const files = (await loadCurrentCandidateFiles()).map((file) => (
      file.path === fixtureRepositoryPath ? { ...file, mode: "120000" } : file
    ));
    const { commandRunner } = createFakeGitRunner(files);

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_candidate_prisma_tree_invalid" });
  });

  it("rejects a candidate fixture whose bytes differ from the reviewed closed guard", async () => {
    const files = (await loadCurrentCandidateFiles()).map((file) => (
      file.path === fixtureRepositoryPath ? { ...file, contents: `${file.contents}\n-- altered guard\n` } : file
    ));
    const { commandRunner } = createFakeGitRunner(files);

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_immutable_fixture_hash_mismatch" });
  });

  it("rejects a schema byte change even when its datasource envelope remains closed", async () => {
    const files = (await loadCurrentCandidateFiles()).map((file) => (
      file.path.endsWith("/schema.prisma") ? { ...file, contents: `${file.contents}\n// candidate schema drift\n` } : file
    ));
    const { commandRunner } = createFakeGitRunner(files);

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_immutable_schema_hash_mismatch" });
  });

  it("rejects cat-file bytes that do not recreate the committed tree blob identity", async () => {
    const { commandRunner: baseRunner } = createFakeGitRunner(await loadCurrentCandidateFiles());
    let tampered = false;
    const commandRunner: CommandRunner = {
      run: async (command, argumentsList, timeoutMilliseconds, environment, workingDirectory) => {
        const result = await baseRunner.run(command, argumentsList, timeoutMilliseconds, environment, workingDirectory);
        if (!tampered && logicalGitArguments(argumentsList)[0] === "cat-file") {
          tampered = true;
          return { ...result, stdout: `${result.stdout}\n-- swapped blob bytes\n` };
        }
        return result;
      },
    };

    await expect(createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    })).rejects.toMatchObject({ publicCode: "a03_candidate_prisma_tree_invalid" });
  });

  it("refuses cleanup if the generated snapshot directory is replaced", async () => {
    const { commandRunner } = createFakeGitRunner(await loadCurrentCandidateFiles());
    const snapshot = await createCandidatePrismaSnapshot({
      commandRunner,
      candidate,
      environment: { PATH: "safe-git-path" },
    });
    try {
      await rm(snapshot.prismaRootPath, { recursive: true, force: true });
      await mkdir(snapshot.prismaRootPath, { mode: 0o700 });
      await expect(snapshot.verifyIntegrity()).rejects.toMatchObject({
        publicCode: "a03_candidate_prisma_snapshot_integrity_invalid",
      });
      await expect(snapshot.dispose()).rejects.toMatchObject({
        publicCode: "a03_candidate_prisma_snapshot_cleanup_failed",
      });
    } finally {
      await rm(snapshot.prismaRootPath, { recursive: true, force: true });
    }
  });
});

async function loadCurrentCandidateFiles(): Promise<readonly FakeGitFile[]> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const sourceFiles = [
    {
      repositoryPath: `${prismaRepositoryPath}/schema.prisma`,
      filesystemPath: join(repositoryRoot, prismaRepositoryPath, "schema.prisma"),
    },
    {
      repositoryPath: `${prismaRepositoryPath}/migrations/migration_lock.toml`,
      filesystemPath: join(repositoryRoot, prismaRepositoryPath, "migrations", "migration_lock.toml"),
    },
    {
      repositoryPath: `${prismaRepositoryPath}/migrations/20260827000000_pilot_foundation/migration.sql`,
      filesystemPath: join(repositoryRoot, prismaRepositoryPath, "migrations", "20260827000000_pilot_foundation", "migration.sql"),
    },
    {
      repositoryPath: `${prismaRepositoryPath}/migrations/20260827120000_pilot_a_phase_authorization_policy/migration.sql`,
      filesystemPath: join(repositoryRoot, prismaRepositoryPath, "migrations", "20260827120000_pilot_a_phase_authorization_policy", "migration.sql"),
    },
    {
      repositoryPath: fixtureRepositoryPath,
      filesystemPath: join(repositoryRoot, fixtureRepositoryPath),
    },
  ];
  return Promise.all(sourceFiles.map(async (sourceFile, index) => Object.freeze({
    path: sourceFile.repositoryPath,
    contents: await readFile(sourceFile.filesystemPath, "utf8"),
    objectSha: ["a", "b", "c", "d", "e"][index]!.repeat(40),
  })));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createFakeGitRunner(files: readonly FakeGitFile[]): Readonly<{
  commandRunner: CommandRunner;
  calls: GitCall[];
}> {
  const calls: GitCall[] = [];
  const normalizedFiles = files.map((file) => Object.freeze({
    ...file,
    objectSha: gitBlobSha1(file.contents),
  }));
  const filesBySha = new Map(normalizedFiles.map((file) => [file.objectSha, file]));
  const commandRunner: CommandRunner = {
    run: async (command, argumentsList, _timeoutMilliseconds, environment) => {
      calls.push({ command, argumentsList: [...argumentsList], environment });
      if (command !== "git") throw new A03ProofError("unexpected_program");
      const argumentsWithoutPrefix = logicalGitArguments(argumentsList);
      if (argumentsWithoutPrefix[0] === "rev-parse" && argumentsWithoutPrefix[1] === "--show-object-format") {
        return { exitCode: 0, stdout: `${candidate.objectFormat}\n`, stderr: "" };
      }
      if (argumentsWithoutPrefix[0] === "rev-parse" && argumentsWithoutPrefix[1] === "--verify") {
        if (argumentsWithoutPrefix[2] === `${candidate.commitSha}^{commit}`) {
          return { exitCode: 0, stdout: `${candidate.commitSha}\n`, stderr: "" };
        }
        if (argumentsWithoutPrefix[2] === `${candidate.commitSha}^{tree}`) {
          return { exitCode: 0, stdout: `${candidate.treeSha}\n`, stderr: "" };
        }
      }
      if (argumentsWithoutPrefix[0] === "ls-tree") {
        return {
          exitCode: 0,
          stdout: normalizedFiles.map((file) => (
            `${file.mode ?? "100644"} ${file.objectType ?? "blob"} ${file.objectSha}\t${file.path}\0`
          )).join(""),
          stderr: "",
        };
      }
      if (argumentsWithoutPrefix[0] === "cat-file" && argumentsWithoutPrefix[1] === "blob") {
        const source = filesBySha.get(argumentsWithoutPrefix[2] ?? "");
        return source === undefined
          ? { exitCode: 1, stdout: "", stderr: "absent" }
          : { exitCode: 0, stdout: source.contents, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unexpected git read" };
    },
  };
  return { commandRunner, calls };
}

function gitBlobSha1(contents: string): string {
  const bytes = Buffer.from(contents, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

function logicalGitArguments(argumentsList: readonly string[]): readonly string[] {
  expect(argumentsList.slice(0, candidateGitReadArgumentPrefix.length)).toEqual(candidateGitReadArgumentPrefix);
  expect(argumentsList[candidateGitReadArgumentPrefix.length]).toBe("-C");
  expect(argumentsList[candidateGitReadArgumentPrefix.length + 1]).toMatch(/[\\/]doorstar-pilot-foundation$/);
  return argumentsList.slice(candidateGitReadArgumentPrefix.length + 2);
}
