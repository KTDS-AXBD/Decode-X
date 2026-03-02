import type { LlmRequest } from "@ai-foundry/types";
import type { ProviderAdapter, ProviderEndpoint, ProviderResponse } from "./types.js";

export const anthropicAdapter: ProviderAdapter = {
  buildBody(request: LlmRequest, model: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      messages: request.messages.map((m) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
      })),
    };

    if (request.system) {
      body["system"] = request.system;
    }

    return body;
  },

  getEndpoint(env: Record<string, unknown>, _model: string): ProviderEndpoint {
    const gatewayUrl = env["CLOUDFLARE_AI_GATEWAY_URL"] as string;
    const apiKey = env["ANTHROPIC_API_KEY"] as string;
    return {
      url: `${gatewayUrl}/anthropic/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    };
  },

  parseResponse(raw: Record<string, unknown>): ProviderResponse {
    const content = (raw["content"] as Array<{ type: string; text: string }>)
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("") ?? "";

    const usageRaw = raw["usage"] as Record<string, number> | undefined;
    return {
      content,
      usage: {
        inputTokens: usageRaw?.["input_tokens"] ?? 0,
        outputTokens: usageRaw?.["output_tokens"] ?? 0,
        totalTokens: (usageRaw?.["input_tokens"] ?? 0) + (usageRaw?.["output_tokens"] ?? 0),
      },
    };
  },
};
