import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readRunTrace } from "../../src/trace/trace-writer.js";

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

const createRunnableRepo = async (expectedText: string): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "memora-run-repo-"));
  execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });

  await writeFile(path.join(repoRoot, "notes.txt"), "hello\n", "utf8");
  await writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify(
      {
        name: "run-fixture",
        private: true,
        packageManager: "npm@10.0.0",
        scripts: {
          test: `node -e \"const fs = require('node:fs'); const text = fs.readFileSync('notes.txt', 'utf8'); if (!text.includes('${expectedText}')) { console.error('Error: missing expected text'); process.exit(1); }\"`
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return repoRoot;
};

const runMemoraCli = (args: string[], cwd: string) => {
  return spawnSync(
    process.execPath,
    [tsxCliPath, path.join(workspaceRoot, "src", "cli", "index.ts"), ...args],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" }
    }
  );
};

describe("run CLI command", () => {
  it("executes a simple edit task, writes a trace, and exits successfully", async () => {
    const repoRoot = await createRunnableRepo("world");
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-run-home-")
    );

    const result = runMemoraCli(
      [
        "run",
        'append "world" to notes.txt',
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      workspaceRoot
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Task completed successfully.");

    const fileContents = await readFile(
      path.join(repoRoot, "notes.txt"),
      "utf8"
    );
    expect(fileContents).toContain("world");

    const runFiles = await readdir(path.join(memoraHome, "repos"));
    expect(runFiles).toHaveLength(1);

    const traceDir = path.join(memoraHome, "repos", runFiles[0], "runs");
    const traceFiles = await readdir(traceDir);
    expect(traceFiles).toHaveLength(1);

    const trace = await readRunTrace(path.join(traceDir, traceFiles[0]));
    expect(
      trace.events.some((event) => event.eventType === "verification.completed")
    ).toBe(true);
    expect(
      trace.events.some((event) => event.eventType === "step.completed")
    ).toBe(true);
  });

  it("returns a failing exit code when verification fails", async () => {
    const repoRoot = await createRunnableRepo("planet");
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-run-home-")
    );

    const result = runMemoraCli(
      [
        "run",
        'append "world" to notes.txt',
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      workspaceRoot
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Verification failed.");
  });
});
