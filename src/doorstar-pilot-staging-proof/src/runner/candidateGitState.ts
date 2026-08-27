import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { A03ProofError } from "./a03Config.js";
import type { CommandRunner } from "./commandRunner.js";

export type CandidateGitState = Readonly<{
  commitSha: string;
  clean: true;
}>;

/**
 * Gate 0 binds evidence to a committed candidate. Ignored runtime evidence is
 * not part of `git status`; tracked/untracked source drift fails before Docker.
 */
export async function requireCleanCandidateGitState(commandRunner: CommandRunner): Promise<CandidateGitState> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  let commitResult;
  let statusResult;
  try {
    commitResult = await commandRunner.run("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], 10_000);
    statusResult = await commandRunner.run(
      "git",
      ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"],
      10_000,
    );
  } catch {
    throw new A03ProofError("a03_candidate_git_unavailable");
  }
  const commitSha = commitResult.stdout.trim();
  if (commitResult.exitCode !== 0 || !/^[0-9a-f]{40,64}$/i.test(commitSha)) {
    throw new A03ProofError("a03_candidate_git_commit_invalid");
  }
  if (statusResult.exitCode !== 0) throw new A03ProofError("a03_candidate_git_status_failed");
  if (statusResult.stdout.trim() !== "") throw new A03ProofError("a03_candidate_worktree_dirty");
  return { commitSha, clean: true };
}
