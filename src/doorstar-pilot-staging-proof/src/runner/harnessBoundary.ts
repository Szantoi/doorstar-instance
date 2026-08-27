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
