#!/usr/bin/env node
/** Build the exact dependency-free ESM closure required by the private
 * Doorstar woodworking tenant. No credentials or runtime configuration are
 * copied: agents.json remains a root-owned VPS-only file. */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distributionDirectory = path.join(packageDirectory, "dist");
const runtimeDirectory = path.join(distributionDirectory, "tenant-woodworking-runtime");
const runtimePackageSource = path.join(packageDirectory, "deploy", "runtime-package.json");
const runtimeFiles = ["tenantWoodworkingRagServer.js", "knowledge.js", "tenantWoodworkingKnowledge.js"];

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function assertRuntimeDirectory() {
  const relative = path.relative(distributionDirectory, runtimeDirectory);
  if (relative !== "tenant-woodworking-runtime" || path.isAbsolute(relative)) {
    throw new Error("Refusing to assemble the tenant runtime outside dist/tenant-woodworking-runtime.");
  }
}

async function assertRegularFile(filePath) {
  const details = await stat(filePath);
  if (!details.isFile()) throw new Error("Required tenant runtime file is missing or not regular: " + path.basename(filePath));
}

async function fingerprintFile(fileName) {
  const content = await readFile(path.join(runtimeDirectory, fileName));
  return { file: fileName, sha256: sha256(content), bytes: content.byteLength };
}

async function main() {
  assertRuntimeDirectory();
  for (const fileName of runtimeFiles) {
    await assertRegularFile(path.join(distributionDirectory, fileName));
  }
  await assertRegularFile(runtimePackageSource);

  // This is a generated subdirectory below the package dist directory; its
  // exact resolved path is verified above before the replacement is made.
  await rm(runtimeDirectory, { recursive: true, force: true });
  await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  for (const fileName of runtimeFiles) {
    await copyFile(path.join(distributionDirectory, fileName), path.join(runtimeDirectory, fileName));
  }
  await copyFile(runtimePackageSource, path.join(runtimeDirectory, "package.json"));

  const files = await Promise.all([...runtimeFiles, "package.json"].map(fingerprintFile));
  await writeFile(
    path.join(runtimeDirectory, "runtime-manifest.json"),
    JSON.stringify({ name: "doorstar-woodworking-rag", files }, null, 2) + "\n",
    { encoding: "utf8", mode: 0o600 }
  );
  console.error("Doorstar woodworking runtime assembled at " + runtimeDirectory + ".");
}

main().catch((error) => {
  console.error("Doorstar woodworking runtime assembly failed: " + (error instanceof Error ? error.message : "unknown error"));
  process.exitCode = 1;
});
