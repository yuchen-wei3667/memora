import { describe, expect, it } from "vitest";

import { assertSupportedProvider, createProvider } from "../../src/providers/registry.js";

describe("provider registry", () => {
  it("creates supported providers", () => {
    const codex = createProvider("openai-codex");
    const copilot = createProvider("github-copilot");

    expect(codex.name).toBe("openai-codex");
    expect(copilot.name).toBe("github-copilot");
  });

  it("rejects unsupported provider", () => {
    expect(() => assertSupportedProvider("anthropic")).toThrow(
      "Supported providers: openai-codex, github-copilot"
    );
  });

  it("supports complete embed and countTokens contract", async () => {
    const provider = createProvider("openai-codex");

    const completion = await provider.complete({ prompt: "hello" });
    const embedding = await provider.embed({ text: "abc" });
    const tokens = await provider.countTokens("a b c");

    expect(completion).toContain("hello");
    expect(embedding.length).toBeGreaterThan(0);
    expect(tokens).toBe(3);
  });
});
