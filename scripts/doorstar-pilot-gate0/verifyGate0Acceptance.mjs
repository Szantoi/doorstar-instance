#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyGate0AcceptanceArtifacts } from "./lib/acceptance.mjs";
import { assertSafeSourceEnvironment } from "./lib/environment.mjs";
import { Gate0Error } from "./lib/errors.mjs";
import { createGitReadRunner } from "./lib/processRunner.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readAcceptanceArguments(argumentsList) {
  if (argumentsList.length !== 6
    || argumentsList[0] !== "--candidate"
    || argumentsList[2] !== "--capsule"
    || argumentsList[4] !== "--acceptance"
    || !argumentsList[1]
    || !argumentsList[3]
    || !argumentsList[5]) {
    throw new Gate0Error("gate0_usage");
  }
  return {
    candidate: argumentsList[1],
    capsulePath: argumentsList[3],
    acceptanceMarkerPath: argumentsList[5],
  };
}

export function runAcceptanceCli({
  argumentsList,
  environment,
  stdout,
  stderr,
  runner = createGitReadRunner(environment),
  root = repoRoot,
}) {
  try {
    const argumentsValue = readAcceptanceArguments(argumentsList);
    assertSafeSourceEnvironment(environment);
    const provenance = verifyGate0AcceptanceArtifacts({
      repoRoot: root,
      ...argumentsValue,
      runner,
      environment,
    });
    stdout.write(provenance);
    return 0;
  } catch (error) {
    const code = error instanceof Gate0Error ? error.code : "gate0_unexpected_error";
    stderr.write(`[doorstar-pilot-gate0] ${code}\n`);
    return 1;
  }
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runAcceptanceCli({
    argumentsList: process.argv.slice(2),
    environment: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
