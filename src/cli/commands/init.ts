import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Command } from "commander";

import { loadConfig, resolveMemoraHome } from "../../config/loader.js";
import { analyzeRepo } from "../../repo/analyzer.js";
import { resolveRepo } from "../../repo/resolver.js";
import { closeDatabase, openDatabase, upsertRepo } from "../../storage/db.js";
import { runMigrations } from "../../storage/migrations/run-migrations.js";

export interface RepoMetadata {
  repoId: string;
  repoRoot: string;
  initializedAt: string;
  detected: {
    language: string;
    framework: string;
    packageManager: string;
  };
  verificationCommands: string[];
}

export interface InitCommandOptions {
  memoraHome?: string;
  cwd?: string;
}

const withNewline = (value: string): string => {
  return value.endsWith("\n") ? value : `${value}\n`;
};

const getRepoDir = (memoraHome: string, repoId: string): string => {
  return path.join(memoraHome, "repos", repoId);
};

const getMetadataPath = (memoraHome: string, repoId: string): string => {
  return path.join(getRepoDir(memoraHome, repoId), "metadata.json");
};

const ensureRepoDirectories = async (repoDir: string): Promise<void> => {
  await Promise.all([
    mkdir(repoDir, { recursive: true }),
    mkdir(path.join(repoDir, "tools"), { recursive: true }),
    mkdir(path.join(repoDir, "skills", "custom"), { recursive: true }),
    mkdir(path.join(repoDir, "runs"), { recursive: true }),
    mkdir(path.join(repoDir, "cache", "embeddings"), { recursive: true })
  ]);
};

const loadExistingMetadata = async (
  metadataPath: string
): Promise<RepoMetadata | null> => {
  try {
    const raw = await readFile(metadataPath, "utf8");
    return JSON.parse(raw) as RepoMetadata;
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

export const initializeRepo = async (
  options: InitCommandOptions = {}
): Promise<RepoMetadata> => {
  const memoraHome = resolveMemoraHome(options.memoraHome);
  const { repoRoot, repoId } = await resolveRepo(options.cwd);

  await loadConfig({ memoraHome, createIfMissing: true });
  await runMigrations({ memoraHome });

  const repoDir = getRepoDir(memoraHome, repoId);
  const metadataPath = getMetadataPath(memoraHome, repoId);
  await ensureRepoDirectories(repoDir);

  const existingMetadata = await loadExistingMetadata(metadataPath);
  const analysis = await analyzeRepo(repoRoot);
  const initializedAt =
    existingMetadata?.initializedAt ?? new Date().toISOString();

  const metadata: RepoMetadata = {
    repoId,
    repoRoot,
    initializedAt,
    detected: analysis.detected,
    verificationCommands: analysis.verificationCommands
  };

  await writeFile(
    metadataPath,
    withNewline(JSON.stringify(metadata, null, 2)),
    "utf8"
  );

  const db = openDatabase({ memoraHome });
  try {
    const timestamp = new Date().toISOString();
    upsertRepo(db, {
      repoId,
      repoRoot,
      createdAt: existingMetadata?.initializedAt ?? timestamp,
      updatedAt: timestamp
    });
  } finally {
    closeDatabase(db);
  }

  return metadata;
};

export const createInitCommand = (): Command => {
  return new Command("init")
    .description("Initialize memora for the current git repository")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option(
      "--cwd <path>",
      "Override working directory for repository detection"
    )
    .action(async (options: InitCommandOptions) => {
      const metadata = await initializeRepo(options);
      const memoraHome = resolveMemoraHome(options.memoraHome);

      console.log(`Initialized memora for ${metadata.repoRoot}`);
      console.log(`repo_id: ${metadata.repoId}`);
      console.log(`metadata: ${getMetadataPath(memoraHome, metadata.repoId)}`);
      if (metadata.verificationCommands.length > 0) {
        console.log(
          `verification: ${metadata.verificationCommands.join(", ")}`
        );
      } else {
        console.log("verification: none detected");
      }
    });
};
