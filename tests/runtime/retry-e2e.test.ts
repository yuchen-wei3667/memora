import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
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

describe("retry e2e", () => {
  it("records retry stop reason under fix mode", async () => {
    const repoRoot = await mkdtemp(
      path.join(os.tmpdir(), "memora-retry-repo-")
    );
    execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          name: "retry-fixture",
          private: true,
          scripts: {
            test: 'node -e "process.exit(1)"'
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-retry-home-")
    );

    const result = spawnSync(
      process.execPath,
      [
        tsxCliPath,
        path.join(workspaceRoot, "src", "cli", "index.ts"),
        "fix",
        "run npm test",
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

    expect(result.status).toBe(1);
    const runIdMatch = result.stdout.match(/run_id:\s+([a-f0-9-]+)/i);
    expect(runIdMatch).not.toBeNull();

    const repoIds = await readdir(path.join(memoraHome, "repos"));
    const tracePath = path.join(
      memoraHome,
      "repos",
      repoIds[0],
      "runs",
      `${runIdMatch![1]}.json`
    );

    const traceRaw = await readFile(tracePath, "utf8");
    expect(traceRaw).toContain("retry.decided");
  });
});
