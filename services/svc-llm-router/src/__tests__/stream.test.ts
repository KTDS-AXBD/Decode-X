import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleStream } from "../routes/stream.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
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

function createJsonRequest(body: unknown): Request {
  return new Request("https://test.internal/stream", {
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

describe("handleStream", () => {
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
    const req = new Request("https://test.internal/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });

    const res = await handleStream(req, env, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: { message: string } };
    expect(data.error.message).toContain("Invalid JSON body");
  });

  it("returns 400 when required fields are missing", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest({ tier: "sonnet" }); // missing messages, callerService

    const res = await handleStream(req, env, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: { message: string } };
    expect(data.error.message).toContain("Invalid request");
  });

  it("returns 400 when tier is invalid", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest(validLlmRequestBody({ tier: "gpt-4" }));

    const res = await handleStream(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages array is empty", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest(validLlmRequestBody({ messages: [] }));

    const res = await handleStream(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns SSE response with correct headers on success", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const sseBody = "data: {\"type\":\"content_block_start\"}\n\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hello\"}}\n\n";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(sseBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleStream(req, env, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("forces stream: true in the Anthropic request body", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({ stream: false }));
    await handleStream(req, env, ctx);

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(callArgs[1]?.body as string) as Record<string, unknown>;
    expect(sentBody["stream"]).toBe(true);
  });

  it("sends request to the AI Gateway URL", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    await handleStream(req, env, ctx);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("passes through the SSE response body from upstream", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const streamContent = "data: {\"type\":\"message_start\"}\n\ndata: {\"type\":\"message_stop\"}\n\n";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(streamContent, { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleStream(req, env, ctx);

    const text = await res.text();
    expect(text).toBe(streamContent);
  });

  it("returns 502 when upstream returns error", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleStream(req, env, ctx);

    expect(res.status).toBe(502);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe("UPSTREAM_ERROR");
  });

  it("returns error when upstream fetch throws", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockRejectedValue(new Error("Connection refused"));
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleStream(req, env, ctx);

    expect(res.status).toBe(500);
  });

  it("downgrades opus to sonnet for unauthorized callers in stream", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({
      tier: "opus",
      callerService: "svc-extraction",
    }));
    await handleStream(req, env, ctx);

    // The model sent to Anthropic should be sonnet, not opus
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(callArgs[1]?.body as string) as Record<string, unknown>;
    expect(sentBody["model"]).toContain("sonnet");
  });

  it("allows opus tier for svc-policy in stream", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({
      tier: "opus",
      callerService: "svc-policy",
    }));
    await handleStream(req, env, ctx);

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(callArgs[1]?.body as string) as Record<string, unknown>;
    expect(sentBody["model"]).toContain("opus");
  });

  it("includes X-Request-Id in SSE response headers", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    const res = await handleStream(req, env, ctx);

    expect(res.headers.get("X-Request-Id")).toBeDefined();
    expect(typeof res.headers.get("X-Request-Id")).toBe("string");
  });

  it("uses haiku model for haiku tier requests", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody({ tier: "haiku" }));
    await handleStream(req, env, ctx);

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(callArgs[1]?.body as string) as Record<string, unknown>;
    expect(sentBody["model"]).toContain("haiku");
  });

  it("returns 400 when callerService is missing", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = createJsonRequest({
      tier: "sonnet",
      messages: [{ role: "user", content: "test" }],
    });

    const res = await handleStream(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("includes anthropic-version header in upstream request", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", { status: 200 }),
    );
    globalThis.fetch = fetchSpy;

    const req = createJsonRequest(validLlmRequestBody());
    await handleStream(req, env, ctx);

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });
});
