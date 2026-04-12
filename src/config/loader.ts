import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_CONFIG, type MemoraConfig, parseMemoraConfig } from "./schema.js";

export interface ConfigLoadOptions {
  memoraHome?: string;
  createIfMissing?: boolean;
}

export interface LoadedConfig {
  configPath: string;
  config: MemoraConfig;
}

const withNewline = (value: string): string => {
  return value.endsWith("\n") ? value : `${value}\n`;
};

export const resolveMemoraHome = (override?: string): string => {
  return override ?? process.env.MEMORA_HOME ?? path.join(os.homedir(), ".memora");
};

export const getConfigPath = (memoraHome: string): string => {
  return path.join(memoraHome, "config.json");
};

export const loadConfig = async (options: ConfigLoadOptions = {}): Promise<LoadedConfig> => {
  const memoraHome = resolveMemoraHome(options.memoraHome);
  const configPath = getConfigPath(memoraHome);
  const createIfMissing = options.createIfMissing ?? true;

  await mkdir(memoraHome, { recursive: true });

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = parseMemoraConfig(JSON.parse(raw));
    return { configPath, config: parsed };
  } catch (error: unknown) {
    const isMissingError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT";

    if (!isMissingError) {
      throw error;
    }

    if (!createIfMissing) {
      throw error;
    }

    await writeFile(configPath, withNewline(JSON.stringify(DEFAULT_CONFIG, null, 2)), "utf8");
    return { configPath, config: DEFAULT_CONFIG };
  }
};
