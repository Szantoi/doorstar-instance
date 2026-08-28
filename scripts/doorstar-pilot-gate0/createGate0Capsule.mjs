#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGate0Capsule } from "./lib/capsule.mjs";
import { Gate0Error } from "./lib/errors.mjs";
import { createGitReadRunner } from "./lib/processRunner.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

try {
  const candidate = readCandidate(process.argv.slice(2));
  const capsule = createGate0Capsule({
    repoRoot,
    candidate,
    environment: process.env,
    runner: createGitReadRunner(process.env),
    onProgress: (event) => process.stderr.write(`[doorstar-pilot-gate0] ${event}\n`),
  });
  process.stdout.write(capsule);
} catch (error) {
  const code = error instanceof Gate0Error ? error.code : "gate0_unexpected_error";
  process.stderr.write(`[doorstar-pilot-gate0] ${code}\n`);
  process.exitCode = 1;
}

function readCandidate(argumentsList) {
  if (argumentsList.length !== 2 || argumentsList[0] !== "--candidate") {
    throw new Gate0Error("gate0_usage");
  }
  return argumentsList[1];
}
