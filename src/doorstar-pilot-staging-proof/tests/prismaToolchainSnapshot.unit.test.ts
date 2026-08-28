import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  calculatePrismaToolchainMerkleSha256,
  createPrismaToolchainSnapshot,
} from "../src/runner/prismaToolchainSnapshot.js";

const expectedCanonicalTreeJson = `{
  "files": [
    {
      "path": "@prisma/engines/index.js",
      "sha256": "6e3be32ff3715ab8ebc3278b4d68adebbb4b301554339fcb8c9986f45ab7dec6",
      "size": 54
    },
    {
      "path": "@prisma/engines/package.json",
      "sha256": "dab72be18ab9eb11a2f414805d88bde0ce7c802b6795b1c09820f211a23e7a6b",
      "size": 47
    },
    {
      "path": "@prisma/engines/query_engine-windows.dll.node",
      "sha256": "bf04e08ee4342d9166da572da1d74fbdaf01f33ce13f891f1319b8f5b336e664",
      "size": 25
    },
    {
      "path": "@prisma/engines/schema-engine-windows.exe",
      "sha256": "116452d1416412123db98f73608cd149cf7999cb806fbd5e40854f285c6b5fbb",
      "size": 26
    },
    {
      "path": "prisma/build/index.js",
      "sha256": "67ae2f2ba1e3f17d84c31d983aad5503270a672ae99b39db3357d926c30743c0",
      "size": 105
    },
    {
      "path": "prisma/package.json",
      "sha256": "7ce854fc8be3104d97d06c744de7252d395c2985345b1ed03ca39c011bcb5a0a",
      "size": 36
    }
  ],
  "kind": "doorstar-pilot-gate1-prisma-toolchain-tree",
  "schemaVersion": 1
}
`;
const expectedTreeSha256 = "5f61daeb3c1538c7c13f5d5912dcdefeec482fe7ddd6e2e74ae4e0a799041f1f";
const execFileAsync = promisify(execFile);

describe("Prisma toolchain snapshot", () => {
  it("uses the shared exact v1 canonical JSON digest and copies the verified external tree", async () => {
    const sourceRootPath = await createExternalToolchain();
    try {
      const first = await calculatePrismaToolchainMerkleSha256(sourceRootPath);
      const repeated = await calculatePrismaToolchainMerkleSha256(sourceRootPath);

      // This literal makes the compatibility contract with the independent
      // Gate 1 verifier explicit: sorted keys, two spaces and a trailing LF.
      expect(createHash("sha256").update(expectedCanonicalTreeJson, "utf8").digest("hex"))
        .toBe(expectedTreeSha256);
      expect(first).toBe(expectedTreeSha256);
      expect(repeated).toBe(expectedTreeSha256);

      const snapshot = await createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: first,
      });
      try {
        expect(snapshot.treeSha256).toBe(expectedTreeSha256);
        expect(snapshot.rootPath).not.toBe(sourceRootPath);
        expect(snapshot.childTempPath).not.toBe(snapshot.rootPath);
        const childTempMetadata = await lstat(snapshot.childTempPath);
        expect(childTempMetadata.isDirectory()).toBe(true);
        expect(childTempMetadata.isSymbolicLink()).toBe(false);
        await expect(readFile(snapshot.prismaCliPath, "utf8"))
          .resolves.toContain("@prisma/engines");
        const resolveFromSnapshotCli = createRequire(snapshot.prismaCliPath);
        expect(resolveFromSnapshotCli.resolve("@prisma/engines"))
          .toContain(`${snapshot.rootPath}${process.platform === "win32" ? "\\" : "/"}node_modules`);
        await expect(snapshot.verifyIntegrity()).resolves.toBeUndefined();
        await expect(execFileAsync(process.execPath, [snapshot.prismaLauncherPath], {
          env: cleanLauncherEnvironment(),
        })).resolves.toMatchObject({ stderr: "" });
      } finally {
        await snapshot.dispose();
      }
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("rejects a symlink or junction anywhere in the external toolchain", async () => {
    const sourceRootPath = await createExternalToolchain();
    try {
      await symlink(
        join(sourceRootPath, "prisma"),
        join(sourceRootPath, "linked-prisma"),
        process.platform === "win32" ? "junction" : "dir",
      );

      await expect(calculatePrismaToolchainMerkleSha256(sourceRootPath)).rejects.toMatchObject({
        publicCode: "a03_prisma_toolchain_source_symlink_forbidden",
      });
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("rejects a source changed after its verifier digest and a subsequently modified snapshot", async () => {
    const sourceRootPath = await createExternalToolchain();
    try {
      const reviewedTreeSha256 = await calculatePrismaToolchainMerkleSha256(sourceRootPath);
      await writeFile(join(sourceRootPath, "prisma", "build", "index.js"), "module.exports = { changed: true };\n", "utf8");

      await expect(createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: reviewedTreeSha256,
      })).rejects.toMatchObject({ publicCode: "a03_prisma_toolchain_source_tree_hash_mismatch" });

      const snapshot = await createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      });
      try {
        await writeFile(snapshot.prismaCliPath, "module.exports = { tampered: true };\n", "utf8");
        await expect(snapshot.verifyIntegrity()).rejects.toMatchObject({
          publicCode: "a03_prisma_toolchain_snapshot_integrity_invalid",
        });
      } finally {
        await snapshot.dispose();
      }
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("requires the Prisma CLI entrypoint to be a regular nonempty source file", async () => {
    const sourceRootPath = await createExternalToolchain({ includeEntrypoint: false });
    try {
      await expect(createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      })).rejects.toMatchObject({ publicCode: "a03_prisma_toolchain_entrypoint_invalid" });
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("rejects a missing host schema engine before any Prisma child can run", async () => {
    const sourceRootPath = await createExternalToolchain({ includeSchemaEngine: false });
    try {
      await expect(createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      })).rejects.toMatchObject({ publicCode: "a03_prisma_toolchain_entrypoint_invalid" });
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("requires an explicit CommonJS Prisma package manifest and rejects static ESM entrypoints", async () => {
    const esmManifestRootPath = await createExternalToolchain({ manifestType: "module" });
    const staticEsmRootPath = await createExternalToolchain({ staticEsmCli: true });
    try {
      await expect(createPrismaToolchainSnapshot({
        sourceRootPath: esmManifestRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(esmManifestRootPath),
      })).rejects.toMatchObject({ publicCode: "a03_prisma_toolchain_cli_cjs_required" });
      await expect(createPrismaToolchainSnapshot({
        sourceRootPath: staticEsmRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(staticEsmRootPath),
      })).rejects.toMatchObject({ publicCode: "a03_prisma_toolchain_cli_cjs_required" });
    } finally {
      await removeGeneratedTestDirectory(esmManifestRootPath);
      await removeGeneratedTestDirectory(staticEsmRootPath);
    }
  });

  it("accepts the leading shebang that Node strips from a CommonJS CLI", async () => {
    const sourceRootPath = await createExternalToolchain({ leadingShebang: true });
    try {
      const snapshot = await createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      });
      try {
        await expect(execFileAsync(process.execPath, [snapshot.prismaLauncherPath], {
          env: cleanLauncherEnvironment(),
        })).resolves.toMatchObject({ stderr: "" });
      } finally {
        await snapshot.dispose();
      }
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("rejects a node_modules replacement in the launcher itself after the pre-launch integrity check", async () => {
    const sourceRootPath = await createExternalToolchain();
    try {
      const snapshot = await createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      });
      try {
        await snapshot.verifyIntegrity();
        const nodeModulesRootPath = join(snapshot.rootPath, "node_modules");
        await rm(nodeModulesRootPath, { recursive: true, force: true, maxRetries: 2 });
        await symlink(sourceRootPath, nodeModulesRootPath, process.platform === "win32" ? "junction" : "dir");

        await expect(execFileAsync(process.execPath, [snapshot.prismaLauncherPath], {
          env: cleanLauncherEnvironment(),
        })).rejects.toMatchObject({
          stderr: expect.stringContaining("a03_prisma_launcher_snapshot_integrity_invalid"),
        });
      } finally {
        await snapshot.dispose();
      }
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("does not follow a launcher symlink when it verifies launcher integrity", async () => {
    const sourceRootPath = await createExternalToolchain();
    try {
      const snapshot = await createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      });
      try {
        const launcherMirrorPath = join(sourceRootPath, "launcher-mirror.cjs");
        await writeFile(launcherMirrorPath, await readFile(snapshot.prismaLauncherPath), { flag: "wx" });
        await rm(snapshot.prismaLauncherPath, { force: true });
        await symlink(launcherMirrorPath, snapshot.prismaLauncherPath, "file");

        await expect(snapshot.verifyIntegrity()).rejects.toMatchObject({
          publicCode: "a03_prisma_toolchain_snapshot_integrity_invalid",
        });
        await expect(execFileAsync(process.execPath, [snapshot.prismaLauncherPath], {
          env: cleanLauncherEnvironment(),
        })).rejects.toMatchObject({
          stderr: expect.stringContaining("a03_prisma_launcher_snapshot_integrity_invalid"),
        });
      } finally {
        await snapshot.dispose();
      }
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });

  it("runs only through the private node_modules closure and rejects a poisoned NODE_PATH fallback", async () => {
    const sourceRootPath = await createExternalToolchain({ requestPoisonModule: true });
    const poisonRootPath = await mkdtemp(join(tmpdir(), "doorstar-prisma-toolchain-poison-test-"));
    try {
      await mkdir(join(poisonRootPath, "poison-target"), { recursive: true });
      await writeFile(join(poisonRootPath, "poison-target", "index.js"), 'process.stdout.write("POISON");\n', "utf8");
      const snapshot = await createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      });
      try {
        await expect(execFileAsync(process.execPath, [snapshot.prismaLauncherPath], {
          env: { ...cleanLauncherEnvironment(), NODE_PATH: poisonRootPath },
        })).rejects.toMatchObject({ stderr: expect.stringContaining("a03_prisma_launcher_untrusted_node_environment") });
      } finally {
        await snapshot.dispose();
      }
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
      await removeGeneratedTestDirectory(poisonRootPath);
    }
  });

  it("removes only its generated private snapshot directory on dispose", async () => {
    const sourceRootPath = await createExternalToolchain();
    try {
      const snapshot = await createPrismaToolchainSnapshot({
        sourceRootPath,
        expectedTreeSha256: await calculatePrismaToolchainMerkleSha256(sourceRootPath),
      });
      const snapshotRootPath = snapshot.rootPath;
      const childTempPath = snapshot.childTempPath;

      await snapshot.dispose();
      expect(existsSync(snapshotRootPath)).toBe(false);
      expect(existsSync(childTempPath)).toBe(false);
      await expect(snapshot.dispose()).resolves.toBeUndefined();
      await expect(snapshot.verifyIntegrity()).rejects.toMatchObject({
        publicCode: "a03_prisma_toolchain_snapshot_disposed",
      });
    } finally {
      await removeGeneratedTestDirectory(sourceRootPath);
    }
  });
});

async function createExternalToolchain(
  {
    includeEntrypoint = true,
    includeSchemaEngine = true,
    requestPoisonModule = false,
    manifestType = "commonjs",
    staticEsmCli = false,
    leadingShebang = false,
  }: Readonly<{
    includeEntrypoint?: boolean;
    includeSchemaEngine?: boolean;
    requestPoisonModule?: boolean;
    manifestType?: "commonjs" | "module";
    staticEsmCli?: boolean;
    leadingShebang?: boolean;
  }> = {},
): Promise<string> {
  const rootPath = await mkdtemp(join(tmpdir(), "doorstar-prisma-toolchain-source-test-"));
  await mkdir(join(rootPath, "prisma", "build"), { recursive: true });
  await mkdir(join(rootPath, "@prisma", "engines"), { recursive: true });
  if (includeEntrypoint) {
    await writeFile(
      join(rootPath, "prisma", "build", "index.js"),
      staticEsmCli
        ? 'import "node:fs";\n'
        : `${leadingShebang ? "#!/usr/bin/env node\n" : ""}const { engineMarker } = require("@prisma/engines");${requestPoisonModule ? ' require("poison-target");' : ""} module.exports = { prismaToolchain: engineMarker };\n`,
      "utf8",
    );
  }
  await writeFile(
    join(rootPath, "prisma", "package.json"),
    `${JSON.stringify({ name: "prisma", type: manifestType })}\n`,
    "utf8",
  );
  await writeFile(
    join(rootPath, "@prisma", "engines", "package.json"),
    '{"name":"@prisma/engines","main":"./index.js"}\n',
    "utf8",
  );
  await writeFile(join(rootPath, "@prisma", "engines", "index.js"), 'module.exports = { engineMarker: "snapshot-engine" };\n', "utf8");
  if (includeSchemaEngine) {
    await writeFile(join(rootPath, "@prisma", "engines", "schema-engine-windows.exe"), "schema-engine-placeholder\n", "utf8");
    await writeFile(join(rootPath, "@prisma", "engines", "query_engine-windows.dll.node"), "query-engine-placeholder\n", "utf8");
  }
  return rootPath;
}

async function removeGeneratedTestDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true, maxRetries: 2 });
}

function cleanLauncherEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" };
}
