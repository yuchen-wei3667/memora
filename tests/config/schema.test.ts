import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, isSupportedProvider, parseMemoraConfig } from "../../src/config/schema.js";

describe("config schema", () => {
  it("parses default config", () => {
    const parsed = parseMemoraConfig(DEFAULT_CONFIG);

    expect(parsed.defaultProvider).toBe("openai-codex");
    expect(parsed.providers["github-copilot"].authMode).toBe("device-flow");
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
