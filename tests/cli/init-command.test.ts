import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { computeRepoId } from "../../src/repo/resolver.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const tsxCliPath = path.join(
  workspaceRoot,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs"
);

const createTempGitRepo = async (): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "memora-init-repo-"));

  execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
  await writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify(
      {
        name: "fixture-repo",
        private: true,
        packageManager: "npm@10.0.0",
        scripts: {
          test: "vitest run",
          lint: "eslint .",
          typecheck: "tsc --noEmit"
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await writeFile(path.join(repoRoot, "tsconfig.json"), "{}\n", "utf8");

  return repoRoot;
};

describe("init CLI command", () => {
  it("creates metadata in a temporary git repo", async () => {
    const repoRoot = await createTempGitRepo();
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-init-home-")
    );

    await runCli([
      "node",
      "memora",
      "init",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);

    const repoId = computeRepoId(repoRoot);
    const metadataPath = path.join(
      memoraHome,
      "repos",
      repoId,
      "metadata.json"
    );
    const raw = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(raw) as {
      repoId: string;
      repoRoot: string;
      initializedAt: string;
      detected: { language: string; framework: string; packageManager: string };
      verificationCommands: string[];
    };

    expect(metadata.repoId).toBe(repoId);
    expect(metadata.repoRoot).toBe(repoRoot);
    expect(metadata.detected).toEqual({
      language: "typescript",
      framework: "node",
      packageManager: "npm"
    });
    expect(metadata.verificationCommands).toEqual([
      "npm test",
      "npm run lint",
      "npm run typecheck"
    ]);
  });

  it("is idempotent when re-run for the same repo", async () => {
    const repoRoot = await createTempGitRepo();
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-init-home-")
    );

    await runCli([
      "node",
      "memora",
      "init",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);

    const repoId = computeRepoId(repoRoot);
    const metadataPath = path.join(
      memoraHome,
      "repos",
      repoId,
      "metadata.json"
    );
    const firstRaw = await readFile(metadataPath, "utf8");
    const firstMetadata = JSON.parse(firstRaw) as { initializedAt: string };

    await runCli([
      "node",
      "memora",
      "init",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);

    const secondRaw = await readFile(metadataPath, "utf8");
    const secondMetadata = JSON.parse(secondRaw) as { initializedAt: string };

    expect(secondMetadata.initializedAt).toBe(firstMetadata.initializedAt);
    expect(secondRaw).toBe(firstRaw);
  });

  it("returns a clear error and non-zero exit code outside a git repo", async () => {
    const nonGitDir = await mkdtemp(
      path.join(os.tmpdir(), "memora-init-non-git-")
    );
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-init-home-")
    );

    const result = spawnSync(
      process.execPath,
      [
        tsxCliPath,
        path.join(workspaceRoot, "src", "cli", "index.ts"),
        "init",
        "--cwd",
        nonGitDir,
        "--memora-home",
        memoraHome
      ],
      {
        cwd: workspaceRoot,
        encoding: "utf8"
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "memora init must be run inside a git repository."
    );
  });
});
