import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleComplete } from "../routes/complete.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(overrides?: Partial<Env>): Env {
  return {
    DB_LLM: mockDb(),
    KV_PROMPTS: { get: vi.fn(), put: vi.fn() } as unknown as KVNamespace,
    AI: { run: vi.fn() } as unknown as Ai,
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

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function makeAnthropicResponse(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Test response" }],
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  };
}

function createJsonRequest(body: unknown): Request {
  return new Request("https://test.internal/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validLlmRequestBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    tier: "sonnet",
    callerService: "svc-extraction",
    messages: [{ role: "user", content: "Analyze this document" }],
    maxTokens: 1024,
    temperature: 0.3,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("handleComplete", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 400 for invalid JSON body", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });

    const res = await handleComplete(req, env, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: { message: string } };
    expect(data.error.message).toContain("Invalid JSON body");
  });

  it("returns 400 when required fields are missing", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest({ tier: "sonnet" }); // missing messages, callerService

    const res = await handleComplete(req, env, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: { message: string } };
    expect(data.error.message).toContain("Invalid request");
  });

  it("returns 400 when tier is invalid", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest(validLlmRequestBody({ tier: "invalid-tier" }));

    const res = await handleComplete(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages array is empty", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest(validLlmRequestBody({ messages: [] }));

    const res = await handleComplete(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when maxTokens exceeds maximum", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest(validLlmRequestBody({ maxTokens: 99999 }));

    const res = await handleComplete(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when temperature is out of range", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest(validLlmRequestBody({ temperature: 5.0 }));

    const res = await handleComplete(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 200 with LLM response on successful call", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleComplete(req, env, ctx);

    expect(res.status).toBe(200);
    const data = await res.json() as {
      success: boolean;
      data: { tier: string; model: string; content: string; usage: Record<string, number> };
    };
    expect(data.success).toBe(true);
    expect(data.data.tier).toBe("sonnet");
    expect(data.data.content).toBe("Test response");
    expect(data.data.usage).toBeDefined();
  });

  it("includes usage info (inputTokens, outputTokens, totalTokens) in response", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse({
        usage: { input_tokens: 100, output_tokens: 200 },
      })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleComplete(req, env, ctx);

    const data = await res.json() as {
      success: boolean;
      data: { usage: { inputTokens: number; outputTokens: number; totalTokens: number } };
    };
    expect(data.data.usage.inputTokens).toBe(100);
    expect(data.data.usage.outputTokens).toBe(200);
    expect(data.data.usage.totalTokens).toBe(300);
  });

  it("downgrades opus to sonnet for unauthorized callers", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({
      tier: "opus",
      callerService: "svc-extraction",
    }));
    const res = await handleComplete(req, env, ctx);

    expect(res.status).toBe(200);
    const data = await res.json() as { data: { tier: string } };
    expect(data.data.tier).toBe("sonnet");
  });

  it("allows opus for svc-policy caller", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({
      tier: "opus",
      callerService: "svc-policy",
    }));
    const res = await handleComplete(req, env, ctx);

    expect(res.status).toBe(200);
    const data = await res.json() as { data: { tier: string } };
    expect(data.data.tier).toBe("opus");
  });

  it("fires cost log to D1 via ctx.waitUntil", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    await handleComplete(req, env, ctx);

    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("writes cost log entry to D1 with correct fields", async () => {
    const db = mockDb();
    const env = mockEnv({ DB_LLM: db });
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse({
        usage: { input_tokens: 50, output_tokens: 100 },
      })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({ callerService: "svc-extraction" }));
    await handleComplete(req, env, ctx);

    // ctx.waitUntil was called with a promise — the D1 write
    expect(ctx.waitUntil).toHaveBeenCalled();

    // Wait for the D1 write to resolve
    const waitUntilCalls = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls;
    await waitUntilCalls[0]?.[0];

    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO llm_cost_log"),
    );
  });

  it("returns 502 when all upstream providers fail", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    // Each call needs a fresh Response (body can only be consumed once)
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("Provider is down", { status: 503 })),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleComplete(req, env, ctx);

    expect(res.status).toBe(502);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe("UPSTREAM_ERROR");
  });

  it("returns error when fetch throws a network error", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockRejectedValue(new Error("Network timeout"));
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleComplete(req, env, ctx);

    expect(res.status).toBe(500);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe("INTERNAL_ERROR");
  });

  it("uses default maxTokens and temperature when not specified", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest({
      tier: "haiku",
      callerService: "svc-extraction",
      messages: [{ role: "user", content: "Test" }],
    });
    const res = await handleComplete(req, env, ctx);

    expect(res.status).toBe(200);

    // Verify the fetch was called — the Zod defaults should fill in maxTokens and temperature
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(callArgs[1]?.body as string) as Record<string, unknown>;
    expect(sentBody["max_tokens"]).toBe(2048); // Zod default
    expect(sentBody["temperature"]).toBe(0.3); // Zod default
  });

  it("returns model and tier in successful response", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({ tier: "haiku" }));
    const res = await handleComplete(req, env, ctx);

    const data = await res.json() as { data: { tier: string; model: string } };
    expect(data.data.tier).toBe("haiku");
    expect(data.data.model).toBeDefined();
    expect(typeof data.data.model).toBe("string");
  });

  it("includes durationMs and cached in response", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeAnthropicResponse()), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "cf-aig-cache-status": "HIT",
        },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleComplete(req, env, ctx);

    const data = await res.json() as { data: { durationMs: number; cached: boolean } };
    expect(typeof data.data.durationMs).toBe("number");
    expect(data.data.cached).toBe(true);
  });

  it("returns a unique requestId in each response", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    // Must create a new Response each time — Response body can only be consumed once
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(makeAnthropicResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    globalThis.fetch = fetchSpy;

    const req1 = createJsonRequest(validLlmRequestBody());
    const res1 = await handleComplete(req1, env, ctx);
    const data1 = await res1.json() as { data: { id: string } };

    const req2 = createJsonRequest(validLlmRequestBody());
    const res2 = await handleComplete(req2, env, ctx);
    const data2 = await res2.json() as { data: { id: string } };

    expect(data1.data.id).toBeDefined();
    expect(data2.data.id).toBeDefined();
    expect(data1.data.id).not.toBe(data2.data.id);
  });
});
