import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  parseAndValidateAcceptanceMarker,
  verifyGate0Acceptance,
  verifyGate0AcceptanceArtifacts,
} from "../lib/acceptance.mjs";
import { createGate0Capsule, verifyGate0Capsule } from "../lib/capsule.mjs";
import { canonicalJson, sha256 } from "../lib/canonical.mjs";
import { MAX_EXTERNAL_EVIDENCE_BYTES, readExternalEvidenceFile } from "../lib/evidenceFile.mjs";
import { Gate0Error } from "../lib/errors.mjs";
import { createGitRepository } from "../lib/gitRepository.mjs";
import { POLICY_PATH } from "../lib/policy.mjs";
import { createGitReadRunner, gate0GitReadArgumentPrefix } from "../lib/processRunner.mjs";
import { readAcceptanceArguments, runAcceptanceCli } from "../verifyGate0Acceptance.mjs";

const REPO_ROOT = mkdtempSync(path.join(os.tmpdir(), "doorstar-gate0-checkout-"));
const CANDIDATE = "a".repeat(40);
const TREE = "b".repeat(40);

after(() => {
  rmSync(REPO_ROOT, { recursive: true, force: true });
});

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
    assert.deepEqual(parsed.reviewedToolchain, { node: "v24.13.0", npm: "11.6.2" });
    assert.deepEqual(parsed.components[1].checks[2], {
      id: "production_dependency_tree",
      kind: "npm_production_dependency_tree",
      command: "npm",
      arguments: [
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
      ],
      acceptanceCriteria: {
        exitCode: 0,
        stdoutJsonMustOmitKeys: ["problems"],
      },
      reviewedToolchain: { node: "v24.13.0", npm: "11.6.2" },
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

  it("rejects a cat-file response whose bytes do not match the committed tree blob", () => {
    const fixture = createFixture({
      catFileOverride: Buffer.from("tampered Git object response\n", "utf8"),
    });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_git_command_failed");
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

  it("fails when a production dependency-tree command, criteria or reviewed toolchain drifts", () => {
    for (const mutatePolicy of [
      (policy) => { policy.components[1].checks[2].arguments[7] = "--include=dev"; },
      (policy) => { policy.components[1].checks[2].acceptanceCriteria.exitCode = 1; },
      (policy) => { policy.components[1].checks[2].reviewedToolchain.npm = "11.6.3"; },
      (policy) => { policy.reviewedToolchain.node = "v24.13.1"; },
    ]) {
      const fixture = createFixture({ mutatePolicy });
      assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_policy_invalid");
      assert.equal(fixture.npmCalls.length, 0);
    }
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
    const fixture = createFixture({
      mutateAfterFirstBlobRead: {
        path: "src/doorstar-pilot-foundation/package.json",
        contents: "{\"unexpected\":true}\n",
      },
    });

    assertGate0Error(() => createGate0Capsule(createOptions(fixture)), "gate0_worktree_not_clean");
  });

  it("rejects drift observed after capsule verification reads the candidate blobs", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const fixture = createFixture({
      mutateAfterFirstBlobRead: {
        path: "src/doorstar-pilot-foundation/package.json",
        contents: "{\"unexpected\":true}\n",
      },
    });

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

  it("pins every Gate 0 Git read away from replacement, lazy-fetch and helper config", () => {
    assert.deepEqual(gate0GitReadArgumentPrefix, [
      "--no-pager",
      "--no-replace-objects",
      "--no-lazy-fetch",
      "--no-optional-locks",
      "-c", "core.fsmonitor=false",
      "-c", "core.useBuiltinFSMonitor=false",
      "-c", "core.untrackedCache=false",
      "-c", "core.preloadIndex=false",
      "-c", "maintenance.auto=false",
      "-c", "gc.auto=0",
      "-c", "credential.helper=",
      "-c", "core.askPass=",
      "-c", "core.sshCommand=",
      "-c", "diff.external=",
      "-c", "alias.rev-parse=",
      "-c", "alias.ls-tree=",
      "-c", "alias.cat-file=",
    ]);
  });
});

describe("Doorstar Gate 0 external human acceptance", () => {
  it("binds an exact canonical acceptance marker to the verified clean candidate without package execution", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const marker = createAcceptanceMarker(capsule);
    const fixture = createFixture();

    const provenance = verifyGate0Acceptance({
      repoRoot: REPO_ROOT,
      candidate: CANDIDATE,
      capsuleText: capsule,
      acceptanceMarkerText: marker,
      runner: fixture.runner,
      environment: { PATH: "/safe" },
    });
    const parsed = JSON.parse(provenance);

    assert.equal(parsed.status, "GATE0_HUMAN_ACCEPTANCE_MARKER_BOUND");
    assert.equal(parsed.capsuleSha256, sha256(capsule));
    assert.equal(parsed.acceptanceMarkerSha256, sha256(marker));
    assert.equal(parsed.sourceCheckOutcomes.length, 11);
    assert.deepEqual(parsed.reviewedToolchain, { node: "v24.13.0", npm: "11.6.2" });
    assert.doesNotMatch(provenance, /top-secret-test-transcript|hostname|reviewer|C:\\\\|\/doorstar/);
    assert.equal(fixture.npmCalls.length, 0);
    assert.ok(fixture.calls.every((call) => call.executable === "git"));
  });

  it("rejects noncanonical marker bytes and marker objects with extra keys", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const marker = createAcceptanceMarker(capsule);
    const noncanonical = JSON.stringify(JSON.parse(marker), null, 2);
    const markerWithExtraKey = canonicalJson({ ...JSON.parse(marker), reviewer: "not-allowed" });

    assertGate0Error(() => parseAndValidateAcceptanceMarker(noncanonical), "gate0_acceptance_marker_noncanonical");
    assertGate0Error(() => parseAndValidateAcceptanceMarker(markerWithExtraKey), "gate0_acceptance_marker_invalid");
  });

  it("rejects a marker that does not bind the capsule identity or exact check-outcome matrix", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    for (const mutate of [
      (marker) => { marker.candidate.commitSha = "c".repeat(40); },
      (marker) => { marker.capsuleSha256 = "c".repeat(64); },
      (marker) => { marker.policySha256 = "c".repeat(64); },
      (marker) => { marker.sourceCheckOutcomes[0].outcome = "FAIL"; },
      (marker) => { marker.sourceCheckOutcomes.reverse(); },
    ]) {
      const fixture = createFixture();
      assertGate0Error(() => verifyGate0Acceptance({
        repoRoot: REPO_ROOT,
        candidate: CANDIDATE,
        capsuleText: capsule,
        acceptanceMarkerText: createAcceptanceMarker(capsule, mutate),
        runner: fixture.runner,
        environment: { PATH: "/safe" },
      }), mutate.toString().includes("FAIL") ? "gate0_acceptance_marker_invalid" : "gate0_acceptance_marker_mismatch");
      assert.equal(fixture.npmCalls.length, 0);
    }
  });

  it("fails closed before Git when acceptance verification inherits a forbidden environment", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const fixture = createFixture();

    assertGate0Error(() => verifyGate0Acceptance({
      repoRoot: REPO_ROOT,
      candidate: CANDIDATE,
      capsuleText: capsule,
      acceptanceMarkerText: createAcceptanceMarker(capsule),
      runner: fixture.runner,
      environment: { PATH: "/safe", NODE_OPTIONS: "--require=untrusted" },
    }), "gate0_forbidden_environment");
    assert.equal(fixture.calls.length, 0);
  });

  it("rejects a dirty candidate during external acceptance verification", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const fixture = createFixture({
      mutateAfterFirstBlobRead: {
        path: "src/doorstar-pilot-foundation/package.json",
        contents: "{\"unexpected\":true}\n",
      },
    });

    assertGate0Error(() => verifyGate0Acceptance({
      repoRoot: REPO_ROOT,
      candidate: CANDIDATE,
      capsuleText: capsule,
      acceptanceMarkerText: createAcceptanceMarker(capsule),
      runner: fixture.runner,
      environment: { PATH: "/safe" },
    }), "gate0_worktree_not_clean");
  });

  it("accepts only external regular bounded evidence files and emits redacted canonical provenance", () => {
    const capsule = createGate0Capsule(createOptions(createFixture()));
    const marker = createAcceptanceMarker(capsule);

    withEvidenceDirectory(({ checkout, evidenceDirectory }) => {
      const capsulePath = path.join(evidenceDirectory, "gate0-capsule.json");
      const markerPath = path.join(evidenceDirectory, "gate0-acceptance.json");
      writeFileSync(capsulePath, capsule, "utf8");
      writeFileSync(markerPath, marker, "utf8");
      const fixture = createFixture({ repoRoot: checkout });

      const provenance = verifyGate0AcceptanceArtifacts({
        repoRoot: checkout,
        candidate: CANDIDATE,
        capsulePath,
        acceptanceMarkerPath: markerPath,
        runner: fixture.runner,
        environment: { PATH: "/safe" },
      });

      assert.equal(readExternalEvidenceFile({ evidencePath: capsulePath, repoRoot: checkout }), capsule);
      assert.equal(provenance, canonicalJson(JSON.parse(provenance)));
      assert.equal(provenance.includes(checkout), false);
      assert.equal(provenance.includes(evidenceDirectory), false);
      assert.equal(fixture.npmCalls.length, 0);
    });
  });

  it("rejects checkout paths, symlinks, nonregular files, oversize files and invalid UTF-8 evidence", () => {
    withEvidenceDirectory(({ checkout, evidenceDirectory }) => {
      const insideCheckout = path.join(checkout, "gate0-capsule.json");
      const oversize = path.join(evidenceDirectory, "oversize.json");
      const invalidUtf8 = path.join(evidenceDirectory, "invalid-utf8.json");
      const hardlinkedEvidence = path.join(evidenceDirectory, "hardlinked.json");
      writeFileSync(insideCheckout, "{}\n", "utf8");
      writeFileSync(oversize, Buffer.alloc(MAX_EXTERNAL_EVIDENCE_BYTES + 1));
      writeFileSync(invalidUtf8, Buffer.from([0xff]));
      linkSync(insideCheckout, hardlinkedEvidence);

      assertGate0Error(() => readExternalEvidenceFile({ evidencePath: insideCheckout, repoRoot: checkout }), "gate0_evidence_inside_checkout");
      assertGate0Error(() => readExternalEvidenceFile({ evidencePath: evidenceDirectory, repoRoot: checkout }), "gate0_evidence_file_invalid");
      assertGate0Error(() => readExternalEvidenceFile({ evidencePath: oversize, repoRoot: checkout }), "gate0_evidence_file_oversize");
      assertGate0Error(() => readExternalEvidenceFile({ evidencePath: invalidUtf8, repoRoot: checkout }), "gate0_evidence_encoding_invalid");
      assertGate0Error(() => readExternalEvidenceFile({ evidencePath: hardlinkedEvidence, repoRoot: checkout }), "gate0_evidence_file_invalid");
      if (process.platform === "win32") {
        const caseVariantInsideCheckout = path.join(checkout.toUpperCase(), "gate0-capsule.json");
        assertGate0Error(() => readExternalEvidenceFile({
          evidencePath: caseVariantInsideCheckout,
          repoRoot: checkout,
        }), "gate0_evidence_inside_checkout");
        assertGate0Error(() => readExternalEvidenceFile({
          evidencePath: "\\\\approval-share\\doorstar\\gate0-capsule.json",
          repoRoot: checkout,
        }), "gate0_evidence_path_not_local");
        assertGate0Error(() => readExternalEvidenceFile({
          evidencePath: "Z:\\approval-share\\gate0-capsule.json",
          repoRoot: checkout,
        }), "gate0_evidence_path_not_local");
        assertGate0Error(() => readExternalEvidenceFile({
          evidencePath: "C:\\approved\\gate0-capsule.json:alternate-stream",
          repoRoot: checkout,
        }), "gate0_evidence_path_not_local");
      }
    });

    const externalPath = path.join(os.tmpdir(), "doorstar-gate0-symlink-test.json");
    const fakeFileSystem = {
      lstatSync: () => ({ isSymbolicLink: () => true }),
    };
    assertGate0Error(() => readExternalEvidenceFile({
      evidencePath: externalPath,
      repoRoot: path.join(os.tmpdir(), "doorstar-gate0-checkout"),
      fileSystem: fakeFileSystem,
    }), "gate0_evidence_path_symlink");
  });

  it("parses only the exact acceptance CLI arguments and keeps stdout empty on a rejected invocation", () => {
    assert.deepEqual(readAcceptanceArguments([
      "--candidate", CANDIDATE,
      "--capsule", "C:\\evidence\\capsule.json",
      "--acceptance", "C:\\evidence\\acceptance.json",
    ]), {
      candidate: CANDIDATE,
      capsulePath: "C:\\evidence\\capsule.json",
      acceptanceMarkerPath: "C:\\evidence\\acceptance.json",
    });
    assertGate0Error(() => readAcceptanceArguments(["--candidate", CANDIDATE]), "gate0_usage");

    const writes = { stdout: "", stderr: "" };
    const result = runAcceptanceCli({
      argumentsList: [
        "--candidate", CANDIDATE,
        "--capsule", "C:\\evidence\\capsule.json",
        "--acceptance", "C:\\evidence\\acceptance.json",
      ],
      environment: { PATH: "/safe", GIT_DIR: "not-allowed" },
      stdout: { write: (value) => { writes.stdout += value; } },
      stderr: { write: (value) => { writes.stderr += value; } },
      runner: { run: () => { throw new Error("must not run"); } },
    });
    assert.equal(result, 1);
    assert.equal(writes.stdout, "");
    assert.equal(writes.stderr, "[doorstar-pilot-gate0] gate0_forbidden_environment\n");
  });
});

function createOptions(fixture) {
  return {
    repoRoot: fixture.repoRoot,
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

  const repoRoot = options.repoRoot ?? REPO_ROOT;
  materializeFixtureWorktree(repoRoot, blobs, options);

  const calls = [];
  const npmCalls = [];
  let catFileCalls = 0;
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
      const result = gitResult(call.arguments, {
        blobs,
        head: options.head ?? CANDIDATE,
        repositoryRoot: options.reportedRepositoryRoot ?? call.cwd,
        objectFormat: options.objectFormat ?? "sha1",
      });
      if (gitCommand(call.arguments) === "cat-file") {
        catFileCalls += 1;
        if (catFileCalls === 1 && options.mutateAfterFirstBlobRead) {
          writeFileSync(path.join(repoRoot, options.mutateAfterFirstBlobRead.path), options.mutateAfterFirstBlobRead.contents);
        }
        if (catFileCalls === 1 && options.catFileOverride !== undefined) {
          return processResult(0, options.catFileOverride);
        }
      }
      return result;
    },
  };

  return { runner, calls, npmCalls, blobs, repoRoot };
}

function materializeFixtureWorktree(repoRoot, blobs, options) {
  rmSync(repoRoot, { recursive: true, force: true });
  mkdirSync(repoRoot, { recursive: true });
  mkdirSync(path.join(repoRoot, ".git"));
  for (const [repositoryPath, contents] of blobs) {
    const destination = path.join(repoRoot, ...repositoryPath.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  for (const [repositoryPath, contents] of Object.entries(options.worktreeOverrides ?? {})) {
    const destination = path.join(repoRoot, ...repositoryPath.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  for (const [repositoryPath, contents] of Object.entries(options.extraFiles ?? {})) {
    const destination = path.join(repoRoot, ...repositoryPath.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  if (options.symlink !== undefined) {
    const destination = path.join(repoRoot, ...options.symlink.path.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    symlinkSync(options.symlink.target, destination);
  }
}

function gitResult(argumentsList, { blobs, head, repositoryRoot, objectFormat }) {
  const commandArguments = stripLocalGitControls(argumentsList);
  const command = commandArguments[0];
  if (command === "rev-parse") {
    if (commandArguments[1] === "--show-object-format") return processResult(0, `${objectFormat}\n`);
    if (commandArguments[1] === "--show-toplevel") return processResult(0, `${repositoryRoot}\n`);
    if (commandArguments[1] !== "--verify") return processResult(1);
    const target = commandArguments[2];
    if (target === `${CANDIDATE}^{commit}`) return processResult(0, `${CANDIDATE}\n`);
    if (target === "HEAD^{commit}") return processResult(0, `${head}\n`);
    if (target === `${CANDIDATE}^{tree}`) return processResult(0, `${TREE}\n`);
    return processResult(1);
  }
  if (command === "ls-tree") {
    return processResult(0, gitTreeOutput(blobs, objectFormat));
  }
  if (command === "cat-file" && commandArguments[1] === "blob") {
    const expectedObjectSha = commandArguments[2];
    const contents = [...blobs.values()].find((value) => gitBlobObjectId(value, objectFormat) === expectedObjectSha);
    return contents === undefined ? processResult(1) : processResult(0, contents);
  }
  return processResult(1);
}

function stripLocalGitControls(argumentsList) {
  let index = 0;
  while (argumentsList[index] === "-c" && typeof argumentsList[index + 1] === "string") {
    index += 2;
  }
  return argumentsList.slice(index);
}

function gitCommand(argumentsList) {
  return stripLocalGitControls(argumentsList)[0];
}

function gitTreeOutput(blobs, objectFormat) {
  return Buffer.concat([...blobs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([repositoryPath, contents]) => Buffer.concat([
      Buffer.from(`100644 blob ${gitBlobObjectId(contents, objectFormat)}\t`, "ascii"),
      Buffer.from(repositoryPath, "utf8"),
      Buffer.from([0]),
    ])));
}

function gitBlobObjectId(contents, objectFormat) {
  const bytes = Buffer.from(contents);
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function processResult(exitCode, stdout = "") {
  return { exitCode, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
}

function assertGate0Error(action, code) {
  assert.throws(action, (error) => error instanceof Gate0Error && error.code === code);
}

function createAcceptanceMarker(capsuleText, mutate) {
  const capsule = JSON.parse(capsuleText);
  const marker = {
    schemaVersion: 1,
    kind: "doorstar-pilot-gate0-human-acceptance",
    status: "GATE0_HUMAN_ACCEPTED",
    candidate: { ...capsule.candidate },
    capsuleSha256: sha256(capsuleText),
    policySha256: capsule.policySha256,
    environmentClass: capsule.environmentClass,
    reviewedToolchain: { ...capsule.reviewedToolchain },
    sourceCheckOutcomes: capsule.components.flatMap((component) => component.checks.map((check) => ({
      componentId: component.id,
      checkId: check.id,
      outcome: "PASS",
    }))),
    permittedNextAction: "GATE_1_DISPOSABLE_PROOF_REQUIRES_SEPARATE_HUMAN_APPROVAL",
  };
  mutate?.(marker);
  return canonicalJson(marker);
}

function withEvidenceDirectory(action) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "doorstar-gate0-test-"));
  const checkout = path.join(temporaryRoot, "checkout");
  const evidenceDirectory = path.join(temporaryRoot, "evidence");
  mkdirSync(checkout);
  mkdirSync(evidenceDirectory);
  try {
    action({ checkout, evidenceDirectory });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function policyFixture() {
  return {
    schemaVersion: 2,
    kind: "doorstar-pilot-gate0-policy",
    environmentClass: "SOURCE_ONLY_NO_EXTERNAL_RUNTIME",
    reviewedToolchain: {
      node: "v24.13.0",
      npm: "11.6.2",
    },
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
          productionDependencyTreeCheck(),
        ],
      },
      {
        id: "bootstrap",
        directory: "src/doorstar-pilot-bootstrap",
        packageName: "@doorstar/pilot-bootstrap",
        checks: [
          { id: "source_and_runtime", kind: "npm_run", script: "test" },
          { id: "lint", kind: "npm_run", script: "lint" },
          productionDependencyTreeCheck(),
        ],
      },
    ],
  };
}

function productionDependencyTreeCheck() {
  return {
    id: "production_dependency_tree",
    kind: "npm_production_dependency_tree",
    command: "npm",
    arguments: [
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
    ],
    acceptanceCriteria: {
      exitCode: 0,
      stdoutJsonMustOmitKeys: ["problems"],
    },
    reviewedToolchain: {
      node: "v24.13.0",
      npm: "11.6.2",
    },
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
