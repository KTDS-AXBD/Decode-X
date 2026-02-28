import { describe, it, expect, vi } from "vitest";
import { handleListPolicies, handleGetPolicy } from "./policies.js";
import type { Env } from "../env.js";

interface ApiOk<T> { success: true; data: T }

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return { DB_POLICY: mockDb(dbOverrides) } as unknown as Env;
}

// ── handleListPolicies ────────────────────────────────────────────

describe("handleListPolicies", () => {
  it("returns empty list with defaults", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/policies");
    const res = await handleListPolicies(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ policies: unknown[]; limit: number; offset: number }>;
    expect(body.data.policies).toEqual([]);
    expect(body.data.limit).toBe(50);
    expect(body.data.offset).toBe(0);
  });

  it("returns formatted policies", async () => {
    const env = mockEnv({
      allResults: [
        {
          policy_id: "p-1",
          extraction_id: "e-1",
          organization_id: "org-1",
          policy_code: "POL-PENSION-WD-001",
          title: "테스트",
          condition: "조건",
          criteria: "기준",
          outcome: "결과",
          source_document_id: "doc-1",
          source_page_ref: null,
          source_excerpt: null,
          status: "candidate",
          trust_level: "unreviewed",
          trust_score: 0,
          tags: "[]",
          created_at: "2026-02-28T00:00:00.000Z",
          updated_at: "2026-02-28T00:00:00.000Z",
        },
      ],
    });
    const req = new Request("https://test.internal/policies?extractionId=e-1&limit=10&offset=5");
    const res = await handleListPolicies(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ policies: Array<{ policyId: string }>; limit: number; offset: number }>;
    expect(body.data.policies).toHaveLength(1);
    expect(body.data.policies[0]?.policyId).toBe("p-1");
    expect(body.data.limit).toBe(10);
    expect(body.data.offset).toBe(5);
  });

  it("caps limit at 100", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/policies?limit=999");
    const res = await handleListPolicies(req, env);
    const body = await res.json() as ApiOk<{ limit: number }>;
    expect(body.data.limit).toBe(100);
  });
});

// ── handleGetPolicy ───────────────────────────────────────────────

describe("handleGetPolicy", () => {
  it("returns 404 when not found", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/policies/p-999");
    const res = await handleGetPolicy(req, env, "p-999");
    expect(res.status).toBe(404);
  });

  it("returns formatted policy when found", async () => {
    const env = mockEnv({
      firstResult: {
        policy_id: "p-1",
        extraction_id: "e-1",
        organization_id: "org-1",
        policy_code: "POL-PENSION-WD-001",
        title: "테스트",
        condition: "조건",
        criteria: "기준",
        outcome: "결과",
        source_document_id: "doc-1",
        source_page_ref: "p.5",
        source_excerpt: "excerpt",
        status: "approved",
        trust_level: "reviewed",
        trust_score: 0.85,
        tags: '["퇴직연금"]',
        created_at: "2026-02-28T00:00:00.000Z",
        updated_at: "2026-02-28T00:00:00.000Z",
      },
    });
    const req = new Request("https://test.internal/policies/p-1");
    const res = await handleGetPolicy(req, env, "p-1");
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ policyId: string; trustLevel: string }>;
    expect(body.data.policyId).toBe("p-1");
    expect(body.data.trustLevel).toBe("reviewed");
  });
});
