import { spawnSync } from "node:child_process";
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

describe("skills CLI command", () => {
  it("lists built-in skills", () => {
    const result = spawnSync(
      process.execPath,
      [
        tsxCliPath,
        path.join(workspaceRoot, "src", "cli", "index.ts"),
        "skills",
        "list"
      ],
      {
        cwd: workspaceRoot,
        encoding: "utf8"
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fix_failing_tests");
    expect(result.stdout).toContain("implement_feature_safely");
    expect(result.stdout).toContain("refactor_preserve_behavior");
  });
});
