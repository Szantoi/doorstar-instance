import { spawn } from "node:child_process";
import { A03ProofError } from "./a03Config.js";

/**
 * A proof command only needs compact, machine-readable output. Keeping this
 * bound below the old post-process parser limit means a child cannot exhaust
 * the verifier's memory before its caller can validate the result.
 *
 * This is deliberately not caller-configurable: Docker, Git and Prisma all
 * use the same safe default and cannot opt out through CommandRunner.
 */
export const maximumBufferedCommandOutputBytes = 1_024 * 1_024;

const outputLimitFailureCode = "a03_command_output_limit_exceeded";

export type CommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export interface CommandRunner {
  run(
    command: string,
    argumentsList: readonly string[],
    timeoutMilliseconds: number,
    environment?: NodeJS.ProcessEnv,
    workingDirectory?: string,
  ): Promise<CommandResult>;
}

/**
 * The runner never uses a shell. That keeps generated passwords out of shell
 * expansion and lets failure reporting expose only a stable command category.
 */
export class NodeCommandRunner implements CommandRunner {
  public async run(
    command: string,
    argumentsList: readonly string[],
    timeoutMilliseconds: number,
    environment: NodeJS.ProcessEnv = process.env,
    workingDirectory?: string,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, [...argumentsList], {
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          env: environment,
          cwd: workingDirectory,
        });
      } catch {
        reject(new A03ProofError("a03_docker_not_ready"));
        return;
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let bufferedOutputBytes = 0;
      let terminationFailureCode: string | undefined;
      let settled = false;
      const timeout = setTimeout(() => {
        requestTermination("a03_docker_command_timeout");
      }, timeoutMilliseconds);

      const settleWithError = (failureCode: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new A03ProofError(failureCode));
      };
      const settleWithResult = (result: CommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const requestTermination = (failureCode: string): void => {
        if (settled || terminationFailureCode !== undefined) return;
        terminationFailureCode = failureCode;
        try {
          // SIGKILL is forceful on supported Unix hosts and maps to forced
          // termination on Windows. Waiting for `close` keeps the process and
          // stream lifecycle ordered before the promise settles.
          child.kill("SIGKILL");
        } catch {
          settleWithError(failureCode);
        }
      };
      const collectOutput = (destination: Buffer[], chunk: Buffer): void => {
        if (settled || terminationFailureCode !== undefined) return;
        if (chunk.length > maximumBufferedCommandOutputBytes - bufferedOutputBytes) {
          requestTermination(outputLimitFailureCode);
          return;
        }
        bufferedOutputBytes += chunk.length;
        destination.push(chunk);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        collectOutput(stdoutChunks, chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        collectOutput(stderrChunks, chunk);
      });
      child.once("error", () => {
        settleWithError(terminationFailureCode ?? "a03_docker_not_ready");
      });
      child.once("close", (exitCode) => {
        if (terminationFailureCode !== undefined) {
          settleWithError(terminationFailureCode);
          return;
        }
        settleWithResult({
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        });
      });
    });
  }
}

/** Runs a non-Docker child without ever echoing its arguments or environment. */
export async function runProgram(
  commandRunner: CommandRunner,
  command: string,
  argumentsList: readonly string[],
  environment: NodeJS.ProcessEnv,
  timeoutMilliseconds: number,
  failureCode: string,
  workingDirectory?: string,
): Promise<CommandResult> {
  const result = await commandRunner.run(
    command,
    argumentsList,
    timeoutMilliseconds,
    environment,
    workingDirectory,
  );
  if (result.exitCode !== 0) {
    throw new A03ProofError(failureCode);
  }
  return result;
}
