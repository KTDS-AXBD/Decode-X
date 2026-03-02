import type { LlmRequest, LlmUsage } from "@ai-foundry/types";

export interface ProviderEndpoint {
  url: string;
  headers: Record<string, string>;
}

export interface ProviderResponse {
  content: string;
  usage: LlmUsage;
}

/**
 * Each LLM provider implements this adapter to normalize request/response formats.
 */
export interface ProviderAdapter {
  /** Build the provider-specific request body from the unified LlmRequest. */
  buildBody(request: LlmRequest, model: string): Record<string, unknown>;

  /** Return the endpoint URL and auth headers for this provider. */
  getEndpoint(env: Record<string, unknown>, model: string): ProviderEndpoint;

  /** Parse the provider-specific response into a unified format. */
  parseResponse(raw: Record<string, unknown>): ProviderResponse;
}
