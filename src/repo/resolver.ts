import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class RepoResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoResolutionError";
  }
}

export interface ResolvedRepo {
  cwd: string;
  repoRoot: string;
  repoId: string;
}

export const canonicalizeRepoRoot = async (
  repoRoot: string
): Promise<string> => {
  const resolved = await realpath(repoRoot);
  return path.normalize(resolved);
};

export const computeRepoId = (repoRoot: string): string => {
  return createHash("sha256").update(repoRoot).digest("hex");
};

export const resolveGitRoot = async (cwd = process.cwd()): Promise<string> => {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd }
    );
    const repoRoot = stdout.trim();

    if (!repoRoot) {
      throw new RepoResolutionError(
        "Unable to determine git root for the current directory."
      );
    }

    return canonicalizeRepoRoot(repoRoot);
  } catch (error: unknown) {
    const isGitError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number | string }).code !== undefined;

    if (isGitError) {
      throw new RepoResolutionError(
        "memora init must be run inside a git repository."
      );
    }

    throw error;
  }
};

export const resolveRepo = async (
  cwd = process.cwd()
): Promise<ResolvedRepo> => {
  const repoRoot = await resolveGitRoot(cwd);
  const repoId = computeRepoId(repoRoot);

  return {
    cwd: path.resolve(cwd),
    repoRoot,
    repoId
  };
};
