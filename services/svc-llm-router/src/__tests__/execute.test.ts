import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveProvider, resolveModel, executeWithFallback } from "../execute.js";
import type { LlmRequest } from "@ai-foundry/types";
import type { Logger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

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

function mockEnv(overrides?: Partial<Env>): Env {
  return {
    DB_LLM: {} as D1Database,
    KV_PROMPTS: {} as KVNamespace,
    AI: { run: vi.fn() } as unknown as Ai,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-llm-router",
    INTERNAL_API_SECRET: "test-secret",
    ANTHROPIC_API_KEY: "sk-ant-test",
    CLOUDFLARE_AI_GATEWAY_URL: "https://gw.example.com",
    OPENAI_API_KEY: "sk-openai-test",
    GOOGLE_AI_API_KEY: "AIza-test",
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<LlmRequest>): LlmRequest {
  return {
    tier: "sonnet",
    callerService: "svc-extraction",
    messages: [{ role: "user", content: "Test" }],
    maxTokens: 1024,
    temperature: 0.3,
    stream: false,
    ...overrides,
  };
}

function makeAnthropicResponse() {
  return {
    content: [{ type: "text", text: "Anthropic response" }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function makeOpenAiResponse() {
  return {
    choices: [{ message: { content: "OpenAI response" } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

// ── resolveProvider ─────────────────────────────────────────────

describe("resolveProvider", () => {
  it("returns explicit provider when specified", () => {
    expect(resolveProvider({ tier: "sonnet", provider: "openai" })).toBe("openai");
  });

  it("returns anthropic by default for non-workers tiers", () => {
    expect(resolveProvider({ tier: "opus" })).toBe("anthropic");
    expect(resolveProvider({ tier: "sonnet" })).toBe("anthropic");
    expect(resolveProvider({ tier: "haiku" })).toBe("anthropic");
  });

  it("returns workers-ai for workers tier", () => {
    expect(resolveProvider({ tier: "workers" })).toBe("workers-ai");
  });
});

// ── resolveModel ────────────────────────────────────────────────

describe("resolveModel", () => {
  it("returns exact model for anthropic sonnet", () => {
    expect(resolveModel("anthropic", "sonnet")).toBe("claude-sonnet-4-6");
  });

  it("returns exact model for openai opus (maps to gpt-4.1)", () => {
    expect(resolveModel("openai", "opus")).toBe("gpt-4.1");
  });

  it("falls back to sonnet for workers-ai opus (no opus model)", () => {
    expect(resolveModel("workers-ai", "opus")).toBe("@cf/zai-org/glm-4.7-flash");
  });

  it("returns haiku model for workers-ai haiku", () => {
    expect(resolveModel("workers-ai", "haiku")).toBe("@cf/meta/llama-3.1-8b-instruct");
  });

  it("returns exact model for google haiku", () => {
    expect(resolveModel("google", "haiku")).toBe("gemini-2.5-flash-lite");
  });
});

// ── executeWithFallback ─────────────────────────────────────────

describe("executeWithFallback", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("succeeds with primary provider (anthropic)", async () => {
    const env = mockEnv();
    const logger = mockLogger();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await executeWithFallback(env, makeRequest(), "sonnet", "anthropic", "req-1", logger);

    expect(result.provider).toBe("anthropic");
    expect(result.content).toBe("Anthropic response");
    expect(result.fallbackFrom).toBeNull();
  });

  it("falls back to openai when anthropic fails", async () => {
    const env = mockEnv();
    const logger = mockLogger();
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if ((url as string).includes("anthropic")) {
        return Promise.resolve(new Response("Credit exhausted", { status: 402 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(makeOpenAiResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const result = await executeWithFallback(env, makeRequest(), "sonnet", "anthropic", "req-2", logger);

    expect(result.provider).toBe("openai");
    expect(result.content).toBe("OpenAI response");
    expect(result.fallbackFrom).toBe("anthropic");
    expect(callCount).toBe(2);
  });

  it("uses workers-ai via env.AI binding", async () => {
    const aiRun = vi.fn().mockResolvedValue({ response: "Llama response" });
    const env = mockEnv({ AI: { run: aiRun } as unknown as Ai });
    const logger = mockLogger();

    const result = await executeWithFallback(env, makeRequest({ tier: "haiku" }), "haiku", "workers-ai", "req-3", logger);

    expect(result.provider).toBe("workers-ai");
    expect(result.content).toBe("Llama response");
    expect(aiRun).toHaveBeenCalledWith(
      "@cf/meta/llama-3.1-8b-instruct",
      expect.objectContaining({ messages: expect.any(Array) }),
    );
  });

  it("throws after all attempts exhausted", async () => {
    const aiRun = vi.fn().mockRejectedValue(new Error("Workers AI down"));
    const env = mockEnv({ AI: { run: aiRun } as unknown as Ai });
    const logger = mockLogger();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("Error", { status: 500 }));

    await expect(
      executeWithFallback(env, makeRequest(), "sonnet", "anthropic", "req-4", logger),
    ).rejects.toThrow();
  });

  it("workers-ai has no fallback chain", async () => {
    const aiRun = vi.fn().mockRejectedValue(new Error("Workers AI error"));
    const env = mockEnv({ AI: { run: aiRun } as unknown as Ai });
    const logger = mockLogger();

    await expect(
      executeWithFallback(env, makeRequest({ tier: "haiku" }), "haiku", "workers-ai", "req-5", logger),
    ).rejects.toThrow("Workers AI error");

    // Only 1 attempt (workers-ai has empty fallback chain)
    expect(aiRun).toHaveBeenCalledOnce();
  });

  it("returns cached=true when AI Gateway returns cache HIT", async () => {
    const env = mockEnv();
    const logger = mockLogger();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "cf-aig-cache-status": "HIT",
        },
      }),
    );

    const result = await executeWithFallback(env, makeRequest(), "sonnet", "anthropic", "req-6", logger);
    expect(result.cached).toBe(true);
  });
});
