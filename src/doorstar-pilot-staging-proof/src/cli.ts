import { publicFailureCode, runDisposableA03Proof } from "./runner/proofRunner.js";

const expectedArgument = "--disposable-docker-proof";

if (process.argv.length !== 3 || process.argv[2] !== expectedArgument) {
  process.stderr.write("A03-FAIL:a03_disposable_cli_argument_required\n");
  process.exitCode = 2;
} else {
  try {
    await runDisposableA03Proof({
      onPass: (marker) => process.stdout.write(`${marker}\n`),
    });
    process.stdout.write("A03-PASS:REDACTED_EVIDENCE_WRITTEN\n");
  } catch (error) {
    process.stderr.write(`A03-FAIL:${publicFailureCode(error)}\n`);
    process.exitCode = 1;
  }
}
