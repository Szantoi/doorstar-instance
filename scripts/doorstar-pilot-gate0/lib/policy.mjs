import { fail } from "./errors.mjs";

export const POLICY_PATH = "scripts/doorstar-pilot-gate0/gate0-policy.v2.json";

export const EXPECTED_REVIEWED_TOOLCHAIN = Object.freeze({
  node: "v24.13.0",
  npm: "11.6.2",
});

const PRODUCTION_DEPENDENCY_TREE_CHECK = Object.freeze({
  id: "production_dependency_tree",
  kind: "npm_production_dependency_tree",
  command: "npm",
  arguments: Object.freeze([
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--workspaces=false",
    "ls",
    "--package-lock-only",
    "--omit=dev",
    "--all",
    "--json",
  ]),
  acceptanceCriteria: Object.freeze({
    exitCode: 0,
    stdoutJsonMustOmitKeys: Object.freeze(["problems"]),
  }),
  reviewedToolchain: EXPECTED_REVIEWED_TOOLCHAIN,
});

const EXPECTED_COMPONENTS = Object.freeze([
  Object.freeze({
    id: "foundation",
    directory: "src/doorstar-pilot-foundation",
    packageName: "@doorstar/pilot-foundation",
    checks: Object.freeze([
      Object.freeze({ id: "prisma_validate", kind: "npm_run", script: "prisma:validate" }),
      Object.freeze({ id: "prisma_generate", kind: "npm_run", script: "prisma:generate" }),
      Object.freeze({ id: "source_and_unit", kind: "npm_run", script: "test" }),
      Object.freeze({ id: "build", kind: "npm_run", script: "build" }),
      Object.freeze({ id: "lint", kind: "npm_run", script: "lint" }),
    ]),
    expectedScripts: Object.freeze({
      "prisma:validate": "node scripts/validatePrismaSchema.mjs",
      "prisma:generate": "prisma generate",
      test: "npm run verify:source && npm run test:unit",
      build: "tsc -p tsconfig.json",
      lint: "tsc -p tsconfig.json --noEmit",
    }),
  }),
  Object.freeze({
    id: "bff",
    directory: "src/doorstar-pilot-bff",
    packageName: "@doorstar/pilot-bff",
    checks: Object.freeze([
      Object.freeze({ id: "source_and_runtime", kind: "npm_run", script: "test" }),
      Object.freeze({ id: "lint", kind: "npm_run", script: "lint" }),
      PRODUCTION_DEPENDENCY_TREE_CHECK,
    ]),
    expectedScripts: Object.freeze({
      test: "npm run test:unit && npm run build && npm run verify:runtime-import",
      lint: "tsc -p tsconfig.json --noEmit",
    }),
  }),
  Object.freeze({
    id: "bootstrap",
    directory: "src/doorstar-pilot-bootstrap",
    packageName: "@doorstar/pilot-bootstrap",
    checks: Object.freeze([
      Object.freeze({ id: "source_and_runtime", kind: "npm_run", script: "test" }),
      Object.freeze({ id: "lint", kind: "npm_run", script: "lint" }),
      PRODUCTION_DEPENDENCY_TREE_CHECK,
    ]),
    expectedScripts: Object.freeze({
      test: "npm run test:unit && npm run verify:built-cli",
      lint: "tsc -p tsconfig.json --noEmit",
    }),
  }),
]);

export const EXPECTED_ENVIRONMENT_CLASS = "SOURCE_ONLY_NO_EXTERNAL_RUNTIME";
export const EXPECTED_NEXT_ACTION = "HUMAN_SOURCE_CHECK_EVIDENCE_AND_GATE0_REVIEW_REQUIRED";

export function parseAndValidatePolicy(policyBytes) {
  let policy;
  try {
    policy = JSON.parse(Buffer.from(policyBytes).toString("utf8"));
  } catch {
    fail("gate0_policy_invalid");
  }
  assertPolicy(policy);
  return policy;
}

export function validatePackageManifest(component, packageBytes) {
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(packageBytes).toString("utf8"));
  } catch {
    fail("gate0_package_manifest_invalid");
  }
  if (!isPlainObject(manifest) || manifest.name !== component.packageName || !isPlainObject(manifest.scripts)) {
    fail("gate0_package_manifest_invalid");
  }
  const expected = EXPECTED_COMPONENTS.find((entry) => entry.id === component.id);
  if (!expected) {
    fail("gate0_package_manifest_invalid");
  }
  for (const [name, command] of Object.entries(expected.expectedScripts)) {
    if (manifest.scripts[name] !== command) {
      fail("gate0_package_script_unexpected");
    }
  }
  return manifest;
}

function assertPolicy(policy) {
  if (!isPlainObject(policy)) {
    fail("gate0_policy_invalid");
  }
  assertExactKeys(policy, [
    "schemaVersion",
    "kind",
    "environmentClass",
    "reviewedToolchain",
    "permittedNextAction",
    "components",
  ]);
  if (policy.schemaVersion !== 2
    || policy.kind !== "doorstar-pilot-gate0-policy"
    || policy.environmentClass !== EXPECTED_ENVIRONMENT_CLASS
    || policy.permittedNextAction !== EXPECTED_NEXT_ACTION
    || !Array.isArray(policy.components)
    || policy.components.length !== EXPECTED_COMPONENTS.length) {
    fail("gate0_policy_invalid");
  }
  assertReviewedToolchain(policy.reviewedToolchain);
  policy.components.forEach((component, index) => assertComponent(component, EXPECTED_COMPONENTS[index]));
}

function assertComponent(component, expected) {
  if (!isPlainObject(component)) {
    fail("gate0_policy_invalid");
  }
  assertExactKeys(component, ["id", "directory", "packageName", "checks"]);
  if (component.id !== expected.id
    || component.directory !== expected.directory
    || component.packageName !== expected.packageName
    || !Array.isArray(component.checks)
    || component.checks.length !== expected.checks.length) {
    fail("gate0_policy_invalid");
  }
  component.checks.forEach((check, index) => assertCheck(check, expected.checks[index]));
}

function assertCheck(check, expected) {
  if (!isPlainObject(check)) {
    fail("gate0_policy_invalid");
  }
  if (expected.kind === "npm_run") {
    assertExactKeys(check, ["id", "kind", "script"]);
    if (check.id !== expected.id || check.kind !== expected.kind || check.script !== expected.script) {
      fail("gate0_policy_invalid");
    }
    return;
  }
  if (expected.kind !== "npm_production_dependency_tree") {
    fail("gate0_policy_invalid");
  }
  assertExactKeys(check, [
    "id",
    "kind",
    "command",
    "arguments",
    "acceptanceCriteria",
    "reviewedToolchain",
  ]);
  if (check.id !== expected.id
    || check.kind !== expected.kind
    || check.command !== expected.command
    || !sameStringArray(check.arguments, expected.arguments)) {
    fail("gate0_policy_invalid");
  }
  assertAcceptanceCriteria(check.acceptanceCriteria, expected.acceptanceCriteria);
  assertReviewedToolchain(check.reviewedToolchain);
}

function assertAcceptanceCriteria(value, expected) {
  if (!isPlainObject(value)) {
    fail("gate0_policy_invalid");
  }
  assertExactKeys(value, ["exitCode", "stdoutJsonMustOmitKeys"]);
  if (value.exitCode !== expected.exitCode
    || !sameStringArray(value.stdoutJsonMustOmitKeys, expected.stdoutJsonMustOmitKeys)) {
    fail("gate0_policy_invalid");
  }
}

function assertReviewedToolchain(value) {
  if (!isPlainObject(value)) {
    fail("gate0_policy_invalid");
  }
  assertExactKeys(value, ["node", "npm"]);
  if (value.node !== EXPECTED_REVIEWED_TOOLCHAIN.node || value.npm !== EXPECTED_REVIEWED_TOOLCHAIN.npm) {
    fail("gate0_policy_invalid");
  }
}

function sameStringArray(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => typeof entry === "string" && entry === expected[index]);
}

function assertExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    fail("gate0_policy_invalid");
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
