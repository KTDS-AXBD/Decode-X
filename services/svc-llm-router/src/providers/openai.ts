import type { LlmRequest } from "@ai-foundry/types";
import type { ProviderAdapter, ProviderEndpoint, ProviderResponse } from "./types.js";

export const openaiAdapter: ProviderAdapter = {
  buildBody(request: LlmRequest, model: string): Record<string, unknown> {
    // OpenAI Chat Completions API: system message goes as first element in messages array
    const messages: Array<{ role: string; content: string }> = [];

    if (request.system) {
      messages.push({ role: "system", content: request.system });
    }

    for (const m of request.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    return {
      model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      messages,
    };
  },

  getEndpoint(env: Record<string, unknown>, _model: string): ProviderEndpoint {
    const gatewayUrl = env["CLOUDFLARE_AI_GATEWAY_URL"] as string;
    const apiKey = env["OPENAI_API_KEY"] as string;
    return {
      url: `${gatewayUrl}/openai/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    };
  },

  parseResponse(raw: Record<string, unknown>): ProviderResponse {
    const choices = raw["choices"] as Array<{ message: { content: string } }> | undefined;
    const content = choices?.[0]?.message.content ?? "";

    const usageRaw = raw["usage"] as Record<string, number> | undefined;
    return {
      content,
      usage: {
        inputTokens: usageRaw?.["prompt_tokens"] ?? 0,
        outputTokens: usageRaw?.["completion_tokens"] ?? 0,
        totalTokens: usageRaw?.["total_tokens"] ?? 0,
      },
    };
  },
};
