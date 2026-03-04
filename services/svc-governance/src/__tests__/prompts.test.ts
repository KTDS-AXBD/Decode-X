import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleCreatePrompt, handleListPrompts, handleGetPrompt } from "../routes/prompts.js";
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

function mockKv(overrides?: {
  getResult?: string | null;
}) {
  return {
    get: vi.fn().mockResolvedValue(overrides?.getResult ?? null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [] }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0], kvOverrides?: Parameters<typeof mockKv>[0]): Env {
  return {
    DB_GOVERNANCE: mockDb(dbOverrides),
    KV_PROMPTS: mockKv(kvOverrides),
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

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function createJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_PROMPT = {
  promptName: "extraction-main",
  version: "1.0.0",
  stage: "extraction",
  content: "You are an extraction assistant...",
  rolloutPct: 10,
  createdBy: "admin-user",
};

// ── handleCreatePrompt ──────────────────────────────────────────

describe("handleCreatePrompt", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
  });

  it("returns 201 with a valid prompt creation payload", async () => {
    const req = createJsonRequest("https://test.internal/prompts", VALID_PROMPT);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; data: { promptVersionId: string; promptName: string; version: string } };
    expect(body.success).toBe(true);
    expect(body.data.promptVersionId).toBeDefined();
    expect(body.data.promptName).toBe("extraction-main");
    expect(body.data.version).toBe("1.0.0");
  });

  it("returns the full record with all fields set correctly", async () => {
    const req = createJsonRequest("https://test.internal/prompts", VALID_PROMPT);
    const res = await handleCreatePrompt(req, env, ctx);
    const body = await res.json() as { data: {
      promptVersionId: string;
      promptName: string;
      version: string;
      stage: string;
      content: string;
      rolloutPct: number;
      isActive: boolean;
      goldenTestPassed: boolean;
      createdBy: string;
      createdAt: string;
      activatedAt: string | null;
    }};
    expect(body.data.stage).toBe("extraction");
    expect(body.data.content).toBe("You are an extraction assistant...");
    expect(body.data.rolloutPct).toBe(10);
    expect(body.data.isActive).toBe(false);
    expect(body.data.goldenTestPassed).toBe(false);
    expect(body.data.createdBy).toBe("admin-user");
    expect(body.data.createdAt).toBeDefined();
    expect(body.data.activatedAt).toBeNull();
  });

  it("inserts a record into the D1 database", async () => {
    const req = createJsonRequest("https://test.internal/prompts", VALID_PROMPT);
    await handleCreatePrompt(req, env, ctx);
    expect(env.DB_GOVERNANCE.prepare).toHaveBeenCalledOnce();
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("INSERT INTO prompt_versions");
  });

  it("caches the prompt in KV via ctx.waitUntil", async () => {
    const req = createJsonRequest("https://test.internal/prompts", VALID_PROMPT);
    await handleCreatePrompt(req, env, ctx);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("caches using both name:version and id keys in KV", async () => {
    const req = createJsonRequest("https://test.internal/prompts", VALID_PROMPT);
    const res = await handleCreatePrompt(req, env, ctx);
    const body = await res.json() as { data: { promptVersionId: string } };

    // waitUntil receives a Promise.all of two KV put calls
    // Verify put was called for both key patterns
    const kvPut = env.KV_PROMPTS.put as ReturnType<typeof vi.fn>;

    // Since ctx.waitUntil wraps a Promise.all, we need to let it resolve
    const waitUntilMock = ctx.waitUntil as ReturnType<typeof vi.fn>;
    const waitUntilPromise = waitUntilMock.mock.calls[0]?.[0] as Promise<unknown>;
    await waitUntilPromise;

    expect(kvPut).toHaveBeenCalledTimes(2);
    const firstCallKey = kvPut.mock.calls[0]?.[0] as string;
    const secondCallKey = kvPut.mock.calls[1]?.[0] as string;
    expect(firstCallKey).toBe(`prompt:extraction-main:1.0.0`);
    expect(secondCallKey).toBe(`prompt-id:${body.data.promptVersionId}`);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://test.internal/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean; error: { message: string } };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid JSON");
  });

  it("returns 400 when promptName is missing", async () => {
    const payload = { ...VALID_PROMPT };
     
    delete (payload as any).promptName;
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when version is not valid semver", async () => {
    const payload = { ...VALID_PROMPT, version: "v1" };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when version has non-numeric parts", async () => {
    const payload = { ...VALID_PROMPT, version: "a.b.c" };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when stage is empty string", async () => {
    const payload = { ...VALID_PROMPT, stage: "" };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty string", async () => {
    const payload = { ...VALID_PROMPT, content: "" };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when rolloutPct is negative", async () => {
    const payload = { ...VALID_PROMPT, rolloutPct: -1 };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when rolloutPct exceeds 100", async () => {
    const payload = { ...VALID_PROMPT, rolloutPct: 101 };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when createdBy is empty", async () => {
    const payload = { ...VALID_PROMPT, createdBy: "" };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("defaults rolloutPct to 0 when not provided", async () => {
    const { rolloutPct: _, ...payloadWithoutRollout } = VALID_PROMPT;
    const req = createJsonRequest("https://test.internal/prompts", payloadWithoutRollout);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { rolloutPct: number } };
    expect(body.data.rolloutPct).toBe(0);
  });

  it("accepts semver with patch version like 2.10.3", async () => {
    const payload = { ...VALID_PROMPT, version: "2.10.3" };
    const req = createJsonRequest("https://test.internal/prompts", payload);
    const res = await handleCreatePrompt(req, env, ctx);
    expect(res.status).toBe(201);
  });

  it("accepts rolloutPct boundary values 0 and 100", async () => {
    for (const pct of [0, 100]) {
      const freshEnv = mockEnv();
      const freshCtx = mockCtx();
      const payload = { ...VALID_PROMPT, rolloutPct: pct };
      const req = createJsonRequest("https://test.internal/prompts", payload);
      const res = await handleCreatePrompt(req, freshEnv, freshCtx);
      expect(res.status).toBe(201);
    }
  });
});

// ── handleListPrompts ───────────────────────────────────────────

describe("handleListPrompts", () => {
  it("returns empty list when no prompts exist", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts");
    const res = await handleListPrompts(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { items: unknown[]; total: number } };
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it("returns mapped prompt records from D1 rows", async () => {
    const dbRows = [
      {
        prompt_version_id: "pv-1",
        prompt_name: "extraction-main",
        version: "1.0.0",
        stage: "extraction",
        content: "prompt text",
        rollout_pct: 50,
        is_active: 1,
        golden_test_passed: 1,
        created_by: "admin",
        created_at: "2026-01-15T00:00:00Z",
        activated_at: "2026-01-16T00:00:00Z",
      },
    ];
    const env = mockEnv({ allResults: dbRows });
    const req = new Request("https://test.internal/prompts");
    const res = await handleListPrompts(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { items: Array<{
      promptVersionId: string;
      promptName: string;
      isActive: boolean;
      goldenTestPassed: boolean;
      activatedAt: string;
    }> } };
    expect(body.data.items).toHaveLength(1);
    const item = body.data.items[0]!;
    expect(item.promptVersionId).toBe("pv-1");
    expect(item.promptName).toBe("extraction-main");
    expect(item.isActive).toBe(true);
    expect(item.goldenTestPassed).toBe(true);
    expect(item.activatedAt).toBe("2026-01-16T00:00:00Z");
  });

  it("maps is_active=0 to isActive=false", async () => {
    const dbRows = [{
      prompt_version_id: "pv-2",
      prompt_name: "policy-gen",
      version: "0.1.0",
      stage: "policy",
      content: "text",
      rollout_pct: 0,
      is_active: 0,
      golden_test_passed: 0,
      created_by: "user",
      created_at: "2026-01-10T00:00:00Z",
      activated_at: null,
    }];
    const env = mockEnv({ allResults: dbRows });
    const req = new Request("https://test.internal/prompts");
    const res = await handleListPrompts(req, env);
    const body = await res.json() as { data: { items: Array<{ isActive: boolean; goldenTestPassed: boolean; activatedAt: string | null }> } };
    const item = body.data.items[0]!;
    expect(item.isActive).toBe(false);
    expect(item.goldenTestPassed).toBe(false);
    expect(item.activatedAt).toBeNull();
  });

  it("filters by name query parameter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts?name=extraction-main");
    await handleListPrompts(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("prompt_name = ?");
  });

  it("filters by active=true query parameter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts?active=true");
    await handleListPrompts(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("is_active = 1");
  });

  it("filters by active=false query parameter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts?active=false");
    await handleListPrompts(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("is_active = 0");
  });

  it("uses default limit=20 and offset=0", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts");
    const res = await handleListPrompts(req, env);
    const body = await res.json() as { data: { limit: number; offset: number } };
    expect(body.data.limit).toBe(20);
    expect(body.data.offset).toBe(0);
  });

  it("respects custom limit and offset query params", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts?limit=5&offset=10");
    const res = await handleListPrompts(req, env);
    const body = await res.json() as { data: { limit: number; offset: number } };
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(10);
  });

  it("caps limit at 100", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts?limit=999");
    const res = await handleListPrompts(req, env);
    const body = await res.json() as { data: { limit: number } };
    expect(body.data.limit).toBe(100);
  });

  it("combines name and active filters", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts?name=policy-gen&active=true");
    await handleListPrompts(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("prompt_name = ?");
    expect(sql).toContain("is_active = 1");
  });

  it("orders results by created_at DESC", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/prompts");
    await handleListPrompts(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ORDER BY created_at DESC");
  });
});

// ── handleGetPrompt ─────────────────────────────────────────────

describe("handleGetPrompt", () => {
  it("returns prompt from KV cache when available (cache hit)", async () => {
    const cachedRecord = {
      promptVersionId: "pv-cached",
      promptName: "extraction-main",
      version: "1.0.0",
      stage: "extraction",
      content: "cached content",
      rolloutPct: 50,
      isActive: true,
      goldenTestPassed: true,
      createdBy: "admin",
      createdAt: "2026-01-15T00:00:00Z",
      activatedAt: null,
    };
    const env = mockEnv(undefined, { getResult: JSON.stringify(cachedRecord) });
    const req = new Request("https://test.internal/prompts/pv-cached");
    const res = await handleGetPrompt(req, env, "pv-cached");
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { promptVersionId: string; content: string } };
    expect(body.success).toBe(true);
    expect(body.data.promptVersionId).toBe("pv-cached");
    expect(body.data.content).toBe("cached content");
  });

  it("does not query D1 when KV cache hit occurs", async () => {
    const cachedRecord = {
      promptVersionId: "pv-cached",
      promptName: "test",
      version: "1.0.0",
      stage: "test",
      content: "text",
      rolloutPct: 0,
      isActive: false,
      goldenTestPassed: false,
      createdBy: "admin",
      createdAt: "2026-01-01T00:00:00Z",
      activatedAt: null,
    };
    const env = mockEnv(undefined, { getResult: JSON.stringify(cachedRecord) });
    const req = new Request("https://test.internal/prompts/pv-cached");
    await handleGetPrompt(req, env, "pv-cached");
    expect(env.DB_GOVERNANCE.prepare).not.toHaveBeenCalled();
  });

  it("queries KV with the correct cache key", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/prompts/pv-abc");
    await handleGetPrompt(req, env, "pv-abc");
    const kvGet = env.KV_PROMPTS.get as ReturnType<typeof vi.fn>;
    expect(kvGet).toHaveBeenCalledWith("prompt-id:pv-abc");
  });

  it("falls back to D1 when KV cache misses", async () => {
    const dbRow = {
      prompt_version_id: "pv-db",
      prompt_name: "policy-gen",
      version: "2.0.0",
      stage: "policy",
      content: "from db",
      rollout_pct: 100,
      is_active: 1,
      golden_test_passed: 1,
      created_by: "admin",
      created_at: "2026-02-01T00:00:00Z",
      activated_at: "2026-02-02T00:00:00Z",
    };
    const env = mockEnv({ firstResult: dbRow }, { getResult: null });
    const req = new Request("https://test.internal/prompts/pv-db");
    const res = await handleGetPrompt(req, env, "pv-db");
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { promptVersionId: string; content: string; isActive: boolean } };
    expect(body.data.promptVersionId).toBe("pv-db");
    expect(body.data.content).toBe("from db");
    expect(body.data.isActive).toBe(true);
  });

  it("returns 404 when prompt not found in KV or D1", async () => {
    const env = mockEnv({ firstResult: null }, { getResult: null });
    const req = new Request("https://test.internal/prompts/pv-nonexistent");
    const res = await handleGetPrompt(req, env, "pv-nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json() as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("pv-nonexistent");
  });

  it("correctly maps D1 snake_case row to camelCase record", async () => {
    const dbRow = {
      prompt_version_id: "pv-map",
      prompt_name: "ontology-embed",
      version: "0.5.0",
      stage: "ontology",
      content: "embed prompt",
      rollout_pct: 25,
      is_active: 0,
      golden_test_passed: 0,
      created_by: "dev-user",
      created_at: "2026-03-01T12:00:00Z",
      activated_at: null,
    };
    const env = mockEnv({ firstResult: dbRow }, { getResult: null });
    const req = new Request("https://test.internal/prompts/pv-map");
    const res = await handleGetPrompt(req, env, "pv-map");
    const body = await res.json() as { data: {
      promptVersionId: string;
      promptName: string;
      version: string;
      stage: string;
      content: string;
      rolloutPct: number;
      isActive: boolean;
      goldenTestPassed: boolean;
      createdBy: string;
      createdAt: string;
      activatedAt: string | null;
    }};
    expect(body.data.promptVersionId).toBe("pv-map");
    expect(body.data.promptName).toBe("ontology-embed");
    expect(body.data.version).toBe("0.5.0");
    expect(body.data.stage).toBe("ontology");
    expect(body.data.content).toBe("embed prompt");
    expect(body.data.rolloutPct).toBe(25);
    expect(body.data.isActive).toBe(false);
    expect(body.data.goldenTestPassed).toBe(false);
    expect(body.data.createdBy).toBe("dev-user");
    expect(body.data.createdAt).toBe("2026-03-01T12:00:00Z");
    expect(body.data.activatedAt).toBeNull();
  });
});
