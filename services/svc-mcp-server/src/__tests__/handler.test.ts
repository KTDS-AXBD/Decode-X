import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../index.js";
import type { Env } from "../env.js";

// ── Test data ───────────────────────────────────────────────────────

const mcpAdapterResponse = {
  protocolVersion: "2024-11-05",
  capabilities: { tools: { listChanged: false } },
  serverInfo: { name: "ai-foundry-skill-퇴직연금", version: "1.0.0" },
  instructions: "AI Foundry Skill for 퇴직연금. 2 policy tool(s) available.",
  name: "ai-foundry-skill-퇴직연금",
  version: "1.0.0",
  description: "AI Foundry Skill: 퇴직연금",
  tools: [
    {
      name: "pol-pension-wd-001",
      description: "중도인출 조건 — 가입자가 무주택자이며...",
      inputSchema: {
        type: "object",
        properties: {
          context: { type: "string", description: "적용 대상의 상황 설명" },
          parameters: {
            type: "object",
            description: "판단에 필요한 추가 파라미터",
          },
        },
        required: ["context"],
      },
      annotations: {
        title: "중도인출 조건",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "pol-pension-wd-002",
      description: "의료비 중도인출 — 본인 또는 부양가족 의료비",
      inputSchema: {
        type: "object",
        properties: {
          context: { type: "string", description: "적용 대상의 상황 설명" },
          parameters: {
            type: "object",
            description: "판단에 필요한 추가 파라미터",
          },
        },
        required: ["context"],
      },
      annotations: {
        title: "의료비 중도인출",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
  ],
  metadata: {
    skillId: "sk-001",
    domain: "퇴직연금",
    trustLevel: "reviewed",
    trustScore: 0.85,
    generatedAt: "2026-03-04T00:00:00.000Z",
  },
};

const evaluateResponse = {
  success: true,
  data: {
    evaluationId: "eval-001",
    skillId: "sk-001",
    policyCode: "POL-PENSION-WD-001",
    provider: "anthropic",
    model: "claude-sonnet-4-6-20250514",
    result: "APPLICABLE",
    confidence: 0.92,
    reasoning: "가입자 A는 무주택자 조건 충족, 5년 경과 조건 충족",
    latencyMs: 1200,
  },
};

// ── Mock helpers ────────────────────────────────────────────────────

function createMockEnv(overrides?: Partial<Env>): Env {
  const mockFetch = vi.fn(async (input: RequestInfo) => {
    const url =
      typeof input === "string" ? input : (input as Request).url;

    if (url.includes("/mcp")) {
      return Response.json(mcpAdapterResponse, { status: 200 });
    }
    if (url.includes("/evaluate")) {
      return Response.json(evaluateResponse, { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  });

  return {
    SVC_SKILL: { fetch: mockFetch } as unknown as Fetcher,
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

function jsonRpcRequest(
  skillId: string,
  method: string,
  params?: unknown,
  id?: number,
): Request {
  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
  };
  if (id !== undefined) {
    body["id"] = id;
  }
  if (params !== undefined) {
    body["params"] = params;
  }
  return new Request(`https://test.workers.dev/mcp/${skillId}`, {
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

describe("svc-mcp-server", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = createMockEnv();
    ctx = mockCtx();
  });

  // ── Health ──────────────────────────────────────────────────────

  describe("GET /health", () => {
    it("returns 200 ok", async () => {
      const req = new Request("https://test.workers.dev/health");
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; service: string };
      expect(body.status).toBe("ok");
      expect(body.service).toBe("svc-mcp-server");
    });
  });

  // ── Auth ────────────────────────────────────────────────────────

  describe("Authentication", () => {
    it("rejects requests without auth", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-001", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
        }),
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(401);
    });

    it("accepts Bearer token auth", async () => {
      const req = jsonRpcRequest("sk-001", "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      }, 1);
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);
    });

    it("accepts X-Internal-Secret auth", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-001", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "X-Internal-Secret": "test-secret-123",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);
    });
  });

  // ── CORS ────────────────────────────────────────────────────────

  describe("CORS", () => {
    it("handles OPTIONS preflight", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-001", {
        method: "OPTIONS",
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST",
      );
    });
  });

  // ── MCP Protocol ────────────────────────────────────────────────

  describe("MCP initialize", () => {
    it("returns server info and capabilities", async () => {
      const req = jsonRpcRequest(
        "sk-001",
        "initialize",
        {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "claude-desktop", version: "1.0.0" },
        },
        1,
      );
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
      expect(body.result.protocolVersion).toBeDefined();
      expect(body.result.capabilities.tools).toBeDefined();
      expect(body.result.serverInfo.name).toBe("ai-foundry-skill-퇴직연금");
    });
  });

  describe("MCP tools/list", () => {
    it("returns registered tools from skill adapter", async () => {
      const req = jsonRpcRequest("sk-001", "tools/list", {}, 2);
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        jsonrpc: string;
        id: number;
        result: {
          tools: Array<{
            name: string;
            description: string;
            inputSchema: Record<string, unknown>;
          }>;
        };
      };
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(2);
      expect(body.result.tools).toHaveLength(2);
      expect(body.result.tools[0]?.name).toBe("pol-pension-wd-001");
      expect(body.result.tools[1]?.name).toBe("pol-pension-wd-002");
    });
  });

  describe("MCP tools/call", () => {
    it("delegates to svc-skill evaluate and returns result", async () => {
      const req = jsonRpcRequest(
        "sk-001",
        "tools/call",
        {
          name: "pol-pension-wd-001",
          arguments: {
            context: "가입자 A는 무주택자이며 DC형에 5년 가입",
          },
        },
        3,
      );
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        jsonrpc: string;
        id: number;
        result: {
          content: Array<{ type: string; text: string }>;
        };
      };
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(3);
      expect(body.result.content).toHaveLength(1);
      expect(body.result.content[0]?.type).toBe("text");
      expect(body.result.content[0]?.text).toContain("APPLICABLE");
      expect(body.result.content[0]?.text).toContain("0.92");
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("returns 404 for unknown skill", async () => {
      const env404 = createMockEnv({
        SVC_SKILL: {
          fetch: vi.fn(async () => new Response("Not Found", { status: 404 })),
        } as unknown as Fetcher,
      });

      const req = jsonRpcRequest("sk-nonexistent", "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      }, 1);
      const res = await handler.fetch(req, env404, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 404 for unknown path", async () => {
      const req = new Request("https://test.workers.dev/unknown");
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 405 for unsupported methods on MCP endpoint", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-001", {
        method: "PUT",
        headers: { Authorization: "Bearer test-secret-123" },
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(405);
    });

    it("handles DELETE (session termination) with 202", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-001", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-secret-123" },
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(202);
    });
  });
});
