/**
 * Tests for handleBulkApprovePolicy
 *
 * The function is exported from services/svc-policy/src/routes/hitl.ts.
 * It accepts { policyIds: string[], reviewerId: string, comment?: string }
 * and processes them in bulk.
 *
 * Key behavior:
 * - Pre-validates ALL policyIds upfront; returns 400 if any are invalid/not found
 * - For valid policies without active HITL sessions, adds them to `failed` array
 * - Returns 200 with { approved: string[], failed: [...], total: number }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleBulkApprovePolicy } from "../routes/hitl.js";
import type { Env } from "../env.js";

// ── Type helpers ─────────────────────────────────────────────────────────────

interface ApiOk<T> { success: true; data: T }
interface BulkApproveResult {
  approved: string[];
  failed: Array<{ policyId: string; reason: string }>;
  total: number;
}

// ── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Build a D1Database mock that simulates the two .all() calls that
 * handleBulkApprovePolicy makes:
 *   1st call: SELECT ... FROM policies WHERE policy_id IN (...)
 *   2nd call: SELECT ... FROM hitl_sessions WHERE policy_id IN (...)
 *
 * Subsequent .run() and .first() calls (for UPDATE / INSERT / trust score)
 * all succeed with no-op stubs.
 */
function mockDb(overrides?: {
  allResults?: Record<string, unknown>[];
  sessionResults?: Record<string, unknown>[];
}) {
  let allCallCount = 0;
  const policiesResults = overrides?.allResults ?? [];
  const sessionResults = overrides?.sessionResults ?? [];

  const allFn = vi.fn().mockImplementation(() => {
    allCallCount++;
    // 1st all() = policies query; 2nd all() = sessions query
    if (allCallCount <= 1) {
      return Promise.resolve({ results: policiesResults });
    }
    return Promise.resolve({ results: sessionResults });
  });

  const runFn = vi
    .fn()
    .mockResolvedValue({ success: true, meta: { changes: 1 } });

  const firstFn = vi.fn().mockResolvedValue(null);

  return {
    prepare: vi.fn().mockReturnValue({
      all: allFn,
      bind: vi.fn().mockReturnValue({
        all: allFn,
        first: firstFn,
        run: runFn,
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_POLICY: mockDb(dbOverrides),
    SVC_EXTRACTION: { fetch: vi.fn() } as unknown as Fetcher,
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
    QUEUE_PIPELINE: {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue,
    HITL_SESSION: {
      idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
      get: vi.fn(),
    } as unknown as DurableObjectNamespace,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-policy",
    INTERNAL_API_SECRET: "test-secret",
  };
}

function jsonReq(body: unknown): Request {
  return new Request("https://test.internal/policies/bulk-approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

/** Build candidate policy rows for the DB mock */
function candidateRows(ids: string[], status = "candidate"): Record<string, unknown>[] {
  return ids.map((id) => ({
    policy_id: id,
    status,
    organization_id: "org-test",
  }));
}

/** Build HITL session rows for the DB mock */
function sessionRows(policyIds: string[]): Record<string, unknown>[] {
  return policyIds.map((pid, i) => ({
    policy_id: pid,
    session_id: `session-${i + 1}`,
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("handleBulkApprovePolicy", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
  });

  // ── 1. 성공: 3건 bulk approve ─────────────────────────────────────────────

  it("성공: 3건 candidate 정책을 bulk approve하고 approved 배열에 반환", async () => {
    const ids = ["pol-001", "pol-002", "pol-003"];
    const envWithPolicies = mockEnv({
      allResults: candidateRows(ids),
      sessionResults: sessionRows(ids),
    });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      envWithPolicies,
      ctx,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<BulkApproveResult>;
    expect(body.success).toBe(true);
    expect(body.data.approved).toHaveLength(3);
    expect(body.data.failed).toHaveLength(0);
    expect(body.data.total).toBe(3);
    for (const id of ids) {
      expect(body.data.approved).toContain(id);
    }
  });

  // ── 2. 빈 배열 거부 ───────────────────────────────────────────────────────

  it("빈 policyIds 배열 → 400 반환 (BulkApproveRequestSchema min 1)", async () => {
    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: [], reviewerId: "reviewer-batch" }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  // ── 3. 100건 초과 거부 ────────────────────────────────────────────────────

  it("policyIds 101개 → 400 반환 (BulkApproveRequestSchema max 100)", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `pol-${i}`);
    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  // ── 4. 이미 approved 상태인 policy → 400 반환 ────────────────────────────

  it("이미 approved 상태인 policy가 포함되면 → 400 + invalid 배열에 reason 포함", async () => {
    const ids = ["pol-already", "pol-candidate", "pol-candidate-2"];
    // 첫 번째는 이미 approved 상태
    const mixedRows: Record<string, unknown>[] = [
      { policy_id: "pol-already", status: "approved", organization_id: "org-test" },
      { policy_id: "pol-candidate", status: "candidate", organization_id: "org-test" },
      { policy_id: "pol-candidate-2", status: "candidate", organization_id: "org-test" },
    ];
    const envWithMixed = mockEnv({ allResults: mixedRows });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      envWithMixed,
      ctx,
    );

    // 구현상 ANY invalid → 400으로 전체 거부
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: false; error: { details: { invalid: Array<{ policyId: string; reason: string }> } } };
    expect(body.error.details.invalid).toBeDefined();
    expect(body.error.details.invalid.length).toBeGreaterThanOrEqual(1);

    const failedEntry = body.error.details.invalid.find((e) => e.policyId === "pol-already");
    expect(failedEntry).toBeDefined();
    expect(failedEntry?.reason).toContain("approved");
  });

  // ── 5. 존재하지 않는 ID → 400 반환 ──────────────────────────────────────

  it("존재하지 않는 policy ID → 400 + invalid 배열에 'not found' reason", async () => {
    const missingId = "pol-does-not-exist";

    // DB에 아무 결과 없음
    const envEmpty = mockEnv({ allResults: [] });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: [missingId], reviewerId: "reviewer-batch" }),
      envEmpty,
      ctx,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details: { invalid: Array<{ policyId: string; reason: string }> } } };
    const entry = body.error.details.invalid.find((e) => e.policyId === missingId);
    expect(entry).toBeDefined();
    expect(entry?.reason.toLowerCase()).toContain("not found");
  });

  // ── 6. Queue 이벤트 발행 확인 ─────────────────────────────────────────────

  it("approved된 policy 수만큼 QUEUE_PIPELINE.send가 호출되고 type이 policy.approved", async () => {
    const ids = ["pol-q-001", "pol-q-002", "pol-q-003"];
    const envWithPolicies = mockEnv({
      allResults: candidateRows(ids),
      sessionResults: sessionRows(ids),
    });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      envWithPolicies,
      ctx,
    );

    expect(res.status).toBe(200);

    const sendMock = envWithPolicies.QUEUE_PIPELINE.send as ReturnType<typeof vi.fn>;
    expect(sendMock).toHaveBeenCalledTimes(3);

    for (const call of sendMock.mock.calls) {
      const event = call[0] as Record<string, unknown>;
      expect(event["type"]).toBe("policy.approved");
      expect(typeof event["eventId"]).toBe("string");
    }
  });

  // ── 7. reviewerId 누락 → 400 ─────────────────────────────────────────────

  it("reviewerId 누락 → 400 반환 (BulkApproveRequestSchema validation)", async () => {
    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ["pol-001"] }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  // ── 추가 엣지 케이스 ───────────────────────────────────────────────────────

  it("잘못된 JSON body → 400 반환", async () => {
    const req = new Request("https://test.internal/policies/bulk-approve", {
      method: "POST",
      body: "not-valid-json",
    });
    const res = await handleBulkApprovePolicy(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("policyIds에 비문자열 값 포함 → 400 반환", async () => {
    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: [1, 2, 3], reviewerId: "reviewer-batch" }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("정확히 100건 policyIds → 스키마 허용 (400 아님)", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `pol-${i}`);
    const envWithPolicies = mockEnv({
      allResults: candidateRows(ids),
      sessionResults: sessionRows(ids),
    });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      envWithPolicies,
      ctx,
    );

    // 100건은 schema 상 최대 허용치 → 유효성 검사 통과
    expect(res.status).not.toBe(400);
  });

  it("optional comment 필드 포함 시 오류 없이 처리", async () => {
    const ids = ["pol-comment-test"];
    const envWithPolicies = mockEnv({
      allResults: candidateRows(ids),
      sessionResults: sessionRows(ids),
    });

    const res = await handleBulkApprovePolicy(
      jsonReq({
        policyIds: ids,
        reviewerId: "reviewer-batch",
        comment: "Batch approved after manual spot-check",
      }),
      envWithPolicies,
      ctx,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<BulkApproveResult>;
    expect(body.data.approved).toContain(ids[0]);
  });

  it("HITL session 없는 valid policy → failed 배열에 포함, 200 반환", async () => {
    const ids = ["pol-no-session"];
    // Policy exists (candidate) but NO session in sessionResults
    const envWithPolicies = mockEnv({
      allResults: candidateRows(ids),
      sessionResults: [],  // no active session
    });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      envWithPolicies,
      ctx,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<BulkApproveResult>;
    expect(body.data.failed).toHaveLength(1);
    expect(body.data.failed[0]?.policyId).toBe("pol-no-session");
    expect(body.data.approved).toHaveLength(0);
  });

  it("in_review 상태 policy도 approve 가능", async () => {
    const ids = ["pol-in-review"];
    const envWithPolicies = mockEnv({
      allResults: candidateRows(ids, "in_review"),
      sessionResults: sessionRows(ids),
    });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      envWithPolicies,
      ctx,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<BulkApproveResult>;
    expect(body.data.approved).toContain("pol-in-review");
    expect(body.data.failed).toHaveLength(0);
  });

  it("응답의 total이 요청한 policyIds 수와 동일", async () => {
    const ids = ["pol-a", "pol-b"];
    const envWithPolicies = mockEnv({
      allResults: candidateRows(ids),
      sessionResults: sessionRows(ids),
    });

    const res = await handleBulkApprovePolicy(
      jsonReq({ policyIds: ids, reviewerId: "reviewer-batch" }),
      envWithPolicies,
      ctx,
    );

    const body = (await res.json()) as ApiOk<BulkApproveResult>;
    expect(body.data.total).toBe(ids.length);
  });
});
