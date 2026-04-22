import { z } from "zod";

export const LlmTierSchema = z.enum([
  "opus",     // Tier 1: complexity > 0.7 — Stage 3 policy inference (svc-policy only)
  "sonnet",   // Tier 2: complexity 0.4–0.7 — Stages 2, 4, 5
  "haiku",    // Tier 2: complexity < 0.4 — lightweight tasks
  "workers",  // Tier 3: embeddings, classification, similarity — NOT routed through OpenRouter
]);

export type LlmTier = z.infer<typeof LlmTierSchema>;

export const LlmProviderSchema = z.enum([
  "anthropic",
  "openai",
  "google",
  "workers-ai",
  "openrouter",
]);

export type LlmProvider = z.infer<typeof LlmProviderSchema>;

// OpenRouter model slugs per tier (TD-44, 2026-04-23: svc-llm-router → OpenRouter via CF Gateway)
// tier "workers"는 OpenRouter chat-completions에서 미지원 → Workers AI 바인딩 직접 사용 권장
export const TIER_MODELS: Record<Exclude<LlmTier, "workers">, string> = {
  opus: "anthropic/claude-opus-4-5",
  sonnet: "anthropic/claude-sonnet-4-5",
  haiku: "anthropic/claude-haiku-4-5",
};

// Per-provider tier→model mapping (legacy; provider 분기 제거됨. 호환을 위해 유지)
export const PROVIDER_TIER_MODELS: Record<LlmProvider, Partial<Record<LlmTier, string>>> = {
  openrouter: {
    opus: "anthropic/claude-opus-4-5",
    sonnet: "anthropic/claude-sonnet-4-5",
    haiku: "anthropic/claude-haiku-4-5",
  },
  anthropic: {
    opus: "claude-opus-4-7",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
    workers: "@cf/baai/bge-m3",
  },
  openai: {
    opus: "gpt-4.1",
    sonnet: "gpt-4.1-mini",
    haiku: "gpt-4.1-nano",
  },
  google: {
    opus: "gemini-2.5-pro",
    sonnet: "gemini-2.5-flash",
    haiku: "gemini-2.5-flash-lite",
  },
  "workers-ai": {
    sonnet: "@cf/zai-org/glm-4.7-flash",
    haiku: "@cf/meta/llama-3.1-8b-instruct",
  },
};

export const LlmMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type LlmMessage = z.infer<typeof LlmMessageSchema>;

export const LlmRequestSchema = z.object({
  tier: LlmTierSchema,
  messages: z.array(LlmMessageSchema).min(1),
  system: z.string().optional(),
  maxTokens: z.number().int().min(1).max(8192).default(2048),
  temperature: z.number().min(0).max(1).default(0.3),
  stream: z.boolean().default(false),
  callerService: z.string(),    // which SVC is calling (e.g. "svc-policy")
  complexityScore: z.number().min(0).max(1).optional(),
  provider: LlmProviderSchema.optional(), // explicit provider override; omit for default routing
  metadata: z.record(z.string()).optional(),
});

export type LlmRequest = z.infer<typeof LlmRequestSchema>;

export const LlmUsageSchema = z.object({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  totalTokens: z.number().int(),
});

export type LlmUsage = z.infer<typeof LlmUsageSchema>;

export const LlmResponseSchema = z.object({
  id: z.string(),
  tier: LlmTierSchema,
  model: z.string(),
  content: z.string(),
  usage: LlmUsageSchema,
  durationMs: z.number(),
  cached: z.boolean().default(false),
  provider: LlmProviderSchema.optional(),
  fallbackFrom: LlmProviderSchema.optional(),
});

export type LlmResponse = z.infer<typeof LlmResponseSchema>;

// Cost log entry written to D1 llm_cost_log
export type LlmCostLogEntry = {
  requestId: string;
  callerService: string;
  tier: LlmTier;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  cached: boolean;
  provider: LlmProvider;
  fallbackFrom: LlmProvider | null;
  createdAt: string; // ISO-8601
};
