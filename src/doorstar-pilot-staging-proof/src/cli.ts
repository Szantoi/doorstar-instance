import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DockerRuntimeInputCandidate } from "./runner/dockerRuntimeInput.js";
import type { Gate0ProvenanceInput } from "./runner/gate0Provenance.js";
import { publicFailureCode, runDisposableA03Proof } from "./runner/proofRunner.js";

const disposableProofArgument = "--disposable-docker-proof";
const gate0CapsuleArgument = "--gate0-capsule";
const gate0AcceptanceArgument = "--gate0-acceptance";
const dockerCliArgument = "--docker-cli";
const postgresImageArgument = "--postgres-image";

export type DisposableProofCliArguments = Readonly<{
  gate0Provenance: Gate0ProvenanceInput;
  dockerRuntime: DockerRuntimeInputCandidate;
}>;

/**
 * The Docker acknowledgement remains a separate environment control. This
 * strict grammar binds the two externally stored Gate 0 artifacts and the
 * separately approved, immutable Docker runtime inputs without defaults.
 */
export function readDisposableProofCliArguments(
  argumentsList: readonly string[],
): DisposableProofCliArguments | undefined {
  if (
    argumentsList.length !== 9
    || argumentsList[0] !== disposableProofArgument
    || argumentsList[1] !== gate0CapsuleArgument
    || argumentsList[3] !== gate0AcceptanceArgument
    || argumentsList[5] !== dockerCliArgument
    || argumentsList[7] !== postgresImageArgument
    || !argumentsList[2]
    || !argumentsList[4]
    || !argumentsList[6]
    || !argumentsList[8]
  ) {
    return undefined;
  }
  return Object.freeze({
    gate0Provenance: Object.freeze({
      capsulePath: argumentsList[2],
      acceptancePath: argumentsList[4],
    }),
    dockerRuntime: Object.freeze({
      dockerCliPath: argumentsList[6],
      postgresImageReference: argumentsList[8],
    }),
  });
}

export async function runDisposableProofCli({
  argumentsList,
  environment = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
}: Readonly<{
  argumentsList: readonly string[];
  environment?: NodeJS.ProcessEnv;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}>): Promise<number> {
  const parsedArguments = readDisposableProofCliArguments(argumentsList);
  if (parsedArguments === undefined) {
    stderr.write("A03-FAIL:a03_disposable_cli_argument_required\n");
    return 2;
  }
  try {
    await runDisposableA03Proof({
      environment,
      gate0Provenance: parsedArguments.gate0Provenance,
      dockerRuntime: parsedArguments.dockerRuntime,
      onPass: (marker) => stdout.write(`${marker}\n`),
    });
    stdout.write("A03-PASS:REDACTED_EVIDENCE_WRITTEN\n");
    return 0;
  } catch (error) {
    stderr.write(`A03-FAIL:${publicFailureCode(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runDisposableProofCli({ argumentsList: process.argv.slice(2) });
}
