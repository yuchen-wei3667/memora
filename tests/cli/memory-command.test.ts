import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
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

const createRepo = async (): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "memora-memory-repo-"));
  execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
  execFileSync("git", ["config", "user.name", "Test User"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
  execFileSync(
    "/usr/bin/bash",
    [
      "-lc",
      'printf \'{"name":"memory-fixture","private":true}\' > package.json'
    ],
    {
      cwd: repoRoot,
      stdio: "ignore"
    }
  );
  return repoRoot;
};

describe("memory CLI command", () => {
  it("supports add/list/delete lifecycle", async () => {
    const repoRoot = await createRepo();
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-memory-home-")
    );

    const add = runCli([
      "memory",
      "add",
      "--category",
      "workflow",
      "--content",
      "Run tests before commit",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);
    expect(add.status).toBe(0);
    expect(add.stdout).toContain("Added memory");

    const list = runCli([
      "memory",
      "list",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain("Run tests before commit");

    const idMatch = list.stdout.match(/^([a-f0-9-]{36})\s+\|/m);
    expect(idMatch).not.toBeNull();

    const del = runCli([
      "memory",
      "delete",
      idMatch![1],
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);
    expect(del.status).toBe(0);

    const listAfter = runCli([
      "memory",
      "list",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);
    expect(listAfter.stdout).toContain("No memory items found.");
  });

  it("dedupes exact and near duplicate additions", async () => {
    const repoRoot = await createRepo();
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-memory-home-")
    );

    runCli([
      "memory",
      "add",
      "--category",
      "workflow",
      "--content",
      "Run tests before commit",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);

    const exact = runCli([
      "memory",
      "add",
      "--category",
      "workflow",
      "--content",
      "Run   tests before commit",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);
    expect(exact.stdout).toContain("Updated existing memory (exact)");

    const near = runCli([
      "memory",
      "add",
      "--category",
      "workflow",
      "--content",
      "Run tests before every commit",
      "--cwd",
      repoRoot,
      "--memora-home",
      memoraHome
    ]);
    expect(near.stdout).toContain("Updated existing memory (near)");
  });
});
