import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MemoryService } from "../../src/memory/memory-service.js";
import { retrieveMemories } from "../../src/memory/memory-retriever.js";
import { runMigrations } from "../../src/storage/migrations/run-migrations.js";

describe("memory retriever", () => {
  it("returns deterministic ranking for identical queries", async () => {
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-memory-rank-")
    );
    await runMigrations({ memoraHome });

    const service = new MemoryService({ memoraHome, repoId: "repo-1" });
    await service.add({
      category: "workflow",
      content: "Run tests before commit",
      score: 0.9,
      confidence: 0.9
    });
    await service.add({
      category: "workflow",
      content: "Use npm test for quick checks",
      score: 0.8,
      confidence: 0.8
    });
    await service.add({
      category: "repo",
      content: "Keep changelog updated",
      score: 0.3,
      confidence: 0.7
    });

    const first = await retrieveMemories({
      service,
      query: "run tests before commit",
      limit: 3
    });
    const second = await retrieveMemories({
      service,
      query: "run tests before commit",
      limit: 3
    });

    expect(first.map((item) => item.memory.memoryId)).toEqual(
      second.map((item) => item.memory.memoryId)
    );
    expect(first[0].memory.content).toContain("Run tests before commit");
  });
});
