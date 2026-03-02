import type { LlmRequest } from "@ai-foundry/types";
import type { ProviderAdapter, ProviderEndpoint, ProviderResponse } from "./types.js";

export const googleAdapter: ProviderAdapter = {
  buildBody(request: LlmRequest, _model: string): Record<string, unknown> {
    // Gemini generateContent API: contents[].parts[] format
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const m of request.messages) {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      },
    };

    if (request.system) {
      body["systemInstruction"] = {
        parts: [{ text: request.system }],
      };
    }

    return body;
  },

  getEndpoint(env: Record<string, unknown>, model: string): ProviderEndpoint {
    const gatewayUrl = env["CLOUDFLARE_AI_GATEWAY_URL"] as string;
    const apiKey = env["GOOGLE_AI_API_KEY"] as string;
    return {
      url: `${gatewayUrl}/google-ai-studio/v1beta/models/${model}:generateContent`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
    };
  },

  parseResponse(raw: Record<string, unknown>): ProviderResponse {
    const candidates = raw["candidates"] as Array<{
      content: { parts: Array<{ text: string }> };
    }> | undefined;
    const content = candidates?.[0]?.content.parts
      .map((p) => p.text)
      .join("") ?? "";

    const usageRaw = raw["usageMetadata"] as Record<string, number> | undefined;
    return {
      content,
      usage: {
        inputTokens: usageRaw?.["promptTokenCount"] ?? 0,
        outputTokens: usageRaw?.["candidatesTokenCount"] ?? 0,
        totalTokens: usageRaw?.["totalTokenCount"] ?? 0,
      },
    };
  },
};
