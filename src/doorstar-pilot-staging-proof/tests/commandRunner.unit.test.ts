import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  maximumBufferedCommandOutputBytes,
  NodeCommandRunner,
} from "../src/runner/commandRunner.js";

describe("NodeCommandRunner", () => {
  it("terminates a local child before buffering combined output beyond the fixed byte cap", async () => {
    const runner = new NodeCommandRunner();
    const outputPerStream = Math.floor(maximumBufferedCommandOutputBytes / 2) + 65_536;

    await expect(runner.run(
      process.execPath,
      [
        "-e",
        `process.stdout.write("x".repeat(${outputPerStream})); process.stderr.write("y".repeat(${outputPerStream}))`,
      ],
      10_000,
      process.env,
    )).rejects.toMatchObject({
      name: "A03ProofError",
      publicCode: "a03_command_output_limit_exceeded",
    });
  });

  it("returns ordinary bounded stdout and stderr unchanged", async () => {
    const runner = new NodeCommandRunner();

    const result = await runner.run(
      process.execPath,
      ["-e", "process.stdout.write('ordinary stdout'); process.stderr.write('ordinary stderr')"],
      10_000,
      process.env,
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: "ordinary stdout",
      stderr: "ordinary stderr",
    });
  });

  it("retains the existing timeout failure for a local child that does not exit", async () => {
    const runner = new NodeCommandRunner();

    await expect(runner.run(
      process.execPath,
      ["-e", "setInterval(() => undefined, 1_000)"],
      200,
      process.env,
    )).rejects.toMatchObject({
      name: "A03ProofError",
      publicCode: "a03_docker_command_timeout",
    });
  });

  it("retains the existing spawn-error failure category", async () => {
    const runner = new NodeCommandRunner();
    const missingExecutable = join(tmpdir(), `doorstar-a03-command-runner-missing-${randomUUID()}`);

    await expect(runner.run(
      missingExecutable,
      [],
      10_000,
      process.env,
    )).rejects.toMatchObject({
      name: "A03ProofError",
      publicCode: "a03_docker_not_ready",
    });
  });
});
