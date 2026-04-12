import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { getAuthStatus } from "../../src/auth/store.js";

const captureConsole = async (fn: () => Promise<void>): Promise<string[]> => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    await fn();
    return logs;
  } finally {
    console.log = original;
  }
};

describe("auth CLI command", () => {
  it("rejects unsupported provider", async () => {
    await expect(runCli(["node", "memora", "auth", "login", "anthropic", "--token", "x"])).rejects.toThrow(
      "Supported providers: openai-codex, github-copilot"
    );
  });

  it("logs in with OpenAI API key", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-cli-auth-"));

    await runCli([
      "node",
      "memora",
      "auth",
      "login",
      "openai-codex",
      "--api-key",
      "sk-test",
      "--memora-home",
      memoraHome
    ]);

    const status = await getAuthStatus(memoraHome);
    expect(status["openai-codex"].loggedIn).toBe(true);
  });

  it("shows status output", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-cli-auth-"));
    await runCli([
      "node",
      "memora",
      "auth",
      "login",
      "github-copilot",
      "--token",
      "ghu_test",
      "--memora-home",
      memoraHome
    ]);

    const output = await captureConsole(() =>
      runCli(["node", "memora", "auth", "status", "--memora-home", memoraHome])
    );
    expect(output.some((line) => line.includes("github-copilot: logged in"))).toBe(true);
  });

  it("logs out provider", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-cli-auth-"));
    await runCli([
      "node",
      "memora",
      "auth",
      "login",
      "github-copilot",
      "--token",
      "ghu_test",
      "--memora-home",
      memoraHome
    ]);
    await runCli(["node", "memora", "auth", "logout", "github-copilot", "--memora-home", memoraHome]);

    const status = await getAuthStatus(memoraHome);
    expect(status["github-copilot"].loggedIn).toBe(false);
  });

  it("logs in with device code without client-id env vars", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-cli-auth-"));
    const openAIClientId = process.env.OPENAI_CLIENT_ID;
    const copilotClientId = process.env.GITHUB_COPILOT_CLIENT_ID;
    delete process.env.OPENAI_CLIENT_ID;
    delete process.env.GITHUB_COPILOT_CLIENT_ID;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          device_auth_id: "dev-auth-id",
          user_code: "user-code",
          interval: "0"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authorization_code: "auth-code",
          code_verifier: "code-verifier",
          code_challenge: "code-challenge"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "token-123", token_type: "Bearer" })
      });

    vi.stubGlobal("fetch", fetchMock);

    try {
      await runCli([
        "node",
        "memora",
        "auth",
        "login",
        "openai-codex",
        "--device-code",
        "--memora-home",
        memoraHome
      ]);

      const status = await getAuthStatus(memoraHome);
      expect(status["openai-codex"].loggedIn).toBe(true);
      expect(status["openai-codex"].authType).toBe("token");
    } finally {
      if (openAIClientId) {
        process.env.OPENAI_CLIENT_ID = openAIClientId;
      }
      if (copilotClientId) {
        process.env.GITHUB_COPILOT_CLIENT_ID = copilotClientId;
      }
      vi.unstubAllGlobals();
    }
  });
});
