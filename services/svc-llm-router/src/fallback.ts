import type { LlmProvider } from "@ai-foundry/types";

/** Maximum number of providers to try (primary + fallbacks). */
export const MAX_ATTEMPTS = 3;

/** Fallback order per primary provider. workers-ai is terminal (no further fallback). */
const FALLBACK_CHAINS: Record<LlmProvider, LlmProvider[]> = {
  anthropic: ["openai", "google", "workers-ai"],
  openai: ["anthropic", "google", "workers-ai"],
  google: ["anthropic", "openai", "workers-ai"],
  "workers-ai": [], // terminal — no fallback
};

/**
 * Return the ordered fallback chain for a given primary provider.
 * The primary provider itself is NOT included in the returned array.
 */
export function getFallbackChain(primary: LlmProvider): LlmProvider[] {
  return FALLBACK_CHAINS[primary];
}
