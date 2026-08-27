import { spawn } from "node:child_process";
import { A03ProofError } from "./a03Config.js";

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
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...argumentsList], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: environment,
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMilliseconds);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", () => {
        clearTimeout(timeout);
        reject(new A03ProofError("a03_docker_not_ready"));
      });
      child.on("close", (exitCode) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new A03ProofError("a03_docker_command_timeout"));
          return;
        }
        resolve({ exitCode: exitCode ?? -1, stdout, stderr });
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
): Promise<CommandResult> {
  const result = await commandRunner.run(command, argumentsList, timeoutMilliseconds, environment);
  if (result.exitCode !== 0) {
    throw new A03ProofError(failureCode);
  }
  return result;
}

export async function requireSuccessfulCommand(
  commandRunner: CommandRunner,
  category: "version" | "image" | "run" | "inspect" | "remove",
  argumentsList: readonly string[],
  timeoutMilliseconds = 30_000,
): Promise<CommandResult> {
  const result = await commandRunner.run("docker", argumentsList, timeoutMilliseconds);
  if (result.exitCode !== 0) {
    throw new A03ProofError(`a03_docker_${category}_failed`);
  }
  return result;
}
