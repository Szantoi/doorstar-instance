import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGate0Capsule, verifyGate0Capsule } from "../lib/capsule.mjs";
import { sha256 } from "../lib/canonical.mjs";
import { Gate0Error } from "../lib/errors.mjs";
import { POLICY_PATH } from "../lib/policy.mjs";
import { createGitReadRunner } from "../lib/processRunner.mjs";

const REPO_ROOT = "/doorstar";
const CANDIDATE = "a".repeat(40);
const TREE = "b".repeat(40);

describe("Doorstar Gate 0 source capsule", () => {
  it("creates byte-identical canonical candidate identity from Git blobs and a fixed check plan", () => {
    const fixture = createFixture();
    const progress = [];
    const first = createGate0Capsule({
      ...createOptions(fixture),
      onProgress: (event) => progress.push(event),
    });
    const second = createGate0Capsule(createOptions(createFixture()));
    const expectedLockHash = sha256(fixture.blobs.get("src/doorstar-pilot-bff/package-lock.json"));
    const parsed = JSON.parse(first);

    assert.equal(first, second);
    assert.equal(parsed.components[1].packageLockSha256, expectedLockHash);
    assert.deepEqual(parsed.components[0].checks[0], {
      id: "prisma_validate",
      kind: "npm_run",
      script: "prisma:validate",
    });
    assert.equal(fixture.npmCalls.length, 0);
    assert.ok(fixture.calls.every((call) => call.executable === "git"));
    assert.deepEqual(progress, ["gate0_candidate_snapshot_started", "gate0_candidate_snapshot_bound"]);
    assert.doesNotMatch(first, /working-tree-crlf|top-secret-test-transcript|untrusted|hostname/);
    assert.equal(first.includes(`"${REPO_ROOT}`), false);
    assert.match(first, /"status": "CANDIDATE_BOUND_NOT_EXECUTED"/);
  });

  it("verifies the exact saved canonical capsule against the same Git blobs", () => {
    const fixture = createFixture();
    const capsule = createGate0Capsule(createOptions(fixture));

    assert.equal(
      verifyGate0Capsule({
        repoRoot: REPO_ROOT,
        candidate: CANDIDATE,
        capsuleText: capsule,
        runner: fixture.runner,
        environment: { PATH: "/safe" },
      }),
      capsule,
    );
  });

  it("rejects an altered package-lock Git blob during verification", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const changedFixture = createFixture({
      blobs: {
        "src/doorstar-pilot-bff/package-lock.json": Buffer.from("{\n  \"lockfileVersion\": 999\n}\n"),
      },
    });

    assertGate0Error(() => verifyGate0Capsule({
      repoRoot: REPO_ROOT,
      candidate: CANDIDATE,
      capsuleText: capsule,
      runner: changedFixture.runner,
      environment: { PATH: "/safe" },
    }), "gate0_capsule_mismatch");
  });

  it("fails before producing a candidate identity when policy scope is widened", () => {
    const fixture = createFixture({
      mutatePolicy: (policy) => {
        policy.components[0].directory = "src/production-service";
      },
    });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_policy_invalid");
    assert.equal(fixture.npmCalls.length, 0);
  });

  it("fails before producing a candidate identity when policy attempts an unallowlisted npm script", () => {
    const fixture = createFixture({
      mutatePolicy: (policy) => {
        policy.components[0].checks[0].script = "deploy";
      },
    });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_policy_invalid");
    assert.equal(fixture.npmCalls.length, 0);
  });

  it("fails before producing a candidate identity when a package script differs from the reviewed source contract", () => {
    const fixture = createFixture({
      mutatePackage: (manifests) => {
        manifests.foundation.scripts.test = "npm run deploy";
      },
    });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_package_script_unexpected");
    assert.equal(fixture.npmCalls.length, 0);
  });

  it("rejects a forbidden runtime environment before running Git or npm", () => {
    const fixture = createFixture();

    assertGate0Error(() => createGate0Capsule({
      ...createOptions(fixture),
      environment: { PATH: "/safe", NODE_OPTIONS: "--require=untrusted" },
    }), "gate0_forbidden_environment");
    assert.equal(fixture.calls.length, 0);
  });

  it("rejects an inherited Git override before reading repository state", () => {
    const fixture = createFixture();

    assertGate0Error(() => createGate0Capsule({
      ...createOptions(fixture),
      environment: { PATH: "/safe", GIT_DIR: "/another-repository/.git" },
    }), "gate0_forbidden_environment");
    assert.equal(fixture.calls.length, 0);
  });

  it("rejects a forbidden environment during capsule verification", () => {
    const fixture = createFixture();
    const capsule = createGate0Capsule(createOptions(fixture));

    assertGate0Error(() => verifyGate0Capsule({
      repoRoot: REPO_ROOT,
      candidate: CANDIDATE,
      capsuleText: capsule,
      runner: fixture.runner,
      environment: { PATH: "/safe", GIT_INDEX_FILE: "/other/index" },
    }), "gate0_forbidden_environment");
  });

  it("rejects a dirty checkout observed after candidate blob capture", () => {
    const fixture = createFixture({ statusResults: ["", " M tracked-file"] });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_worktree_not_clean");
  });

  it("rejects drift observed after capsule verification reads the candidate blobs", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const fixture = createFixture({ statusResults: ["", " M tracked-file"] });

    assertGate0Error(() => verifyGate0Capsule({
      repoRoot: REPO_ROOT,
      candidate: CANDIDATE,
      capsuleText: capsule,
      runner: fixture.runner,
      environment: { PATH: "/safe" },
    }), "gate0_worktree_not_clean");
  });

  it("rejects a candidate that is not the checked-out HEAD", () => {
    const fixture = createFixture({ head: "c".repeat(40) });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_candidate_not_head");
  });

  it("rejects a Git top-level that differs from the requested repository root", () => {
    const fixture = createFixture({ reportedRepositoryRoot: "/different-repository" });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_repository_root_mismatch");
  });

  it("does not expose a non-Git child-process capability", () => {
    const runner = createGitReadRunner({ PATH: "/safe" });

    assert.equal(runner.run({ executable: "npm", arguments: ["run", "test"], cwd: REPO_ROOT }).exitCode, -1);
  });
});

function createOptions(fixture) {
  return {
    repoRoot: REPO_ROOT,
    candidate: CANDIDATE,
    runner: fixture.runner,
    environment: { PATH: "/safe" },
  };
}

function createFixture(options = {}) {
  const policy = policyFixture();
  options.mutatePolicy?.(policy);
  const manifests = packageManifests();
  options.mutatePackage?.(manifests);
  const blobs = new Map([
    [POLICY_PATH, Buffer.from(`${JSON.stringify(policy, null, 2)}\n`)],
    ["src/doorstar-pilot-foundation/package.json", Buffer.from(`${JSON.stringify(manifests.foundation, null, 2)}\n`)],
    ["src/doorstar-pilot-foundation/package-lock.json", Buffer.from("{\n  \"lockfileVersion\": 3\n}\n")],
    ["src/doorstar-pilot-bff/package.json", Buffer.from(`${JSON.stringify(manifests.bff, null, 2)}\n`)],
    ["src/doorstar-pilot-bff/package-lock.json", Buffer.from("{\n  \"lockfileVersion\": 3,\n  \"name\": \"bff\"\n}\n")],
    ["src/doorstar-pilot-bootstrap/package.json", Buffer.from(`${JSON.stringify(manifests.bootstrap, null, 2)}\n`)],
    ["src/doorstar-pilot-bootstrap/package-lock.json", Buffer.from("{\n  \"lockfileVersion\": 3,\n  \"name\": \"bootstrap\"\n}\n")],
  ]);
  for (const [key, value] of Object.entries(options.blobs ?? {})) {
    blobs.set(key, value);
  }

  const calls = [];
  const npmCalls = [];
  const statusResults = [...(options.statusResults ?? ["", "", "", ""])];
  const runner = {
    run(call) {
      calls.push(call);
      if (call.executable === "npm") {
        npmCalls.push(call);
        return processResult(1);
      }
      if (call.executable !== "git") {
        return processResult(1);
      }
      return gitResult(call.arguments, {
        blobs,
        statusResults,
        head: options.head ?? CANDIDATE,
        repositoryRoot: options.reportedRepositoryRoot ?? call.cwd,
      });
    },
  };

  return { runner, calls, npmCalls, blobs };
}

function gitResult(argumentsList, { blobs, statusResults, head, repositoryRoot }) {
  if (argumentsList[0] === "status") {
    return processResult(0, statusResults.shift() ?? "");
  }
  if (argumentsList[0] !== "rev-parse") {
    if (argumentsList[0] !== "show") {
      return processResult(1);
    }
    const prefix = `${CANDIDATE}:`;
    const blobPath = argumentsList[1].startsWith(prefix) ? argumentsList[1].slice(prefix.length) : "";
    return blobs.has(blobPath) ? processResult(0, blobs.get(blobPath)) : processResult(1);
  }
  if (argumentsList[1] === "--verify") {
    return processResult(0, `${CANDIDATE}\n`);
  }
  if (argumentsList[1] === "HEAD") {
    return processResult(0, `${head}\n`);
  }
  if (argumentsList[1] === "--show-object-format") {
    return processResult(0, "sha1\n");
  }
  if (argumentsList[1] === "--show-toplevel") {
    return processResult(0, `${repositoryRoot}\n`);
  }
  if (argumentsList[1] === `${CANDIDATE}^{tree}`) {
    return processResult(0, `${TREE}\n`);
  }
  return processResult(1);
}

function processResult(exitCode, stdout = "") {
  return { exitCode, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
}

function assertGate0Error(action, code) {
  assert.throws(action, (error) => error instanceof Gate0Error && error.code === code);
}

function policyFixture() {
  return {
    schemaVersion: 1,
    kind: "doorstar-pilot-gate0-policy",
    environmentClass: "SOURCE_ONLY_NO_EXTERNAL_RUNTIME",
    permittedNextAction: "HUMAN_SOURCE_CHECK_EVIDENCE_AND_GATE0_REVIEW_REQUIRED",
    components: [
      {
        id: "foundation",
        directory: "src/doorstar-pilot-foundation",
        packageName: "@doorstar/pilot-foundation",
        checks: [
          { id: "prisma_validate", kind: "npm_run", script: "prisma:validate" },
          { id: "prisma_generate", kind: "npm_run", script: "prisma:generate" },
          { id: "source_and_unit", kind: "npm_run", script: "test" },
          { id: "build", kind: "npm_run", script: "build" },
          { id: "lint", kind: "npm_run", script: "lint" },
        ],
      },
      {
        id: "bff",
        directory: "src/doorstar-pilot-bff",
        packageName: "@doorstar/pilot-bff",
        checks: [
          { id: "source_and_runtime", kind: "npm_run", script: "test" },
          { id: "lint", kind: "npm_run", script: "lint" },
          { id: "production_dependency_tree", kind: "npm_production_dependency_tree" },
        ],
      },
      {
        id: "bootstrap",
        directory: "src/doorstar-pilot-bootstrap",
        packageName: "@doorstar/pilot-bootstrap",
        checks: [
          { id: "source_and_runtime", kind: "npm_run", script: "test" },
          { id: "lint", kind: "npm_run", script: "lint" },
          { id: "production_dependency_tree", kind: "npm_production_dependency_tree" },
        ],
      },
    ],
  };
}

function packageManifests() {
  return {
    foundation: {
      name: "@doorstar/pilot-foundation",
      scripts: {
        "prisma:validate": "node scripts/validatePrismaSchema.mjs",
        "prisma:generate": "prisma generate",
        test: "npm run verify:source && npm run test:unit",
        build: "tsc -p tsconfig.json",
        lint: "tsc -p tsconfig.json --noEmit",
      },
    },
    bff: {
      name: "@doorstar/pilot-bff",
      scripts: {
        test: "npm run test:unit && npm run build && npm run verify:runtime-import",
        lint: "tsc -p tsconfig.json --noEmit",
      },
    },
    bootstrap: {
      name: "@doorstar/pilot-bootstrap",
      scripts: {
        test: "npm run test:unit && npm run verify:built-cli",
        lint: "tsc -p tsconfig.json --noEmit",
      },
    },
  };
}
