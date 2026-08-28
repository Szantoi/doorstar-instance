import { describe, expect, it } from "vitest";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { createDisposableProofPlan } from "../src/runner/a03Config.js";
import type { CommandRunner } from "../src/runner/commandRunner.js";
import type { CandidatePrismaSnapshot } from "../src/runner/candidatePrismaSnapshot.js";
import type { PrismaToolchainSnapshot } from "../src/runner/prismaToolchainSnapshot.js";
import {
  createPrismaMigrationChildEnvironment,
  deployImmutablePilotMigrationsThroughPrisma,
} from "../src/runner/databaseSetup.js";

const generatedDatabaseUrl = "postgresql://generated-migrator:generated-password@127.0.0.1:54321/a03_proof";
const privateChildTempPath = process.platform === "win32"
  ? "C:\\approved-private-prisma-temp"
  : "/approved-private-prisma-temp";

const ignoredAmbientEnvironment: NodeJS.ProcessEnv = {
  Path: "safe-prisma-path",
  systemroot: "C:\\Windows",
  WINDIR: "C:\\Windows",
  ComSpec: "C:\\Windows\\System32\\cmd.exe",
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  TEMP: "C:\\Temp",
  tmp: "C:\\Tmp",
  NODE_OPTIONS: "--require=untrusted-node-hook",
  NODE_PATH: "untrusted-node-path",
  GIT_DIR: "untrusted-git-dir",
  GIT_CONFIG_GLOBAL: "untrusted-git-config",
  PRISMA_SCHEMA_PATH: "untrusted-prisma-schema",
  PRISMA_QUERY_ENGINE_BINARY: "untrusted-prisma-engine",
  PGHOST: "untrusted-postgres-host",
  PGPASSWORD: "untrusted-postgres-password",
  PGSERVICE: "untrusted-postgres-service",
  PGOPTIONS: "untrusted-postgres-options",
  DATABASE_URL: "postgresql://untrusted-database-url",
  DIRECT_URL: "postgresql://untrusted-direct-url",
  HTTP_PROXY: "http://untrusted-proxy.invalid",
  HTTPS_PROXY: "http://untrusted-proxy.invalid",
  ALL_PROXY: "http://untrusted-proxy.invalid",
  NO_PROXY: "untrusted-no-proxy",
  NPM_TOKEN: "untrusted-package-token",
  DOORSTAR_A03_ACKNOWLEDGEMENT: "untrusted-acknowledgement",
  DOORSTAR_PILOT_OIDC_SECRET: "untrusted-doorstar-secret",
  PILOT_BOOTSTRAP_TOKEN: "untrusted-pilot-token",
};

const forbiddenNames = [
  "NODE_OPTIONS",
  "NODE_PATH",
  "GIT_DIR",
  "GIT_CONFIG_GLOBAL",
  "PRISMA_SCHEMA_PATH",
  "PRISMA_QUERY_ENGINE_BINARY",
  "PGHOST",
  "PGPASSWORD",
  "PGSERVICE",
  "PGOPTIONS",
  "DIRECT_URL",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NPM_TOKEN",
  "DOORSTAR_A03_ACKNOWLEDGEMENT",
  "DOORSTAR_PILOT_OIDC_SECRET",
  "PILOT_BOOTSTRAP_TOKEN",
] as const;

describe("Prisma migration child environment", () => {
  it("uses a fixed host-safe PATH, a snapshot-owned temp root, and the generated disposable URL", () => {
    const childEnvironment = createPrismaMigrationChildEnvironment(
      generatedDatabaseUrl,
      privateChildTempPath,
      "win32",
    );

    expect(childEnvironment).toEqual(expectedWindowsPrismaEnvironment(generatedDatabaseUrl));
    expect(Object.isFrozen(childEnvironment)).toBe(true);
    for (const name of forbiddenNames) {
      expect(childEnvironment).not.toHaveProperty(name);
    }
    expect(childEnvironment.PATH).not.toBe(ignoredAmbientEnvironment.Path);
    expect(childEnvironment.TEMP).toBe(privateChildTempPath);
    expect(childEnvironment.TMP).toBe(privateChildTempPath);
    expect(childEnvironment).not.toHaveProperty("ComSpec");
    expect(childEnvironment).not.toHaveProperty("PATHEXT");
  });

  it("uses no ambient caller PATH or temp routing on Unix", () => {
    const childEnvironment = createPrismaMigrationChildEnvironment(
      generatedDatabaseUrl,
      privateChildTempPath,
      "linux",
    );

    expect(childEnvironment).toEqual({
      PATH: "/usr/bin:/bin",
      TEMP: privateChildTempPath,
      TMP: privateChildTempPath,
      TMPDIR: privateChildTempPath,
      DATABASE_URL: generatedDatabaseUrl,
    });
    expect(childEnvironment.PATH).not.toBe(ignoredAmbientEnvironment.Path);
    expect(childEnvironment.TEMP).not.toBe(ignoredAmbientEnvironment.TEMP);
    for (const name of forbiddenNames) {
      expect(childEnvironment).not.toHaveProperty(name);
    }
  });

  it("passes the isolated environment to the fixed Prisma migrate deploy command", async () => {
    const calls: Array<Readonly<{
      command: string;
      argumentsList: readonly string[];
      environment: NodeJS.ProcessEnv | undefined;
      workingDirectory: string | undefined;
    }>> = [];
    const commandRunner: CommandRunner = {
      run: async (command, argumentsList, _timeoutMilliseconds, environment, workingDirectory) => {
        calls.push({ command, argumentsList: [...argumentsList], environment, workingDirectory });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    const plan = createDisposableProofPlan();
    let snapshotIntegrityChecks = 0;
    const snapshot = {
      prismaRootPath: "C:\\approved-prisma-snapshot",
      schemaPath: "C:\\approved-prisma-snapshot\\schema.prisma",
      migrationsDirectoryPath: "C:\\approved-prisma-snapshot\\migrations",
      migrationHashes: {
        "20260827000000_pilot_foundation/migration.sql": "a".repeat(64),
      },
      prismaMigrationChecksums: {
        "20260827000000_pilot_foundation": "a".repeat(64),
      },
      manifest: {},
      manifestSha256: "b".repeat(64),
      verifyIntegrity: async () => { snapshotIntegrityChecks += 1; },
      dispose: async () => {},
    } as unknown as CandidatePrismaSnapshot;
    let toolchainIntegrityChecks = 0;
    const toolchainSnapshot = {
      rootPath: "C:\\approved-prisma-toolchain-snapshot",
      prismaCliPath: "C:\\approved-prisma-toolchain-snapshot\\prisma\\build\\index.js",
      prismaLauncherPath: "C:\\approved-prisma-toolchain-snapshot\\doorstar-prisma-launcher.cjs",
      childTempPath: privateChildTempPath,
      treeSha256: "c".repeat(64),
      verifyIntegrity: async () => { toolchainIntegrityChecks += 1; },
      dispose: async () => {},
    } as unknown as PrismaToolchainSnapshot;

    await deployImmutablePilotMigrationsThroughPrisma(
      commandRunner,
      plan,
      54321,
      snapshot,
      toolchainSnapshot,
    );

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.command).toBe(process.execPath);
    expect(call?.argumentsList.slice(1, 4)).toEqual(["migrate", "deploy", "--schema"]);
    expect(call?.argumentsList[0]).toBe(toolchainSnapshot.prismaLauncherPath);
    expect(call?.argumentsList[4]).toBe(snapshot.schemaPath);
    expect(call?.workingDirectory).toBe(snapshot.prismaRootPath);
    expect(call?.environment).toEqual(expectedCurrentPlatformPrismaEnvironment());
    for (const name of forbiddenNames) {
      expect(call?.environment).not.toHaveProperty(name);
    }
    expect(snapshotIntegrityChecks).toBe(2);
    expect(toolchainIntegrityChecks).toBe(2);
  });
});

function expectedCurrentPlatformPrismaEnvironment(): NodeJS.ProcessEnv {
  const generatedUrl = expect.stringMatching(
    /^postgresql:\/\/a03_migrator_[a-z0-9]+:[A-Za-z0-9_-]+@127\.0\.0\.1:54321\//,
  );
  return process.platform === "win32"
    ? expectedWindowsPrismaEnvironment(generatedUrl)
    : {
      PATH: "/usr/bin:/bin",
      TEMP: privateChildTempPath,
      TMP: privateChildTempPath,
      TMPDIR: privateChildTempPath,
      DATABASE_URL: generatedUrl,
    };
}

function expectedWindowsPrismaEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const configuredSystemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (configuredSystemRoot === undefined) throw new Error("Windows system root is required for this unit test");
  const systemRoot = realpathSync.native(configuredSystemRoot);
  return {
    PATH: `${join(systemRoot, "System32")};${systemRoot}`,
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    TEMP: privateChildTempPath,
    TMP: privateChildTempPath,
    DATABASE_URL: databaseUrl,
  };
}
