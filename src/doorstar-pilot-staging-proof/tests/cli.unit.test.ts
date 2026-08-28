import { describe, expect, it } from "vitest";
import {
  disposableAcknowledgement,
  disposableAcknowledgementEnvironment,
} from "../src/runner/a03Config.js";
import { runDisposableProofCli } from "../src/cli.js";

const postgresImageReference = `postgres@sha256:${"a".repeat(64)}`;

describe("A-03 CLI trust boundary", () => {
  it("rejects an incomplete argument grammar without attempting a proof", async () => {
    const output = createOutputCapture();
    await expect(runDisposableProofCli({
      argumentsList: ["--disposable-docker-proof"],
      stdout: output.stdout,
      stderr: output.stderr,
      environment: {},
    })).resolves.toBe(2);
    expect(output.stdoutText()).toBe("");
    expect(output.stderrText()).toBe("A03-FAIL:a03_disposable_cli_argument_required\n");
  });

  it("keeps a well-formed acknowledged invocation outside the candidate checkout authority", async () => {
    const output = createOutputCapture();
    await expect(runDisposableProofCli({
      argumentsList: [
        "--disposable-docker-proof",
        "--gate0-capsule", "C:\\external\\gate0-capsule.json",
        "--gate0-acceptance", "C:\\external\\gate0-acceptance.json",
        "--docker-cli", "C:\\external\\docker.exe",
        "--postgres-image", postgresImageReference,
      ],
      stdout: output.stdout,
      stderr: output.stderr,
      environment: {
        [disposableAcknowledgementEnvironment]: disposableAcknowledgement,
      },
    })).resolves.toBe(1);
    expect(output.stdoutText()).toBe("");
    expect(output.stderrText()).toBe("A03-FAIL:a03_gate1_external_trust_anchor_required\n");
  });
});

function createOutputCapture(): Readonly<{
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdoutText: () => string;
  stderrText: () => string;
}> {
  let stdout = "";
  let stderr = "";
  return Object.freeze({
    stdout: { write: (value: string) => { stdout += value; return true; } },
    stderr: { write: (value: string) => { stderr += value; return true; } },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  });
}
