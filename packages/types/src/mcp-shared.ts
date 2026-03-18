/**
 * MCP Shared Types — AI Foundry ↔ Foundry-X 공유 타입
 *
 * 이 파일은 두 프로젝트 간 MCP 연동에 사용되는 공통 타입을 정의해요.
 * AI Foundry의 @ai-foundry/types에서 export되며,
 * Foundry-X에서도 동일한 타입 정의를 사용해요.
 *
 * @see AIF-REQ-026 Phase 1-1 PoC
 */

import { z } from "zod";

// ── MCP Tool (MCP 프로토콜 도구 정의) ───────────────────────────────

export const McpToolInputSchemaZ = z.object({
  type: z.literal("object"),
  properties: z.record(
    z.object({
      type: z.string(),
      description: z.string(),
    }),
  ),
  required: z.array(z.string()),
});

export type McpToolInputSchema = z.infer<typeof McpToolInputSchemaZ>;

export const McpToolAnnotationsZ = z.object({
  title: z.string(),
  readOnlyHint: z.boolean(),
  openWorldHint: z.boolean(),
});

export type McpToolAnnotations = z.infer<typeof McpToolAnnotationsZ>;

export const McpToolZ = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: McpToolInputSchemaZ,
  annotations: McpToolAnnotationsZ.optional(),
});

export type McpTool = z.infer<typeof McpToolZ>;

// ── MCP Adapter Response (AI Foundry → 외부 클라이언트) ─────────────

export const McpAdapterResponseZ = z.object({
  protocolVersion: z.string(),
  capabilities: z.object({
    tools: z.object({ listChanged: z.boolean() }),
  }),
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  instructions: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  tools: z.array(McpToolZ),
  metadata: z.object({
    skillId: z.string(),
    domain: z.string(),
    trustLevel: z.string(),
    trustScore: z.number(),
    generatedAt: z.string(),
  }),
});

export type McpAdapterResponse = z.infer<typeof McpAdapterResponseZ>;

// ── Policy Evaluation Result (tools/call 응답) ─────────────────────

export const PolicyEvalResultZ = z.object({
  result: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  policyCode: z.string(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number(),
});

export type PolicyEvalResult = z.infer<typeof PolicyEvalResultZ>;

// ── MCP Server Registration (Foundry-X registry 등록용) ────────────

export const McpServerRegistrationZ = z.object({
  name: z.string(),
  serverUrl: z.string().url(),
  transportType: z.enum(["sse", "http"]).default("http"),
  apiKey: z.string().optional(),
});

export type McpServerRegistration = z.infer<typeof McpServerRegistrationZ>;
