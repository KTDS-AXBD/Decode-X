import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetTrust, handleCreateTrustEvaluation } from "../routes/trust.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  const allFn = vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] });
  return {
    prepare: vi.fn().mockReturnValue({
      // .all() directly on prepare() — used by handleGetTrust (no bind)
      all: allFn,
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: allFn,
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_GOVERNANCE: mockDb(dbOverrides),
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

function createJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_EVALUATION = {
  targetType: "output" as const,
  targetId: "output-abc-123",
  level: "L1" as const,
  score: 0.85,
  evaluator: "reviewer-1",
  notes: "High quality extraction output",
};

// ── handleCreateTrustEvaluation ─────────────────────────────────

describe("handleCreateTrustEvaluation", () => {
  let env: Env;

  beforeEach(() => {
    env = mockEnv();
  });

  it("returns 201 with valid trust evaluation", async () => {
    const req = createJsonRequest("https://test.internal/trust", VALID_EVALUATION);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; data: { evaluationId: string; targetType: string } };
    expect(body.success).toBe(true);
    expect(body.data.evaluationId).toBeDefined();
    expect(body.data.targetType).toBe("output");
  });

  it("returns all fields in the created evaluation response", async () => {
    const req = createJsonRequest("https://test.internal/trust", VALID_EVALUATION);
    const res = await handleCreateTrustEvaluation(req, env);
    const body = await res.json() as { data: {
      evaluationId: string;
      targetType: string;
      targetId: string;
      level: string;
      score: number;
      evaluator: string;
      notes: string;
      evaluatedAt: string;
    }};
    expect(body.data.evaluationId).toBeDefined();
    expect(body.data.targetType).toBe("output");
    expect(body.data.targetId).toBe("output-abc-123");
    expect(body.data.level).toBe("L1");
    expect(body.data.score).toBe(0.85);
    expect(body.data.evaluator).toBe("reviewer-1");
    expect(body.data.notes).toBe("High quality extraction output");
    expect(body.data.evaluatedAt).toBeDefined();
  });

  it("inserts a trust evaluation into D1", async () => {
    const req = createJsonRequest("https://test.internal/trust", VALID_EVALUATION);
    await handleCreateTrustEvaluation(req, env);
    expect(env.DB_GOVERNANCE.prepare).toHaveBeenCalledOnce();
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("INSERT INTO trust_evaluations");
  });

  it("accepts targetType 'skill' with level L2", async () => {
    const payload = { ...VALID_EVALUATION, targetType: "skill", level: "L2" };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { targetType: string; level: string } };
    expect(body.data.targetType).toBe("skill");
    expect(body.data.level).toBe("L2");
  });

  it("accepts targetType 'system' with level L3", async () => {
    const payload = { ...VALID_EVALUATION, targetType: "system", level: "L3" };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { targetType: string; level: string } };
    expect(body.data.targetType).toBe("system");
    expect(body.data.level).toBe("L3");
  });

  it("accepts notes as optional (null in response when omitted)", async () => {
    const { notes: _, ...payloadWithoutNotes } = VALID_EVALUATION;
    const req = createJsonRequest("https://test.internal/trust", payloadWithoutNotes);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { notes: string | null } };
    expect(body.data.notes).toBeNull();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://test.internal/trust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("Invalid JSON");
  });

  it("returns 400 for invalid targetType", async () => {
    const payload = { ...VALID_EVALUATION, targetType: "unknown" };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid level", async () => {
    const payload = { ...VALID_EVALUATION, level: "L4" };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when score is below 0", async () => {
    const payload = { ...VALID_EVALUATION, score: -0.1 };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when score is above 1", async () => {
    const payload = { ...VALID_EVALUATION, score: 1.1 };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when evaluator is empty", async () => {
    const payload = { ...VALID_EVALUATION, evaluator: "" };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetId is empty", async () => {
    const payload = { ...VALID_EVALUATION, targetId: "" };
    const req = createJsonRequest("https://test.internal/trust", payload);
    const res = await handleCreateTrustEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("accepts score boundary values 0 and 1", async () => {
    for (const score of [0, 1]) {
      const freshEnv = mockEnv();
      const payload = { ...VALID_EVALUATION, score };
      const req = createJsonRequest("https://test.internal/trust", payload);
      const res = await handleCreateTrustEvaluation(req, freshEnv);
      expect(res.status).toBe(201);
    }
  });
});

// ── handleGetTrust ──────────────────────────────────────────────

describe("handleGetTrust", () => {
  it("returns empty aggregation when no evaluations exist", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/trust");
    const res = await handleGetTrust(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { byTargetType: Record<string, unknown>; totalEvaluations: number } };
    expect(body.success).toBe(true);
    expect(body.data.byTargetType).toEqual({});
    expect(body.data.totalEvaluations).toBe(0);
  });

  it("aggregates evaluations by target_type and level", async () => {
    const aggRows = [
      { target_type: "output", level: "L1", cnt: 10, avg_score: 0.756 },
      { target_type: "output", level: "L2", cnt: 5, avg_score: 0.821 },
      { target_type: "skill", level: "L2", cnt: 3, avg_score: 0.9 },
      { target_type: "system", level: "L3", cnt: 2, avg_score: 0.655 },
    ];
    const env = mockEnv({ allResults: aggRows as unknown as Record<string, unknown>[] });
    const req = new Request("https://test.internal/trust");
    const res = await handleGetTrust(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: {
      byTargetType: Record<string, Record<string, { count: number; avgScore: number }>>;
      totalEvaluations: number;
    }};
    expect(body.data.totalEvaluations).toBe(20);
    expect(body.data.byTargetType["output"]?.["L1"]?.count).toBe(10);
    expect(body.data.byTargetType["output"]?.["L1"]?.avgScore).toBe(0.756);
    expect(body.data.byTargetType["output"]?.["L2"]?.count).toBe(5);
    expect(body.data.byTargetType["skill"]?.["L2"]?.count).toBe(3);
    expect(body.data.byTargetType["system"]?.["L3"]?.count).toBe(2);
  });

  it("rounds avgScore to 3 decimal places", async () => {
    const aggRows = [
      { target_type: "output", level: "L1", cnt: 7, avg_score: 0.12345678 },
    ];
    const env = mockEnv({ allResults: aggRows as unknown as Record<string, unknown>[] });
    const req = new Request("https://test.internal/trust");
    const res = await handleGetTrust(req, env);
    const body = await res.json() as { data: {
      byTargetType: Record<string, Record<string, { avgScore: number }>>;
    }};
    expect(body.data.byTargetType["output"]?.["L1"]?.avgScore).toBe(0.123);
  });

  it("queries trust_evaluations with GROUP BY", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/trust");
    await handleGetTrust(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("GROUP BY target_type, level");
  });

  it("handles single target_type with multiple levels", async () => {
    const aggRows = [
      { target_type: "skill", level: "L1", cnt: 4, avg_score: 0.7 },
      { target_type: "skill", level: "L2", cnt: 6, avg_score: 0.8 },
      { target_type: "skill", level: "L3", cnt: 2, avg_score: 0.95 },
    ];
    const env = mockEnv({ allResults: aggRows as unknown as Record<string, unknown>[] });
    const req = new Request("https://test.internal/trust");
    const res = await handleGetTrust(req, env);
    const body = await res.json() as { data: {
      byTargetType: Record<string, Record<string, { count: number; avgScore: number }>>;
      totalEvaluations: number;
    }};
    expect(body.data.totalEvaluations).toBe(12);
    const skillBucket = body.data.byTargetType["skill"];
    expect(skillBucket).toBeDefined();
    expect(Object.keys(skillBucket!)).toHaveLength(3);
    expect(skillBucket!["L1"]?.count).toBe(4);
    expect(skillBucket!["L2"]?.count).toBe(6);
    expect(skillBucket!["L3"]?.count).toBe(2);
  });
});
