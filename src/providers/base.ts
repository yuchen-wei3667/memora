import type { ProviderName } from "../config/schema.js";

export interface ProviderCompleteRequest {
  prompt: string;
  system?: string;
  temperature?: number;
}

export interface ProviderEmbedRequest {
  text: string;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  complete(request: ProviderCompleteRequest): Promise<string>;
  embed(request: ProviderEmbedRequest): Promise<number[]>;
  countTokens(text: string): Promise<number>;
}
