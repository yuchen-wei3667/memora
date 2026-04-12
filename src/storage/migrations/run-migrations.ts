import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface MigrationModule {
  id: string;
  up: () => Promise<void>;
}

interface MigrationLedger {
  applied: string[];
}

const loadLedger = async (ledgerPath: string): Promise<MigrationLedger> => {
  try {
    const raw = await readFile(ledgerPath, "utf8");
    const parsed = JSON.parse(raw) as MigrationLedger;
    return { applied: Array.isArray(parsed.applied) ? parsed.applied : [] };
  } catch {
    return { applied: [] };
  }
};

const saveLedger = async (ledgerPath: string, applied: string[]): Promise<void> => {
  const ledger: MigrationLedger = { applied: [...new Set(applied)].sort() };
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
};

const run = async (): Promise<void> => {
  const memoraHome = process.env.MEMORA_HOME ?? path.join(os.homedir(), ".memora");
  const stateDir = path.join(memoraHome, "state");
  const ledgerPath = path.join(stateDir, "migrations.json");

  await mkdir(stateDir, { recursive: true });
  const ledger = await loadLedger(ledgerPath);
  const applied = new Set(ledger.applied);

  const migrationsDir = path.dirname(new URL(import.meta.url).pathname);
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.ts$/.test(file))
    .sort();

  for (const file of files) {
    const modulePath = path.join(migrationsDir, file);
    const moduleUrl = pathToFileURL(modulePath).href;
    const migration = (await import(moduleUrl)) as MigrationModule;

    if (applied.has(migration.id)) {
      console.log(`skip ${migration.id}`);
      continue;
    }

    await migration.up();
    applied.add(migration.id);
    console.log(`applied ${migration.id}`);
  }

  await saveLedger(ledgerPath, [...applied]);
  console.log(`ledger ${ledgerPath}`);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
