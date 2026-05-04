/**
 * svc-mcp-server — MCP Server Worker
 *
 * Streamable HTTP MCP Server for AI Foundry Skills.
 * Each skill becomes an independent MCP server endpoint at POST /mcp/:skillId.
 * Claude Desktop connects directly to this Worker to use skill policies as tools.
 *
 * Architecture:
 *   POST /mcp/:skillId → JSON-RPC 2.0 (Streamable HTTP transport)
 *     ├─ initialize → protocol + capabilities
 *     ├─ tools/list → svc-skill GET /skills/:id/mcp → policies as tools
 *     └─ tools/call → svc-skill POST /skills/:id/evaluate → policy evaluation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createLogger, timingSafeCompare } from "@ai-foundry/utils";
import { z } from "zod";
import type { Env } from "./env.js";
import { handleAgentRun, handleAgentResume } from "./routes/agent.js";

const logger = createLogger("svc-mcp-server");

// ── Rate Limiting ────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // per IP per minute

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(request: Request): Response | null {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();

  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    // Cleanup old entries periodically
    if (rateLimitMap.size > 1000) {
      for (const [key, val] of rateLimitMap) {
        if (now >= val.resetAt) rateLimitMap.delete(key);
      }
    }
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Rate limit exceeded. Try again later." },
        id: null,
      },
      {
        status: 429,
        headers: {
          ...corsHeaders(),
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
        },
      },
    );
  }

  return null;
}

// ── Types ───────────────────────────────────────────────────────────

interface McpAdapterTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  annotations?: {
    title: string;
    readOnlyHint: boolean;
    openWorldHint: boolean;
  };
}

interface McpAdapterResponse {
  serverInfo: { name: string; version: string };
  instructions: string;
  tools: McpAdapterTool[];
  metadata: {
    skillId: string;
    domain: string;
    trustLevel: string;
    trustScore: number;
  };
}

interface OrgMcpAdapterResponse {
  serverInfo: { name: string; version: string };
  instructions: string;
  tools: McpAdapterTool[];
  metadata: {
    organizationId: string;
    skillCount: number;
    totalTools: number;
    generatedAt: string;
  };
  _toolSkillMap: Record<string, string>; // toolName → skillId
}

// ── Meta-tools (foundry_* prefix) ─────────────────────────────────

const META_TOOLS: McpAdapterTool[] = [
  {
    name: "foundry_policy_eval",
    description: "AI Foundry 정책 평가 — condition-criteria-outcome 트리플에 대해 비즈니스 컨텍스트를 평가하고 준수 여부를 판정합니다.",
    inputSchema: {
      type: "object",
      properties: {
        policyCode: { type: "string", description: "평가할 정책 코드 (예: POL-GV-CHARGE-001). 생략 시 context 기반 자동 매칭" },
        context: { type: "string", description: "평가 대상 비즈니스 상황 설명" },
        parameters: { type: "string", description: "추가 파라미터 JSON (선택)" },
      },
      required: ["context"],
    },
    annotations: { title: "정책 평가", readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "foundry_skill_query",
    description: "AI Foundry 스킬 검색 — 역공학으로 추출된 도메인 스킬을 키워드, 태그, 서브도메인으로 검색합니다.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색 키워드 (예: '충전', '선물하기')" },
        tags: { type: "string", description: "태그 필터 (쉼표 구분)" },
        subdomain: { type: "string", description: "서브도메인 필터" },
        limit: { type: "string", description: "결과 수 (기본 10)" },
      },
      required: ["query"],
    },
    annotations: { title: "스킬 검색", readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "foundry_ontology_lookup",
    description: "AI Foundry 용어 조회 — SKOS/JSON-LD 기반 도메인 용어사전에서 용어를 검색합니다. 정의, 동의어, SKOS URI를 반환합니다.",
    inputSchema: {
      type: "object",
      properties: {
        term: { type: "string", description: "검색할 용어 (예: '온누리상품권', '충전한도')" },
        includeRelated: { type: "string", description: "관련 용어 포함 여부 (true/false, 기본 true)" },
      },
      required: ["term"],
    },
    annotations: { title: "용어 조회", readOnlyHint: true, openWorldHint: true },
  },
];

interface EvaluateApiResponse {
  success: boolean;
  data: {
    result: string;
    confidence: number;
    reasoning: string;
    policyCode: string;
    provider: string;
    model: string;
    latencyMs: number;
  };
  error?: { message: string };
}

// ── MCP Server Factory ──────────────────────────────────────────────

async function fetchMcpAdapter(
  env: Env,
  skillId: string,
): Promise<McpAdapterResponse | null> {
  const res = await env.SVC_SKILL.fetch(
    `https://svc-skill.internal/skills/${skillId}/mcp`,
    {
      headers: {
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
    },
  );

  if (!res.ok) {
    logger.error("Failed to fetch MCP adapter", {
      skillId,
      status: res.status,
    });
    return null;
  }

  return (await res.json()) as McpAdapterResponse;
}

async function fetchOrgMcpAdapter(
  env: Env,
  orgId: string,
): Promise<OrgMcpAdapterResponse | null> {
  const res = await env.SVC_SKILL.fetch(
    `https://svc-skill.internal/skills/org/${orgId}/mcp`,
    { headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET } },
  );
  if (!res.ok) {
    logger.error("Failed to fetch org MCP adapter", { orgId, status: res.status });
    return null;
  }
  return (await res.json()) as OrgMcpAdapterResponse;
}

async function evaluatePolicy(
  env: Env,
  skillId: string,
  policyCode: string,
  context: string,
  parameters?: Record<string, unknown>,
): Promise<EvaluateApiResponse> {
  const body: Record<string, unknown> = { policyCode, context };
  if (parameters) {
    body["parameters"] = parameters;
  }

  const res = await env.SVC_SKILL.fetch(
    `https://svc-skill.internal/skills/${skillId}/evaluate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify(body),
    },
  );

  return (await res.json()) as EvaluateApiResponse;
}

function createSkillMcpServer(
  adapter: McpAdapterResponse,
  skillId: string,
  env: Env,
): McpServer {
  const server = new McpServer({
    name: adapter.serverInfo.name,
    version: adapter.serverInfo.version,
  });

  // Register each policy as an MCP tool
  for (const tool of adapter.tools) {
    server.tool(
      tool.name,
      tool.description,
      {
        context: z.string().min(1).max(10_000).describe("적용 대상의 상황 설명"),
        parameters: z.string().optional().describe("추가 파라미터 (JSON 문자열)"),
      },
      async ({ context, parameters }) => {
        const policyCode = tool.name.toUpperCase();

        let parsedParams: Record<string, unknown> | undefined;
        if (parameters) {
          try {
            parsedParams = JSON.parse(parameters) as Record<string, unknown>;
          } catch {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: parameters must be valid JSON. Received: ${parameters}`,
                },
              ],
              isError: true,
            };
          }
        }

        try {
          const result = await evaluatePolicy(
            env,
            skillId,
            policyCode,
            context,
            parsedParams,
          );

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `평가 실패: ${result.error?.message ?? "알 수 없는 오류"}`,
                },
              ],
              isError: true,
            };
          }

          const { data } = result;
          const text = [
            `## 정책 평가 결과`,
            ``,
            `**정책**: ${data.policyCode}`,
            `**판정**: ${data.result}`,
            `**신뢰도**: ${data.confidence}`,
            `**모델**: ${data.provider} / ${data.model}`,
            `**응답시간**: ${data.latencyMs}ms`,
            ``,
            `### 근거`,
            data.reasoning,
          ].join("\n");

          return {
            content: [{ type: "text" as const, text }],
          };
        } catch (e) {
          logger.error("tools/call evaluate error", {
            skillId,
            policyCode,
            error: String(e),
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `평가 중 오류 발생: ${String(e)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

// ── JSON-RPC response helpers ─────────────────────────────────────

function jsonRpcSuccess(id: unknown, text: string): Response {
  return Response.json({
    jsonrpc: "2.0",
    result: { content: [{ type: "text", text }] },
    id,
  }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

function jsonRpcError(id: unknown, message: string): Response {
  return Response.json({
    jsonrpc: "2.0",
    result: { content: [{ type: "text", text: `Error: ${message}` }], isError: true },
    id,
  }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

// ── Meta-tool handlers ───────────────────────────────────────────

type ToolCallParams = { name: string; arguments?: Record<string, string> } | undefined;
type JsonRpcBody = { jsonrpc: string; method: string; params?: Record<string, unknown>; id?: unknown };

async function handlePolicyEvalTool(
  body: JsonRpcBody,
  params: ToolCallParams,
  adapter: OrgMcpAdapterResponse,
  env: Env,
  _orgId: string,
): Promise<Response> {
  const context = params?.arguments?.["context"] ?? "";
  const policyCode = params?.arguments?.["policyCode"];
  const parametersStr = params?.arguments?.["parameters"];

  let skillId: string;
  let evalPolicyCode: string;

  if (policyCode) {
    evalPolicyCode = policyCode.toUpperCase();
    skillId = adapter._toolSkillMap[policyCode.toLowerCase()] ?? "";
  } else {
    const firstTool = Object.keys(adapter._toolSkillMap)[0] ?? "";
    skillId = adapter._toolSkillMap[firstTool] ?? "";
    evalPolicyCode = firstTool.toUpperCase();
  }

  if (!skillId) {
    return jsonRpcError(body.id, "매칭되는 정책을 찾을 수 없습니다");
  }

  let parsedParams: Record<string, unknown> | undefined;
  if (parametersStr) {
    try { parsedParams = JSON.parse(parametersStr) as Record<string, unknown>; } catch { /* ignore */ }
  }

  try {
    const result = await evaluatePolicy(env, skillId, evalPolicyCode, context, parsedParams);
    if (!result.success) {
      return jsonRpcError(body.id, result.error?.message ?? "알 수 없는 오류");
    }
    const { data } = result;
    const text = [
      "## 정책 평가 결과", "",
      `**정책**: ${data.policyCode}`,
      `**판정**: ${data.result}`,
      `**신뢰도**: ${data.confidence}`,
      `**모델**: ${data.provider} / ${data.model}`,
      `**응답시간**: ${data.latencyMs}ms`,
      "", "### 근거", data.reasoning,
    ].join("\n");
    return jsonRpcSuccess(body.id, text);
  } catch (e) {
    logger.error("foundry_policy_eval error", { evalPolicyCode, error: String(e) });
    return jsonRpcError(body.id, `평가 중 오류 발생: ${String(e)}`);
  }
}

async function handleSkillQueryTool(
  body: JsonRpcBody,
  params: ToolCallParams,
  env: Env,
  orgId: string,
): Promise<Response> {
  const query = params?.arguments?.["query"] ?? "";
  const tags = params?.arguments?.["tags"] ?? "";
  const subdomain = params?.arguments?.["subdomain"] ?? "";
  const limit = params?.arguments?.["limit"] ?? "10";

  const searchParams = new URLSearchParams({ q: query, limit });
  if (tags) searchParams.set("tags", tags);
  if (subdomain) searchParams.set("subdomain", subdomain);

  try {
    const res = await env.SVC_SKILL.fetch(
      `https://svc-skill.internal/skills?${searchParams}`,
      { headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET, "X-Organization-Id": orgId } },
    );

    if (!res.ok) {
      return jsonRpcError(body.id, `스킬 검색 실패: ${res.status}`);
    }

    const json = await res.json() as { success: boolean; data: { skills: Array<Record<string, unknown>>; total: number } };
    const { skills, total } = json.data;

    const text = [
      `## 스킬 검색 결과 (${total}건)`, "",
      `**검색어**: ${query}`,
      `**조직**: ${orgId}`,
      "",
      ...skills.map((s, i: number) => {
        const meta = s["metadata"] as Record<string, unknown> | undefined;
        const trust = s["trust"] as Record<string, unknown> | undefined;
        const domain = meta?.["domain"] ?? "unknown";
        const subdomain = meta?.["subdomain"] ?? "";
        const trustLevel = trust?.["level"] ?? "unknown";
        const tags = Array.isArray(meta?.["tags"]) ? (meta["tags"] as string[]).slice(0, 3).join(", ") : "";
        return `${i + 1}. **${domain}/${subdomain}** (${s["skillId"]})\n   신뢰도: ${trustLevel} | 정책: ${s["policyCount"]}건${tags ? ` | 태그: ${tags}` : ""}`;
      }),
    ].join("\n");

    return jsonRpcSuccess(body.id, text);
  } catch (e) {
    logger.error("foundry_skill_query error", { orgId, error: String(e) });
    return jsonRpcError(body.id, `스킬 검색 중 오류 발생: ${String(e)}`);
  }
}

async function handleOntologyLookupTool(
  body: JsonRpcBody,
  params: ToolCallParams,
  env: Env,
  orgId: string,
): Promise<Response> {
  const term = params?.arguments?.["term"] ?? "";

  const searchParams = new URLSearchParams({ q: term, limit: "20" });

  try {
    if (!env.SVC_ONTOLOGY) {
      return jsonRpcError(body.id, "SVC_ONTOLOGY binding not configured");
    }

    const res = await env.SVC_ONTOLOGY.fetch(
      `https://svc-ontology.internal/terms?${searchParams}`,
      { headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET, "X-Organization-Id": orgId } },
    );

    if (!res.ok) {
      return jsonRpcError(body.id, `용어 조회 실패: ${res.status}`);
    }

    const json = await res.json() as { success: boolean; data: { terms: Array<Record<string, unknown>>; total?: number } };
    const terms = json.data.terms;
    const total = json.data.total ?? terms.length;

    const text = [
      `## 용어 조회 결과 (${total}건)`, "",
      `**검색어**: ${term}`,
      `**조직**: ${orgId}`,
      "",
      ...terms.map((t, i: number) => {
        const lines = [`${i + 1}. **${t["label"]}** (${t["termType"] ?? "term"})`];
        if (t["definition"]) lines.push(`   정의: ${t["definition"]}`);
        if (t["skosUri"]) lines.push(`   URI: ${t["skosUri"]}`);
        return lines.join("\n");
      }),
    ].join("\n");

    return jsonRpcSuccess(body.id, text);
  } catch (e) {
    logger.error("foundry_ontology_lookup error", { orgId, error: String(e) });
    return jsonRpcError(body.id, `용어 조회 중 오류 발생: ${String(e)}`);
  }
}

/**
 * Handle org-level MCP requests with raw JSON-RPC instead of SDK.
 * Avoids Worker crash from registering 848+ tools via server.tool().
 */
async function handleOrgMcpJsonRpc(
  request: Request,
  adapter: OrgMcpAdapterResponse,
  orgId: string,
  env: Env,
): Promise<Response> {
  const body = (await request.json()) as { jsonrpc: string; method: string; params?: Record<string, unknown>; id?: unknown };

  if (body.method === "initialize") {
    return Response.json({
      jsonrpc: "2.0",
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: adapter.serverInfo,
        instructions: adapter.instructions,
      },
      id: body.id,
    }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }

  if (body.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }

  if (body.method === "tools/list") {
    const policyTools = adapter.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    }));
    const allTools = [...META_TOOLS, ...policyTools];
    return Response.json({
      jsonrpc: "2.0",
      result: { tools: allTools },
      id: body.id,
    }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }

  if (body.method === "tools/call") {
    const params = body.params as ToolCallParams;
    const toolName = params?.name ?? "";

    // ── Meta-tool 분기 (foundry_* prefix) ──
    if (toolName === "foundry_policy_eval") {
      return handlePolicyEvalTool(body, params, adapter, env, orgId);
    }
    if (toolName === "foundry_skill_query") {
      return handleSkillQueryTool(body, params, env, orgId);
    }
    if (toolName === "foundry_ontology_lookup") {
      return handleOntologyLookupTool(body, params, env, orgId);
    }

    // ── 기존 policy tool (policy code 기반) ──
    const context = params?.arguments?.["context"] ?? "";
    const parametersStr = params?.arguments?.["parameters"];

    const policyCode = toolName.toUpperCase();
    const skillId = adapter._toolSkillMap[toolName];
    if (!skillId) {
      return Response.json({
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text: `Error: Unknown tool ${toolName}` }], isError: true },
        id: body.id,
      }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
    }

    let parsedParams: Record<string, unknown> | undefined;
    if (parametersStr) {
      try { parsedParams = JSON.parse(parametersStr) as Record<string, unknown>; }
      catch { return Response.json({
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text: "Error: parameters must be valid JSON" }], isError: true },
        id: body.id,
      }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } }); }
    }

    try {
      const result = await evaluatePolicy(env, skillId, policyCode, context, parsedParams);
      if (!result.success) {
        return Response.json({
          jsonrpc: "2.0",
          result: { content: [{ type: "text", text: `평가 실패: ${result.error?.message ?? "알 수 없는 오류"}` }], isError: true },
          id: body.id,
        }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
      }
      const { data } = result;
      const text = [
        "## 정책 평가 결과", "",
        `**정책**: ${data.policyCode}`,
        `**판정**: ${data.result}`,
        `**신뢰도**: ${data.confidence}`,
        `**모델**: ${data.provider} / ${data.model}`,
        `**응답시간**: ${data.latencyMs}ms`,
        "", "### 근거", data.reasoning,
      ].join("\n");
      return Response.json({
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text }] },
        id: body.id,
      }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
    } catch (e) {
      logger.error("org tools/call error", { orgId, skillId, policyCode, error: String(e) });
      return Response.json({
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text: `평가 중 오류 발생: ${String(e)}` }], isError: true },
        id: body.id,
      }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
    }
  }

  return Response.json({
    jsonrpc: "2.0",
    error: { code: -32601, message: `Method not found: ${body.method}` },
    id: body.id,
  }, { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

// ── Auth ─────────────────────────────────────────────────────────────

function authenticate(request: Request, env: Env): boolean {
  // Check Bearer token
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (timingSafeCompare(token, env.INTERNAL_API_SECRET)) {
      return true;
    }
  }

  // Check X-Internal-Secret header (inter-service)
  const secret = request.headers.get("X-Internal-Secret");
  if (secret && timingSafeCompare(secret, env.INTERNAL_API_SECRET)) {
    return true;
  }

  return false;
}

// ── CORS ─────────────────────────────────────────────────────────────

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Internal-Secret, Mcp-Session-Id",
  };
}

// ── Fetch Handler ───────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check
    if (method === "GET" && path === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: env.SERVICE_NAME }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    // AG-UI Agent endpoints
    if (method === "POST" && path === "/agent/run") {
      if (!authenticate(request, env)) {
        return Response.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401, headers: corsHeaders() },
        );
      }
      return handleAgentRun(request, env);
    }

    if (method === "POST" && path === "/agent/resume") {
      if (!authenticate(request, env)) {
        return Response.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401, headers: corsHeaders() },
        );
      }
      return handleAgentResume(request, env);
    }

    // Org-level MCP endpoint: POST /mcp/org/:orgId
    const orgMcpMatch = path.match(/^\/mcp\/org\/([^/]+)$/);
    if (orgMcpMatch) {
      const orgId = orgMcpMatch[1];
      if (!orgId) return new Response("Not Found", { status: 404 });

      if (!authenticate(request, env)) {
        return Response.json(
          { jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized" }, id: null },
          { status: 401, headers: corsHeaders() },
        );
      }

      const rateLimitResponse = checkRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;

      if (method === "DELETE") {
        return new Response(null, { status: 202, headers: corsHeaders() });
      }
      if (method === "GET") {
        return new Response("SSE not supported in stateless mode", { status: 405, headers: corsHeaders() });
      }
      if (method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
      }

      const adapter = await fetchOrgMcpAdapter(env, orgId);
      if (!adapter) {
        return Response.json(
          { jsonrpc: "2.0", error: { code: -32602, message: `Organization not found: ${orgId}` }, id: null },
          { status: 404, headers: corsHeaders() },
        );
      }

      return handleOrgMcpJsonRpc(request, adapter, orgId, env);
    }

    // MCP endpoint: POST /mcp/:skillId
    const mcpMatch = path.match(/^\/mcp\/([^/]+)$/);
    if (mcpMatch) {
      const skillId = mcpMatch[1];
      if (!skillId) {
        return new Response("Not Found", { status: 404 });
      }

      // Auth check
      if (!authenticate(request, env)) {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Unauthorized" },
            id: null,
          },
          { status: 401, headers: corsHeaders() },
        );
      }

      // Rate limit check (after auth, before MCP processing)
      const rateLimitResponse = checkRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;

      // Handle DELETE (session termination — acknowledge but no-op for stateless)
      if (method === "DELETE") {
        return new Response(null, { status: 202, headers: corsHeaders() });
      }

      // Handle GET (optional SSE stream — not needed for stateless)
      if (method === "GET") {
        return new Response("SSE not supported in stateless mode", {
          status: 405,
          headers: corsHeaders(),
        });
      }

      if (method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: corsHeaders(),
        });
      }

      // Fetch skill's MCP adapter data (tool definitions)
      const adapter = await fetchMcpAdapter(env, skillId);
      if (!adapter) {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32602,
              message: `Skill not found: ${skillId}`,
            },
            id: null,
          },
          { status: 404, headers: corsHeaders() },
        );
      }

      // Create per-request MCP server + transport (stateless, SDK 1.26+ safe)
      const server = createSkillMcpServer(adapter, skillId, env);
      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
      });

      await server.connect(transport);

      const response = await transport.handleRequest(request);

      // Inject CORS headers into the response
      const finalHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders())) {
        finalHeaders.set(key, value as string);
      }

      return new Response(response.body, {
        status: response.status,
        headers: finalHeaders,
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  },
} satisfies ExportedHandler<Env>;
