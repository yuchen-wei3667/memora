import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../src/storage/db.js";
import {
  rollbackMigrations,
  runMigrations
} from "../../src/storage/migrations/run-migrations.js";

describe("storage migrations", () => {
  const openDbs: Array<ReturnType<typeof openDatabase>> = [];

  afterEach(() => {
    while (openDbs.length > 0) {
      const db = openDbs.pop();
      if (db) {
        closeDatabase(db);
      }
    }
  });

  it("applies, rolls back, and reapplies schema migrations", async () => {
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-migrations-")
    );

    const initialRun = await runMigrations({ memoraHome });
    expect(initialRun.applied).toEqual(["0001_initial"]);

    const secondRun = await runMigrations({ memoraHome });
    expect(secondRun.applied).toEqual([]);
    expect(secondRun.skipped).toEqual(["0001_initial"]);

    const dbAfterUp = openDatabase({ memoraHome });
    openDbs.push(dbAfterUp);

    const tablesAfterUp = dbAfterUp
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name IN ('repos', 'runs', 'memory_items', '_memora_migrations')
          ORDER BY name ASC
        `
      )
      .all() as Array<{ name: string }>;

    expect(tablesAfterUp.map((row) => row.name)).toEqual([
      "_memora_migrations",
      "memory_items",
      "repos",
      "runs"
    ]);

    await rollbackMigrations({ memoraHome, all: true });

    closeDatabase(dbAfterUp);
    openDbs.pop();

    const dbAfterDown = openDatabase({ memoraHome });
    openDbs.push(dbAfterDown);

    const tablesAfterDown = dbAfterDown
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name IN ('repos', 'runs', 'memory_items')
          ORDER BY name ASC
        `
      )
      .all() as Array<{ name: string }>;

    expect(tablesAfterDown).toEqual([]);

    const finalRun = await runMigrations({ memoraHome });
    expect(finalRun.applied).toEqual(["0001_initial"]);
  });
});
