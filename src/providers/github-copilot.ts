import type { ProviderAdapter, ProviderCompleteRequest, ProviderEmbedRequest } from "./base.js";

export class GitHubCopilotProvider implements ProviderAdapter {
  public readonly name = "github-copilot" as const;

  public async complete(request: ProviderCompleteRequest): Promise<string> {
    return `github-copilot stub completion: ${request.prompt}`;
  }

  public async embed(request: ProviderEmbedRequest): Promise<number[]> {
    return [request.text.length];
  }

  public async countTokens(text: string): Promise<number> {
    return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  }
}

export const createGitHubCopilotProvider = (): ProviderAdapter => {
  return new GitHubCopilotProvider();
};
