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
    const mcpTools = adapter.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    }));
    return Response.json({
      jsonrpc: "2.0",
      result: { tools: mcpTools },
      id: body.id,
    }, { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }

  if (body.method === "tools/call") {
    const params = body.params as { name: string; arguments?: { context?: string; parameters?: string } } | undefined;
    const toolName = params?.name ?? "";
    const context = params?.arguments?.context ?? "";
    const parametersStr = params?.arguments?.parameters;

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
      return handleAgentRun(request);
    }

    if (method === "POST" && path === "/agent/resume") {
      if (!authenticate(request, env)) {
        return Response.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401, headers: corsHeaders() },
        );
      }
      return handleAgentResume(request);
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
