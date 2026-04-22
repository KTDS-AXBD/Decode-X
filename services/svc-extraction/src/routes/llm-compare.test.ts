import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleLlmCompareRoutes } from "./llm-compare.js";
import type { Env } from "../env.js";

/* ─── Mock LLM caller ─── */

function mockExtractionResult(provider: string) {
  const baseResult = {
    processes: [{ name: "해지 처리", description: "퇴직연금 해지", steps: ["신청", "검증", "처리"] }],
    entities: [
      { name: "퇴직연금 계좌", type: "account", attributes: ["계좌번호", "잔액"] },
      { name: "가입자", type: "person", attributes: ["이름", "생년월일"] },
    ],
    relationships: [{ from: "가입자", to: "퇴직연금 계좌", type: "소유" }],
    rules: [{ condition: "해지 요청 시", outcome: "잔액 확인 필수", domain: "pension" }],
  };

  // OpenAI returns slightly different entity names to test overlap
  if (provider === "openai") {
    baseResult.entities.push({ name: "운용사", type: "system", attributes: ["운용사명"] });
  }

  return baseResult;
}

let callCount = 0;

vi.mock("../llm/caller.js", () => ({
  callLlm: vi.fn().mockImplementation(async () => JSON.stringify(mockExtractionResult("anthropic"))),
  callLlmWithMeta: vi.fn().mockImplementation(async () => {
    const providers = ["anthropic", "openai"];
    const models = ["claude-sonnet-4-6", "gpt-4.1-mini"];
    const idx = callCount % 2;
    const provider = providers[idx] ?? "anthropic";
    const model = models[idx] ?? "claude-sonnet-4-6";
    callCount++;
    return {
      content: JSON.stringify(mockExtractionResult(provider)),
      provider,
      model,
    };
  }),
}));

/* ─── Mock helpers ─── */

function mockFetcher(response: unknown): Fetcher {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } }),
    ),
  } as unknown as Fetcher;
}

function mockChunks() {
  return [
    { masked_text: "퇴직연금 해지 절차 설명", classification: "process", element_type: "NarrativeText", word_count: 50, chunk_index: 0 },
    { masked_text: "계좌 개설 프로세스", classification: "process", element_type: "NarrativeText", word_count: 40, chunk_index: 1 },
  ];
}

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
    DB_EXTRACTION: mockDb(),
    QUEUE_PIPELINE: {} as Queue,
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
    SVC_INGESTION: overrides?.SVC_INGESTION ?? mockFetcher({ success: true, data: { chunks: mockChunks() } }),
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-extraction",
    R2_SPEC_PACKAGES: {} as R2Bucket,
    INTERNAL_API_SECRET: "test-secret",
  };
}

/* ─── Tests ─── */

describe("handleLlmCompareRoutes", () => {
  beforeEach(() => {
    callCount = 0;
    vi.clearAllMocks();
  });

  describe("POST /llm-compare", () => {
    it("runs extraction with both providers and returns comparison", async () => {
      const env = mockEnv();
      const req = new Request("https://test/llm-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "doc-1", organizationId: "org-test" }),
      });

      const res = await handleLlmCompareRoutes(req, env);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
      expect(body.success).toBe(true);

      const data = body.data;
      expect(data["comparisonId"]).toBeDefined();
      expect(data["documentId"]).toBe("doc-1");

      const providerA = data["providerA"] as { provider: string; counts: { entities: number } };
      const providerB = data["providerB"] as { provider: string; counts: { entities: number } };
      expect(providerA.provider).toBe("anthropic");
      expect(providerB.provider).toBe("openai");
      expect(providerA.counts.entities).toBe(2);
      expect(providerB.counts.entities).toBe(3); // openai has extra entity

      const metrics = data["metrics"] as { jaccardEntities: number; overlapEntities: number };
      expect(metrics.overlapEntities).toBe(2); // 2 common entities
      expect(metrics.jaccardEntities).toBeGreaterThan(0);
      expect(metrics.jaccardEntities).toBeLessThan(1);
    });

    it("returns 400 when documentId is missing", async () => {
      const env = mockEnv();
      const req = new Request("https://test/llm-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org-test" }),
      });

      const res = await handleLlmCompareRoutes(req, env);
      expect(res.status).toBe(400);
    });

    it("returns 400 when no chunks found", async () => {
      const env = mockEnv({
        SVC_INGESTION: mockFetcher({ success: true, data: { chunks: [] } }),
      });
      const req = new Request("https://test/llm-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "doc-empty", organizationId: "org-test" }),
      });

      const res = await handleLlmCompareRoutes(req, env);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /llm-compare", () => {
    it("returns list of comparisons", async () => {
      const env = mockEnv();
      const req = new Request("https://test/llm-compare?organizationId=org-test");
      const res = await handleLlmCompareRoutes(req, env);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /llm-compare/:id", () => {
    it("returns 404 for nonexistent comparison", async () => {
      const env = mockEnv();
      const req = new Request("https://test/llm-compare/nonexistent");
      const res = await handleLlmCompareRoutes(req, env);
      expect(res.status).toBe(404);
    });
  });
});
