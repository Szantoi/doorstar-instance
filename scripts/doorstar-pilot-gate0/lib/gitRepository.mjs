import path from "node:path";
import { fail } from "./errors.mjs";

/**
 * Minimal Git adapter. Every argument is fixed or validated and is passed to
 * the runner without a shell, so a candidate or path cannot become a command.
 */
export function createGitRepository({ repoRoot, runner }) {
  const resolvedRepositoryRoot = path.resolve(repoRoot);
  const assertRepositoryRoot = () => {
    const topLevel = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "--show-toplevel"]);
    if (!sameFilesystemPath(topLevel, resolvedRepositoryRoot)) {
      fail("gate0_repository_root_mismatch");
    }
  };

  const captureCleanCandidate = (candidate) => {
    assertRepositoryRoot();
    assertFullCommitSha(candidate);
    const resolvedCandidate = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "--verify", `${candidate}^{commit}`]);
    const head = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "HEAD"]);
    if (resolvedCandidate !== head) {
      fail("gate0_candidate_not_head");
    }
    assertClean(runner, resolvedRepositoryRoot);
    const objectFormat = gitText(runner, resolvedRepositoryRoot, ["rev-parse", "--show-object-format"]);
    if ((objectFormat !== "sha1" && objectFormat !== "sha256")
      || resolvedCandidate.length !== (objectFormat === "sha1" ? 40 : 64)
      || !/^[0-9a-f]+$/i.test(resolvedCandidate)) {
      fail("gate0_candidate_invalid");
    }
    const treeSha = gitText(runner, resolvedRepositoryRoot, ["rev-parse", `${resolvedCandidate}^{tree}`]);
    return Object.freeze({
      commitSha: resolvedCandidate,
      treeSha,
      objectFormat,
    });
  };

  return {
    captureCleanCandidate,

    readBlob(candidate, repositoryRelativePath) {
      assertRepositoryRelativePath(repositoryRelativePath);
      return gitBytes(runner, resolvedRepositoryRoot, ["show", `${candidate.commitSha}:${repositoryRelativePath}`]);
    },

    assertStillCleanCandidate(candidate) {
      const current = captureCleanCandidate(candidate.commitSha);
      if (current.treeSha !== candidate.treeSha || current.objectFormat !== candidate.objectFormat) {
        fail("gate0_candidate_changed");
      }
    },
  };
}

function sameFilesystemPath(left, right) {
  return process.platform === "win32"
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
}

function assertFullCommitSha(candidate) {
  if (typeof candidate !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(candidate)) {
    fail("gate0_candidate_invalid");
  }
}

function assertRepositoryRelativePath(repositoryRelativePath) {
  if (typeof repositoryRelativePath !== "string"
    || repositoryRelativePath.startsWith("/")
    || repositoryRelativePath.includes("\\")
    || repositoryRelativePath.includes("..")
    || path.posix.normalize(repositoryRelativePath) !== repositoryRelativePath) {
    fail("gate0_policy_invalid");
  }
}

function assertClean(runner, repoRoot) {
  const status = gitText(runner, repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    fail("gate0_worktree_not_clean");
  }
}

function gitText(runner, repoRoot, argumentsList) {
  return gitBytes(runner, repoRoot, argumentsList).toString("utf8").trim();
}

function gitBytes(runner, repoRoot, argumentsList) {
  const result = runner.run({ executable: "git", arguments: argumentsList, cwd: repoRoot });
  if (result.exitCode !== 0) {
    fail("gate0_git_command_failed");
  }
  return Buffer.from(result.stdout);
}
