import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  closeDatabase,
  createRepoScopedDb,
  getRepoById,
  openDatabase,
  upsertRepo
} from "../../src/storage/db.js";
import { runMigrations } from "../../src/storage/migrations/run-migrations.js";

describe("storage db helpers", () => {
  const openDbs: Array<ReturnType<typeof openDatabase>> = [];

  afterEach(() => {
    while (openDbs.length > 0) {
      const db = openDbs.pop();
      if (db) {
        closeDatabase(db);
      }
    }
  });

  it("supports repo, run, and memory CRUD with repo isolation", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-storage-"));
    await runMigrations({ memoraHome });

    const db = openDatabase({ memoraHome });
    openDbs.push(db);

    const repoA = upsertRepo(db, {
      repoId: "repo-a",
      repoRoot: "/tmp/repo-a",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const repoB = upsertRepo(db, {
      repoId: "repo-b",
      repoRoot: "/tmp/repo-b",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(getRepoById(db, repoA.repoId)).toMatchObject({
      repoRoot: "/tmp/repo-a"
    });
    expect(getRepoById(db, repoB.repoId)).toMatchObject({
      repoRoot: "/tmp/repo-b"
    });

    const repoADb = createRepoScopedDb(db, repoA.repoId);
    const repoBDb = createRepoScopedDb(db, repoB.repoId);

    const runA = repoADb.insertRun({
      runId: "run-a",
      command: "memora run fix tests",
      taskText: "fix tests",
      status: "success",
      attemptCount: 1,
      selectedSkill: "fix-failing-tests",
      summary: "fixed the failing test suite",
      startedAt: "2026-01-02T00:00:00.000Z",
      endedAt: "2026-01-02T00:01:00.000Z"
    });
    repoBDb.insertRun({
      runId: "run-b",
      command: "memora run add memory",
      taskText: "add memory",
      status: "failed",
      attemptCount: 2,
      startedAt: "2026-01-03T00:00:00.000Z"
    });

    expect(repoADb.getRunById(runA.runId)).toMatchObject({
      runId: "run-a",
      repoId: "repo-a"
    });
    expect(repoADb.getRunById("run-b")).toBeNull();
    expect(repoADb.listRuns().map((run) => run.runId)).toEqual(["run-a"]);
    expect(repoBDb.listRuns().map((run) => run.runId)).toEqual(["run-b"]);

    const memoryA = repoADb.insertMemoryItem({
      memoryId: "memory-a",
      category: "workflow",
      content: "Run tests before commit",
      contentHash: "hash-a",
      score: 0.9,
      confidence: 0.8,
      sourceRunId: runA.runId,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
    repoBDb.insertMemoryItem({
      memoryId: "memory-b",
      category: "repo",
      content: "Use pnpm for installs",
      contentHash: "hash-b",
      score: 0.4,
      confidence: 0.7,
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z"
    });

    expect(repoADb.getMemoryItemById(memoryA.memoryId)).toMatchObject({
      memoryId: "memory-a",
      repoId: "repo-a",
      archived: false
    });
    expect(repoADb.getMemoryItemById("memory-b")).toBeNull();
    expect(repoADb.listMemoryItems().map((memory) => memory.memoryId)).toEqual([
      "memory-a"
    ]);
    expect(repoBDb.listMemoryItems().map((memory) => memory.memoryId)).toEqual([
      "memory-b"
    ]);

    const updatedMemory = repoADb.updateMemoryItem("memory-a", {
      score: 0.95,
      useCount: 3,
      archived: true,
      updatedAt: "2026-01-04T00:00:00.000Z"
    });

    expect(updatedMemory).toMatchObject({
      memoryId: "memory-a",
      score: 0.95,
      useCount: 3,
      archived: true
    });

    expect(repoADb.deleteMemoryItem("memory-a")).toBe(true);
    expect(repoADb.getMemoryItemById("memory-a")).toBeNull();
    expect(repoBDb.getMemoryItemById("memory-b")).toMatchObject({
      repoId: "repo-b"
    });
  });
});
