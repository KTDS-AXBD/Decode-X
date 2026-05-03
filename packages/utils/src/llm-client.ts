/**
 * LLM Router HTTP Client — OpenRouter via Cloudflare AI Gateway.
 *
 * TD-44 (2026-04-23): svc-llm-router Worker를 decommission하고,
 * 모든 pipeline 서비스가 OpenRouter chat-completions API(Gateway 경유)를 직접 호출하도록 전환.
 * 함수명/시그니처는 유지하여 consumer(svc-policy/skill/extraction/ontology) 호환성 보존.
 */

import { TIER_MODELS, type LlmTier, type LlmProvider } from "@ai-foundry/types";

export interface LlmClientEnv {
  /**
   * Cloudflare AI Gateway의 OpenRouter chat-completions 엔드포인트 (전체 URL).
   * 예: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openrouter/api/v1/chat/completions
   */
  CLOUDFLARE_AI_GATEWAY_URL: string;
  OPENROUTER_API_KEY: string;
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
  /**
   * Deprecated: OpenRouter는 단일 경로로 모델이 지정되므로 provider override는 무시된다.
   * 호환을 위해 optional 유지.
   */
  provider?: LlmProvider;
}

interface OpenRouterChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string | number };
}

/**
 * tier → OpenRouter 모델 slug 매핑. workers tier는 OpenRouter chat-completions에서 미지원.
 */
function resolveModel(tier: LlmTier): string {
  if (tier === "workers") {
    throw new Error(
      `LLM tier "workers" is no longer routed through OpenRouter. Use Workers AI binding directly if needed.`,
    );
  }
  const model = TIER_MODELS[tier];
  if (!model) {
    throw new Error(`Unknown LLM tier: ${tier}`);
  }
  return model;
}

/**
 * Call OpenRouter chat-completions via Cloudflare AI Gateway. Returns the content string.
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
 * Call OpenRouter chat-completions via Cloudflare AI Gateway. Returns content + model metadata.
 */
const LLM_MAX_RETRIES = 2;

export async function callLlmRouterWithMeta(
  env: LlmClientEnv,
  callerService: string,
  tier: LlmTier,
  prompt: string,
  options?: LlmCallOptions,
): Promise<LlmCallResult> {
  const model = resolveModel(tier);

  const messages: Array<{ role: string; content: string }> = [];
  if (options?.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options?.maxTokens ?? 2048,
    temperature: options?.temperature ?? 0.3,
  };
  if (options?.seed !== undefined) body["seed"] = options.seed;

  const fetchOpts: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://decode-x.ktds-axbd.workers.dev",
      "X-Title": `Decode-X/${callerService}`,
    },
    body: JSON.stringify(body),
  };

  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    const response = await fetch(env.CLOUDFLARE_AI_GATEWAY_URL, fetchOpts);

    // HTML guard: OpenRouter burst rate limit returns HTML error page instead of JSON
    const contentType = response.headers?.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      if (attempt < LLM_MAX_RETRIES) {
        await new Promise<void>((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      const preview = (await response.text()).slice(0, 200);
      throw new Error(
        `LLM returned HTML response after ${LLM_MAX_RETRIES + 1} attempts (burst rate limit?): ${preview}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM Router (OpenRouter) error ${response.status}: ${text}`);
    }

    const json = (await response.json()) as OpenRouterChatResponse;
    if (json.error) {
      throw new Error(`LLM Router returned failure: ${json.error.message ?? "unknown"}`);
    }

    const content = json.choices?.[0]?.message?.content ?? "";
    const returnedModel = json.model ?? model;

    return {
      content,
      provider: "openrouter",
      model: returnedModel,
    };
  }

  // TypeScript exhaustiveness — loop always returns or throws
  throw new Error("LLM call failed: unexpected loop exit");
}
