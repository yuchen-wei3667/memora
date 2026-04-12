export interface ProviderAdapter {
  complete(prompt: string): Promise<string>;
  embed(text: string): Promise<number[]>;
  countTokens(text: string): Promise<number>;
}
