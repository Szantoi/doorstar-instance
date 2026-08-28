import { spawnSync } from "node:child_process";
import { sanitizedSourceEnvironment } from "./environment.mjs";

/** Fixed Git-wide controls for every Gate 0 candidate read. */
export const gate0GitReadArgumentPrefix = Object.freeze([
  "--no-pager",
  "--no-replace-objects",
  "--no-lazy-fetch",
  "--no-optional-locks",
  "-c", "core.fsmonitor=false",
  "-c", "core.useBuiltinFSMonitor=false",
  "-c", "core.untrackedCache=false",
  "-c", "core.preloadIndex=false",
  "-c", "maintenance.auto=false",
  "-c", "gc.auto=0",
  "-c", "credential.helper=",
  "-c", "core.askPass=",
  "-c", "core.sshCommand=",
  "-c", "diff.external=",
  "-c", "alias.rev-parse=",
  "-c", "alias.ls-tree=",
  "-c", "alias.cat-file=",
]);

/**
 * Runs only Git read commands without a shell. The fixed Git options avoid a
 * pager, replacement objects, lazy fetch, optional locks, aliases and helper
 * execution from ambient configuration.
 */
export function createGitReadRunner(environment) {
  const childEnvironment = sanitizedSourceEnvironment(environment);

  return {
    run({ executable, arguments: argumentsList, cwd }) {
      if (executable !== "git") {
        return { exitCode: -1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }
      const result = spawnSync("git", [...gate0GitReadArgumentPrefix, ...argumentsList], {
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
