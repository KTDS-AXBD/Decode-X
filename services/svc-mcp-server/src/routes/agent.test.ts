import { describe, it, expect, beforeEach } from "vitest";
import { handleAgentResume } from "./agent.js";
import type { Env } from "../env.js";

// ── KV mock — stateful Map-based implementation ──────────────────────

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

// ── Env factory ─────────────────────────────────────────────────────

function makeEnv(kv?: KVNamespace): Env {
  const env: Env = {
    SVC_SKILL: {} as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-mcp-server",
    INTERNAL_API_SECRET: "test-secret",
  };
  if (kv !== undefined) {
    env.AGENT_SESSIONS = kv;
  }
  return env;
}

// ── Session state helper ─────────────────────────────────────────────

function makeSession(runId: string) {
  return JSON.stringify({
    runId,
    organizationId: "org-test",
    task: "테스트 작업",
    nextToolCall: {
      toolName: "confirm-policy",
      args: { policyCode: "POL-PENSION-WD-HOUSING-001" },
    },
    hitlComponentType: "PolicyApprovalCard",
    hitlProps: { policyCode: "POL-PENSION-WD-HOUSING-001", confidence: 0.87 },
    createdAt: Date.now(),
  });
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.com/agent/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("handleAgentResume", () => {
  let kv: KVNamespace;
  const TOKEN = "test-resume-token-uuid-1234";
  const RUN_ID = "run-abc-123";

  beforeEach(async () => {
    kv = createMockKV();
    await kv.put(`session:${TOKEN}`, makeSession(RUN_ID));
  });

  it("approve decision → 200 with nextStep type=tool_call", async () => {
    const req = makeRequest({ resumeToken: TOKEN, decision: "approve" });
    const res = await handleAgentResume(req, makeEnv(kv));

    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { status: string; resumeToken: string; runId: string; nextStep: { type: string; toolName?: string; summary: string } };
    };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("resumed");
    expect(body.data.resumeToken).toBe(TOKEN);
    expect(body.data.runId).toBe(RUN_ID);
    expect(body.data.nextStep.type).toBe("tool_call");
    expect(body.data.nextStep.toolName).toBe("confirm-policy");
    expect(body.data.nextStep.summary).toContain("confirm-policy");
  });

  it("reject decision → 200 with nextStep type=complete", async () => {
    const req = makeRequest({ resumeToken: TOKEN, decision: "reject" });
    const res = await handleAgentResume(req, makeEnv(kv));

    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { nextStep: { type: string; summary: string } };
    };
    expect(body.data.nextStep.type).toBe("complete");
    expect(body.data.nextStep.summary).toContain("reject");
  });

  it("session is deleted after resume (one-shot)", async () => {
    const req = makeRequest({ resumeToken: TOKEN, decision: "approve" });
    await handleAgentResume(req, makeEnv(kv));

    // Second resume with same token should 404
    const req2 = makeRequest({ resumeToken: TOKEN, decision: "approve" });
    const res2 = await handleAgentResume(req2, makeEnv(kv));
    expect(res2.status).toBe(404);
  });

  it("unknown token → 404", async () => {
    const req = makeRequest({ resumeToken: "non-existent-token", decision: "approve" });
    const res = await handleAgentResume(req, makeEnv(kv));

    expect(res.status).toBe(404);
  });

  it("missing AGENT_SESSIONS (degraded mode) → 200 with complete nextStep", async () => {
    const req = makeRequest({ resumeToken: TOKEN, decision: "approve" });
    const res = await handleAgentResume(req, makeEnv(undefined));

    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { nextStep: { type: string; summary: string } };
    };
    expect(body.data.nextStep.type).toBe("complete");
    expect(body.data.nextStep.summary).toContain("degraded");
  });

  it("missing resumeToken in body → 400", async () => {
    const req = makeRequest({ decision: "approve" });
    const res = await handleAgentResume(req, makeEnv(kv));

    expect(res.status).toBe(400);
  });

  it("empty decision → 400", async () => {
    const req = makeRequest({ resumeToken: TOKEN, decision: "" });
    const res = await handleAgentResume(req, makeEnv(kv));

    expect(res.status).toBe(400);
  });
});
