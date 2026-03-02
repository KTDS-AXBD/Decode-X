import type { LlmProvider } from "@ai-foundry/types";
import type { ProviderAdapter } from "./types.js";
import { anthropicAdapter } from "./anthropic.js";
import { openaiAdapter } from "./openai.js";
import { googleAdapter } from "./google.js";

// HTTP-based provider adapters (workers-ai uses env.AI binding, handled separately)
const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

export function getProviderAdapter(provider: LlmProvider): ProviderAdapter | undefined {
  return PROVIDER_ADAPTERS[provider];
}

export type { ProviderAdapter, ProviderEndpoint, ProviderResponse } from "./types.js";
