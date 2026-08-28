import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { canonicalJson, sha256 } from "../lib/canonical.mjs";
import {
  APPROVAL_PROVENANCE_STATUS,
  parseAndValidateGate1ApprovalRecord,
  verifyGate1Approval,
} from "../lib/approval.mjs";
import { Gate1Error } from "../lib/errors.mjs";
import {
  MAX_DOCKER_CLI_BYTES,
  hashExternalDockerCli,
  hashExternalPrismaToolchain,
} from "../lib/externalContent.mjs";
import {
  BOUND_NOT_APPROVED_STATUS,
  REQUIRED_NODE_VERSION,
  parseAndValidateRuntimeManifest,
} from "../lib/runtimeManifest.mjs";
import { verifyGate1RuntimeInputs } from "../lib/verifier.mjs";
import {
  readRuntimeInputArguments,
  runRuntimeInputCli,
} from "../verifyGate1RuntimeInputs.mjs";
import {
  readGate1ApprovalArguments,
  runGate1ApprovalCli,
} from "../verifyGate1Approval.mjs";

const CANDIDATE = "a".repeat(40);
const TREE = "b".repeat(40);
const CAPSULE_SHA = "c".repeat(64);
const MARKER_SHA = "d".repeat(64);

describe("Doorstar Gate 1 runtime-input verifier", () => {
  it("verifies Gate 0 first and emits only canonical redacted runtime provenance", () => {
    withRuntimeFixture((fixture) => {
      let gate0Calls = 0;
      let runnerCalls = 0;
      const provenance = verifyGate1RuntimeInputs({
        ...fixture.inputs,
        runner: { run: () => { runnerCalls += 1; throw new Error("candidate execution is forbidden"); } },
        environment: { PATH: "/safe" },
        gate0AcceptanceVerifier: (input) => {
          gate0Calls += 1;
          assert.equal(input.candidate, CANDIDATE);
          assert.equal(input.capsulePath, fixture.capsulePath);
          assert.equal(input.acceptanceMarkerPath, fixture.acceptancePath);
          return gate0Provenance();
        },
      });
      const parsed = JSON.parse(provenance);

      assert.equal(provenance, canonicalJson(parsed));
      assert.equal(parsed.status, BOUND_NOT_APPROVED_STATUS);
      assert.equal(parsed.runtimeManifestSha256, sha256(fixture.manifestText));
      assert.equal(parsed.dockerCliContentSha256, fixture.dockerHash.sha256);
      assert.equal(parsed.prismaToolchainTreeSha256, fixture.toolchainHash.treeSha256);
      assert.equal(parsed.postgresImageReference, fixture.postgresImageReference);
      assert.equal(parsed.nodeVersion, REQUIRED_NODE_VERSION);
      assert.equal(gate0Calls, 1);
      assert.equal(runnerCalls, 0);
      assert.equal(provenance.includes(fixture.checkout), false);
      assert.equal(provenance.includes(fixture.evidenceDirectory), false);
      assert.equal(provenance.includes(fixture.dockerCliPath), false);
      assert.equal(provenance.includes(fixture.prismaToolchainPath), false);
      assert.doesNotMatch(provenance, /source-only-secret|external-evidence/);
    });
  });

  it("rejects noncanonical runtime-manifest bytes and any extra key", () => {
    const manifest = runtimeManifest({
      dockerCliContentSha256: "e".repeat(64),
      prismaToolchainTreeSha256: "f".repeat(64),
    });
    const noncanonical = JSON.stringify(manifest, null, 2);
    const extraKey = canonicalJson({ ...manifest, humanApproval: "not-a-manifest-field" });

    assertGate1Error(() => parseAndValidateRuntimeManifest(noncanonical), "gate1_runtime_manifest_noncanonical");
    assertGate1Error(() => parseAndValidateRuntimeManifest(extraKey), "gate1_runtime_manifest_invalid");
  });

  it("requires a digest-pinned Postgres reference and the fixed reviewed Node version", () => {
    const base = runtimeManifest({
      dockerCliContentSha256: "e".repeat(64),
      prismaToolchainTreeSha256: "f".repeat(64),
    });
    const tagOnlyImage = canonicalJson({ ...base, postgresImageReference: "postgres:16" });
    const changedNode = canonicalJson({ ...base, nodeVersion: "v24.13.1" });

    assertGate1Error(() => parseAndValidateRuntimeManifest(tagOnlyImage), "gate1_runtime_manifest_invalid");
    assertGate1Error(() => parseAndValidateRuntimeManifest(changedNode), "gate1_runtime_manifest_invalid");
  });

  it("rejects a manifest whose candidate, capsule, or acceptance-marker binding differs from Gate 0", () => {
    withRuntimeFixture((fixture) => {
      const mutations = [
        (manifest) => { manifest.candidate.commitSha = "e".repeat(40); },
        (manifest) => { manifest.gate0CapsuleSha256 = "e".repeat(64); },
        (manifest) => { manifest.gate0AcceptanceMarkerSha256 = "e".repeat(64); },
      ];
      for (const mutate of mutations) {
        const manifest = JSON.parse(fixture.manifestText);
        mutate(manifest);
        writeFileSync(fixture.manifestPath, canonicalJson(manifest), "utf8");
        assertGate1Error(() => verifyWithFixture(fixture), "gate1_runtime_manifest_gate0_binding_mismatch");
      }
    });
  });

  it("rejects an actual Docker CLI or Prisma tree whose content hash differs from the manifest", () => {
    withRuntimeFixture((fixture) => {
      writeFileSync(fixture.dockerCliPath, "changed-docker-cli", "utf8");
      assertGate1Error(() => verifyWithFixture(fixture), "gate1_runtime_manifest_binding_mismatch");

      writeFileSync(fixture.dockerCliPath, "docker-cli-content", "utf8");
      writeFileSync(path.join(fixture.prismaToolchainPath, "prisma.js"), "changed-prisma-toolchain", "utf8");
      assertGate1Error(() => verifyWithFixture(fixture), "gate1_runtime_manifest_binding_mismatch");
    });
  });

  it("rejects checkout paths, symlinks, and oversize external content before hashing", () => {
    withRuntimeFixture((fixture) => {
      const insideCheckout = path.join(fixture.checkout, "docker-cli.bin");
      writeFileSync(insideCheckout, "not-external", "utf8");
      assertGate1Error(() => hashExternalDockerCli({
        dockerCliPath: insideCheckout,
        repoRoot: fixture.checkout,
      }), "gate1_docker_cli_inside_checkout");
    });

    const fakeSymlinkFileSystem = {
      lstatSync: () => ({ isSymbolicLink: () => true }),
    };
    assertGate1Error(() => hashExternalDockerCli({
      dockerCliPath: path.join(os.tmpdir(), "gate1-symlink-docker.bin"),
      repoRoot: path.join(os.tmpdir(), "gate1-checkout"),
      fileSystem: fakeSymlinkFileSystem,
    }), "gate1_docker_cli_path_symlink");
    assertGate1Error(() => hashExternalPrismaToolchain({
      prismaToolchainPath: path.join(os.tmpdir(), "gate1-symlink-toolchain"),
      repoRoot: path.join(os.tmpdir(), "gate1-checkout"),
      fileSystem: fakeSymlinkFileSystem,
    }), "gate1_prisma_toolchain_path_symlink");

    const oversizedStats = fakeRegularFileStats(MAX_DOCKER_CLI_BYTES + 1);
    const fakeOversizedFileSystem = {
      lstatSync: () => oversizedStats,
      realpathSync: Object.assign((value) => value, { native: (value) => value }),
    };
    assertGate1Error(() => hashExternalDockerCli({
      dockerCliPath: path.join(os.tmpdir(), "gate1-oversized-docker.bin"),
      repoRoot: path.join(os.tmpdir(), "gate1-checkout"),
      fileSystem: fakeOversizedFileSystem,
      }), "gate1_docker_cli_file_oversize");
  });

  it("defines the Prisma toolchain tree by byte-sorted relative path, size, and file-content hash", () => {
    withTwoToolchains(({ checkout, first, second }) => {
      const firstHash = hashExternalPrismaToolchain({ prismaToolchainPath: first, repoRoot: checkout });
      const secondHash = hashExternalPrismaToolchain({ prismaToolchainPath: second, repoRoot: checkout });
      const expected = sha256(canonicalJson({
        schemaVersion: 1,
        kind: "doorstar-pilot-gate1-prisma-toolchain-tree",
        files: [
          { path: "a.txt", size: 1, sha256: sha256("a") },
          { path: "nested/b.txt", size: 1, sha256: sha256("b") },
          { path: "z.txt", size: 1, sha256: sha256("z") },
        ],
      }));

      assert.equal(firstHash.treeSha256, expected);
      assert.equal(secondHash.treeSha256, expected);
      assert.equal(firstHash.treeSha256, secondHash.treeSha256);
      writeFileSync(path.join(second, "nested", "b.txt"), "different", "utf8");
      assert.notEqual(
        hashExternalPrismaToolchain({ prismaToolchainPath: second, repoRoot: checkout }).treeSha256,
        expected,
      );
    });
  });

  it("fails closed before Gate 0 or filesystem reads when the environment is unsafe", () => {
    let gate0Calls = 0;
    assertGate1Error(() => verifyGate1RuntimeInputs({
      repoRoot: path.join(os.tmpdir(), "gate1-checkout"),
      candidate: CANDIDATE,
      capsulePath: path.join(os.tmpdir(), "capsule.json"),
      acceptanceMarkerPath: path.join(os.tmpdir(), "acceptance.json"),
      runtimeManifestPath: path.join(os.tmpdir(), "runtime-manifest.json"),
      dockerCliPath: path.join(os.tmpdir(), "docker.bin"),
      prismaToolchainPath: path.join(os.tmpdir(), "toolchain"),
      environment: { PATH: "/safe", DOCKER_HOST: "tcp://not-permitted" },
      runner: { run: () => { throw new Error("must not run"); } },
      gate0AcceptanceVerifier: () => { gate0Calls += 1; return gate0Provenance(); },
    }), "gate1_forbidden_environment");
    assert.equal(gate0Calls, 0);
  });

  it("keeps a failed Gate 0 verification ahead of all runtime-path handling", () => {
    let fileSystemCalls = 0;
    assertGate1Error(() => verifyGate1RuntimeInputs({
      repoRoot: path.join(os.tmpdir(), "gate1-checkout"),
      candidate: CANDIDATE,
      capsulePath: path.join(os.tmpdir(), "capsule.json"),
      acceptanceMarkerPath: path.join(os.tmpdir(), "acceptance.json"),
      runtimeManifestPath: path.join(os.tmpdir(), "runtime-manifest.json"),
      dockerCliPath: path.join(os.tmpdir(), "docker.bin"),
      prismaToolchainPath: path.join(os.tmpdir(), "toolchain"),
      environment: { PATH: "/safe" },
      runner: { run: () => { throw new Error("must not run"); } },
      fileSystem: {
        lstatSync: () => { fileSystemCalls += 1; throw new Error("must not read"); },
      },
      gate0AcceptanceVerifier: () => { throw new Error("invalid gate0"); },
    }), "gate1_gate0_acceptance_invalid");
    assert.equal(fileSystemCalls, 0);
  });

  it("requires the verifier process itself to use the same fixed Node version", () => {
    withRuntimeFixture((fixture) => {
      assertGate1Error(() => verifyGate1RuntimeInputs({
        ...fixture.inputs,
        runner: { run: () => { throw new Error("must not run candidate"); } },
        environment: { PATH: "/safe" },
        nodeVersion: "v24.13.1",
        gate0AcceptanceVerifier: () => gate0Provenance(),
      }), "gate1_node_version_unexpected");
    });
  });
});

describe("Doorstar Gate 1 runtime-input CLI", () => {
  it("accepts only the exact six-input grammar and leaves stdout empty on rejection", () => {
    const argumentsList = exactArguments();
    assert.deepEqual(readRuntimeInputArguments(argumentsList), {
      candidate: CANDIDATE,
      capsulePath: "C:\\evidence\\gate0-capsule.json",
      acceptanceMarkerPath: "C:\\evidence\\gate0-acceptance.json",
      runtimeManifestPath: "C:\\evidence\\gate1-runtime-manifest.json",
      dockerCliPath: "C:\\runtime\\docker.exe",
      prismaToolchainPath: "C:\\runtime\\node_modules",
    });
    assertGate1Error(() => readRuntimeInputArguments(["--candidate", CANDIDATE]), "gate1_usage");

    const writes = { stdout: "", stderr: "" };
    const result = runRuntimeInputCli({
      argumentsList: ["--candidate", CANDIDATE],
      environment: { PATH: "/safe" },
      stdout: { write: (value) => { writes.stdout += value; } },
      stderr: { write: (value) => { writes.stderr += value; } },
      runner: { run: () => { throw new Error("must not run"); } },
      verifier: () => { throw new Error("must not run"); },
    });
    assert.equal(result, 1);
    assert.equal(writes.stdout, "");
    assert.equal(writes.stderr, "[doorstar-pilot-gate1] gate1_usage\n");
  });
});

describe("Doorstar Gate 1 external human-approval record", () => {
  it("binds a minimal canonical approval record to freshly verified runtime provenance", () => {
    withRuntimeFixture((fixture) => {
      const runtimeProvenanceText = verifyWithFixture(fixture);
      const runtimeProvenance = JSON.parse(runtimeProvenanceText);
      const approvalPath = path.join(fixture.evidenceDirectory, "gate1-approval.json");
      const approvalText = canonicalJson(approvalRecord(runtimeProvenance));
      writeFileSync(approvalPath, approvalText, "utf8");
      let verifierInput;

      const provenance = verifyGate1Approval({
        ...fixture.inputs,
        approvalPath,
        runner: { run: () => { throw new Error("candidate execution is forbidden"); } },
        environment: { PATH: "/safe" },
        runtimeInputVerifier: (input) => {
          verifierInput = input;
          return runtimeProvenanceText;
        },
      });
      const parsed = JSON.parse(provenance);

      assert.equal(verifierInput.repoRoot, fixture.checkout);
      assert.equal(verifierInput.candidate, CANDIDATE);
      assert.equal(provenance, canonicalJson(parsed));
      assert.deepEqual(Object.keys(parsed).sort(), [
        "approvalRecordSha256",
        "candidate",
        "dockerCliContentSha256",
        "gate0AcceptanceMarkerSha256",
        "gate0CapsuleSha256",
        "kind",
        "nodeVersion",
        "permittedAction",
        "postgresImageReference",
        "prismaToolchainTreeSha256",
        "runtimeManifestSha256",
        "schemaVersion",
        "status",
      ]);
      assert.equal(parsed.status, APPROVAL_PROVENANCE_STATUS);
      assert.equal(parsed.approvalRecordSha256, sha256(approvalText));
      assert.equal(parsed.runtimeManifestSha256, runtimeProvenance.runtimeManifestSha256);
      assert.equal(parsed.dockerCliContentSha256, runtimeProvenance.dockerCliContentSha256);
      assert.equal(parsed.prismaToolchainTreeSha256, runtimeProvenance.prismaToolchainTreeSha256);
      assert.equal(parsed.postgresImageReference, runtimeProvenance.postgresImageReference);
      assert.equal(parsed.permittedAction, "A03_DISPOSABLE_DOCKER_POSTGRES16_PROOF");
      assert.equal(provenance.includes(fixture.checkout), false);
      assert.equal(provenance.includes(approvalPath), false);
      assert.doesNotMatch(provenance, /source-only-secret|external-evidence/);
    });
  });

  it("rejects a structurally valid approval record that differs from any bound runtime input", () => {
    withRuntimeFixture((fixture) => {
      const runtimeProvenanceText = verifyWithFixture(fixture);
      const runtimeProvenance = JSON.parse(runtimeProvenanceText);
      const approvalPath = path.join(fixture.evidenceDirectory, "gate1-approval.json");
      const mutations = [
        (record) => { record.candidate.treeSha = "e".repeat(40); },
        (record) => { record.runtimeManifestSha256 = "e".repeat(64); },
        (record) => { record.dockerCliContentSha256 = "e".repeat(64); },
        (record) => { record.postgresImageReference = `postgres@sha256:${"f".repeat(64)}`; },
        (record) => { record.prismaToolchainTreeSha256 = "e".repeat(64); },
      ];
      for (const mutate of mutations) {
        const record = approvalRecord(runtimeProvenance);
        mutate(record);
        writeFileSync(approvalPath, canonicalJson(record), "utf8");
        assertGate1Error(() => verifyGate1Approval({
          ...fixture.inputs,
          approvalPath,
          runner: { run: () => { throw new Error("candidate execution is forbidden"); } },
          environment: { PATH: "/safe" },
          runtimeInputVerifier: () => runtimeProvenanceText,
        }), "gate1_approval_record_binding_mismatch");
      }
    });
  });

  it("rejects malformed, noncanonical, or identity-bearing approval records", () => {
    const runtimeProvenance = JSON.parse(runtimeProvenanceFixture());
    const record = approvalRecord(runtimeProvenance);
    const noncanonical = JSON.stringify(record, null, 2);
    const extraIdentity = canonicalJson({ ...record, reviewer: "not-permitted" });
    const wrongAction = canonicalJson({ ...record, permittedAction: "DEPLOY" });

    assertGate1Error(() => parseAndValidateGate1ApprovalRecord("not-json\n"), "gate1_approval_record_invalid");
    assertGate1Error(() => parseAndValidateGate1ApprovalRecord(noncanonical), "gate1_approval_record_noncanonical");
    assertGate1Error(() => parseAndValidateGate1ApprovalRecord(extraIdentity), "gate1_approval_record_invalid");
    assertGate1Error(() => parseAndValidateGate1ApprovalRecord(wrongAction), "gate1_approval_record_invalid");
  });

  it("requires the approval record itself to remain external to the checkout", () => {
    withRuntimeFixture((fixture) => {
      const runtimeProvenanceText = verifyWithFixture(fixture);
      const approvalPath = path.join(fixture.checkout, "approval.json");
      writeFileSync(approvalPath, canonicalJson(approvalRecord(JSON.parse(runtimeProvenanceText))), "utf8");

      assertGate1Error(() => verifyGate1Approval({
        ...fixture.inputs,
        approvalPath,
        runner: { run: () => { throw new Error("candidate execution is forbidden"); } },
        environment: { PATH: "/safe" },
        runtimeInputVerifier: () => runtimeProvenanceText,
      }), "gate1_approval_record_inside_checkout");
    });
  });
});

describe("Doorstar Gate 1 approval CLI", () => {
  it("requires the explicit repository root and all seven strict inputs", () => {
    const argumentsList = exactApprovalArguments();
    const parsed = readGate1ApprovalArguments(argumentsList);
    assert.equal(parsed.repoRoot, path.resolve("C:\\candidate"));
    assert.equal(parsed.candidate, CANDIDATE);
    assert.equal(parsed.approvalPath, path.resolve("C:\\evidence\\gate1-approval.json"));
    assertGate1Error(() => readGate1ApprovalArguments(argumentsList.slice(0, -2)), "gate1_approval_usage");

    const writes = { stdout: "", stderr: "" };
    const result = runGate1ApprovalCli({
      argumentsList: ["--repo-root", "C:\\candidate"],
      environment: { PATH: "/safe" },
      stdout: { write: (value) => { writes.stdout += value; } },
      stderr: { write: (value) => { writes.stderr += value; } },
      runner: { run: () => { throw new Error("must not run"); } },
      verifier: () => { throw new Error("must not run"); },
    });
    assert.equal(result, 1);
    assert.equal(writes.stdout, "");
    assert.equal(writes.stderr, "[doorstar-pilot-gate1] gate1_approval_usage\n");
  });
});

function verifyWithFixture(fixture) {
  return verifyGate1RuntimeInputs({
    ...fixture.inputs,
    runner: { run: () => { throw new Error("candidate execution is forbidden"); } },
    environment: { PATH: "/safe" },
    gate0AcceptanceVerifier: () => gate0Provenance(),
  });
}

function withRuntimeFixture(action) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "doorstar-gate1-test-"));
  const checkout = path.join(temporaryRoot, "checkout");
  const evidenceDirectory = path.join(temporaryRoot, "external-evidence");
  const runtimeDirectory = path.join(temporaryRoot, "external-runtime");
  mkdirSync(checkout);
  mkdirSync(evidenceDirectory);
  mkdirSync(runtimeDirectory);
  const capsulePath = path.join(evidenceDirectory, "gate0-capsule.json");
  const acceptancePath = path.join(evidenceDirectory, "gate0-acceptance.json");
  const manifestPath = path.join(evidenceDirectory, "gate1-runtime-manifest.json");
  const dockerCliPath = path.join(runtimeDirectory, "docker-cli.bin");
  const prismaToolchainPath = path.join(runtimeDirectory, "node_modules");
  mkdirSync(prismaToolchainPath);
  mkdirSync(path.join(prismaToolchainPath, "nested"));
  writeFileSync(capsulePath, "external-evidence", "utf8");
  writeFileSync(acceptancePath, "external-evidence", "utf8");
  writeFileSync(dockerCliPath, "docker-cli-content", "utf8");
  writeFileSync(path.join(prismaToolchainPath, "prisma.js"), "source-only-secret", "utf8");
  writeFileSync(path.join(prismaToolchainPath, "nested", "engine.bin"), "engine", "utf8");
  const dockerHash = hashExternalDockerCli({ dockerCliPath, repoRoot: checkout });
  const toolchainHash = hashExternalPrismaToolchain({ prismaToolchainPath, repoRoot: checkout });
  const postgresImageReference = `postgres@sha256:${"e".repeat(64)}`;
  const manifestText = canonicalJson(runtimeManifest({
    dockerCliContentSha256: dockerHash.sha256,
    prismaToolchainTreeSha256: toolchainHash.treeSha256,
    postgresImageReference,
  }));
  writeFileSync(manifestPath, manifestText, "utf8");

  try {
    action({
      checkout,
      evidenceDirectory,
      capsulePath,
      acceptancePath,
      manifestPath,
      manifestText,
      dockerCliPath,
      prismaToolchainPath,
      dockerHash,
      toolchainHash,
      postgresImageReference,
      inputs: {
        repoRoot: checkout,
        candidate: CANDIDATE,
        capsulePath,
        acceptanceMarkerPath: acceptancePath,
        runtimeManifestPath: manifestPath,
        dockerCliPath,
        prismaToolchainPath,
      },
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function withTwoToolchains(action) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "doorstar-gate1-tree-test-"));
  const checkout = path.join(temporaryRoot, "checkout");
  const first = path.join(temporaryRoot, "first");
  const second = path.join(temporaryRoot, "second");
  mkdirSync(checkout);
  for (const directory of [first, second]) {
    mkdirSync(directory);
    mkdirSync(path.join(directory, "nested"));
  }
  writeFileSync(path.join(first, "z.txt"), "z", "utf8");
  writeFileSync(path.join(first, "nested", "b.txt"), "b", "utf8");
  writeFileSync(path.join(first, "a.txt"), "a", "utf8");
  writeFileSync(path.join(second, "a.txt"), "a", "utf8");
  writeFileSync(path.join(second, "z.txt"), "z", "utf8");
  writeFileSync(path.join(second, "nested", "b.txt"), "b", "utf8");
  try {
    action({ checkout, first, second });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function runtimeManifest({
  candidate = { commitSha: CANDIDATE, treeSha: TREE, objectFormat: "sha1" },
  gate0CapsuleSha256 = CAPSULE_SHA,
  gate0AcceptanceMarkerSha256 = MARKER_SHA,
  dockerCliContentSha256,
  prismaToolchainTreeSha256,
  postgresImageReference = `postgres@sha256:${"e".repeat(64)}`,
} = {}) {
  return {
    schemaVersion: 1,
    kind: "doorstar-pilot-gate1-runtime-input-manifest",
    status: BOUND_NOT_APPROVED_STATUS,
    candidate,
    gate0CapsuleSha256,
    gate0AcceptanceMarkerSha256,
    dockerCliContentSha256,
    postgresImageReference,
    prismaToolchainTreeSha256,
    nodeVersion: REQUIRED_NODE_VERSION,
  };
}

function gate0Provenance() {
  return canonicalJson({
    schemaVersion: 1,
    kind: "doorstar-pilot-gate0-acceptance-provenance",
    status: "GATE0_HUMAN_ACCEPTANCE_MARKER_BOUND",
    candidate: { commitSha: CANDIDATE, treeSha: TREE, objectFormat: "sha1" },
    capsuleSha256: CAPSULE_SHA,
    acceptanceMarkerSha256: MARKER_SHA,
    policySha256: "f".repeat(64),
    environmentClass: "SOURCE_ONLY_NO_EXTERNAL_RUNTIME",
    reviewedToolchain: { node: REQUIRED_NODE_VERSION, npm: "11.6.2" },
    sourceCheckOutcomes: [{ componentId: "foundation", checkId: "lint", outcome: "PASS" }],
    permittedNextAction: "GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL",
  });
}

function runtimeProvenanceFixture() {
  return canonicalJson({
    schemaVersion: 1,
    kind: "doorstar-pilot-gate1-runtime-input-provenance",
    status: BOUND_NOT_APPROVED_STATUS,
    candidate: { commitSha: CANDIDATE, treeSha: TREE, objectFormat: "sha1" },
    gate0CapsuleSha256: CAPSULE_SHA,
    gate0AcceptanceMarkerSha256: MARKER_SHA,
    runtimeManifestSha256: "e".repeat(64),
    dockerCliContentSha256: "f".repeat(64),
    postgresImageReference: `postgres@sha256:${"1".repeat(64)}`,
    prismaToolchainTreeSha256: "2".repeat(64),
    nodeVersion: REQUIRED_NODE_VERSION,
  });
}

function approvalRecord(runtimeProvenance) {
  return {
    schemaVersion: 1,
    kind: "doorstar-pilot-gate1-human-approval",
    status: "GATE1_HUMAN_APPROVED",
    candidate: { ...runtimeProvenance.candidate },
    runtimeManifestSha256: runtimeProvenance.runtimeManifestSha256,
    dockerCliContentSha256: runtimeProvenance.dockerCliContentSha256,
    postgresImageReference: runtimeProvenance.postgresImageReference,
    prismaToolchainTreeSha256: runtimeProvenance.prismaToolchainTreeSha256,
    nodeVersion: REQUIRED_NODE_VERSION,
    permittedAction: "A03_DISPOSABLE_DOCKER_POSTGRES16_PROOF",
  };
}

function exactArguments() {
  return [
    "--candidate", CANDIDATE,
    "--capsule", "C:\\evidence\\gate0-capsule.json",
    "--acceptance", "C:\\evidence\\gate0-acceptance.json",
    "--runtime-manifest", "C:\\evidence\\gate1-runtime-manifest.json",
    "--docker-cli", "C:\\runtime\\docker.exe",
    "--prisma-toolchain", "C:\\runtime\\node_modules",
  ];
}

function exactApprovalArguments() {
  return [
    "--repo-root", "C:\\candidate",
    "--candidate", CANDIDATE,
    "--capsule", "C:\\evidence\\gate0-capsule.json",
    "--acceptance", "C:\\evidence\\gate0-acceptance.json",
    "--runtime-manifest", "C:\\evidence\\gate1-runtime-manifest.json",
    "--docker-cli", "C:\\runtime\\docker.exe",
    "--prisma-toolchain", "C:\\runtime\\node_modules",
    "--approval", "C:\\evidence\\gate1-approval.json",
  ];
}

function fakeRegularFileStats(size) {
  return {
    isSymbolicLink: () => false,
    isFile: () => true,
    isDirectory: () => false,
    size,
    dev: 1,
    ino: 1,
    mode: 0o100644,
    mtimeMs: 1,
    ctimeMs: 1,
    nlink: 1,
  };
}

function assertGate1Error(action, code) {
  assert.throws(action, (error) => error instanceof Gate1Error && error.code === code);
}
