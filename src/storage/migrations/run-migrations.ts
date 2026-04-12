import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  closeDatabase,
  ensureDbDirectory,
  ensureMigrationLedgerTable,
  getAppliedMigrationsDescending,
  listAppliedMigrationIds,
  openDatabase,
  recordAppliedMigration,
  removeAppliedMigration,
  withTransaction,
  type DbConnectionOptions
} from "../db.js";

export interface MigrationModule {
  id: string;
  up: (db: ReturnType<typeof openDatabase>) => Promise<void> | void;
  down: (db: ReturnType<typeof openDatabase>) => Promise<void> | void;
}

export interface MigrationRunResult {
  dbPath: string;
  applied: string[];
  skipped: string[];
}

export interface MigrationRollbackResult {
  dbPath: string;
  rolledBack: string[];
}

export interface MigrationRollbackOptions extends DbConnectionOptions {
  steps?: number;
  all?: boolean;
}

const migrationsDir = fileURLToPath(new URL(".", import.meta.url));

const loadMigrations = async (): Promise<MigrationModule[]> => {
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.(?:ts|js)$/.test(file))
    .sort();

  const migrations = await Promise.all(
    files.map(async (file) => {
      const modulePath = path.join(migrationsDir, file);
      const moduleUrl = pathToFileURL(modulePath).href;
      return (await import(moduleUrl)) as MigrationModule;
    })
  );

  return migrations.sort((left, right) => left.id.localeCompare(right.id));
};

export const runMigrations = async (
  options: DbConnectionOptions = {}
): Promise<MigrationRunResult> => {
  const dbPath = await ensureDbDirectory(options);
  const db = openDatabase({ ...options, dbPath });

  try {
    ensureMigrationLedgerTable(db);

    const migrations = await loadMigrations();
    const appliedIds = new Set(listAppliedMigrationIds(db));
    const result: MigrationRunResult = {
      dbPath,
      applied: [],
      skipped: []
    };

    for (const migration of migrations) {
      if (appliedIds.has(migration.id)) {
        result.skipped.push(migration.id);
        continue;
      }

      await withTransaction(db, async () => {
        await migration.up(db);
        recordAppliedMigration(db, migration.id, new Date().toISOString());
      });

      result.applied.push(migration.id);
      appliedIds.add(migration.id);
    }

    return result;
  } finally {
    closeDatabase(db);
  }
};

export const rollbackMigrations = async (
  options: MigrationRollbackOptions = {}
): Promise<MigrationRollbackResult> => {
  const dbPath = await ensureDbDirectory(options);
  const db = openDatabase({ ...options, dbPath });

  try {
    ensureMigrationLedgerTable(db);

    const applied = getAppliedMigrationsDescending(db);
    const migrations = await loadMigrations();
    const byId = new Map(
      migrations.map((migration) => [migration.id, migration])
    );
    const count = options.all
      ? applied.length
      : Math.max(0, options.steps ?? 1);
    const target = applied.slice(0, count);

    for (const entry of target) {
      const migration = byId.get(entry.id);

      if (!migration) {
        throw new Error(`Missing migration module for ${entry.id}`);
      }

      await withTransaction(db, async () => {
        await migration.down(db);
        removeAppliedMigration(db, entry.id);
      });
    }

    return {
      dbPath,
      rolledBack: target.map((entry) => entry.id)
    };
  } finally {
    closeDatabase(db);
  }
};

const parseArgs = (
  args: string[]
): { direction: "up" | "down"; steps?: number; all?: boolean } => {
  const [directionArg, ...flags] = args;
  const direction = directionArg === "down" ? "down" : "up";
  const stepsFlag = flags.find((flag) => flag.startsWith("--steps="));
  const steps = stepsFlag
    ? Number.parseInt(stepsFlag.slice("--steps=".length), 10)
    : undefined;
  const all = flags.includes("--all");

  if (steps !== undefined && (!Number.isInteger(steps) || steps < 1)) {
    throw new Error(`Invalid --steps value: ${stepsFlag}`);
  }

  return { direction, steps, all };
};

const runCli = async (): Promise<void> => {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.direction === "down") {
    const result = await rollbackMigrations({
      steps: parsed.steps,
      all: parsed.all
    });
    console.log(
      `rolled back ${result.rolledBack.length} migration(s) at ${result.dbPath}`
    );
    for (const id of result.rolledBack) {
      console.log(`reverted ${id}`);
    }
    return;
  }

  const result = await runMigrations();
  console.log(
    `applied ${result.applied.length} migration(s) at ${result.dbPath}`
  );
  for (const id of result.applied) {
    console.log(`applied ${id}`);
  }
  for (const id of result.skipped) {
    console.log(`skip ${id}`);
  }
};

const isEntrypoint = (): boolean => {
  const entry = process.argv[1];

  if (!entry) {
    return false;
  }

  return import.meta.url === pathToFileURL(entry).href;
};

if (isEntrypoint()) {
  runCli().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
