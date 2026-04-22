import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCreateSession,
  handleSubmitFragment,
  handleGetSession,
  handleCompleteSession,
} from "./tacit-interview.js";
import type { Env } from "../env.js";

// ── Mock helpers ─────────────────────────────────────────────────────

type DbRow = Record<string, unknown>;

function mockDb(options: {
  firstResult?: DbRow | null;
  allResults?: DbRow[];
} = {}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(options.firstResult ?? null),
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue({ results: options.allResults ?? [] }),
      }),
    }),
  } as unknown as D1Database;
}

function stubLlmSuccess(content: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ success: true, data: { content, provider: "anthropic", model: "claude-haiku" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  ));
}

function makeEnv(db: D1Database): Env {
  return { DB_SKILL: db, CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key" } as unknown as Env;
}

function makeRequest(path: string, body: unknown): Request {
  return new Request(`https://test.local${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("POST /tacit-interview/sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a session and returns 201 with session id", async () => {
    const db = mockDb();
    const env = makeEnv(db);
    const req = makeRequest("/tacit-interview/sessions", {
      orgId: "LPON",
      domain: "PENSION",
      smeId: "SME-001",
      department: "퇴직연금사업부",
    });

    const res = await handleCreateSession(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { id: string; status: string } };
    expect(body.data.status).toBe("IN_PROGRESS");
    expect(body.data.id).toBeTruthy();
  });

  it("returns 400 if orgId is missing", async () => {
    const db = mockDb();
    const env = makeEnv(db);
    const req = makeRequest("/tacit-interview/sessions", { domain: "PENSION", smeId: "SME-001" });

    const res = await handleCreateSession(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    const db = mockDb();
    const env = makeEnv(db);
    const req = new Request("https://test.local/tacit-interview/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await handleCreateSession(req, env);
    expect(res.status).toBe(400);
  });
});

describe("POST /tacit-interview/sessions/:id/fragments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts spec fragment and returns 201", async () => {
    stubLlmSuccess(JSON.stringify({
      specContent: "충전 한도는 월 200만원",
      specType: "business",
      confidence: 0.85,
      policyCode: "POL-VOUCHER-CHARGE-LIMIT-001",
    }));

    const db = mockDb({
      firstResult: { id: "INT-ABC", domain: "VOUCHER", fragment_count: 0 },
    });
    const env = makeEnv(db);
    const req = makeRequest("/tacit-interview/sessions/INT-ABC/fragments", {
      category: "constraint",
      question: "충전 한도가 있나요?",
      answer: "월 200만원 한도입니다.",
    });

    const res = await handleSubmitFragment(req, env, "INT-ABC");
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { fragmentId: string; confidence: number } };
    expect(body.data.fragmentId).toMatch(/^TIF-VOUCHER-001$/);
    expect(body.data.confidence).toBe(0.85);
  });

  it("returns 400 if question is empty", async () => {
    const db = mockDb({
      firstResult: { id: "INT-ABC", domain: "VOUCHER", fragment_count: 0 },
    });
    const env = makeEnv(db);
    const req = makeRequest("/tacit-interview/sessions/INT-ABC/fragments", {
      category: "domain",
      question: "",
      answer: "Some answer",
    });

    const res = await handleSubmitFragment(req, env, "INT-ABC");
    expect(res.status).toBe(400);
  });

  it("returns 404 if session not found", async () => {
    const db = mockDb({ firstResult: null });
    const env = makeEnv(db);
    const req = makeRequest("/tacit-interview/sessions/NONEXIST/fragments", {
      category: "domain",
      question: "Q?",
      answer: "A.",
    });

    const res = await handleSubmitFragment(req, env, "NONEXIST");
    expect(res.status).toBe(404);
  });

  it("masks phone numbers in answers", async () => {
    stubLlmSuccess(JSON.stringify({ specContent: "답변 마스킹됨", specType: "business", confidence: 0.7, policyCode: null }));

    let capturedAnswer = "";
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockImplementation((...args: unknown[]) => {
          if (typeof args[4] === "string") capturedAnswer = args[4] as string;
          return { first: vi.fn().mockResolvedValue({ id: "INT-X", domain: "TEST", fragment_count: 0 }), run: vi.fn().mockResolvedValue({ success: true }), all: vi.fn().mockResolvedValue({ results: [] }) };
        }),
      }),
    } as unknown as D1Database;

    const env = makeEnv(db);
    const req = makeRequest("/tacit-interview/sessions/INT-X/fragments", {
      category: "exception",
      question: "담당자 연락처는?",
      answer: "010-1234-5678로 연락하세요",
    });

    await handleSubmitFragment(req, env, "INT-X");
    expect(capturedAnswer).toContain("[PHONE]");
    expect(capturedAnswer).not.toContain("010-1234-5678");
  });
});

describe("GET /tacit-interview/sessions/:id", () => {
  it("returns session with fragments list", async () => {
    const sessionRow = {
      id: "INT-ABC",
      org_id: "LPON",
      domain: "PENSION",
      sme_id: "SME-[MASKED]",
      department: "연금부",
      status: "COMPLETED",
      fragment_count: 2,
      avg_confidence: 0.8,
      created_at: "2026-04-19T00:00:00.000Z",
      completed_at: "2026-04-19T00:30:00.000Z",
    };
    const fragmentRows = [
      { id: "TIF-PENSION-001", category: "domain", spec_content: "spec1", spec_type: "business", confidence: 0.9, policy_code: null, created_at: "2026-04-19T00:10:00.000Z" },
    ];

    const db = {
      prepare: vi.fn()
        .mockReturnValueOnce({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(sessionRow) }) })
        .mockReturnValueOnce({ bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: fragmentRows }) }) }),
    } as unknown as D1Database;

    const env = makeEnv(db);
    const req = new Request("https://test.local/tacit-interview/sessions/INT-ABC");
    const res = await handleGetSession(req, env, "INT-ABC");

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string; fragments: unknown[] } };
    expect(body.data.id).toBe("INT-ABC");
    expect(body.data.fragments).toHaveLength(1);
  });

  it("returns 404 if session not found", async () => {
    const db = mockDb({ firstResult: null });
    const env = makeEnv(db);
    const req = new Request("https://test.local/tacit-interview/sessions/MISSING");
    const res = await handleGetSession(req, env, "MISSING");
    expect(res.status).toBe(404);
  });
});

describe("POST /tacit-interview/sessions/:id/complete", () => {
  it("marks session as COMPLETED", async () => {
    const db = {
      prepare: vi.fn()
        .mockReturnValueOnce({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ id: "INT-X", status: "IN_PROGRESS" }) }) })
        .mockReturnValueOnce({ bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ success: true }) }) }),
    } as unknown as D1Database;

    const env = makeEnv(db);
    const req = new Request("https://test.local/tacit-interview/sessions/INT-X/complete", { method: "POST" });
    const res = await handleCompleteSession(req, env, "INT-X");

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe("COMPLETED");
  });

  it("returns 400 if session already completed", async () => {
    const db = mockDb({ firstResult: { id: "INT-X", status: "COMPLETED" } });
    const env = makeEnv(db);
    const req = new Request("https://test.local/tacit-interview/sessions/INT-X/complete", { method: "POST" });
    const res = await handleCompleteSession(req, env, "INT-X");
    expect(res.status).toBe(400);
  });
});
