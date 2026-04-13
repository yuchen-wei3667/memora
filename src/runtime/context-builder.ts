import { readFile } from "node:fs/promises";
import path from "node:path";

import { analyzeRepo } from "../repo/analyzer.js";
import { resolveRepo } from "../repo/resolver.js";

export interface RunTaskContext {
  repoId: string;
  repoRoot: string;
  taskText: string;
  verificationCommands: string[];
  knownFiles: string[];
}

interface RepoMetadata {
  verificationCommands?: string[];
}

const loadMetadataVerificationCommands = async (
  memoraHome: string,
  repoId: string
): Promise<string[] | null> => {
  const metadataPath = path.join(memoraHome, "repos", repoId, "metadata.json");

  try {
    const raw = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(raw) as RepoMetadata;
    return Array.isArray(metadata.verificationCommands)
      ? metadata.verificationCommands
      : [];
  } catch (error: unknown) {
    const isMissing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT";

    if (isMissing) {
      return null;
    }

    throw error;
  }
};

export const buildRunContext = async (input: {
  taskText: string;
  memoraHome: string;
  cwd?: string;
}): Promise<RunTaskContext> => {
  const resolved = await resolveRepo(input.cwd);
  const fromMetadata = await loadMetadataVerificationCommands(
    input.memoraHome,
    resolved.repoId
  );
  const analysis = await analyzeRepo(resolved.repoRoot);

  return {
    repoId: resolved.repoId,
    repoRoot: resolved.repoRoot,
    taskText: input.taskText,
    verificationCommands: fromMetadata ?? analysis.verificationCommands,
    knownFiles: []
  };
};
