import type { LlmRequest, LlmUsage } from "@ai-foundry/types";
import type { ProviderResponse } from "./types.js";

// Workers AI uses env.AI binding, not HTTP — so it does not implement the full ProviderAdapter.
// Instead we export standalone helpers used by execute.ts.

export interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function buildWorkersAiInput(request: LlmRequest): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = [];

  if (request.system) {
    messages.push({ role: "system", content: request.system });
  }

  for (const m of request.messages) {
    messages.push({ role: m.role, content: m.content });
  }

  return {
    messages,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
  };
}

export function parseWorkersAiResponse(raw: Record<string, unknown>): ProviderResponse {
  // Workers AI text-generation returns { response: string } or { result: { response: string } }
  const response = (raw["response"] as string | undefined)
    ?? (raw["result"] as Record<string, unknown> | undefined)?.["response"] as string | undefined
    ?? "";

  // Workers AI does not report token usage
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  return { content: response, usage };
}
