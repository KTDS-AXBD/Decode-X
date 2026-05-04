/**
 * AG-UI Protocol — SSE 기반 Agent 실행 스트리밍 엔드포인트.
 * Design Doc: AIF-DSGN-024 §4 AG-UI Protocol, AIF-DSGN-052 F357
 *
 * POST /agent/run    → SSE 스트림으로 에이전트 실행 이벤트 전송 + HITL 세션 KV 저장
 * POST /agent/resume → KV에서 세션 복구 + nextStep 응답 (F357 실구현)
 */

import {
  AgentRunRequestSchema,
  AgentResumeRequestSchema,
} from "@ai-foundry/types";
import type {
  RunStartedEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  StateSyncEvent,
  HitlRequestEvent,
} from "@ai-foundry/types";
import { ok, badRequest, notFound } from "@ai-foundry/utils";
import type { Env } from "../env.js";

// ── KV session constants ─────────────────────────────────────────────

const KV_SESSION_PREFIX = "session:";
const KV_SESSION_TTL = 86_400; // 24h

// ── Session state stored in KV ───────────────────────────────────────

interface AgentSessionState {
  runId: string;
  organizationId: string;
  task: string;
  nextToolCall: { toolName: string; args: Record<string, unknown> } | null;
  hitlComponentType: "PolicyApprovalCard" | "EntityConfirmation" | "ParameterInput";
  hitlProps: Record<string, unknown>;
  createdAt: number;
}

// ── SSE Helpers ──────────────────────────────────────────────────────

function sseEncode(event: Record<string, unknown>): string {
  return `event: ag-ui\ndata: ${JSON.stringify(event)}\n\n`;
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Internal-Secret, Mcp-Session-Id",
  };
}

// ── Sample Widget SVG ────────────────────────────────────────────────

const SAMPLE_WIDGET_HTML = `
<div style="padding: 16px; font-family: system-ui, sans-serif;">
  <h3 style="color: var(--aif-primary, #3b82f6); margin: 0 0 12px 0; font-size: 15px;">정책 분석 결과</h3>
  <svg viewBox="0 0 400 180" style="width: 100%; max-width: 450px;">
    <rect x="30" y="10" width="80" height="120" rx="4" fill="#3b82f6" opacity="0.85"/>
    <rect x="130" y="40" width="80" height="90" rx="4" fill="#8b5cf6" opacity="0.85"/>
    <rect x="230" y="70" width="80" height="60" rx="4" fill="#06b6d4" opacity="0.85"/>
    <text x="70" y="150" text-anchor="middle" font-size="11" fill="#6b7280">승인</text>
    <text x="170" y="150" text-anchor="middle" font-size="11" fill="#6b7280">검토중</text>
    <text x="270" y="150" text-anchor="middle" font-size="11" fill="#6b7280">보류</text>
    <text x="70" y="170" text-anchor="middle" font-size="10" fill="#9ca3af">2,827</text>
    <text x="170" y="170" text-anchor="middle" font-size="10" fill="#9ca3af">148</text>
    <text x="270" y="170" text-anchor="middle" font-size="10" fill="#9ca3af">42</text>
  </svg>
</div>`.trim();

// ── Handlers ─────────────────────────────────────────────────────────

export async function handleAgentRun(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = AgentRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(
      "Invalid request body",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { task, organizationId } = parsed.data;
  const runId = crypto.randomUUID();
  const toolCallId = crypto.randomUUID();

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const streamEvents = async () => {
    try {
      const startEvent: RunStartedEvent = {
        type: "RUN_STARTED",
        timestamp: Date.now(),
        runId,
        agentName: "ai-foundry-agent",
        taskDescription: task,
      };
      await writer.write(encoder.encode(sseEncode(startEvent)));

      const toolStartEvent: ToolCallStartEvent = {
        type: "TOOL_CALL_START",
        timestamp: Date.now(),
        runId,
        toolCallId,
        toolName: "query-policies",
        args: { organizationId, query: task },
      };
      await writer.write(encoder.encode(sseEncode(toolStartEvent)));

      await new Promise((resolve) => setTimeout(resolve, 100));

      const toolEndEvent: ToolCallEndEvent = {
        type: "TOOL_CALL_END",
        timestamp: Date.now(),
        runId,
        toolCallId,
        result: {
          policiesFound: 6,
          topPolicy: "POL-PENSION-WD-HOUSING-001",
          confidence: 0.87,
        },
      };
      await writer.write(encoder.encode(sseEncode(toolEndEvent)));

      const stateSyncEvent: StateSyncEvent = {
        type: "STATE_SYNC",
        timestamp: Date.now(),
        runId,
        widgetHtml: SAMPLE_WIDGET_HTML,
        visualizationType: "chart",
      };
      await writer.write(encoder.encode(sseEncode(stateSyncEvent)));

      // HITL: store session state in KV, then emit HITL_REQUEST
      const resumeToken = crypto.randomUUID();
      const sessionState: AgentSessionState = {
        runId,
        organizationId,
        task,
        nextToolCall: {
          toolName: "confirm-policy",
          args: { policyCode: "POL-PENSION-WD-HOUSING-001", confidence: 0.87 },
        },
        hitlComponentType: "PolicyApprovalCard",
        hitlProps: {
          policyCode: "POL-PENSION-WD-HOUSING-001",
          confidence: 0.87,
          policiesFound: 6,
        },
        createdAt: Date.now(),
      };

      if (env.AGENT_SESSIONS) {
        await env.AGENT_SESSIONS.put(
          `${KV_SESSION_PREFIX}${resumeToken}`,
          JSON.stringify(sessionState),
          { expirationTtl: KV_SESSION_TTL },
        );
      }

      const hitlEvent: HitlRequestEvent = {
        type: "CUSTOM",
        subType: "HITL_REQUEST",
        timestamp: Date.now(),
        runId,
        componentType: "PolicyApprovalCard",
        props: sessionState.hitlProps,
        resumeToken,
      };
      await writer.write(encoder.encode(sseEncode(hitlEvent)));
    } catch {
      // Stream may be closed by client — ignore write errors
    } finally {
      try {
        await writer.close();
      } catch {
        // Already closed
      }
    }
  };

  void streamEvents();

  return new Response(readable, {
    status: 200,
    headers: sseHeaders(),
  });
}

export async function handleAgentResume(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = AgentResumeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(
      "Invalid request body",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { resumeToken, decision } = parsed.data;

  // Degraded mode: KV namespace not bound
  if (!env.AGENT_SESSIONS) {
    return ok({
      status: "resumed",
      resumeToken,
      runId: "unknown",
      nextStep: {
        type: "complete",
        summary: "Session storage unavailable — operating in degraded mode",
      },
    });
  }

  const raw = await env.AGENT_SESSIONS.get(`${KV_SESSION_PREFIX}${resumeToken}`);
  if (!raw) {
    return notFound("session", resumeToken);
  }

  const sessionState = JSON.parse(raw) as AgentSessionState;

  // One-shot: delete session immediately after retrieval
  await env.AGENT_SESSIONS.delete(`${KV_SESSION_PREFIX}${resumeToken}`);

  const nextStep =
    decision === "approve" && sessionState.nextToolCall
      ? {
          type: "tool_call" as const,
          toolName: sessionState.nextToolCall.toolName,
          args: sessionState.nextToolCall.args,
          summary: `정책 승인됨 — ${sessionState.nextToolCall.toolName} 실행 예정`,
        }
      : {
          type: "complete" as const,
          summary: `결정 '${decision}' 처리됨 — 워크플로우 종료`,
        };

  return ok({
    status: "resumed",
    resumeToken,
    runId: sessionState.runId,
    nextStep,
  });
}
