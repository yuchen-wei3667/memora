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

describe("test CLI command", () => {
  it("runs verification commands and succeeds", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "memora-test-repo-"));
    execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          name: "test-fixture",
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
      path.join(os.tmpdir(), "memora-test-home-")
    );

    const result = spawnSync(
      process.execPath,
      [
        tsxCliPath,
        path.join(workspaceRoot, "src", "cli", "index.ts"),
        "test",
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
    expect(result.stdout).toContain("status: passed");
  });
});
