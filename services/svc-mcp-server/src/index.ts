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
import { createLogger } from "@ai-foundry/utils";
import { z } from "zod";
import type { Env } from "./env.js";

const logger = createLogger("svc-mcp-server");

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

// ── Auth ─────────────────────────────────────────────────────────────

function authenticate(request: Request, env: Env): boolean {
  // Check Bearer token
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === env.INTERNAL_API_SECRET) {
      return true;
    }
  }

  // Check X-Internal-Secret header (inter-service)
  const secret = request.headers.get("X-Internal-Secret");
  if (secret === env.INTERNAL_API_SECRET) {
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
