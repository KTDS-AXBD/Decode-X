import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleNormalize } from "../routes/normalize.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
  runError?: Error;
}) {
  const runFn = overrides?.runError
    ? vi.fn().mockRejectedValue(overrides.runError)
    : vi.fn().mockResolvedValue({ success: true });
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] }),
        run: runFn,
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_ONTOLOGY: mockDb(dbOverrides),
    SVC_POLICY: { fetch: vi.fn().mockResolvedValue(new Response("{}")) } as unknown as Fetcher,
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-ontology",
    INTERNAL_API_SECRET: "test-secret",
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
    NEO4J_URI: "https://test.databases.neo4j.io",
    NEO4J_USERNAME: "neo4j",
    NEO4J_PASSWORD: "pass",
    NEO4J_DATABASE: "testdb",
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function makeNormalizeRequest(body: unknown): Request {
  return new Request("https://test.internal/normalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Mock neo4jQuery so normalize.ts doesn't actually call fetch
vi.mock("../neo4j/client.js", () => ({
  neo4jQuery: vi.fn().mockResolvedValue({ results: [], errors: [] }),
}));

import { neo4jQuery as mockedNeo4jQuery } from "../neo4j/client.js";

// ── Tests ────────────────────────────────────────────────────────

describe("handleNormalize", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
    vi.clearAllMocks();
    // Reset the mock to default success
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [], errors: [] });
  });

  // ── Input validation ──────────────────────────────────────────

  it("returns 400 when body is not valid JSON", async () => {
    const req = new Request("https://test.internal/normalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("valid JSON");
  });

  it("returns 400 when body is null", async () => {
    const req = new Request("https://test.internal/normalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("JSON object");
  });

  it("returns 400 when body is an array", async () => {
    const req = makeNormalizeRequest([1, 2, 3]);
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    // Arrays are objects in JS, but we check for null above; the code checks typeof === "object" && !== null
    // An array IS an object, so the next check is policyId; it won't be a string
    expect(body.error.message).toContain("policyId");
  });

  it("returns 400 when policyId is missing", async () => {
    const req = makeNormalizeRequest({ organizationId: "org-1", terms: [] });
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("policyId");
  });

  it("returns 400 when policyId is empty string", async () => {
    const req = makeNormalizeRequest({ policyId: "", organizationId: "org-1", terms: [] });
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("policyId");
  });

  it("returns 400 when organizationId is missing", async () => {
    const req = makeNormalizeRequest({ policyId: "pol-1", terms: [] });
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("organizationId");
  });

  it("returns 400 when organizationId is empty string", async () => {
    const req = makeNormalizeRequest({ policyId: "pol-1", organizationId: "", terms: [] });
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("organizationId");
  });

  it("returns 400 when terms is not an array", async () => {
    const req = makeNormalizeRequest({ policyId: "pol-1", organizationId: "org-1", terms: "invalid" });
    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("terms must be an array");
  });

  // ── Happy path ────────────────────────────────────────────────

  it("returns 201 with ontology and terms on success", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [
        { label: "Retirement Pension", definition: "A pension plan for retirees" },
        { label: "Withdrawal" },
      ],
    });

    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(201);

    const body = await res.json() as {
      success: boolean;
      data: {
        ontology: {
          ontologyId: string;
          policyId: string;
          organizationId: string;
          skosConceptScheme: string;
          termCount: number;
          status: string;
        };
        terms: Array<{
          termId: string;
          label: string;
          definition: string | null;
          skosUri: string;
        }>;
      };
    };

    expect(body.success).toBe(true);
    expect(body.data.ontology.policyId).toBe("pol-1");
    expect(body.data.ontology.organizationId).toBe("org-1");
    expect(body.data.ontology.termCount).toBe(2);
    expect(body.data.ontology.status).toBe("completed");
    expect(body.data.terms).toHaveLength(2);
    expect(body.data.terms[0]?.label).toBe("Retirement Pension");
    expect(body.data.terms[0]?.definition).toBe("A pension plan for retirees");
    expect(body.data.terms[1]?.label).toBe("Withdrawal");
    expect(body.data.terms[1]?.definition).toBeNull();
  });

  // ── SKOS URI generation ───────────────────────────────────────

  it("generates SKOS concept scheme URI with ontologyId", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Test Term" }],
    });

    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(201);

    const body = await res.json() as {
      data: { ontology: { ontologyId: string; skosConceptScheme: string } };
    };

    expect(body.data.ontology.skosConceptScheme).toBe(
      `urn:aif:scheme:${body.data.ontology.ontologyId}`,
    );
  });

  it("generates unique SKOS URI for each term", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Term A" }, { label: "Term B" }, { label: "Term C" }],
    });

    const res = await handleNormalize(req, env, ctx);
    const body = await res.json() as {
      data: { terms: Array<{ termId: string; skosUri: string }> };
    };

    const uris = body.data.terms.map((t) => t.skosUri);
    // All URIs should be unique
    expect(new Set(uris).size).toBe(3);
    // All URIs should follow the pattern
    for (const uri of uris) {
      expect(uri).toMatch(/^urn:aif:term:[0-9a-f-]+$/);
    }
  });

  // ── D1 insert ─────────────────────────────────────────────────

  it("inserts ontology record into D1 with processing status", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Test" }],
    });

    await handleNormalize(req, env, ctx);

    expect(env.DB_ONTOLOGY.prepare).toHaveBeenCalled();
    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const firstCallSql = prepareMock.mock.calls[0]?.[0] as string;
    expect(firstCallSql).toContain("INSERT INTO ontologies");
  });

  it("inserts terms into D1 via await", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Term A" }, { label: "Term B" }],
    });

    await handleNormalize(req, env, ctx);

    // D1 writes are now awaited (not ctx.waitUntil) to prevent data loss
    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const allSql = prepareMock.mock.calls.map((c: unknown[]) => c[0] as string);
    const termInserts = allSql.filter((s: string) => s.includes("INSERT INTO terms"));
    expect(termInserts.length).toBe(2);
  });

  it("returns error when D1 ontology insert fails", async () => {
    const failEnv = mockEnv({ runError: new Error("D1 insert failed") });
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Test" }],
    });

    const res = await handleNormalize(req, failEnv, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
  });

  // ── Neo4j calls ───────────────────────────────────────────────

  it("calls neo4jQuery with MERGE statements for terms and ontology", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Pension", definition: "Retirement fund" }],
    });

    await handleNormalize(req, env, ctx);

    expect(mockedNeo4jQuery).toHaveBeenCalledOnce();
    const callArgs = (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [Env, Array<{ statement: string; parameters: Record<string, unknown> }>];
    const statements = callArgs[1];
    // 1 term MERGE + 1 ontology-policy MERGE
    expect(statements).toHaveLength(2);
    expect(statements[0]?.statement).toContain("MERGE (t:Term {uri: $uri})");
    expect(statements[0]?.parameters?.["label"]).toBe("Pension");
    expect(statements[0]?.parameters?.["definition"]).toBe("Retirement fund");
    expect(statements[1]?.statement).toContain("MERGE (o:Ontology {id: $ontologyId})");
    expect(statements[1]?.parameters?.["policyId"]).toBe("pol-1");
  });

  it("sets neo4jGraphId when Neo4j upsert succeeds", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ columns: [], data: [] }],
      errors: [],
    });

    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Test" }],
    });

    const res = await handleNormalize(req, env, ctx);
    const body = await res.json() as {
      data: { ontology: { neo4jGraphId: string | null } };
    };

    expect(body.data.ontology.neo4jGraphId).toBeDefined();
    expect(body.data.ontology.neo4jGraphId).not.toBeNull();
  });

  it("sets neo4jGraphId to null when Neo4j returns errors", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ columns: [], data: [] }],
      errors: [{ code: "Neo.ClientError", message: "Some error" }],
    });

    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Test" }],
    });

    const res = await handleNormalize(req, env, ctx);
    const body = await res.json() as {
      data: { ontology: { neo4jGraphId: string | null } };
    };

    expect(body.data.ontology.neo4jGraphId).toBeNull();
  });

  // ── Graceful fallback ─────────────────────────────────────────

  it("continues successfully when Neo4j is unavailable (throws)", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Neo4j connection refused"),
    );

    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Fallback Term" }],
    });

    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(201);

    const body = await res.json() as {
      data: {
        ontology: { neo4jGraphId: string | null; status: string };
        terms: Array<{ label: string }>;
      };
    };

    expect(body.data.ontology.neo4jGraphId).toBeNull();
    expect(body.data.ontology.status).toBe("completed");
    expect(body.data.terms).toHaveLength(1);
    expect(body.data.terms[0]?.label).toBe("Fallback Term");
  });

  // ── Queue event emission ──────────────────────────────────────

  it("emits ontology.normalized event to QUEUE_PIPELINE", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Test" }],
    });

    await handleNormalize(req, env, ctx);

    // queue send is now awaited directly
    expect(env.QUEUE_PIPELINE.send).toHaveBeenCalledOnce();

    const sendMock = env.QUEUE_PIPELINE.send as ReturnType<typeof vi.fn>;
    const sentEvent = sendMock.mock.calls[0]?.[0] as {
      type: string;
      payload: { policyId: string; ontologyId: string; termCount: number };
    };
    expect(sentEvent.type).toBe("ontology.normalized");
    expect(sentEvent.payload.policyId).toBe("pol-1");
    expect(sentEvent.payload.termCount).toBe(1);
  });

  // ── Term filtering ────────────────────────────────────────────

  it("skips terms with missing or empty labels", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [
        { label: "Valid Term" },
        { label: "" },            // empty label — should be skipped
        { definition: "no label" }, // no label at all
        null,                      // null entry
        42,                        // non-object
        { label: "Another Valid" },
      ],
    });

    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(201);

    const body = await res.json() as {
      data: { ontology: { termCount: number }; terms: Array<{ label: string }> };
    };

    expect(body.data.terms).toHaveLength(2);
    expect(body.data.terms[0]?.label).toBe("Valid Term");
    expect(body.data.terms[1]?.label).toBe("Another Valid");
    expect(body.data.ontology.termCount).toBe(2);
  });

  it("handles empty terms array", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [],
    });

    const res = await handleNormalize(req, env, ctx);
    expect(res.status).toBe(201);

    const body = await res.json() as {
      data: { ontology: { termCount: number }; terms: unknown[] };
    };

    expect(body.data.terms).toHaveLength(0);
    expect(body.data.ontology.termCount).toBe(0);
    // Neo4j should not be called for empty terms
    expect(mockedNeo4jQuery).not.toHaveBeenCalled();
  });

  // ── Response shape ────────────────────────────────────────────

  it("includes createdAt and completedAt in response", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "Test" }],
    });

    const res = await handleNormalize(req, env, ctx);
    const body = await res.json() as {
      data: {
        ontology: { createdAt: string; completedAt: string };
        terms: Array<{ createdAt: string }>;
      };
    };

    expect(body.data.ontology.createdAt).toBeDefined();
    expect(body.data.ontology.completedAt).toBeDefined();
    expect(body.data.terms[0]?.createdAt).toBeDefined();
  });

  it("each term has ontologyId matching the ontology", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [{ label: "A" }, { label: "B" }],
    });

    const res = await handleNormalize(req, env, ctx);
    const body = await res.json() as {
      data: {
        ontology: { ontologyId: string };
        terms: Array<{ ontologyId: string }>;
      };
    };

    const ontologyId = body.data.ontology.ontologyId;
    for (const term of body.data.terms) {
      expect(term.ontologyId).toBe(ontologyId);
    }
  });

  it("term definition is included when provided, null otherwise", async () => {
    const req = makeNormalizeRequest({
      policyId: "pol-1",
      organizationId: "org-1",
      terms: [
        { label: "With Def", definition: "Some definition" },
        { label: "No Def" },
      ],
    });

    const res = await handleNormalize(req, env, ctx);
    const body = await res.json() as {
      data: { terms: Array<{ label: string; definition: string | null }> };
    };

    expect(body.data.terms[0]?.definition).toBe("Some definition");
    expect(body.data.terms[1]?.definition).toBeNull();
  });
});
