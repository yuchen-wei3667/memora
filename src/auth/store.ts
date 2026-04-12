import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { resolveMemoraHome } from "../config/loader.js";
import type { ProviderName } from "../config/schema.js";

const authEntrySchema = z
  .object({
    token: z.string().min(1),
    updatedAt: z.string().min(1),
    authType: z.enum(["api-key", "token"])
  })
  .strict();

const authStateSchema = z
  .object({
    "openai-codex": authEntrySchema.optional(),
    "github-copilot": authEntrySchema.optional()
  })
  .strict();

export type AuthEntry = z.infer<typeof authEntrySchema>;
export type AuthState = z.infer<typeof authStateSchema>;

const EMPTY_AUTH_STATE: AuthState = {};

export const getAuthPath = (memoraHome: string): string => {
  return path.join(memoraHome, "auth.json");
};

const withNewline = (value: string): string => {
  return value.endsWith("\n") ? value : `${value}\n`;
};

export const loadAuthState = async (memoraHomeOverride?: string): Promise<AuthState> => {
  const memoraHome = resolveMemoraHome(memoraHomeOverride);
  const authPath = getAuthPath(memoraHome);

  try {
    const raw = await readFile(authPath, "utf8");
    return authStateSchema.parse(JSON.parse(raw));
  } catch (error: unknown) {
    const isMissingError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT";

    if (isMissingError) {
      return EMPTY_AUTH_STATE;
    }

    throw error;
  }
};

export const saveAuthState = async (
  state: AuthState,
  memoraHomeOverride?: string
): Promise<{ authPath: string }> => {
  const memoraHome = resolveMemoraHome(memoraHomeOverride);
  const authPath = getAuthPath(memoraHome);

  await mkdir(memoraHome, { recursive: true });
  await writeFile(authPath, withNewline(JSON.stringify(authStateSchema.parse(state), null, 2)), "utf8");
  await chmod(authPath, 0o600);

  return { authPath };
};

export const upsertAuthToken = async (
  provider: ProviderName,
  token: string,
  authType: "api-key" | "token",
  memoraHomeOverride?: string
): Promise<{ authPath: string }> => {
  const state = await loadAuthState(memoraHomeOverride);
  const next: AuthState = {
    ...state,
    [provider]: {
      token,
      updatedAt: new Date().toISOString(),
      authType
    }
  };

  return saveAuthState(next, memoraHomeOverride);
};

export const clearAuthToken = async (
  provider: ProviderName,
  memoraHomeOverride?: string
): Promise<{ authPath: string }> => {
  const state = await loadAuthState(memoraHomeOverride);
  const next: AuthState = { ...state };
  delete next[provider];
  return saveAuthState(next, memoraHomeOverride);
};

export const getAuthStatus = async (
  memoraHomeOverride?: string
): Promise<Record<ProviderName, { loggedIn: boolean; updatedAt: string | null; authType: string | null }>> => {
  const state = await loadAuthState(memoraHomeOverride);

  const build = (provider: ProviderName) => ({
    loggedIn: Boolean(state[provider]?.token),
    updatedAt: state[provider]?.updatedAt ?? null,
    authType: state[provider]?.authType ?? null
  });

  return {
    "openai-codex": build("openai-codex"),
    "github-copilot": build("github-copilot")
  };
};
