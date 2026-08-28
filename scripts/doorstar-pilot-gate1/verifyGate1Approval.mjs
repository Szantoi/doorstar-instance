#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyGate1Approval } from "./lib/approval.mjs";
import { Gate1Error } from "./lib/errors.mjs";
import { createGitReadRunner } from "../doorstar-pilot-gate0/lib/processRunner.mjs";

/**
 * The approval verifier intentionally has no checkout default: the caller
 * supplies the exact candidate repository root and all external artifacts.
 */
export function readGate1ApprovalArguments(argumentsList) {
  if (argumentsList.length !== 16
    || argumentsList[0] !== "--repo-root"
    || argumentsList[2] !== "--candidate"
    || argumentsList[4] !== "--capsule"
    || argumentsList[6] !== "--acceptance"
    || argumentsList[8] !== "--runtime-manifest"
    || argumentsList[10] !== "--docker-cli"
    || argumentsList[12] !== "--prisma-toolchain"
    || argumentsList[14] !== "--approval"
    || !isAbsoluteInput(argumentsList[1])
    || !isFullLowercaseGitSha(argumentsList[3])
    || !isAbsoluteInput(argumentsList[5])
    || !isAbsoluteInput(argumentsList[7])
    || !isAbsoluteInput(argumentsList[9])
    || !isAbsoluteInput(argumentsList[11])
    || !isAbsoluteInput(argumentsList[13])
    || !isAbsoluteInput(argumentsList[15])) {
    throw new Gate1Error("gate1_approval_usage");
  }
  return Object.freeze({
    repoRoot: path.resolve(argumentsList[1]),
    candidate: argumentsList[3],
    capsulePath: path.resolve(argumentsList[5]),
    acceptanceMarkerPath: path.resolve(argumentsList[7]),
    runtimeManifestPath: path.resolve(argumentsList[9]),
    dockerCliPath: path.resolve(argumentsList[11]),
    prismaToolchainPath: path.resolve(argumentsList[13]),
    approvalPath: path.resolve(argumentsList[15]),
  });
}

export function runGate1ApprovalCli({
  argumentsList,
  environment = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  runner = createGitReadRunner(environment),
  verifier = verifyGate1Approval,
}) {
  try {
    const inputs = readGate1ApprovalArguments(argumentsList);
    const provenance = verifier({
      ...inputs,
      runner,
      environment,
    });
    stdout.write(provenance);
    return 0;
  } catch (error) {
    const code = error instanceof Gate1Error ? error.code : "gate1_approval_unexpected_error";
    stderr.write(`[doorstar-pilot-gate1] ${code}\n`);
    return 1;
  }
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runGate1ApprovalCli({
    argumentsList: process.argv.slice(2),
    environment: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

function isAbsoluteInput(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") && path.isAbsolute(value);
}

function isFullLowercaseGitSha(value) {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}
