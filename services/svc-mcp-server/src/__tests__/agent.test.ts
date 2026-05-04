import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../index.js";
import type { Env } from "../env.js";

// ── Mock helpers ────────────────────────────────────────────────────

function createMockEnv(): Env {
  return {
    SVC_SKILL: {
      fetch: vi.fn(async () => new Response("Not Found", { status: 404 })),
    } as unknown as Fetcher,
    INTERNAL_API_SECRET: "test-secret-agent",
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-mcp-server",
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function agentRunRequest(body: unknown): Request {
  return new Request("https://test.workers.dev/agent/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-secret-agent",
    },
    body: JSON.stringify(body),
  });
}

function agentResumeRequest(body: unknown): Request {
  return new Request("https://test.workers.dev/agent/resume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-secret-agent",
    },
    body: JSON.stringify(body),
  });
}

interface AgUiEventParsed {
  type: string;
  runId: string;
  timestamp: number;
  [key: string]: unknown;
}

async function collectSSEEvents(response: Response): Promise<AgUiEventParsed[]> {
  const reader = response.body?.getReader();
  if (!reader) return [];

  const decoder = new TextDecoder();
  const events: AgUiEventParsed[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const dataLine = trimmed
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) continue;

      const jsonStr = dataLine.slice(6);
      try {
        events.push(JSON.parse(jsonStr) as AgUiEventParsed);
      } catch {
        // Skip malformed
      }
    }
  }

  return events;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("AG-UI Agent endpoints", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = createMockEnv();
    ctx = mockCtx();
  });

  describe("POST /agent/run", () => {
    it("returns SSE response with correct headers", async () => {
      const req = agentRunRequest({
        task: "정책 분석",
        organizationId: "org-test",
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
    });

    it("sends RUN_STARTED as first event", async () => {
      const req = agentRunRequest({
        task: "정책 분석",
        organizationId: "org-test",
      });
      const res = await handler.fetch(req, env, ctx);
      const events = await collectSSEEvents(res);

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.type).toBe("RUN_STARTED");
      expect(events[0]?.["agentName"]).toBe("ai-foundry-agent");
      expect(events[0]?.["taskDescription"]).toBe("정책 분석");
    });

    it("sends HITL_REQUEST as last event (F357: HITL flow replaces RUN_FINISHED)", async () => {
      const req = agentRunRequest({
        task: "정책 분석",
        organizationId: "org-test",
      });
      const res = await handler.fetch(req, env, ctx);
      const events = await collectSSEEvents(res);

      expect(events.length).toBeGreaterThan(1);
      const lastEvent = events[events.length - 1];
      expect(lastEvent?.type).toBe("CUSTOM");
      expect(lastEvent?.["subType"]).toBe("HITL_REQUEST");
      expect(typeof lastEvent?.["resumeToken"]).toBe("string");
      expect(lastEvent?.["componentType"]).toBe("PolicyApprovalCard");
    });

    it("returns 400 for invalid request body", async () => {
      const req = agentRunRequest({ invalid: true });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty task", async () => {
      const req = agentRunRequest({ task: "", organizationId: "org-test" });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(400);
    });

    it("returns 401 when not authenticated", async () => {
      const req = new Request("https://test.workers.dev/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "test", organizationId: "org-test" }),
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(401);
    });

    it("includes STATE_SYNC event with widget HTML", async () => {
      const req = agentRunRequest({
        task: "정책 현황 시각화",
        organizationId: "org-test",
      });
      const res = await handler.fetch(req, env, ctx);
      const events = await collectSSEEvents(res);

      const stateSync = events.find((e) => e.type === "STATE_SYNC");
      expect(stateSync).toBeDefined();
      expect(typeof stateSync?.["widgetHtml"]).toBe("string");
      expect(stateSync?.["visualizationType"]).toBe("chart");
    });

    it("sends events in correct sequence (F357: ends with HITL_REQUEST)", async () => {
      const req = agentRunRequest({
        task: "분석 요청",
        organizationId: "org-test",
      });
      const res = await handler.fetch(req, env, ctx);
      const events = await collectSSEEvents(res);

      // Sequence: RUN_STARTED → TOOL_CALL_START → TOOL_CALL_END → STATE_SYNC → CUSTOM/HITL_REQUEST
      expect(events.length).toBe(5);
      expect(events[0]?.type).toBe("RUN_STARTED");
      expect(events[1]?.type).toBe("TOOL_CALL_START");
      expect(events[2]?.type).toBe("TOOL_CALL_END");
      expect(events[3]?.type).toBe("STATE_SYNC");
      expect(events[4]?.type).toBe("CUSTOM");
      expect(events[4]?.["subType"]).toBe("HITL_REQUEST");
    });
  });

  describe("POST /agent/resume", () => {
    it("returns ok response with resumed status", async () => {
      const req = agentResumeRequest({
        resumeToken: "token-123",
        decision: "approve",
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        success: boolean;
        data: { status: string; resumeToken: string };
      };
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("resumed");
      expect(body.data.resumeToken).toBe("token-123");
    });

    it("returns 400 for missing resumeToken", async () => {
      const req = agentResumeRequest({ decision: "approve" });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing decision", async () => {
      const req = agentResumeRequest({ resumeToken: "token-123" });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(400);
    });

    it("returns 401 when not authenticated", async () => {
      const req = new Request("https://test.workers.dev/agent/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "token-123",
          decision: "approve",
        }),
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(401);
    });
  });
});
