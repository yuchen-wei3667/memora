import { isSupportedProvider, type ProviderName } from "../config/schema.js";
import type { ProviderAdapter } from "./base.js";
import { createGitHubCopilotProvider } from "./github-copilot.js";
import { createOpenAICodexProvider } from "./openai-codex.js";

export const createProvider = (name: ProviderName): ProviderAdapter => {
  switch (name) {
    case "openai-codex":
      return createOpenAICodexProvider();
    case "github-copilot":
      return createGitHubCopilotProvider();
    default: {
      const exhaustiveCheck: never = name;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
};

export const assertSupportedProvider = (name: string): ProviderName => {
  if (!isSupportedProvider(name)) {
    throw new Error(
      `Unsupported provider '${name}'. Supported providers: openai-codex, github-copilot`
    );
  }

  return name;
};
