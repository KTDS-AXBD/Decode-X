/**
 * LLM Router caller — svc-llm-router /complete via service binding.
 * Uses Sonnet tier for Stage 5 skill description generation.
 */

import type { LlmResponse, ApiResponse } from "@ai-foundry/types";

export async function callSonnetLlm(
  system: string,
  userContent: string,
  llmRouter: Fetcher,
  internalSecret: string,
): Promise<string> {
  const body = {
    tier: "sonnet",
    messages: [{ role: "user", content: userContent }],
    system,
    callerService: "svc-skill",
    maxTokens: 2048,
    temperature: 0.3,
  };

  const response = await llmRouter.fetch(
    "https://svc-llm-router.internal/complete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM Router error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as ApiResponse<LlmResponse>;
  if (!json.success) {
    throw new Error(`LLM Router returned failure: ${json.error.message}`);
  }

  return json.data.content;
}
