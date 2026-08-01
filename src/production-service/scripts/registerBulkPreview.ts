import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import { registerBulkPreview, bulkPreviewRegistrationVersion, type BulkPreviewArtifact } from "../src/services/bulkPreviewRegistration.js";

const confirmationArgument = "--confirm-bulk-preview-registration";
const workspaceRoot = resolve(process.cwd(), "../..");

type Manifest = {
  schemaVersion: string;
  profileVersion: string;
  previewArtifacts: string[];
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function relativeWorkspacePath(path: string): string {
  if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) throw new Error("manifest paths must be workspace-relative");
  const resolved = resolve(workspaceRoot, path);
  const relativePath = relative(workspaceRoot, resolved);
  if (relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) throw new Error("manifest path escapes workspace");
  return relativePath.split(sep).join("/");
}

function parsePreview(relativePath: string, content: Buffer): BulkPreviewArtifact {
  const payload = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
  if (payload.mode !== "preview" || payload.databaseWrite !== false || !Array.isArray(payload.records)) {
    throw new Error(`${relativePath}: preview must have mode=preview, databaseWrite=false, and records[]`);
  }
  if (payload.macroExecution === true) throw new Error(`${relativePath}: macroExecution must not be true`);
  const sourceFingerprint = typeof payload.sourceFingerprint === "string" ? payload.sourceFingerprint.replace(/^sha256:/i, "") : undefined;
  if (sourceFingerprint && !/^[a-f0-9]{64}$/i.test(sourceFingerprint)) throw new Error(`${relativePath}: sourceFingerprint must be SHA-256`);
  return { relativePath, contentSha256: sha256(content), sourceFingerprint, records: payload.records };
}

function requiresDoorstarTestSchema(): void {
  if (new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") !== "doorstar_test") {
    throw new Error("Bulk preview registration is allowed only with DATABASE_URL?schema=doorstar_test");
  }
}

async function main() {
  const manifestArgument = argument("--manifest");
  const reviewNote = argument("--review-note")?.trim();
  const actorRole = argument("--actor-role") ?? "administrator";
  const dryRun = process.argv.includes("--dry-run");
  if (!manifestArgument) throw new Error("--manifest is required");
  if (!reviewNote || reviewNote.length < 10) throw new Error("--review-note must contain at least 10 characters");
  if (!['administrator', 'vezeto'].includes(actorRole)) throw new Error("--actor-role must be administrator or vezeto");
  if (!dryRun && !process.argv.includes(confirmationArgument)) throw new Error(`Human confirmation required: ${confirmationArgument}`);

  const manifestRelativePath = relativeWorkspacePath(manifestArgument);
  const manifestContent = await readFile(resolve(workspaceRoot, manifestRelativePath));
  const manifest = JSON.parse(manifestContent.toString("utf8")) as Manifest;
  if (manifest.schemaVersion !== bulkPreviewRegistrationVersion) throw new Error(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}`);
  if (!manifest.profileVersion?.trim()) throw new Error("manifest profileVersion is required");
  if (!Array.isArray(manifest.previewArtifacts) || manifest.previewArtifacts.length === 0) throw new Error("manifest previewArtifacts must not be empty");
  if (new Set(manifest.previewArtifacts).size !== manifest.previewArtifacts.length) throw new Error("manifest previewArtifacts must be unique");

  const artifacts = await Promise.all(manifest.previewArtifacts.map(async (artifactPath) => {
    const artifactRelativePath = relativeWorkspacePath(artifactPath);
    return parsePreview(artifactRelativePath, await readFile(resolve(workspaceRoot, artifactRelativePath)));
  }));
  if (dryRun) {
    console.info(JSON.stringify({ dryRun: true, manifest: manifestRelativePath, profileVersion: manifest.profileVersion, artifactCount: artifacts.length, recordCount: artifacts.reduce((total, artifact) => total + artifact.records.length, 0) }));
    return;
  }

  requiresDoorstarTestSchema();
  const prisma = new PrismaClient();
  try {
    const result = await registerBulkPreview(prisma, {
      profileVersion: manifest.profileVersion.trim(),
      manifestRelativePath,
      manifestSha256: sha256(manifestContent),
      reviewedByRole: actorRole,
      reviewNote,
      artifacts,
    });
    console.info(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
