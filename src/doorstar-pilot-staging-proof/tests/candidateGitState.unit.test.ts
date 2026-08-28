import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  candidateGitReadArgumentPrefix,
  createCandidateGitChildEnvironment,
  requireCandidateGitAnchorsUnchanged,
  requireCleanCandidateGitState,
  verifyCandidateWorkingTreeAgainstGitTree,
  type CandidateGitTreeEntry,
} from "../src/runner/candidateGitState.js";
import type { CommandRunner } from "../src/runner/commandRunner.js";

const commitSha = "a".repeat(40);
const treeSha = "b".repeat(40);

describe("candidate Git state hardening", () => {
  it("uses a frozen minimal child environment and fixed object-only Git options", () => {
    const ambientEnvironment: NodeJS.ProcessEnv = {
      Path: "C:\\trusted-git-bin",
      SystemRoot: "C:\\Windows",
      GIT_DIR: "C:\\attacker-controlled-repository",
      git_config_global: "C:\\attacker-controlled-gitconfig",
      GIT_CONFIG_SYSTEM: "C:\\attacker-controlled-system-gitconfig",
      GIT_EXTERNAL_DIFF: "C:\\attacker-controlled-diff.exe",
      NODE_OPTIONS: "--require C:\\attacker-controlled-node-hook.cjs",
      HOME: "C:\\attacker-controlled-home",
      USERPROFILE: "C:\\attacker-controlled-profile",
    };

    const childEnvironment = createCandidateGitChildEnvironment(ambientEnvironment);

    expect(childEnvironment).not.toBe(ambientEnvironment);
    expect(Object.isFrozen(childEnvironment)).toBe(true);
    expect(childEnvironment.PATH).toBe("C:\\trusted-git-bin");
    expect(childEnvironment.GIT_CONFIG_NOSYSTEM).toBe("1");
    expect(childEnvironment.GIT_CONFIG_GLOBAL).toBe(process.platform === "win32" ? "NUL" : "/dev/null");
    expect(childEnvironment.GIT_TERMINAL_PROMPT).toBe("0");
    for (const forbiddenName of ["GIT_DIR", "GIT_CONFIG_SYSTEM", "GIT_EXTERNAL_DIFF", "NODE_OPTIONS", "HOME", "USERPROFILE"]) {
      expect(Object.keys(childEnvironment).some((name) => name.toUpperCase() === forbiddenName)).toBe(false);
    }
    expect(candidateGitReadArgumentPrefix).toEqual(expect.arrayContaining([
      "--no-pager",
      "--no-replace-objects",
      "--no-lazy-fetch",
      "--no-optional-locks",
      "core.fsmonitor=false",
      "core.untrackedCache=false",
      "maintenance.auto=false",
      "gc.auto=0",
      "alias.rev-parse=",
      "alias.ls-tree=",
      "alias.cat-file=",
    ]));
    expect(candidateGitReadArgumentPrefix).not.toContain("alias.status=");
  });

  it("accepts an exact raw-byte worktree with the repository sha256 object format", async () => {
    await withTemporaryWorktree(async (root) => {
      await writeFile(join(root, "tracked.txt"), "committed bytes\n", "utf8");

      await expect(verifyCandidateWorkingTreeAgainstGitTree(root, [
        gitBlobEntry("tracked.txt", "committed bytes\n", "sha256"),
      ], "sha256")).resolves.toBeUndefined();
    });
  });

  it("rejects an untracked extra file even when Git would normally ignore it", async () => {
    await withTemporaryWorktree(async (root) => {
      await writeFile(join(root, ".gitignore"), "untracked.txt\n", "utf8");
      await writeFile(join(root, "tracked.txt"), "committed\n", "utf8");
      await writeFile(join(root, "untracked.txt"), "ignored-but-not-permitted\n", "utf8");

      await expect(verifyCandidateWorkingTreeAgainstGitTree(root, [
        gitBlobEntry(".gitignore", "untracked.txt\n"),
        gitBlobEntry("tracked.txt", "committed\n"),
      ], "sha1")).rejects.toMatchObject({ publicCode: "a03_candidate_worktree_dirty" });
    });
  });

  it("rejects a symbolic-link entry instead of following it", async (context) => {
    await withTemporaryWorktree(async (root) => {
      await writeFile(join(root, "tracked.txt"), "committed\n", "utf8");
      try {
        await symlink("tracked.txt", join(root, "link.txt"));
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: string }).code
          : undefined;
        if (code === "EPERM" || code === "EACCES") {
          context.skip("the host does not permit test symlink creation");
          return;
        }
        throw error;
      }

      await expect(verifyCandidateWorkingTreeAgainstGitTree(root, [
        gitBlobEntry("tracked.txt", "committed\n"),
      ], "sha1")).rejects.toMatchObject({ publicCode: "a03_candidate_worktree_dirty" });
    });
  });

  it("rejects raw-byte content that does not match the committed Git blob", async () => {
    await withTemporaryWorktree(async (root) => {
      await writeFile(join(root, "tracked.txt"), "working-copy bytes\n", "utf8");

      await expect(verifyCandidateWorkingTreeAgainstGitTree(root, [
        gitBlobEntry("tracked.txt", "committed bytes\n"),
      ], "sha1")).rejects.toMatchObject({ publicCode: "a03_candidate_worktree_dirty" });
    });
  });

  it("never invokes git status while checking the candidate", async () => {
    const calls: Array<Readonly<{ command: string; argumentsList: readonly string[] }>> = [];
    const runner: CommandRunner = {
      run: async (command, argumentsList) => {
        calls.push({ command, argumentsList: [...argumentsList] });
        return {
          exitCode: 0,
          stdout: argumentsList.includes("--show-object-format")
            ? "sha1\n"
            : argumentsList.some((argument) => argument.endsWith("^{tree}"))
              ? `${treeSha}\n`
              : argumentsList.includes("HEAD^{commit}")
                ? `${commitSha}\n`
                : "",
          stderr: "",
        };
      },
    };

    // The deliberately empty tree cannot match this real checkout, but the
    // filesystem failure is after every allowed Git object read has occurred.
    await expect(requireCleanCandidateGitState(runner)).rejects
      .toMatchObject({ publicCode: "a03_candidate_worktree_dirty" });

    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.command === "git")).toBe(true);
    expect(calls.some((call) => call.argumentsList.includes("status"))).toBe(false);
    expect(calls.some((call) => call.argumentsList.includes("--porcelain=v1"))).toBe(false);
    expect(calls.some((call) => call.argumentsList.includes("ls-tree"))).toBe(true);
    for (const call of calls) {
      expect(call.argumentsList.slice(0, candidateGitReadArgumentPrefix.length))
        .toEqual(candidateGitReadArgumentPrefix);
    }
  });

  it("rejects a checkout movement after the raw worktree walk", async () => {
    const changedCommitSha = "c".repeat(40);
    const calls: Array<Readonly<{ command: string; argumentsList: readonly string[] }>> = [];
    const runner: CommandRunner = {
      run: async (command, argumentsList) => {
        calls.push({ command, argumentsList: [...argumentsList] });
        return {
          exitCode: 0,
          stdout: argumentsList.includes("--show-object-format")
            ? "sha1\n"
            : argumentsList.includes("HEAD^{commit}")
              ? `${changedCommitSha}\n`
              : argumentsList.some((argument) => argument.endsWith("^{tree}"))
                ? `${treeSha}\n`
                : "",
          stderr: "",
        };
      },
    };

    await expect(requireCandidateGitAnchorsUnchanged(
      runner,
      createCandidateGitChildEnvironment({ PATH: process.env.PATH }),
      Object.freeze({ commitSha, treeSha, objectFormat: "sha1", clean: true }),
    )).rejects.toMatchObject({ publicCode: "a03_candidate_git_changed" });

    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.command === "git")).toBe(true);
    expect(calls.some((call) => call.argumentsList.includes("status"))).toBe(false);
    for (const call of calls) {
      expect(call.argumentsList.slice(0, candidateGitReadArgumentPrefix.length))
        .toEqual(candidateGitReadArgumentPrefix);
    }
  });
});

function gitBlobEntry(
  path: string,
  contents: string,
  objectFormat: "sha1" | "sha256" = "sha1",
): CandidateGitTreeEntry {
  return Object.freeze({
    mode: "100644",
    objectType: "blob",
    objectSha: gitBlobObjectId(contents, objectFormat),
    path,
  });
}

function gitBlobObjectId(contents: string, objectFormat: "sha1" | "sha256"): string {
  const bytes = Buffer.from(contents, "utf8");
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

async function withTemporaryWorktree(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "doorstar-candidate-git-state-"));
  try {
    await mkdir(join(root, ".git"));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 2 });
  }
}
