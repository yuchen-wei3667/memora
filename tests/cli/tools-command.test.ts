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

describe("tools CLI command", () => {
  it("lists no tools for fresh repo", async () => {
    const repoRoot = await mkdtemp(
      path.join(os.tmpdir(), "memora-tools-repo-")
    );
    execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          name: "tools-fixture",
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
      path.join(os.tmpdir(), "memora-tools-home-")
    );

    const result = spawnSync(
      process.execPath,
      [
        tsxCliPath,
        path.join(workspaceRoot, "src", "cli", "index.ts"),
        "tools",
        "list",
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      {
        cwd: workspaceRoot,
        encoding: "utf8"
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No tools found.");
  });
});
