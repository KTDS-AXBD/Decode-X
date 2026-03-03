import { describe, it, expect, vi } from "vitest";
import { resolveTier, buildAnthropicBody } from "../router.js";
import type { LlmRequest } from "@ai-foundry/types";
import { TIER_MODELS } from "@ai-foundry/types";
import type { Logger } from "@ai-foundry/utils";

// ── Helpers ──────────────────────────────────────────────────────

function mockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeRequest(overrides: Partial<Pick<LlmRequest, "tier" | "callerService" | "complexityScore" | "provider">> = {}): Pick<LlmRequest, "tier" | "callerService" | "complexityScore" | "provider"> {
  return {
    tier: "sonnet",
    callerService: "svc-extraction",
    ...overrides,
  };
}

function makeFullRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    tier: "sonnet",
    callerService: "svc-extraction",
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 2048,
    temperature: 0.3,
    stream: false,
    ...overrides,
  };
}

// ── resolveTier ─────────────────────────────────────────────────

describe("resolveTier", () => {
  it("returns opus tier and model for svc-policy calling opus", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "opus", callerService: "svc-policy" }), logger);
    expect(result.tier).toBe("opus");
    expect(result.model).toBe(TIER_MODELS["opus"]);
    expect(result.downgraded).toBe(false);
  });

  it("downgrades opus to sonnet when caller is not svc-policy", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "opus", callerService: "svc-extraction" }), logger);
    expect(result.tier).toBe("sonnet");
    expect(result.model).toBe(TIER_MODELS["sonnet"]);
    expect(result.downgraded).toBe(true);
  });

  it("logs warning when opus call is downgraded", () => {
    const logger = mockLogger();
    resolveTier(makeRequest({ tier: "opus", callerService: "svc-skill" }), logger);
    expect(logger.warn).toHaveBeenCalledWith(
      "Unauthorized opus call downgraded to sonnet",
      expect.objectContaining({
        callerService: "svc-skill",
        requestedTier: "opus",
      }),
    );
  });

  it("returns sonnet tier and model for explicit sonnet request", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "sonnet" }), logger);
    expect(result.tier).toBe("sonnet");
    expect(result.model).toBe(TIER_MODELS["sonnet"]);
    expect(result.downgraded).toBe(false);
  });

  it("returns haiku tier and model for explicit haiku request", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "haiku" }), logger);
    expect(result.tier).toBe("haiku");
    expect(result.model).toBe(TIER_MODELS["haiku"]);
    expect(result.downgraded).toBe(false);
  });

  it("returns workers tier and model for explicit workers request", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "workers" }), logger);
    expect(result.tier).toBe("workers");
    expect(result.model).toBe(TIER_MODELS["workers"]);
    expect(result.downgraded).toBe(false);
  });

  // ── Auto-select by complexity score ────────────────────────────

  it("auto-selects opus for svc-policy when complexityScore >= 0.7", () => {
    const logger = mockLogger();
    const result = resolveTier(
      makeRequest({ tier: "sonnet", callerService: "svc-policy", complexityScore: 0.85 }),
      logger,
    );
    expect(result.tier).toBe("opus");
    expect(result.model).toBe(TIER_MODELS["opus"]);
  });

  it("auto-selects sonnet for non-svc-policy when complexityScore >= 0.7", () => {
    const logger = mockLogger();
    const result = resolveTier(
      makeRequest({ tier: "haiku", callerService: "svc-extraction", complexityScore: 0.75 }),
      logger,
    );
    expect(result.tier).toBe("sonnet");
    expect(result.model).toBe(TIER_MODELS["sonnet"]);
  });

  it("auto-selects sonnet when complexityScore is between 0.4 and 0.7", () => {
    const logger = mockLogger();
    const result = resolveTier(
      makeRequest({ tier: "haiku", callerService: "svc-extraction", complexityScore: 0.5 }),
      logger,
    );
    expect(result.tier).toBe("sonnet");
    expect(result.model).toBe(TIER_MODELS["sonnet"]);
  });

  it("auto-selects haiku when complexityScore < 0.4", () => {
    const logger = mockLogger();
    const result = resolveTier(
      makeRequest({ tier: "sonnet", callerService: "svc-extraction", complexityScore: 0.2 }),
      logger,
    );
    expect(result.tier).toBe("haiku");
    expect(result.model).toBe(TIER_MODELS["haiku"]);
  });

  it("auto-selects sonnet at complexity boundary 0.4", () => {
    const logger = mockLogger();
    const result = resolveTier(
      makeRequest({ tier: "haiku", callerService: "svc-extraction", complexityScore: 0.4 }),
      logger,
    );
    expect(result.tier).toBe("sonnet");
  });

  it("auto-selects opus at complexity boundary 0.7 for svc-policy", () => {
    const logger = mockLogger();
    const result = resolveTier(
      makeRequest({ tier: "haiku", callerService: "svc-policy", complexityScore: 0.7 }),
      logger,
    );
    expect(result.tier).toBe("opus");
  });

  it("does not auto-select by complexity when tier is opus (no override for opus)", () => {
    const logger = mockLogger();
    // opus tier is kept even if complexityScore is low, because complexity-based
    // auto-selection only applies to non-opus tiers
    const result = resolveTier(
      makeRequest({ tier: "opus", callerService: "svc-policy", complexityScore: 0.1 }),
      logger,
    );
    expect(result.tier).toBe("opus");
  });

  it("uses requested tier when no complexityScore is provided", () => {
    const logger = mockLogger();
    const result = resolveTier(
      makeRequest({ tier: "haiku", callerService: "svc-extraction" }),
      logger,
    );
    expect(result.tier).toBe("haiku");
    expect(result.model).toBe(TIER_MODELS["haiku"]);
  });

  it("downgraded opus does get overridden by high complexityScore for non-policy service", () => {
    const logger = mockLogger();
    // svc-extraction calls opus -> downgraded to sonnet -> then complexityScore 0.8 -> sonnet (not opus because not svc-policy)
    const result = resolveTier(
      makeRequest({ tier: "opus", callerService: "svc-extraction", complexityScore: 0.8 }),
      logger,
    );
    // After downgrade, tier is "sonnet". Then complexityScore 0.8 >= 0.7,
    // but callerService is not svc-policy, so stays sonnet.
    expect(result.tier).toBe("sonnet");
    expect(result.downgraded).toBe(true);
  });

  // ── provider resolution ────────────────────────────────────────

  it("defaults to anthropic provider for non-workers tier", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "sonnet" }), logger);
    expect(result.provider).toBe("anthropic");
  });

  it("defaults to workers-ai provider for workers tier", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "workers" }), logger);
    expect(result.provider).toBe("workers-ai");
  });

  it("uses explicit provider when specified", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "sonnet", provider: "openai" }), logger);
    expect(result.provider).toBe("openai");
  });

  it("uses explicit google provider", () => {
    const logger = mockLogger();
    const result = resolveTier(makeRequest({ tier: "haiku", provider: "google" }), logger);
    expect(result.provider).toBe("google");
  });
});

// ── buildAnthropicBody ──────────────────────────────────────────

describe("buildAnthropicBody", () => {
  it("builds basic body with model, messages, maxTokens, temperature", () => {
    const request = makeFullRequest();
    const body = buildAnthropicBody(request, "claude-sonnet-4-6");
    expect(body["model"]).toBe("claude-sonnet-4-6");
    expect(body["max_tokens"]).toBe(2048);
    expect(body["temperature"]).toBe(0.3);
    expect(body["messages"]).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts system role messages to user role", () => {
    const request = makeFullRequest({
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ],
    });
    const body = buildAnthropicBody(request, "claude-sonnet-4-6");
    const messages = body["messages"] as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("You are helpful");
    expect(messages[1]?.role).toBe("user");
  });

  it("includes system field when request has system", () => {
    const request = makeFullRequest({ system: "Be concise" });
    const body = buildAnthropicBody(request, "claude-sonnet-4-6");
    expect(body["system"]).toBe("Be concise");
  });

  it("does not include system field when request has no system", () => {
    const request = makeFullRequest();
    const body = buildAnthropicBody(request, "claude-sonnet-4-6");
    expect(body["system"]).toBeUndefined();
  });

  it("includes stream: true when request.stream is true", () => {
    const request = makeFullRequest({ stream: true });
    const body = buildAnthropicBody(request, "claude-sonnet-4-6");
    expect(body["stream"]).toBe(true);
  });

  it("does not include stream field when request.stream is false", () => {
    const request = makeFullRequest({ stream: false });
    const body = buildAnthropicBody(request, "claude-sonnet-4-6");
    expect(body["stream"]).toBeUndefined();
  });

  it("preserves assistant messages as-is", () => {
    const request = makeFullRequest({
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "More" },
      ],
    });
    const body = buildAnthropicBody(request, "claude-sonnet-4-6");
    const messages = body["messages"] as Array<{ role: string; content: string }>;
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toBe("Hi there");
  });

  it("uses the provided model parameter, not the request tier", () => {
    const request = makeFullRequest({ tier: "haiku" });
    const body = buildAnthropicBody(request, "custom-model-123");
    expect(body["model"]).toBe("custom-model-123");
  });
});
