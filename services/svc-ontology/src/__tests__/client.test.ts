import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { neo4jQuery } from "../neo4j/client.js";
import type { Env } from "../env.js";
import type { Neo4jStatement } from "../neo4j/client.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockEnv(overrides?: Partial<Env>): Env {
  return {
    DB_ONTOLOGY: {} as D1Database,
    SVC_POLICY: {} as Fetcher,
    QUEUE_PIPELINE: {} as Queue,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-ontology",
    INTERNAL_API_SECRET: "test-secret",
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
    NEO4J_URI: "https://test-instance.databases.neo4j.io",
    NEO4J_USERNAME: "neo4j-user",
    NEO4J_PASSWORD: "neo4j-pass",
    NEO4J_DATABASE: "test-db",
    ...overrides,
  };
}

function makeQueryApiResponse(fields: string[], values: unknown[][]) {
  return {
    data: { fields, values },
    bookmarks: [],
    counters: {},
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("neo4jQuery", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Request format ────────────────────────────────────────────

  it("sends POST to correct Query API v2 URL", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse([], [])), { status: 200 }),
    );

    await neo4jQuery(env, [{ statement: "RETURN 1" }]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://test-instance.databases.neo4j.io/db/test-db/query/v2");
  });

  it("sends Basic auth header with base64-encoded credentials", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse([], [])), { status: 200 }),
    );

    await neo4jQuery(env, [{ statement: "RETURN 1" }]);

    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = call[1]?.headers as Record<string, string>;
    const expected = btoa("neo4j-user:neo4j-pass");
    expect(headers["Authorization"]).toBe(`Basic ${expected}`);
  });

  it("sends Content-Type and Accept as application/json", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse([], [])), { status: 200 }),
    );

    await neo4jQuery(env, [{ statement: "RETURN 1" }]);

    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("sends statement and parameters in the request body", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse([], [])), { status: 200 }),
    );

    const stmt: Neo4jStatement = {
      statement: "MATCH (n:Term {uri: $uri}) RETURN n",
      parameters: { uri: "urn:aif:term:123" },
    };

    await neo4jQuery(env, [stmt]);

    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1]?.body as string) as { statement: string; parameters: Record<string, unknown> };
    expect(body.statement).toBe("MATCH (n:Term {uri: $uri}) RETURN n");
    expect(body.parameters).toEqual({ uri: "urn:aif:term:123" });
  });

  it("defaults parameters to empty object when not provided", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse([], [])), { status: 200 }),
    );

    await neo4jQuery(env, [{ statement: "RETURN 1" }]);

    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1]?.body as string) as { parameters: Record<string, unknown> };
    expect(body.parameters).toEqual({});
  });

  // ── Response parsing ──────────────────────────────────────────

  it("converts Query API v2 response to Neo4jResult shape", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify(makeQueryApiResponse(["name", "age"], [["Alice", 30], ["Bob", 25]])),
        { status: 200 },
      ),
    );

    const response = await neo4jQuery(env, [{ statement: "MATCH (n) RETURN n.name, n.age" }]);

    expect(response.results).toHaveLength(1);
    const result = response.results[0];
    expect(result?.columns).toEqual(["name", "age"]);
    expect(result?.data).toHaveLength(2);
    expect(result?.data[0]?.row).toEqual(["Alice", 30]);
    expect(result?.data[1]?.row).toEqual(["Bob", 25]);
    expect(result?.data[0]?.meta).toEqual([]);
    expect(response.errors).toHaveLength(0);
  });

  it("handles empty result set", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse(["n"], [])), { status: 200 }),
    );

    const response = await neo4jQuery(env, [{ statement: "MATCH (n:Nonexistent) RETURN n" }]);

    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.columns).toEqual(["n"]);
    expect(response.results[0]?.data).toHaveLength(0);
    expect(response.errors).toHaveLength(0);
  });

  it("handles empty statements array", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

    const response = await neo4jQuery(env, []);

    expect(response.results).toHaveLength(0);
    expect(response.errors).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Batch execution ───────────────────────────────────────────

  it("executes multiple statements sequentially", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeQueryApiResponse(["a"], [["first"]])), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeQueryApiResponse(["b"], [["second"]])), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeQueryApiResponse(["c"], [["third"]])), { status: 200 }),
      );

    const stmts: Neo4jStatement[] = [
      { statement: "RETURN 'first' AS a" },
      { statement: "RETURN 'second' AS b" },
      { statement: "RETURN 'third' AS c" },
    ];

    const response = await neo4jQuery(env, stmts);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(response.results).toHaveLength(3);
    expect(response.results[0]?.data[0]?.row).toEqual(["first"]);
    expect(response.results[1]?.data[0]?.row).toEqual(["second"]);
    expect(response.results[2]?.data[0]?.row).toEqual(["third"]);
    expect(response.errors).toHaveLength(0);
  });

  it("accumulates errors from multiple statements", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeQueryApiResponse(["a"], [["ok"]])), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ errors: [{ code: "Neo.ClientError.Statement.SyntaxError", message: "Invalid syntax" }] }),
          { status: 400 },
        ),
      );

    const response = await neo4jQuery(env, [
      { statement: "RETURN 'ok' AS a" },
      { statement: "INVALID CYPHER" },
    ]);

    expect(response.results).toHaveLength(2);
    expect(response.results[0]?.data[0]?.row).toEqual(["ok"]);
    // Second result should be empty (error path)
    expect(response.results[1]?.columns).toEqual([]);
    expect(response.results[1]?.data).toEqual([]);
    // Errors accumulated
    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]?.code).toBe("Neo.ClientError.Statement.SyntaxError");
    expect(response.errors[0]?.message).toBe("Invalid syntax");
  });

  // ── Error handling ────────────────────────────────────────────

  it("returns errors from Neo4j JSON error response", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            { code: "Neo.ClientError.Security.Unauthorized", message: "Invalid credentials" },
          ],
        }),
        { status: 401 },
      ),
    );

    const response = await neo4jQuery(env, [{ statement: "RETURN 1" }]);

    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]?.code).toBe("Neo.ClientError.Security.Unauthorized");
    expect(response.errors[0]?.message).toBe("Invalid credentials");
    expect(response.results[0]?.columns).toEqual([]);
    expect(response.results[0]?.data).toEqual([]);
  });

  it("throws when server returns non-JSON error body", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response("Gateway Timeout", { status: 504 }),
    );

    await expect(neo4jQuery(env, [{ statement: "RETURN 1" }])).rejects.toThrow(
      "Neo4j HTTP error: 504",
    );
  });

  it("throws when fetch itself fails (network error)", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("Network unreachable"));

    await expect(neo4jQuery(env, [{ statement: "RETURN 1" }])).rejects.toThrow(
      "Network unreachable",
    );
  });

  it("throws for 500 with non-JSON error body", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(neo4jQuery(env, [{ statement: "RETURN 1" }])).rejects.toThrow(
      "Neo4j HTTP error: 500",
    );
  });

  it("throws for 403 Forbidden with plain text body", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );

    await expect(neo4jQuery(env, [{ statement: "RETURN 1" }])).rejects.toThrow(
      "Neo4j HTTP error: 403",
    );
  });

  // ── URI construction ──────────────────────────────────────────

  it("constructs URI with custom database name", async () => {
    const env = mockEnv({ NEO4J_DATABASE: "custom-db-name" });
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse([], [])), { status: 200 }),
    );

    await neo4jQuery(env, [{ statement: "RETURN 1" }]);

    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://test-instance.databases.neo4j.io/db/custom-db-name/query/v2");
  });

  it("uses the provided NEO4J_URI as base URL", async () => {
    const env = mockEnv({ NEO4J_URI: "https://custom-host.example.com" });
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse([], [])), { status: 200 }),
    );

    await neo4jQuery(env, [{ statement: "RETURN 1" }]);

    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://custom-host.example.com/db/test-db/query/v2");
  });

  // ── Edge cases ────────────────────────────────────────────────

  it("handles response with complex nested values", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const complexRow = [
      { id: "node-1", labels: ["Term"], properties: { name: "test" } },
      { type: "HAS_TERM", properties: {} },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(makeQueryApiResponse(["node", "rel"], [complexRow])), { status: 200 }),
    );

    const response = await neo4jQuery(env, [{ statement: "MATCH (n)-[r]->(m) RETURN n, r" }]);

    expect(response.results[0]?.data[0]?.row).toEqual(complexRow);
  });

  it("handles 400 error with JSON errors array", async () => {
    const env = mockEnv();
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const errorBody = {
      errors: [
        { code: "Neo.ClientError.Statement.SyntaxError", message: "Variable `x` not defined" },
        { code: "Neo.ClientError.Statement.SemanticError", message: "Type mismatch" },
      ],
    };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 400 }),
    );

    const response = await neo4jQuery(env, [{ statement: "RETURN x" }]);

    expect(response.errors).toHaveLength(2);
    expect(response.errors[0]?.code).toBe("Neo.ClientError.Statement.SyntaxError");
    expect(response.errors[1]?.code).toBe("Neo.ClientError.Statement.SemanticError");
  });
});
