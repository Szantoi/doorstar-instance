import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourcePackagesRoot = resolve(packageRoot, "..");
const localSourceRoot = join(packageRoot, "src");
const siblingPackages = [
  "doorstar-pilot-foundation",
  "doorstar-pilot-bff",
  "doorstar-pilot-bootstrap",
] as const;
const staticImportPatterns = [
  /^\s*import\s*["']([^"']+)["']/gm,
  /^\s*(?:import|export)\s+(?:type\s+)?[\w\s{},*]+?\s+from\s+["']([^"']+)["']/gm,
] as const;
const disabledProofDockerScript = "node scripts/gate1ExternalTrustAnchorRequired.mjs";
const publishedFiles = Object.freeze([
  "README.md",
  "scripts/gate1ExternalTrustAnchorRequired.mjs",
]);

export type HarnessBoundaryReport = Readonly<{
  package: "@doorstar/pilot-staging-proof";
  boundary: "PASS";
  sourceFiles: number;
  checkedSiblings: readonly string[];
}>;

/**
 * A runtime Gate 0 check, as well as a source-test command: the disposable
 * package may not cross-import production packages and production packages
 * may not import this harness.
 */
export async function verifyHarnessBoundary(): Promise<HarnessBoundaryReport> {
  const localSourceFiles = await listFiles(localSourceRoot, (path) => path.endsWith(".ts"));
  const violations: string[] = [];
  await verifyDisabledPackageEntrypoints(violations);
  for (const file of localSourceFiles) {
    const contents = await readFile(file, "utf8");
    for (const pattern of staticImportPatterns) {
      for (const match of contents.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier.startsWith("node:") || specifier === "pg") continue;
        if (!specifier.startsWith(".")) {
          violations.push(`${relative(packageRoot, file)} imports non-local runtime module ${JSON.stringify(specifier)}`);
          continue;
        }
        const target = resolve(dirname(file), specifier).replace(/\.js$/, ".ts");
        if (!target.startsWith(`${localSourceRoot}\\`) && target !== localSourceRoot) {
          violations.push(`${relative(packageRoot, file)} imports outside staging-proof source ${JSON.stringify(specifier)}`);
        }
      }
    }
  }

  for (const sibling of siblingPackages) {
    const siblingRoot = join(sourcePackagesRoot, sibling);
    const siblingFiles = await listFiles(siblingRoot, (path) => (
      path.endsWith(".ts") || path.endsWith(".mjs") || path.endsWith(".json")
    ));
    for (const file of siblingFiles) {
      const contents = await readFile(file, "utf8");
      if (contents.includes("doorstar-pilot-staging-proof")) {
        violations.push(`${sibling}/${relative(siblingRoot, file)} references the disposable staging-proof package`);
      }
    }
  }

  const forbiddenPackagePaths = [join(packageRoot, "prisma"), join(packageRoot, "docker-compose.yml")];
  for (const forbiddenPath of forbiddenPackagePaths) {
    try {
      await readdir(forbiddenPath);
      violations.push(`disposable staging-proof package contains forbidden production lineage path ${relative(packageRoot, forbiddenPath)}`);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
  }

  if (violations.length > 0) {
    throw new Error(`a03_staging_proof_boundary_invalid\n${violations.join("\n")}`);
  }
  return {
    package: "@doorstar/pilot-staging-proof",
    boundary: "PASS",
    sourceFiles: localSourceFiles.length,
    checkedSiblings: siblingPackages,
  };
}

/**
 * A stale generated `dist` tree once contained an executable historical
 * Docker runner. Keep every package-managed entry point on the independent
 * hard stop and publish only that inert script until a separate verifier is
 * released outside the candidate checkout.
 */
async function verifyDisabledPackageEntrypoints(violations: string[]): Promise<void> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  } catch {
    violations.push("disposable staging-proof package manifest is unreadable");
    return;
  }
  if (manifest === null || typeof manifest !== "object") {
    violations.push("disposable staging-proof package manifest is invalid");
    return;
  }
  const packageManifest = manifest as Readonly<{
    main?: unknown;
    bin?: unknown;
    files?: unknown;
    scripts?: Readonly<Record<string, unknown>>;
  }>;
  if (packageManifest.main !== undefined || packageManifest.bin !== undefined) {
    violations.push("disposable staging-proof package exposes a main or bin entry point");
  }
  if (packageManifest.scripts?.["proof:docker"] !== disabledProofDockerScript) {
    violations.push("disposable staging-proof proof:docker script is not the external-trust hard stop");
  }
  if (
    !Array.isArray(packageManifest.files)
    || packageManifest.files.length !== publishedFiles.length
    || packageManifest.files.some((entry, index) => entry !== publishedFiles[index])
  ) {
    violations.push("disposable staging-proof package publication whitelist is not the inert hard-stop set");
  }
}

async function listFiles(directory: string, include: (path: string) => boolean): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git", "evidence"].includes(entry.name)) return [];
      return listFiles(path, include);
    }
    return entry.isFile() && include(path) ? [path] : [];
  }));
  return nested.flat();
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
