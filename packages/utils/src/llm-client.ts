/**
 * LLM Router HTTP Client — replaces service binding calls to svc-llm-router.
 *
 * After MSA restructuring, svc-llm-router runs as an independent Worker.
 * Pipeline services call it over HTTP instead of Cloudflare service bindings.
 */

import type { LlmResponse, LlmTier, LlmProvider, ApiResponse } from "@ai-foundry/types";

export interface LlmClientEnv {
  LLM_ROUTER_URL: string;
  INTERNAL_API_SECRET: string;
}

export interface LlmCallResult {
  content: string;
  provider: string;
  model: string;
}

export interface LlmCallOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  seed?: number;
  provider?: LlmProvider;
}

/**
 * Call svc-llm-router /complete via HTTP. Returns the content string.
 */
export async function callLlmRouter(
  env: LlmClientEnv,
  callerService: string,
  tier: LlmTier,
  prompt: string,
  options?: LlmCallOptions,
): Promise<string> {
  const result = await callLlmRouterWithMeta(env, callerService, tier, prompt, options);
  return result.content;
}

/**
 * Call svc-llm-router /complete via HTTP. Returns content + provider/model metadata.
 */
export async function callLlmRouterWithMeta(
  env: LlmClientEnv,
  callerService: string,
  tier: LlmTier,
  prompt: string,
  options?: LlmCallOptions,
): Promise<LlmCallResult> {
  const body: Record<string, unknown> = {
    tier,
    messages: [{ role: "user", content: prompt }],
    callerService,
    maxTokens: options?.maxTokens ?? 2048,
  };
  if (options?.system) body["system"] = options.system;
  if (options?.temperature !== undefined) body["temperature"] = options.temperature;
  if (options?.seed !== undefined) body["seed"] = options.seed;
  if (options?.provider) body["provider"] = options.provider;

  const response = await fetch(`${env.LLM_ROUTER_URL}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM Router error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as ApiResponse<LlmResponse>;
  if (!json.success) {
    throw new Error(`LLM Router returned failure: ${json.error.message}`);
  }

  return {
    content: json.data.content,
    provider: json.data.provider ?? "unknown",
    model: json.data.model ?? "unknown",
  };
}
