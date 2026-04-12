import type { ProviderAdapter, ProviderCompleteRequest, ProviderEmbedRequest } from "./base.js";

export class OpenAICodexProvider implements ProviderAdapter {
  public readonly name = "openai-codex" as const;

  public async complete(request: ProviderCompleteRequest): Promise<string> {
    return `openai-codex stub completion: ${request.prompt}`;
  }

  public async embed(request: ProviderEmbedRequest): Promise<number[]> {
    return [request.text.length];
  }

  public async countTokens(text: string): Promise<number> {
    return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  }
}

export const createOpenAICodexProvider = (): ProviderAdapter => {
  return new OpenAICodexProvider();
};
