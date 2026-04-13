import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  isSupportedProvider,
  parseMemoraConfig
} from "../../src/config/schema.js";

describe("config schema", () => {
  it("parses default config", () => {
    const parsed = parseMemoraConfig(DEFAULT_CONFIG);

    expect(parsed.defaultProvider).toBe("openai-codex");
    expect(parsed.providers["github-copilot"].authMode).toBe("device-flow");
    expect(parsed.providers["openai-codex"].models).toEqual(["gpt-5-codex"]);
  });

  it("accepts provider model lists", () => {
    const parsed = parseMemoraConfig({
      ...DEFAULT_CONFIG,
      providers: {
        ...DEFAULT_CONFIG.providers,
        "openai-codex": {
          ...DEFAULT_CONFIG.providers["openai-codex"],
          model: "gpt-5-codex",
          models: ["gpt-5-codex", "gpt-5-mini"]
        }
      }
    });

    expect(parsed.providers["openai-codex"].models).toEqual([
      "gpt-5-codex",
      "gpt-5-mini"
    ]);
  });

  it("rejects default model outside configured model list", () => {
    const invalid = {
      ...DEFAULT_CONFIG,
      providers: {
        ...DEFAULT_CONFIG.providers,
        "openai-codex": {
          ...DEFAULT_CONFIG.providers["openai-codex"],
          model: "gpt-5-codex",
          models: ["gpt-5-mini"]
        }
      }
    };

    expect(() => parseMemoraConfig(invalid)).toThrow(
      "Default model must be included in models."
    );
  });

  it("supports legacy provider config without models list", () => {
    const parsed = parseMemoraConfig({
      ...DEFAULT_CONFIG,
      providers: {
        ...DEFAULT_CONFIG.providers,
        "openai-codex": {
          apiKeyEnv: "OPENAI_API_KEY",
          model: "gpt-5-codex",
          deviceCode: DEFAULT_CONFIG.providers["openai-codex"].deviceCode
        }
      }
    });

    expect(parsed.providers["openai-codex"].models).toBeUndefined();
  });

  it("rejects unsupported provider in defaultProvider", () => {
    const invalid = {
      ...DEFAULT_CONFIG,
      defaultProvider: "unsupported-provider"
    };

    expect(() => parseMemoraConfig(invalid)).toThrow();
  });

  it("rejects extra provider keys", () => {
    const invalid = {
      ...DEFAULT_CONFIG,
      providers: {
        ...DEFAULT_CONFIG.providers,
        "other-provider": {
          model: "x"
        }
      }
    };

    expect(() => parseMemoraConfig(invalid)).toThrow();
  });

  it("supports only codex and copilot provider names", () => {
    expect(isSupportedProvider("openai-codex")).toBe(true);
    expect(isSupportedProvider("github-copilot")).toBe(true);
    expect(isSupportedProvider("anthropic")).toBe(false);
  });
});
