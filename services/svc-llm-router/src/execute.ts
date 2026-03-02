import type { LlmProvider, LlmRequest, LlmTier, LlmUsage } from "@ai-foundry/types";
import { PROVIDER_TIER_MODELS } from "@ai-foundry/types";
import { UpstreamError } from "@ai-foundry/utils";
import type { Logger } from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { getProviderAdapter } from "./providers/index.js";
import { buildWorkersAiInput, parseWorkersAiResponse } from "./providers/workers-ai.js";
import { getFallbackChain, MAX_ATTEMPTS } from "./fallback.js";

export interface ExecuteResult {
  content: string;
  usage: LlmUsage;
  provider: LlmProvider;
  model: string;
  durationMs: number;
  cached: boolean;
  fallbackFrom: LlmProvider | null;
}

/**
 * Determine which provider to use.
 * - Explicit `provider` field in request takes priority.
 * - `workers` tier defaults to `workers-ai`, all else to `anthropic`.
 */
export function resolveProvider(request: Pick<LlmRequest, "tier" | "provider">): LlmProvider {
  if (request.provider) return request.provider;
  return request.tier === "workers" ? "workers-ai" : "anthropic";
}

/**
 * Resolve the model ID for a given provider and tier.
 * Falls back to lower tiers if the exact tier is unavailable for the provider.
 */
export function resolveModel(provider: LlmProvider, tier: LlmTier): string {
  const tierMap = PROVIDER_TIER_MODELS[provider];
  const exact = tierMap[tier];
  if (exact) return exact;

  // Tier fallback order: opus → sonnet → haiku
  const fallbackOrder: LlmTier[] = ["sonnet", "haiku"];
  for (const fallbackTier of fallbackOrder) {
    const model = tierMap[fallbackTier];
    if (model) return model;
  }

  // Should never happen if PROVIDER_TIER_MODELS is well-defined
  throw new Error(`No model available for provider=${provider} tier=${tier}`);
}

/**
 * Call a single provider (HTTP-based). Workers AI is handled separately.
 */
async function callHttpProvider(
  env: Env,
  request: LlmRequest,
  provider: LlmProvider,
  model: string,
  requestId: string,
): Promise<{ content: string; usage: LlmUsage; durationMs: number; cached: boolean }> {
  const adapter = getProviderAdapter(provider);
  if (!adapter) {
    throw new Error(`No HTTP adapter for provider=${provider}`);
  }

  const body = adapter.buildBody(request, model);
  const endpoint = adapter.getEndpoint(env as unknown as Record<string, unknown>, model);

  const startMs = Date.now();
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      ...endpoint.headers,
      "cf-aig-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
  const durationMs = Date.now() - startMs;

  if (!response.ok) {
    const text = await response.text();
    throw new UpstreamError(provider, `HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const raw = await response.json() as Record<string, unknown>;
  const cached = response.headers.get("cf-aig-cache-status") === "HIT";
  const parsed = adapter.parseResponse(raw);

  return { ...parsed, durationMs, cached };
}

/**
 * Call Workers AI via env.AI binding.
 */
async function callWorkersAi(
  env: Env,
  request: LlmRequest,
  model: string,
): Promise<{ content: string; usage: LlmUsage; durationMs: number; cached: boolean }> {
  const input = buildWorkersAiInput(request);
  const startMs = Date.now();
  const raw = await env.AI.run(model as Parameters<typeof env.AI.run>[0], input) as Record<string, unknown>;
  const durationMs = Date.now() - startMs;
  const parsed = parseWorkersAiResponse(raw);

  return { ...parsed, durationMs, cached: false };
}

/**
 * Execute an LLM call with automatic fallback across providers.
 */
export async function executeWithFallback(
  env: Env,
  request: LlmRequest,
  tier: LlmTier,
  primaryProvider: LlmProvider,
  requestId: string,
  logger: Logger,
): Promise<ExecuteResult> {
  const chain: LlmProvider[] = [primaryProvider, ...getFallbackChain(primaryProvider)];
  const attempts = Math.min(chain.length, MAX_ATTEMPTS);

  let lastError: unknown;
  let fallbackFrom: LlmProvider | null = null;

  for (let i = 0; i < attempts; i++) {
    const provider = chain[i]!;
    const model = resolveModel(provider, tier);

    if (i > 0) {
      fallbackFrom = chain[0]!;
      logger.warn("Falling back to next provider", {
        from: chain[i - 1],
        to: provider,
        model,
        attempt: i + 1,
      });
    }

    try {
      const result = provider === "workers-ai"
        ? await callWorkersAi(env, request, model)
        : await callHttpProvider(env, request, provider, model, requestId);

      return {
        ...result,
        provider,
        model,
        fallbackFrom,
      };
    } catch (e) {
      lastError = e;
      logger.error("Provider call failed", {
        provider,
        model,
        attempt: i + 1,
        error: String(e),
      });
    }
  }

  // All attempts exhausted
  throw lastError;
}
