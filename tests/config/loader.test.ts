import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/loader.js";
import { DEFAULT_CONFIG } from "../../src/config/schema.js";

describe("loadConfig", () => {
  it("creates default config when missing", async () => {
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "memora-config-"));
    const loaded = await loadConfig({ memoraHome: tempHome, createIfMissing: true });

    expect(loaded.config.defaultProvider).toBe("openai-codex");
    const raw = await readFile(loaded.configPath, "utf8");
    expect(JSON.parse(raw)).toEqual(DEFAULT_CONFIG);
  });

  it("throws when config is missing and createIfMissing is false", async () => {
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "memora-config-"));

    await expect(loadConfig({ memoraHome: tempHome, createIfMissing: false })).rejects.toMatchObject(
      { code: "ENOENT" }
    );
  });
});
