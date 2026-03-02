import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gatewayComplete, gatewayStream, parseAnthropicResponse } from "../gateway.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockEnv(overrides?: Partial<Env>): Env {
  return {
    DB_LLM: {} as D1Database,
    KV_PROMPTS: {} as KVNamespace,
    AI: {} as Ai,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-llm-router",
    INTERNAL_API_SECRET: "test-secret",
    ANTHROPIC_API_KEY: "sk-ant-test-key",
    CLOUDFLARE_AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw",
    OPENAI_API_KEY: "sk-openai-test",
    GOOGLE_AI_API_KEY: "AIza-test",
    ...overrides,
  };
}

function makeAnthropicResponseBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "msg_test123",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Hello, world!" }],
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  };
}

// ── gatewayComplete ─────────────────────────────────────────────

describe("gatewayComplete", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends POST to correct AI Gateway URL", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponseBody()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    await gatewayComplete(env, "claude-sonnet-4-6", { model: "claude-sonnet-4-6", messages: [] }, "req-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("includes correct headers (api-key, anthropic-version, request-id)", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponseBody()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    await gatewayComplete(env, "claude-sonnet-4-6", { model: "claude-sonnet-4-6" }, "req-abc");

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["cf-aig-request-id"]).toBe("req-abc");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends JSON stringified body", async () => {
    const env = mockEnv();
    const requestBody = { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Hi" }] };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponseBody()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    await gatewayComplete(env, "claude-sonnet-4-6", requestBody, "req-1");

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(callArgs[1]?.body).toBe(JSON.stringify(requestBody));
  });

  it("returns raw response, durationMs, and cached status", async () => {
    const env = mockEnv();
    const responseBody = makeAnthropicResponseBody();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const result = await gatewayComplete(env, "claude-sonnet-4-6", {}, "req-1");

    expect(result.raw).toEqual(responseBody);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.cached).toBe(false);
  });

  it("detects cache HIT from cf-aig-cache-status header", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponseBody()), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "cf-aig-cache-status": "HIT",
        },
      }),
    );
    globalThis.fetch = fetchSpy;

    const result = await gatewayComplete(env, "claude-sonnet-4-6", {}, "req-1");
    expect(result.cached).toBe(true);
  });

  it("detects cache MISS (no header) as not cached", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponseBody()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const result = await gatewayComplete(env, "claude-sonnet-4-6", {}, "req-1");
    expect(result.cached).toBe(false);
  });

  it("throws UpstreamError on non-ok response (400)", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("Bad Request: invalid model", { status: 400 }),
    );
    globalThis.fetch = fetchSpy;

    await expect(gatewayComplete(env, "bad-model", {}, "req-1")).rejects.toThrow(
      /Upstream error from anthropic/,
    );
  });

  it("throws UpstreamError on non-ok response (500)", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );
    globalThis.fetch = fetchSpy;

    await expect(gatewayComplete(env, "claude-sonnet-4-6", {}, "req-1")).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("truncates error text to 200 characters", async () => {
    const env = mockEnv();
    const longError = "x".repeat(300);
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(longError, { status: 422 }),
    );
    globalThis.fetch = fetchSpy;

    try {
      await gatewayComplete(env, "claude-sonnet-4-6", {}, "req-1");
      expect.unreachable("Should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      // Error message includes "Upstream error from anthropic: HTTP 422: " prefix + 200 chars
      expect(message).toContain("HTTP 422");
      // The sliced text should be 200 chars max
      expect(message.length).toBeLessThan(300);
    }
  });

  it("uses the CLOUDFLARE_AI_GATEWAY_URL from env", async () => {
    const env = mockEnv({ CLOUDFLARE_AI_GATEWAY_URL: "https://custom-gw.example.com" });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponseBody()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    await gatewayComplete(env, "claude-sonnet-4-6", {}, "req-1");

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(callArgs[0]).toBe("https://custom-gw.example.com/anthropic/v1/messages");
  });
});

// ── gatewayStream ───────────────────────────────────────────────

describe("gatewayStream", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends POST to AI Gateway URL for streaming", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}", { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );
    globalThis.fetch = fetchSpy;

    await gatewayStream(env, { model: "claude-sonnet-4-6", stream: true }, "req-stream-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("includes correct headers for streaming request", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    await gatewayStream(env, {}, "req-stream-2");

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["cf-aig-request-id"]).toBe("req-stream-2");
  });

  it("returns Response with SSE headers", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const result = await gatewayStream(env, {}, "req-stream-3");

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
    expect(result.headers.get("Content-Type")).toBe("text/event-stream");
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
    expect(result.headers.get("X-Request-Id")).toBe("req-stream-3");
  });

  it("throws UpstreamError on non-ok streaming response", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    globalThis.fetch = fetchSpy;

    await expect(gatewayStream(env, {}, "req-stream-4")).rejects.toThrow(
      /Upstream error from anthropic/,
    );
  });

  it("includes HTTP status code in error for failed stream", async () => {
    const env = mockEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("service unavailable", { status: 503 }),
    );
    globalThis.fetch = fetchSpy;

    await expect(gatewayStream(env, {}, "req-stream-5")).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it("passes through the upstream response body as stream", async () => {
    const env = mockEnv();
    const streamContent = "data: {\"type\":\"content_block_delta\"}\n\n";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(streamContent, { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const result = await gatewayStream(env, {}, "req-stream-6");
    const text = await result.text();
    expect(text).toBe(streamContent);
  });
});

// ── parseAnthropicResponse ──────────────────────────────────────

describe("parseAnthropicResponse", () => {
  it("parses standard Anthropic response into LlmResponse", () => {
    const raw = makeAnthropicResponseBody();
    const result = parseAnthropicResponse(raw, "req-1", "sonnet", "claude-sonnet-4-6", 150, false);

    expect(result.id).toBe("req-1");
    expect(result.tier).toBe("sonnet");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.content).toBe("Hello, world!");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(20);
    expect(result.usage.totalTokens).toBe(30);
    expect(result.durationMs).toBe(150);
    expect(result.cached).toBe(false);
  });

  it("joins multiple text content blocks", () => {
    const raw = makeAnthropicResponseBody({
      content: [
        { type: "text", text: "Part 1. " },
        { type: "text", text: "Part 2." },
      ],
    });
    const result = parseAnthropicResponse(raw, "req-2", "opus", "claude-opus-4-6", 200, false);
    expect(result.content).toBe("Part 1. Part 2.");
  });

  it("filters out non-text content blocks", () => {
    const raw = makeAnthropicResponseBody({
      content: [
        { type: "text", text: "Text block" },
        { type: "tool_use", id: "tool-1", name: "get_weather" },
      ],
    });
    const result = parseAnthropicResponse(raw, "req-3", "sonnet", "claude-sonnet-4-6", 100, false);
    expect(result.content).toBe("Text block");
  });

  it("returns empty string when content is missing", () => {
    const raw = makeAnthropicResponseBody({ content: undefined });
    const result = parseAnthropicResponse(raw, "req-4", "haiku", "claude-haiku-4-5-20251001", 50, false);
    expect(result.content).toBe("");
  });

  it("returns empty string when content array is empty", () => {
    const raw = makeAnthropicResponseBody({ content: [] });
    const result = parseAnthropicResponse(raw, "req-5", "haiku", "claude-haiku-4-5-20251001", 50, false);
    expect(result.content).toBe("");
  });

  it("handles missing usage gracefully with zero tokens", () => {
    const raw = makeAnthropicResponseBody({ usage: undefined });
    const result = parseAnthropicResponse(raw, "req-6", "sonnet", "claude-sonnet-4-6", 100, false);
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.usage.totalTokens).toBe(0);
  });

  it("correctly marks cached responses", () => {
    const raw = makeAnthropicResponseBody();
    const result = parseAnthropicResponse(raw, "req-7", "sonnet", "claude-sonnet-4-6", 5, true);
    expect(result.cached).toBe(true);
  });

  it("passes through durationMs accurately", () => {
    const raw = makeAnthropicResponseBody();
    const result = parseAnthropicResponse(raw, "req-8", "opus", "claude-opus-4-6", 3456, false);
    expect(result.durationMs).toBe(3456);
  });

  it("calculates totalTokens as sum of input and output", () => {
    const raw = makeAnthropicResponseBody({
      usage: { input_tokens: 500, output_tokens: 1500 },
    });
    const result = parseAnthropicResponse(raw, "req-9", "sonnet", "claude-sonnet-4-6", 100, false);
    expect(result.usage.totalTokens).toBe(2000);
  });

  it("preserves requestId as response id", () => {
    const raw = makeAnthropicResponseBody();
    const result = parseAnthropicResponse(raw, "my-custom-id-123", "haiku", "claude-haiku-4-5-20251001", 50, false);
    expect(result.id).toBe("my-custom-id-123");
  });

  it("handles all tier types correctly", () => {
    const tiers: Array<import("@ai-foundry/types").LlmTier> = ["opus", "sonnet", "haiku", "workers"];
    for (const tier of tiers) {
      const raw = makeAnthropicResponseBody();
      const result = parseAnthropicResponse(raw, `req-${tier}`, tier, `model-${tier}`, 100, false);
      expect(result.tier).toBe(tier);
      expect(result.model).toBe(`model-${tier}`);
    }
  });

  it("returns content only from text blocks when mixed with other types", () => {
    const raw = makeAnthropicResponseBody({
      content: [
        { type: "image", source: "base64data" },
        { type: "text", text: "Only this" },
        { type: "tool_result", content: "ignored" },
      ],
    });
    const result = parseAnthropicResponse(raw, "req-mix", "sonnet", "claude-sonnet-4-6", 100, false);
    expect(result.content).toBe("Only this");
  });
});
