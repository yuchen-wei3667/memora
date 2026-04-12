import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { clearAuthToken, getAuthStatus, loadAuthState, upsertAuthToken } from "../../src/auth/store.js";

describe("auth store", () => {
  it("stores and loads codex login", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-auth-"));
    await upsertAuthToken("openai-codex", "sk-test", "api-key", memoraHome);

    const state = await loadAuthState(memoraHome);
    expect(state["openai-codex"]?.token).toBe("sk-test");
    expect(state["openai-codex"]?.authType).toBe("api-key");
  });

  it("reports status for both providers", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-auth-"));
    await upsertAuthToken("github-copilot", "ghu_test", "token", memoraHome);

    const status = await getAuthStatus(memoraHome);
    expect(status["openai-codex"].loggedIn).toBe(false);
    expect(status["github-copilot"].loggedIn).toBe(true);
    expect(status["github-copilot"].authType).toBe("token");
  });

  it("clears provider token on logout", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-auth-"));
    await upsertAuthToken("github-copilot", "ghu_test", "token", memoraHome);
    await clearAuthToken("github-copilot", memoraHome);

    const status = await getAuthStatus(memoraHome);
    expect(status["github-copilot"].loggedIn).toBe(false);
  });
});
