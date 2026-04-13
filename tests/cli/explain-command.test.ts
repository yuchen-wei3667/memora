import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

const runCli = (args: string[]) => {
  return spawnSync(
    process.execPath,
    [tsxCliPath, path.join(workspaceRoot, "src", "cli", "index.ts"), ...args],
    {
      cwd: workspaceRoot,
      encoding: "utf8"
    }
  );
};

describe("explain CLI command", () => {
  it("prints explanation for latest run", async () => {
    const repoRoot = await mkdtemp(
      path.join(os.tmpdir(), "memora-explain-repo-")
    );
    execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
    await writeFile(path.join(repoRoot, "notes.txt"), "hello\n", "utf8");
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          name: "explain-fixture",
          private: true,
          scripts: {
            test: 'node -e "process.exit(0)"'
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-explain-home-")
    );

    const run = runCli([
      "run",
      'append "world" to notes.txt',
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);
    expect(run.status).toBe(0);

    const explain = runCli([
      "explain",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);

    expect(explain.status).toBe(0);
    expect(explain.stdout).toContain("run_id:");
    expect(explain.stdout).toContain("selected_skill:");
    expect(explain.stdout).toContain("verification_delta:");
  });
});
