#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Gate1Error } from "./lib/errors.mjs";
import { verifyGate1RuntimeInputs } from "./lib/verifier.mjs";
import { createGitReadRunner } from "../doorstar-pilot-gate0/lib/processRunner.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The grammar has no defaults, environment fallbacks, or optional artifacts. */
export function readRuntimeInputArguments(argumentsList) {
  if (argumentsList.length !== 12
    || argumentsList[0] !== "--candidate"
    || argumentsList[2] !== "--capsule"
    || argumentsList[4] !== "--acceptance"
    || argumentsList[6] !== "--runtime-manifest"
    || argumentsList[8] !== "--docker-cli"
    || argumentsList[10] !== "--prisma-toolchain"
    || !argumentsList[1]
    || !argumentsList[3]
    || !argumentsList[5]
    || !argumentsList[7]
    || !argumentsList[9]
    || !argumentsList[11]) {
    throw new Gate1Error("gate1_usage");
  }
  return Object.freeze({
    candidate: argumentsList[1],
    capsulePath: argumentsList[3],
    acceptanceMarkerPath: argumentsList[5],
    runtimeManifestPath: argumentsList[7],
    dockerCliPath: argumentsList[9],
    prismaToolchainPath: argumentsList[11],
  });
}

export function runRuntimeInputCli({
  argumentsList,
  environment = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  runner = createGitReadRunner(environment),
  root = repoRoot,
  verifier = verifyGate1RuntimeInputs,
}) {
  try {
    const inputs = readRuntimeInputArguments(argumentsList);
    const provenance = verifier({
      repoRoot: root,
      ...inputs,
      runner,
      environment,
    });
    stdout.write(provenance);
    return 0;
  } catch (error) {
    const code = error instanceof Gate1Error ? error.code : "gate1_unexpected_error";
    stderr.write(`[doorstar-pilot-gate1] ${code}\n`);
    return 1;
  }
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runRuntimeInputCli({
    argumentsList: process.argv.slice(2),
    environment: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
