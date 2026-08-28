#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyGate0Capsule } from "./lib/capsule.mjs";
import { Gate0Error } from "./lib/errors.mjs";
import { createGitReadRunner } from "./lib/processRunner.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

try {
  const { candidate, capsulePath } = readArguments(process.argv.slice(2));
  verifyGate0Capsule({
    repoRoot,
    candidate,
    capsuleText: readFileSync(capsulePath, "utf8"),
    runner: createGitReadRunner(process.env),
    environment: process.env,
  });
  process.stdout.write("PASS\n");
} catch (error) {
  const code = error instanceof Gate0Error ? error.code : "gate0_unexpected_error";
  process.stderr.write(`[doorstar-pilot-gate0] ${code}\n`);
  process.exitCode = 1;
}

function readArguments(argumentsList) {
  if (argumentsList.length !== 4
    || argumentsList[0] !== "--candidate"
    || argumentsList[2] !== "--capsule"
    || !argumentsList[3]) {
    throw new Gate0Error("gate0_usage");
  }
  return { candidate: argumentsList[1], capsulePath: argumentsList[3] };
}
