import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../index.js";
import type { Env } from "../env.js";

// F514: CF Access JWT bypass for tests (production은 CF edge에서 검증)
vi.mock("@ai-foundry/utils", async () => {
  const actual = await vi.importActual<typeof import("@ai-foundry/utils")>("@ai-foundry/utils");
  return { ...actual, requireCfAccessJwt: () => null };
});

// ── Test data ───────────────────────────────────────────────────────

const orgMcpAdapterResponse = {
  serverInfo: { name: "ai-foundry-org-LPON", version: "1.0.0" },
  instructions: "AI Foundry Organization MCP for LPON. 3 tool(s) from 2 skills.",
  tools: [
    {
      name: "pol-gift-charge-001",
      description: "온누리상품권 충전 조건",
      inputSchema: {
        type: "object",
        properties: {
          context: { type: "string", description: "적용 대상의 상황 설명" },
          parameters: { type: "object", description: "추가 파라미터" },
        },
        required: ["context"],
      },
      annotations: { title: "충전 조건", readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "pol-gift-pay-001",
      description: "온누리상품권 결제 조건",
      inputSchema: {
        type: "object",
        properties: {
          context: { type: "string", description: "적용 대상의 상황 설명" },
          parameters: { type: "object", description: "추가 파라미터" },
        },
        required: ["context"],
      },
      annotations: { title: "결제 조건", readOnlyHint: true, openWorldHint: true },
    },
  ],
  metadata: {
    organizationId: "LPON",
    skillCount: 2,
    totalTools: 2,
    generatedAt: "2026-03-19T00:00:00.000Z",
  },
  _toolSkillMap: {
    "pol-gift-charge-001": "sk-lpon-001",
    "pol-gift-pay-001": "sk-lpon-002",
  },
};

const evaluateResponse = {
  success: true,
  data: {
    evaluationId: "eval-org-001",
    skillId: "sk-lpon-001",
    policyCode: "POL-GIFT-CHARGE-001",
    provider: "anthropic",
    model: "claude-sonnet-4-6-20250514",
    result: "APPLICABLE",
    confidence: 0.88,
    reasoning: "충전 한도 이내, 본인 인증 완료",
    latencyMs: 950,
  },
};

const skillQueryResponse = {
  success: true,
  data: {
    skills: [
      { skillId: "sk-lpon-001", metadata: { domain: "giftvoucher", subdomain: "charging", tags: ["충전", "자동충전"] }, trust: { level: "reviewed", score: 0 }, policyCount: 5, status: "bundled" },
      { skillId: "sk-lpon-002", metadata: { domain: "giftvoucher", subdomain: "payment", tags: ["결제"] }, trust: { level: "reviewed", score: 0 }, policyCount: 3, status: "bundled" },
    ],
    total: 2,
  },
};

const ontologyLookupResponse = {
  success: true,
  data: {
    terms: [
      { termId: "t-001", label: "온누리상품권", definition: "소상공인 지원 상품권", skosUri: "urn:aif:term:onnuri-voucher", termType: "concept" },
      { termId: "t-002", label: "충전한도", definition: "1회 최대 충전 가능 금액", skosUri: "urn:aif:term:charge-limit", termType: "attribute" },
    ],
  },
};

// ── Mock helpers ────────────────────────────────────────────────────

function createMockEnv(overrides?: Partial<Env>): Env {
  const mockSkillFetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === "string" ? input : (input as Request).url;

    if (url.includes("/skills/org/")) {
      return Response.json(orgMcpAdapterResponse, { status: 200 });
    }
    if (url.includes("/evaluate")) {
      return Response.json(evaluateResponse, { status: 200 });
    }
    if (url.includes("/skills?")) {
      return Response.json(skillQueryResponse, { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  });

  const mockOntologyFetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === "string" ? input : (input as Request).url;

    if (url.includes("/terms?")) {
      return Response.json(ontologyLookupResponse, { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  });

  return {
    SVC_SKILL: { fetch: mockSkillFetch } as unknown as Fetcher,
    SVC_ONTOLOGY: { fetch: mockOntologyFetch } as unknown as Fetcher,
    INTERNAL_API_SECRET: "test-secret-123",
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-mcp-server",
    ...overrides,
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function orgJsonRpcRequest(
  orgId: string,
  method: string,
  params?: unknown,
  id?: number,
): Request {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== undefined) body["id"] = id;
  if (params !== undefined) body["params"] = params;
  return new Request(`https://test.workers.dev/mcp/org/${orgId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer test-secret-123",
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("svc-mcp-server org endpoint", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = createMockEnv();
    ctx = mockCtx();
  });

  it("POST /mcp/org/LPON initialize returns serverInfo", async () => {
    const req = orgJsonRpcRequest("LPON", "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" },
    }, 1);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: {
        protocolVersion: string;
        capabilities: { tools: Record<string, unknown> };
        serverInfo: { name: string; version: string };
      };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.serverInfo.name).toBe("ai-foundry-org-LPON");
  });

  it("POST /mcp/org/LPON tools/list returns meta-tools + policy tools", async () => {
    const req = orgJsonRpcRequest("LPON", "tools/list", {}, 2);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: {
        tools: Array<{ name: string; description: string }>;
      };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(2);
    // 3 meta-tools + 2 policy tools = 5
    expect(body.result.tools).toHaveLength(5);
    // Meta-tools first
    expect(body.result.tools[0]?.name).toBe("foundry_policy_eval");
    expect(body.result.tools[1]?.name).toBe("foundry_skill_query");
    expect(body.result.tools[2]?.name).toBe("foundry_ontology_lookup");
    // Then policy tools
    expect(body.result.tools[3]?.name).toBe("pol-gift-charge-001");
    expect(body.result.tools[4]?.name).toBe("pol-gift-pay-001");
  });

  it("POST /mcp/org/LPON tools/call returns evaluation result", async () => {
    const req = orgJsonRpcRequest("LPON", "tools/call", {
      name: "pol-gift-charge-001",
      arguments: { context: "사용자 A가 온누리상품권 5만원 충전 요청" },
    }, 3);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(3);
    expect(body.result.content).toHaveLength(1);
    expect(body.result.content[0]?.text).toContain("APPLICABLE");
    expect(body.result.content[0]?.text).toContain("0.88");
  });

  it("rejects unauthenticated requests with 401", async () => {
    const req = new Request("https://test.workers.dev/mcp/org/LPON", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { jsonrpc: string; error: { code: number; message: string } };
    expect(body.error.message).toBe("Unauthorized");
  });

  it("returns 404 when org adapter fetch fails", async () => {
    const env404 = createMockEnv({
      SVC_SKILL: {
        fetch: vi.fn(async () => new Response("Not Found", { status: 404 })),
      } as unknown as Fetcher,
    });

    const req = orgJsonRpcRequest("UNKNOWN-ORG", "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    }, 1);
    const res = await handler.fetch(req, env404, ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { jsonrpc: string; error: { code: number; message: string } };
    expect(body.error.message).toContain("Organization not found");
  });

  // ── Meta-tool tests ──────────────────────────────────────────────

  it("foundry_skill_query calls SVC_SKILL and returns formatted result", async () => {
    const req = orgJsonRpcRequest("LPON", "tools/call", {
      name: "foundry_skill_query",
      arguments: { query: "충전" },
    }, 10);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(body.id).toBe(10);
    expect(body.result.content).toHaveLength(1);
    const text = body.result.content[0]?.text ?? "";
    expect(text).toContain("스킬 검색 결과 (2건)");
    expect(text).toContain("giftvoucher/charging");
    expect(text).toContain("sk-lpon-001");

    // Verify SVC_SKILL.fetch was called with skills query + X-Organization-Id header
    const skillFetch = (env.SVC_SKILL as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const calls = skillFetch.mock.calls as Array<[string, { headers: Record<string, string> }]>;
    expect(calls.some(([url, opts]) => url.includes("/skills?") && url.includes("q=") && opts.headers["X-Organization-Id"] === "LPON")).toBe(true);
  });

  it("foundry_ontology_lookup calls SVC_ONTOLOGY and returns formatted result", async () => {
    const req = orgJsonRpcRequest("LPON", "tools/call", {
      name: "foundry_ontology_lookup",
      arguments: { term: "온누리상품권" },
    }, 11);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(body.id).toBe(11);
    expect(body.result.content).toHaveLength(1);
    const text = body.result.content[0]?.text ?? "";
    expect(text).toContain("용어 조회 결과 (2건)");
    expect(text).toContain("온누리상품권");
    expect(text).toContain("온누리상품권");
    expect(text).toContain("urn:aif:term:onnuri-voucher");

    // Verify SVC_ONTOLOGY.fetch was called with X-Organization-Id header
    const ontologyFetch = (env.SVC_ONTOLOGY as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const calls = ontologyFetch.mock.calls as Array<[string, { headers: Record<string, string> }]>;
    expect(calls.some(([url, opts]) => url.includes("/terms?") && opts.headers["X-Organization-Id"] === "LPON")).toBe(true);
  });

  it("foundry_policy_eval calls evaluatePolicy and returns result", async () => {
    const req = orgJsonRpcRequest("LPON", "tools/call", {
      name: "foundry_policy_eval",
      arguments: { context: "사용자가 5만원 충전 요청", policyCode: "pol-gift-charge-001" },
    }, 12);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(body.id).toBe(12);
    const text = body.result.content[0]?.text ?? "";
    expect(text).toContain("APPLICABLE");
    expect(text).toContain("0.88");

    // Verify SVC_SKILL.fetch was called with evaluate endpoint
    const skillFetch = (env.SVC_SKILL as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const calls = skillFetch.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes("/evaluate"))).toBe(true);
  });

  it("unknown meta-tool name returns error", async () => {
    const req = orgJsonRpcRequest("LPON", "tools/call", {
      name: "foundry_nonexistent",
      arguments: { query: "test" },
    }, 14);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { content: Array<{ type: string; text: string }>; isError?: boolean };
    };
    expect(body.id).toBe(14);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain("Unknown tool");
  });

  it("existing policy tool (pol-gift-charge-001) still works after meta-tool addition", async () => {
    const req = orgJsonRpcRequest("LPON", "tools/call", {
      name: "pol-gift-charge-001",
      arguments: { context: "사용자 A가 온누리상품권 5만원 충전 요청" },
    }, 13);
    const res = await handler.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(body.id).toBe(13);
    expect(body.result.content[0]?.text).toContain("APPLICABLE");
  });
});
