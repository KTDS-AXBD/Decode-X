import { describe, it, expect, vi } from "vitest";
import { handleGetCost } from "../routes/cost.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockEnv(): Env {
  return {
    DB_GOVERNANCE: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    } as unknown as D1Database,
    KV_PROMPTS: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    SECURITY: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 })) } as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-governance",
    INTERNAL_API_SECRET: "test-secret",
    ANTHROPIC_API_KEY: "test-key",
    OPENAI_API_KEY: "test-openai-key",
    GOOGLE_API_KEY: "test-google-key",
    AI: { run: vi.fn() } as unknown as Ai,
    SVC_INGESTION: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_EXTRACTION: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_POLICY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_SKILL: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_ONTOLOGY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_ANALYTICS: { fetch: vi.fn() } as unknown as Fetcher,
  };
}

// ── handleGetCost ───────────────────────────────────────────────

describe("handleGetCost", () => {
  it("returns 200 with cost summary", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/cost");
    const res = await handleGetCost(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it("returns zeroed stub values for all cost fields", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/cost");
    const res = await handleGetCost(req, env);
    const body = await res.json() as { data: {
      totalRequests: number;
      totalTokens: number;
      estimatedCost: number;
      byTier: Record<string, unknown>;
      byService: Record<string, unknown>;
      period: string;
    }};
    expect(body.data.totalRequests).toBe(0);
    expect(body.data.totalTokens).toBe(0);
    expect(body.data.estimatedCost).toBe(0);
    expect(body.data.byTier).toEqual({});
    expect(body.data.byService).toEqual({});
  });

  it("returns 'last-24h' as the default period", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/cost");
    const res = await handleGetCost(req, env);
    const body = await res.json() as { data: { period: string } };
    expect(body.data.period).toBe("last-24h");
  });

  it("returns correct Content-Type header", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/cost");
    const res = await handleGetCost(req, env);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("does not query D1 (stub implementation)", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/cost");
    await handleGetCost(req, env);
    expect(env.DB_GOVERNANCE.prepare).not.toHaveBeenCalled();
  });

  it("returns consistent structure across multiple calls", async () => {
    const env = mockEnv();
    const req1 = new Request("https://test.internal/cost");
    const req2 = new Request("https://test.internal/cost");
    const res1 = await handleGetCost(req1, env);
    const res2 = await handleGetCost(req2, env);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1).toEqual(body2);
  });
});
