import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runMigrations } from "../../src/storage/migrations/run-migrations.js";
import {
  listTools,
  recordToolExecution,
  registerTool
} from "../../src/tools/tool-registry.js";

describe("tool registry", () => {
  it("registers tool script and updates execution stats", async () => {
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-tools-home-")
    );
    await runMigrations({ memoraHome });

    const registered = await registerTool({
      memoraHome,
      repoId: "repo-a",
      repoRoot: "/tmp/repo-a",
      runId: "run-a",
      name: "test-tool",
      description: "tool description",
      language: "bash",
      script: "#!/usr/bin/env bash\nexit 0\n",
      approvalState: "auto"
    });

    const script = await readFile(registered.path, "utf8");
    expect(script).toContain("exit 0");

    const listed = listTools({ memoraHome, repoId: "repo-a" });
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("test-tool");

    const updated = recordToolExecution({
      memoraHome,
      repoId: "repo-a",
      toolId: registered.toolId,
      success: true
    });
    expect(updated.successCount).toBe(1);
    expect(updated.failureCount).toBe(0);
  });
});
