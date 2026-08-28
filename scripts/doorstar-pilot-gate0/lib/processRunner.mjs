import { spawnSync } from "node:child_process";
import { sanitizedSourceEnvironment } from "./environment.mjs";

/**
 * Runs only Git read commands without a shell. The fixed Git options avoid a
 * pager, optional locks and fsmonitor command execution from ambient config.
 */
export function createGitReadRunner(environment) {
  const childEnvironment = sanitizedSourceEnvironment(environment);

  return {
    run({ executable, arguments: argumentsList, cwd }) {
      if (executable !== "git") {
        return { exitCode: -1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }
      const result = spawnSync("git", [
        "--no-pager",
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        ...argumentsList,
      ], {
        cwd,
        env: childEnvironment,
        encoding: null,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      return {
        exitCode: typeof result.status === "number" ? result.status : -1,
        stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
        stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0),
      };
    },
  };
}
