import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackageManifest = {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  main?: string;
  bin?: unknown;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(packageRoot, "src");
const scriptsRoot = join(packageRoot, "scripts");
const distRoot = join(packageRoot, "dist");
const schemaPath = join(packageRoot, "prisma", "schema.prisma");
const migrationPath = join(packageRoot, "prisma", "migrations", "20260827000000_pilot_foundation", "migration.sql");
const policyMigrationPath = join(
  packageRoot,
  "prisma",
  "migrations",
  "20260827120000_pilot_a_phase_authorization_policy",
  "migration.sql",
);
const ignoredDirectoryNames = new Set([".git", "dist", "node_modules"]);
const expectedInitialMigrationSha256 = "b0408b3caba4d868cae2fcbcec39fb0442897ca17f877b7b09f0dd54809ba382";
const expectedAPolicyMigrationSha256 = "a00ba2424729003bf9a8bfac87dfc11e0306d75b57b6cba347c97db83418e7d7";
const expectedFoundationSourceSha256: Readonly<Record<string, string>> = {
  "src/domain/pilotScope.ts": "d8e6ee69a6df32ae72a6d574337adf53ba712d1e02a1ef710a51a409d389b74a",
  "src/domain/roles.ts": "135acfb3c76879bc1dfc475896923537a6b3093e9e9e196e66f024dfb67990aa",
  "src/index.ts": "156a09858a66f2123175dcdf994d6f7044f744a83dfb2ea9928da8a11cc5fcf6",
};
const expectedBuiltFiles = new Set([
  "domain/pilotScope.d.ts",
  "domain/pilotScope.js",
  "domain/pilotScope.js.map",
  "domain/roles.d.ts",
  "domain/roles.js",
  "domain/roles.js.map",
  "index.d.ts",
  "index.js",
  "index.js.map",
]);
const expectedSchemaValidatorSha256 = "59e888ac488349a1705f9c9d57c4b5b3cab3621532e09b4fff017b2e91acca78";
const allowedPackageFiles = new Set([
  ".env.example",
  "README.md",
  "package-lock.json",
  "package.json",
  "prisma/migrations/20260827000000_pilot_foundation/migration.sql",
  "prisma/migrations/20260827120000_pilot_a_phase_authorization_policy/migration.sql",
  "prisma/migrations/migration_lock.toml",
  "prisma/schema.prisma",
  "scripts/validatePrismaSchema.mjs",
  "scripts/verifyAPolicySource.ts",
  "scripts/verifyFoundationBoundary.ts",
  "src/domain/pilotScope.ts",
  "src/domain/roles.ts",
  "src/index.ts",
  "tests/pilotScope.unit.test.ts",
  "tests/roles.unit.test.ts",
  "tests/aPolicySource.unit.test.ts",
  "tests/schemaBoundary.unit.test.ts",
  "tsconfig.json",
  "vitest.unit.config.ts",
]);

const expectedDependencies: Record<string, string> = {
  "@prisma/client": "6.3.1",
};

const expectedDevDependencies: Record<string, string> = {
  "@types/node": "22.10.5",
  prisma: "6.3.1",
  tsx: "4.19.2",
  typescript: "5.7.3",
  vitest: "2.1.8",
};

const expectedPackageScripts: Record<string, string> = {
  build: "tsc -p tsconfig.json",
  lint: "tsc -p tsconfig.json --noEmit",
  "prisma:generate": "prisma generate",
  "prisma:validate": "node scripts/validatePrismaSchema.mjs",
  "test:unit": "vitest run --config vitest.unit.config.ts",
  "verify:a:policy": "tsx scripts/verifyAPolicySource.ts",
  "verify:foundation": "tsx scripts/verifyFoundationBoundary.ts",
  "verify:source": "npm run verify:foundation && npm run verify:a:policy",
  test: "npm run verify:source && npm run test:unit",
};

const forbiddenExecutablePatterns: ReadonlyArray<readonly [string, RegExp]> = [
  ["legacy Office/Plant reference", /production-service|uzemi-tabla-web|joinerytech-plant|doorstar-flow-lab|doorstar-calculation-lab/i],
  ["browser authority header", /x-role|x-station|x-principal/i],
  ["HTTP server import", /\b(?:from|require\s*\(|import\s*\()\s*["'](?:node:)?https?["']/i],
  ["HTTP framework import", /\b(?:from|require\s*\(|import\s*\()\s*["'](?:express|fastify|hono|koa)["']/i],
  ["OIDC or JOSE client import", /\b(?:from|require\s*\(|import\s*\()\s*["'](?:openid-client|jose)["']/i],
  ["bare framework import", /\bimport\s*["'](?:express|fastify|hono|koa|openid-client|jose)["']/i],
  ["dynamic module import", /\bimport\s*\(/i],
  ["CommonJS module loading", /\b(?:createRequire|require)\s*\(/i],
  ["runtime code evaluation", /\b(?:eval|Function)\s*\(/],
  ["network request", /\bfetch\s*\(/i],
  ["HTTP listener", /(?:\.\s*listen\s*\(|\b(?:http|https)\s*\.\s*createServer\s*\(|\bcreateServer\s*\()/i],
];

const noExternalSpecifiers = new Set<string>();
const testExternalSpecifiers = new Set(["node:fs/promises", "node:url", "vitest"]);
const allowedExternalSpecifiersByPackagePath: Readonly<Record<string, ReadonlySet<string>>> = {
  "scripts/validatePrismaSchema.mjs": new Set(["node:child_process", "node:fs", "node:url"]),
  "scripts/verifyAPolicySource.ts": new Set(["node:fs/promises", "node:path", "node:url"]),
  "scripts/verifyFoundationBoundary.ts": new Set(["node:child_process", "node:crypto", "node:fs", "node:fs/promises", "node:path", "node:url"]),
  "vitest.unit.config.ts": new Set(["vitest/config"]),
};

const staticModuleSpecifierPatterns = [
  /^\s*import\s*["']([^"']+)["']/gm,
  /^\s*(?:import|export)\s+(?:type\s+)?[\w\s{},*]+?\s+from\s+["']([^"']+)["']/gm,
] as const;

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? listTypeScriptFiles(path)
      : entry.isFile() && path.endsWith(".ts") ? [path] : [];
  }));
  return files.flat();
}

async function listPackageFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectoryNames.has(entry.name) ? [] : listPackageFiles(path);
    }
    return entry.isFile() ? [path] : [];
  }));
  return files.flat();
}

function requireExactRecord(
  actual: Record<string, string> | undefined,
  expected: Record<string, string>,
  label: string,
  violations: string[],
): void {
  const actualEntries = Object.entries(actual ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    violations.push(`${label} differs from the F-phase allow-list`);
  }
}

function packageRelativePath(path: string): string {
  return relative(packageRoot, path).replaceAll("\\", "/");
}

function isPackageFile(path: string, packageRelativeFiles: ReadonlySet<string>): boolean {
  const relativePath = packageRelativePath(path);
  return !relativePath.startsWith("../") && !relativePath.includes(":/") && packageRelativeFiles.has(relativePath);
}

function allowedExternalSpecifiersFor(file: string): ReadonlySet<string> {
  const path = packageRelativePath(file);
  if (path.startsWith("tests/")) return testExternalSpecifiers;
  return allowedExternalSpecifiersByPackagePath[path] ?? noExternalSpecifiers;
}

function verifyStaticImports(
  file: string,
  contents: string,
  packageRelativeFiles: ReadonlySet<string>,
  violations: string[],
): void {
  const allowedExternalSpecifiers = allowedExternalSpecifiersFor(file);
  for (const pattern of staticModuleSpecifierPatterns) {
    for (const match of contents.matchAll(pattern)) {
      const specifier = match[1];
      if (allowedExternalSpecifiers.has(specifier)) continue;
      if (!specifier.startsWith(".")) {
        violations.push(`${packageRelativePath(file)} imports unapproved external module ${JSON.stringify(specifier)}`);
        continue;
      }

      const baseTarget = resolve(dirname(file), specifier);
      const sourceTarget = baseTarget.replace(/\.(?:c|m)?js$/, ".ts");
      const candidates = [
        baseTarget,
        sourceTarget,
        `${baseTarget}.ts`,
        `${baseTarget}.mjs`,
        join(baseTarget, "index.ts"),
        join(baseTarget, "index.mjs"),
      ];
      if (!candidates.some((candidate) => isPackageFile(candidate, packageRelativeFiles))) {
        violations.push(`${packageRelativePath(file)} imports outside the F-package allow-list ${JSON.stringify(specifier)}`);
      }
    }
  }
}

async function sha256Normalized(path: string): Promise<string> {
  const contents = (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

function modelBlock(schema: string, model: string): string | undefined {
  return schema.match(new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"))?.[1];
}

async function runCleanFoundationBuild(): Promise<void> {
  await rm(distRoot, { recursive: true, force: true });
  const tscCli = join(packageRoot, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tscCli)) {
    throw new Error("doorstar_pilot_typescript_cli_missing_run_npm_ci");
  }
  const result = spawnSync(process.execPath, [tscCli, "-p", "tsconfig.json"], {
    cwd: packageRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("doorstar_pilot_foundation_clean_build_failed");
  }
}

function assertBoundaryRejectsRepresentativeBypasses(): void {
  const syntheticPackageFiles = new Set(["src/index.ts"]);
  const importViolations: string[] = [];
  verifyStaticImports(
    join(packageRoot, "src", "index.ts"),
    'import "../../outside-foundation.js";\n',
    syntheticPackageFiles,
    importViolations,
  );
  if (importViolations.length === 0) {
    throw new Error("doorstar_pilot_foundation_import_escape_self_test_failed");
  }

  const dynamicImportPattern = forbiddenExecutablePatterns.find(([label]) => label === "dynamic module import")?.[1];
  const listenerPattern = forbiddenExecutablePatterns.find(([label]) => label === "HTTP listener")?.[1];
  const dynamicImportSnippet = `const provider = ${["im", "port"].join("")}("openid-client");`;
  const listenerSnippet = `server.${["lis", "ten"].join("")}(3000);`;
  if (!dynamicImportPattern?.test(dynamicImportSnippet) || !listenerPattern?.test(listenerSnippet)) {
    throw new Error("doorstar_pilot_foundation_runtime_escape_self_test_failed");
  }
}

const violations: string[] = [];
assertBoundaryRejectsRepresentativeBypasses();
await runCleanFoundationBuild();
const sourceFiles = await listTypeScriptFiles(sourceRoot);
const packageFiles = await listPackageFiles(packageRoot);
const packageRelativeFiles = new Set(packageFiles.map((file) => relative(packageRoot, file).replaceAll("\\", "/")));
for (const file of packageRelativeFiles) {
  if (!allowedPackageFiles.has(file)) {
    violations.push(`package contains unexpected F-phase file ${JSON.stringify(file)}`);
  }
}
for (const file of allowedPackageFiles) {
  if (!packageRelativeFiles.has(file)) {
    violations.push(`package is missing required F-phase file ${JSON.stringify(file)}`);
  }
}

const runtimeCodeFiles = packageFiles.filter((file) => {
  const path = relative(packageRoot, file).replaceAll("\\", "/");
  return path.startsWith("src/") || path === "scripts/validatePrismaSchema.mjs";
});
const testAndConfigCodeFiles = packageFiles.filter((file) => {
  const path = relative(packageRoot, file).replaceAll("\\", "/");
  return path.startsWith("tests/") || path.startsWith("scripts/") || path === "vitest.unit.config.ts";
});
for (const file of runtimeCodeFiles) {
  const contents = await readFile(file, "utf8");
  for (const [label, pattern] of forbiddenExecutablePatterns) {
    if (pattern.test(contents)) {
      violations.push(`${relative(packageRoot, file)} contains forbidden ${label}`);
    }
  }
  verifyStaticImports(file, contents, packageRelativeFiles, violations);
}
for (const file of testAndConfigCodeFiles) {
  const contents = await readFile(file, "utf8");
  for (const [label, pattern] of forbiddenExecutablePatterns.slice(2)) {
    if (pattern.test(contents)) {
      violations.push(`${relative(packageRoot, file)} contains forbidden ${label}`);
    }
  }
  verifyStaticImports(file, contents, packageRelativeFiles, violations);
}

const builtFiles = await listPackageFiles(distRoot);
const builtRelativeFiles = new Set(builtFiles.map((file) => relative(distRoot, file).replaceAll("\\", "/")));
for (const file of builtRelativeFiles) {
  if (!expectedBuiltFiles.has(file)) {
    violations.push(`clean build produced unexpected artifact ${JSON.stringify(file)}`);
  }
}
for (const file of expectedBuiltFiles) {
  if (!builtRelativeFiles.has(file)) {
    violations.push(`clean build is missing expected artifact ${JSON.stringify(file)}`);
  }
}
for (const file of builtFiles.filter((path) => path.endsWith(".js"))) {
  const contents = await readFile(file, "utf8");
  for (const [label, pattern] of forbiddenExecutablePatterns) {
    if (pattern.test(contents)) {
      violations.push(`${relative(distRoot, file)} contains forbidden built ${label}`);
    }
  }
  for (const pattern of staticModuleSpecifierPatterns) {
    for (const match of contents.matchAll(pattern)) {
      const specifier = match[1];
      const target = specifier.startsWith(".") ? resolve(dirname(file), specifier) : undefined;
      const targetRelativePath = target ? relative(distRoot, target).replaceAll("\\", "/") : "";
      if (!target || targetRelativePath.startsWith("../") || !builtRelativeFiles.has(targetRelativePath)) {
        violations.push(`${relative(distRoot, file)} imports outside the clean build ${JSON.stringify(specifier)}`);
      }
    }
  }
}

const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as PackageManifest;
if (
  packageManifest.name !== "@doorstar/pilot-foundation"
  || packageManifest.version !== "0.1.0"
  || packageManifest.private !== true
  || packageManifest.type !== "module"
  || packageManifest.main !== "dist/index.js"
  || packageManifest.bin !== undefined
  || packageManifest.exports !== undefined
) {
  violations.push("package.json runtime entrypoint metadata differs from the F-phase allow-list");
}
requireExactRecord(packageManifest.dependencies, expectedDependencies, "package.json dependencies", violations);
requireExactRecord(packageManifest.devDependencies, expectedDevDependencies, "package.json devDependencies", violations);
requireExactRecord(packageManifest.scripts, expectedPackageScripts, "package.json scripts", violations);

const schemaValidator = await readFile(join(scriptsRoot, "validatePrismaSchema.mjs"), "utf8");
if (
  createHash("sha256").update(schemaValidator.replaceAll("\r\n", "\n"), "utf8").digest("hex") !== expectedSchemaValidatorSha256
) {
  violations.push("schema validator differs from the reviewed inert loopback prisma validate implementation");
}

if (await sha256Normalized(migrationPath) !== expectedInitialMigrationSha256) {
  violations.push("the immutable F initial migration differs from its reviewed hash");
}
if (await sha256Normalized(policyMigrationPath) !== expectedAPolicyMigrationSha256) {
  violations.push("the approved A policy migration differs from its reviewed hash");
}
for (const [path, expectedSha256] of Object.entries(expectedFoundationSourceSha256)) {
  if (await sha256Normalized(join(packageRoot, path)) !== expectedSha256) {
    violations.push(`the immutable F source capsule differs from its reviewed hash: ${path}`);
  }
}

const schema = await readFile(schemaPath, "utf8");
const expectedModels = [
  "PilotScope",
  "AuthorizationTransaction",
  "PrincipalBinding",
  "OpaqueSession",
  "BindingAudit",
  "PilotAuditWriterRole",
].sort();
const discoveredModels = Array.from(schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s+\{/gm), (match) => match[1]).sort();
if (JSON.stringify(discoveredModels) !== JSON.stringify(expectedModels)) {
  violations.push("schema models differ from the approved F+A identity, session, audit and writer-map vocabulary");
}
if (
  !/previewFeatures\s*=\s*\["multiSchema"\]/.test(schema)
  || !/schemas\s*=\s*\["pilot"\]/.test(schema)
) {
  violations.push("schema must map the F+A lineage exclusively through Prisma multiSchema pilot");
}
for (const model of expectedModels) {
  if (!modelBlock(schema, model)?.includes('@@schema("pilot")')) {
    violations.push(`schema model ${model} is not pinned to the isolated pilot schema`);
  }
}
if (
  schema.includes('@@schema("public")')
  || schema.includes("nonceCiphertext")
  || !modelBlock(schema, "AuthorizationTransaction")?.includes("nonceHash")
  || modelBlock(schema, "AuthorizationTransaction")?.includes("pilotScopeId")
) {
  violations.push("schema must keep authorization transactions scope-neutral and store only a nonce hash");
}
const bindingAudit = modelBlock(schema, "BindingAudit");
if (
  !bindingAudit?.includes("previousAuditVersion")
  || !bindingAudit.includes("nextAuditVersion")
  || !bindingAudit.includes("correlationId")
  || !bindingAudit.includes("witnessTransactionId")
) {
  violations.push("schema is missing the approved A-phase DB-owned audit evidence fields");
}
for (const model of ["Project", "Order", "Task", "Station", "Plant", "Flow", "Calculation"]) {
  if (schema.includes(`model ${model}`)) {
    violations.push(`schema contains forbidden non-foundation model ${JSON.stringify(model)}`);
  }
}

const migration = (await readFile(migrationPath, "utf8")).toLowerCase();
for (const table of ["project", "order", "task", "station", "plant", "flow", "calculation"]) {
  if (migration.includes(`create table "${table}"`)) {
    violations.push(`migration creates forbidden non-foundation table ${JSON.stringify(table)}`);
  }
}
if (!migration.includes("pilotscope_immutable") || !migration.includes("bindingaudit_append_only")) {
  violations.push("migration is missing immutable scope or append-only audit enforcement");
}

if (violations.length > 0) {
  throw new Error(`doorstar_pilot_foundation_boundary_invalid\n${violations.join("\n")}`);
}

process.stdout.write(JSON.stringify({
  package: "@doorstar/pilot-foundation",
  sourceFiles: sourceFiles.map((file) => relative(packageRoot, file)).sort(),
  boundary: "valid",
}, null, 2) + "\n");
