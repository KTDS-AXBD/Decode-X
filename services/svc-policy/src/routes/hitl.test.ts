import { describe, it, expect, vi } from "vitest";
import {
  handleApprovePolicy,
  handleModifyPolicy,
  handleRejectPolicy,
  handleGetSession,
} from "./hitl.js";
import type { Env } from "../env.js";

interface ApiOk<T> { success: true; data: T }

// ── Mock helpers ──────────────────────────────────────────────────

function jsonReq(body: unknown): Request {
  return new Request("https://test.internal/policies/p-1/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResult?: Record<string, unknown>[];
}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResult ?? [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockDoStub(statusResponse: { status?: string } = { status: "in_progress" }) {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify(statusResponse), { status: 200 }),
    ),
  };
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): {
  env: Env;
  doStub: ReturnType<typeof mockDoStub>;
} {
  const doStub = mockDoStub();
  const db = mockDb(dbOverrides);

  const env = {
    DB_POLICY: db,
    HITL_SESSION: {
      idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
      get: vi.fn().mockReturnValue(doStub),
    },
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) },
    INTERNAL_API_SECRET: "test-secret",
  } as unknown as Env;

  return { env, doStub };
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn() } as unknown as ExecutionContext;
}

// ── handleApprovePolicy ───────────────────────────────────────────

describe("handleApprovePolicy", () => {
  it("returns 400 for invalid JSON body", async () => {
    const { env } = mockEnv();
    const req = new Request("https://test.internal/", {
      method: "POST",
      body: "not-json",
    });
    const res = await handleApprovePolicy(req, env, "p-1", mockCtx());
    expect(res.status).toBe(400);
  });

  it("returns 400 when reviewerId is missing", async () => {
    const { env } = mockEnv();
    const res = await handleApprovePolicy(jsonReq({}), env, "p-1", mockCtx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when policy not found", async () => {
    const { env } = mockEnv({ firstResult: null });
    const res = await handleApprovePolicy(
      jsonReq({ reviewerId: "rev-1" }),
      env,
      "p-1",
      mockCtx(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when policy status is not reviewable", async () => {
    const { env } = mockEnv({ firstResult: { policy_id: "p-1", status: "approved" } });
    const res = await handleApprovePolicy(
      jsonReq({ reviewerId: "rev-1" }),
      env,
      "p-1",
      mockCtx(),
    );
    expect(res.status).toBe(400);
  });

  it("successfully approves a candidate policy", async () => {
    // First call returns policy, second call returns session
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn()
            .mockResolvedValueOnce({ policy_id: "p-1", status: "candidate" })
            .mockResolvedValueOnce({ session_id: "s-1" }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    } as unknown as D1Database;

    const doStub = {
      fetch: vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: "open" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: "in_progress" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed" }), { status: 200 })),
    };

    const env = {
      DB_POLICY: db,
      HITL_SESSION: {
        idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
        get: vi.fn().mockReturnValue(doStub),
      },
      QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Env;

    const ctx = mockCtx();
    const res = await handleApprovePolicy(
      jsonReq({ reviewerId: "rev-1", comment: "LGTM" }),
      env,
      "p-1",
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ policyId: string; status: string }>;
    expect(body.data.policyId).toBe("p-1");
    expect(body.data.status).toBe("approved");
  });
});

// ── handleModifyPolicy ────────────────────────────────────────────

describe("handleModifyPolicy", () => {
  it("returns 400 for missing modifiedFields", async () => {
    const { env } = mockEnv();
    const res = await handleModifyPolicy(
      jsonReq({ reviewerId: "rev-1" }),
      env,
      "p-1",
      mockCtx(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty modifiedFields", async () => {
    const { env } = mockEnv();
    const res = await handleModifyPolicy(
      jsonReq({ reviewerId: "rev-1", modifiedFields: {} }),
      env,
      "p-1",
      mockCtx(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects disallowed field names", async () => {
    const { env } = mockEnv();
    const res = await handleModifyPolicy(
      jsonReq({ reviewerId: "rev-1", modifiedFields: { policyCode: "HACK" } }),
      env,
      "p-1",
      mockCtx(),
    );
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("policyCode");
    expect(body).toContain("cannot be modified");
  });

  it("allows modifying condition, criteria, outcome, title", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn()
            .mockResolvedValueOnce({ policy_id: "p-1", status: "candidate" })
            .mockResolvedValueOnce({ session_id: "s-1" }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    } as unknown as D1Database;

    const doStub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "completed" }), { status: 200 }),
      ),
    };

    const env = {
      DB_POLICY: db,
      HITL_SESSION: {
        idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
        get: vi.fn().mockReturnValue(doStub),
      },
      QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Env;

    const ctx = mockCtx();
    const res = await handleModifyPolicy(
      jsonReq({
        reviewerId: "rev-1",
        modifiedFields: { condition: "updated", title: "new title" },
      }),
      env,
      "p-1",
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ status: string; modifiedFields: Record<string, string> }>;
    expect(body.data.status).toBe("approved");
    expect(body.data.modifiedFields).toEqual({ condition: "updated", title: "new title" });
  });
});

// ── handleRejectPolicy ────────────────────────────────────────────

describe("handleRejectPolicy", () => {
  it("returns 400 for invalid JSON", async () => {
    const { env } = mockEnv();
    const req = new Request("https://test.internal/", { method: "POST", body: "bad" });
    const res = await handleRejectPolicy(req, env, "p-1", mockCtx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when policy not found", async () => {
    const { env } = mockEnv({ firstResult: null });
    const res = await handleRejectPolicy(
      jsonReq({ reviewerId: "rev-1" }),
      env,
      "p-1",
      mockCtx(),
    );
    expect(res.status).toBe(404);
  });

  it("successfully rejects a candidate policy", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn()
            .mockResolvedValueOnce({ policy_id: "p-1", status: "candidate" })
            .mockResolvedValueOnce({ session_id: "s-1" }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    } as unknown as D1Database;

    const doStub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "completed" }), { status: 200 }),
      ),
    };

    const env = {
      DB_POLICY: db,
      HITL_SESSION: {
        idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
        get: vi.fn().mockReturnValue(doStub),
      },
      QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Env;

    const ctx = mockCtx();
    const res = await handleRejectPolicy(
      jsonReq({ reviewerId: "rev-1", comment: "Not valid" }),
      env,
      "p-1",
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ status: string }>;
    expect(body.data.status).toBe("rejected");
  });
});

// ── handleGetSession ──────────────────────────────────────────────

describe("handleGetSession", () => {
  it("returns 404 when session not found", async () => {
    const { env } = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/sessions/s-1");
    const res = await handleGetSession(req, env, "s-1");
    expect(res.status).toBe(404);
  });

  it("proxies DO response when session exists", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ policy_id: "p-1" }),
        }),
      }),
    } as unknown as D1Database;

    const doStub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "in_progress", policyId: "p-1" }), { status: 200 }),
      ),
    };

    const env = {
      DB_POLICY: db,
      HITL_SESSION: {
        idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
        get: vi.fn().mockReturnValue(doStub),
      },
    } as unknown as Env;

    const req = new Request("https://test.internal/sessions/s-1");
    const res = await handleGetSession(req, env, "s-1");
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("in_progress");
  });
});
