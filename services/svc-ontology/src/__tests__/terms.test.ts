import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetTerm, handleListTerms, handleGetGraph, handleTermsStats, handleGraphVisualization } from "../routes/terms.js";
import type { Env } from "../env.js";

// ── Mock neo4jQuery ─────────────────────────────────────────────

vi.mock("../neo4j/client.js", () => ({
  neo4jQuery: vi.fn().mockResolvedValue({ results: [], errors: [] }),
}));

import { neo4jQuery as mockedNeo4jQuery } from "../neo4j/client.js";

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

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_ONTOLOGY: mockDb(dbOverrides),
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_POLICY: { fetch: vi.fn().mockResolvedValue(new Response("{}")) } as unknown as Fetcher,
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-ontology",
    INTERNAL_API_SECRET: "test-secret",
    NEO4J_URI: "https://test.databases.neo4j.io",
    NEO4J_USERNAME: "neo4j",
    NEO4J_PASSWORD: "pass",
    NEO4J_DATABASE: "testdb",
  };
}

/** Create a Request with X-Organization-Id header */
function orgRequest(url: string, orgId = "LPON"): Request {
  return new Request(url, {
    headers: { "X-Organization-Id": orgId },
  });
}

const SAMPLE_TERM = {
  term_id: "term-abc-123",
  ontology_id: "ont-xyz",
  label: "Retirement Pension",
  definition: "A pension plan for retired employees",
  skos_uri: "urn:aif:term:term-abc-123",
  broader_term_id: null,
  embedding_model: null,
  created_at: "2026-01-15T10:00:00Z",
};

const SAMPLE_TERM_2 = {
  term_id: "term-def-456",
  ontology_id: "ont-xyz",
  label: "Withdrawal",
  definition: "An act of removing funds",
  skos_uri: "urn:aif:term:term-def-456",
  broader_term_id: "term-abc-123",
  embedding_model: "bge-base-en-v1.5",
  created_at: "2026-01-15T10:01:00Z",
};

// ── handleGetTerm ────────────────────────────────────────────────

describe("handleGetTerm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when term is not found", async () => {
    const env = mockEnv({ firstResult: null });
    const req = orgRequest("https://test.internal/terms/nonexistent");
    const res = await handleGetTerm(req, env, "nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json() as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("nonexistent");
  });

  it("returns term when found", async () => {
    const env = mockEnv({ firstResult: SAMPLE_TERM });
    const req = orgRequest("https://test.internal/terms/term-abc-123");
    const res = await handleGetTerm(req, env, "term-abc-123");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: {
        termId: string;
        ontologyId: string;
        label: string;
        definition: string;
        skosUri: string;
        broaderTermId: string | null;
        embeddingModel: string | null;
        createdAt: string;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.termId).toBe("term-abc-123");
    expect(body.data.label).toBe("Retirement Pension");
    expect(body.data.definition).toBe("A pension plan for retired employees");
    expect(body.data.skosUri).toBe("urn:aif:term:term-abc-123");
  });

  it("formats camelCase field names from snake_case D1 rows", async () => {
    const env = mockEnv({ firstResult: SAMPLE_TERM_2 });
    const req = orgRequest("https://test.internal/terms/term-def-456");
    const res = await handleGetTerm(req, env, "term-def-456");
    const body = await res.json() as {
      data: {
        termId: string;
        ontologyId: string;
        broaderTermId: string | null;
        embeddingModel: string | null;
        createdAt: string;
      };
    };
    expect(body.data.termId).toBe("term-def-456");
    expect(body.data.ontologyId).toBe("ont-xyz");
    expect(body.data.broaderTermId).toBe("term-abc-123");
    expect(body.data.embeddingModel).toBe("bge-base-en-v1.5");
    expect(body.data.createdAt).toBe("2026-01-15T10:01:00Z");
  });

  it("queries D1 with org-scoped JOIN", async () => {
    const env = mockEnv({ firstResult: SAMPLE_TERM });
    const req = orgRequest("https://test.internal/terms/my-term-id", "LPON");
    await handleGetTerm(req, env, "my-term-id");

    expect(env.DB_ONTOLOGY.prepare).toHaveBeenCalledOnce();
    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("JOIN ontologies o");
    expect(sql).toContain("o.organization_id = ?");
  });

  it("returns null fields properly", async () => {
    const termWithNulls = {
      ...SAMPLE_TERM,
      definition: null,
      broader_term_id: null,
      embedding_model: null,
    };
    const env = mockEnv({ firstResult: termWithNulls });
    const req = orgRequest("https://test.internal/terms/term-abc-123");
    const res = await handleGetTerm(req, env, "term-abc-123");
    const body = await res.json() as {
      data: {
        definition: string | null;
        broaderTermId: string | null;
        embeddingModel: string | null;
      };
    };
    expect(body.data.definition).toBeNull();
    expect(body.data.broaderTermId).toBeNull();
    expect(body.data.embeddingModel).toBeNull();
  });
});

// ── handleListTerms ──────────────────────────────────────────────

describe("handleListTerms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list when no terms exist", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/terms");
    const res = await handleListTerms(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { terms: unknown[]; limit: number; offset: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.terms).toHaveLength(0);
    expect(body.data.limit).toBe(50);
    expect(body.data.offset).toBe(0);
  });

  it("returns list of terms with correct formatting", async () => {
    const env = mockEnv({ allResults: [SAMPLE_TERM, SAMPLE_TERM_2] });
    const req = orgRequest("https://test.internal/terms");
    const res = await handleListTerms(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: {
        terms: Array<{ termId: string; label: string }>;
        limit: number;
        offset: number;
      };
    };
    expect(body.data.terms).toHaveLength(2);
    expect(body.data.terms[0]?.termId).toBe("term-abc-123");
    expect(body.data.terms[0]?.label).toBe("Retirement Pension");
    expect(body.data.terms[1]?.termId).toBe("term-def-456");
    expect(body.data.terms[1]?.label).toBe("Withdrawal");
  });

  it("filters by ontologyId when provided", async () => {
    const env = mockEnv({ allResults: [SAMPLE_TERM] });
    const req = orgRequest("https://test.internal/terms?ontologyId=ont-xyz");
    await handleListTerms(req, env);

    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("t.ontology_id = ?");
  });

  it("always includes org filter in query", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/terms", "Miraeasset");
    await handleListTerms(req, env);

    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("o.organization_id = ?");
    expect(sql).toContain("JOIN ontologies o");
  });

  it("respects custom limit parameter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/terms?limit=10");
    const res = await handleListTerms(req, env);
    const body = await res.json() as { data: { limit: number } };
    expect(body.data.limit).toBe(10);
  });

  it("caps limit at 100", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/terms?limit=500");
    const res = await handleListTerms(req, env);
    const body = await res.json() as { data: { limit: number } };
    expect(body.data.limit).toBe(100);
  });

  it("respects custom offset parameter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/terms?offset=20");
    const res = await handleListTerms(req, env);
    const body = await res.json() as { data: { offset: number } };
    expect(body.data.offset).toBe(20);
  });

  it("defaults limit to 50 and offset to 0", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/terms");
    const res = await handleListTerms(req, env);
    const body = await res.json() as { data: { limit: number; offset: number } };
    expect(body.data.limit).toBe(50);
    expect(body.data.offset).toBe(0);
  });

  it("handles combined filter and pagination", async () => {
    const env = mockEnv({ allResults: [SAMPLE_TERM] });
    const req = orgRequest("https://test.internal/terms?ontologyId=ont-xyz&limit=5&offset=10");
    const res = await handleListTerms(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { limit: number; offset: number } };
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(10);
  });

  it("SQL includes ORDER BY t.created_at ASC", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/terms");
    await handleListTerms(req, env);

    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ORDER BY t.created_at ASC");
  });
});

// ── handleGetGraph ───────────────────────────────────────────────

describe("handleGetGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ columns: ["t", "r", "n"], data: [{ row: ["node1", "rel1", "node2"], meta: [] }] }],
      errors: [],
    });
  });

  // ── Default query ─────────────────────────────────────────────

  it("uses default graph query when no query param provided", async () => {
    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }] });
    const req = orgRequest("https://test.internal/graph");
    await handleGetGraph(req, env);

    expect(mockedNeo4jQuery).toHaveBeenCalledOnce();
    const callArgs = (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Env,
      Array<{ statement: string }>,
    ];
    const statements = callArgs[1];
    expect(statements[0]?.statement).toContain("MATCH (t:Term)-[r]->(n)");
  });

  it("uses custom query from query param", async () => {
    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }] });
    const customCypher = "MATCH (n:Ontology) RETURN n LIMIT 10";
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent(customCypher)}`,
    );
    await handleGetGraph(req, env);

    const callArgs = (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Env,
      Array<{ statement: string }>,
    ];
    expect(callArgs[1][0]?.statement).toBe(customCypher);
  });

  // ── Read-only guard ───────────────────────────────────────────

  it("blocks DELETE queries", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("MATCH (n) DELETE n")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("read-only");
  });

  it("blocks DETACH queries", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("MATCH (n) DETACH DELETE n")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("read-only");
  });

  it("blocks DROP queries", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("DROP INDEX my_index")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
  });

  it("blocks CREATE queries", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("CREATE (n:Term {name: 'test'})")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
  });

  it("blocks MERGE queries", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("MERGE (n:Term {name: 'test'})")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
  });

  it("blocks SET queries", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("MATCH (n) SET n.name = 'test'")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
  });

  it("blocks REMOVE queries", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("MATCH (n) REMOVE n.name")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
  });

  it("blocks case-insensitive destructive keywords", async () => {
    const env = mockEnv();
    const req = orgRequest(
      `https://test.internal/graph?query=${encodeURIComponent("match (n) delete n")}`,
    );
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
  });

  // ── Empty org returns empty ───────────────────────────────────

  it("returns empty when org has no ontologies", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/graph", "EMPTY_ORG");
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { columns: string[]; rows: unknown[][] } };
    expect(body.data.columns).toEqual([]);
    expect(body.data.rows).toEqual([]);
  });

  // ── Successful graph queries ──────────────────────────────────

  it("returns columns and rows from Neo4j on success", async () => {
    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }] });
    const req = orgRequest("https://test.internal/graph");
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: {
        columns: string[];
        rows: unknown[][];
        query: string;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.columns).toEqual(["t", "r", "n"]);
    expect(body.data.rows).toEqual([["node1", "rel1", "node2"]]);
    expect(body.data.query).toContain("MATCH");
  });

  it("returns empty results from Neo4j", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ columns: ["n"], data: [] }],
      errors: [],
    });
    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }] });
    const req = orgRequest("https://test.internal/graph");
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { rows: unknown[][] } };
    expect(body.data.rows).toEqual([]);
  });

  // ── Neo4j error handling ──────────────────────────────────────

  it("returns 400 when Neo4j returns query errors", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [],
      errors: [{ code: "Neo.ClientError", message: "Syntax error at position 5" }],
    });

    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }] });
    const req = orgRequest("https://test.internal/graph");
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("Neo4j query error");
    expect(body.error.message).toContain("Syntax error at position 5");
  });

  it("returns 500 when Neo4j throws an exception", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Connection timeout"),
    );

    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }] });
    const req = orgRequest("https://test.internal/graph");
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(500);
  });

  // ── Edge: empty results array ─────────────────────────────────

  it("handles when Neo4j returns empty results array (no errors)", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [],
      errors: [],
    });

    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }] });
    const req = orgRequest("https://test.internal/graph");
    const res = await handleGetGraph(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: { columns: string[]; rows: unknown[][] };
    };
    // firstResult is undefined, so columns/rows default to []
    expect(body.data.columns).toEqual([]);
    expect(body.data.rows).toEqual([]);
  });
});

// ── handleTermsStats ─────────────────────────────────────────────

describe("handleTermsStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes org filter in stats query", async () => {
    const env = mockEnv({ firstResult: { total: 100, distinct_labels: 80, ontology_count: 5 } });
    const req = orgRequest("https://test.internal/terms/stats", "LPON");
    await handleTermsStats(req, env);

    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("JOIN ontologies o");
    expect(sql).toContain("o.organization_id = ?");
  });
});

// ── handleGraphVisualization ─────────────────────────────────────

describe("handleGraphVisualization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when org has no ontologies", async () => {
    const env = mockEnv({ allResults: [] });
    const req = orgRequest("https://test.internal/graph/visualization", "EMPTY_ORG");
    const res = await handleGraphVisualization(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { nodes: unknown[]; links: unknown[] } };
    expect(body.data.nodes).toEqual([]);
    expect(body.data.links).toEqual([]);
  });

  it("passes ontologyIds to Neo4j Cypher parameters", async () => {
    (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ columns: ["label", "definition", "freq", "termType"], data: [] }],
      errors: [],
    });

    const env = mockEnv({ allResults: [{ ontology_id: "ont-1" }, { ontology_id: "ont-2" }] });
    const req = orgRequest("https://test.internal/graph/visualization", "LPON");
    await handleGraphVisualization(req, env);

    expect(mockedNeo4jQuery).toHaveBeenCalledOnce();
    const callArgs = (mockedNeo4jQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Env,
      Array<{ statement: string; parameters?: Record<string, unknown> }>,
    ];
    const params = callArgs[1][0]?.parameters;
    expect(params).toBeDefined();
    expect(params?.["ontologyIds"]).toEqual(["ont-1", "ont-2"]);
  });
});
