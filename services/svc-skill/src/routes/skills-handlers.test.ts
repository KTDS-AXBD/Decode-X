import { describe, it, expect, vi } from "vitest";
import { handleListSkills, handleGetSkill, handleDownloadSkill } from "./skills.js";
import type { Env } from "../env.js";

interface ApiOk<T> { success: true; data: T }

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  // When firstResult is explicitly provided, use it for all .first() calls.
  // Otherwise, default to { cnt: N } for count queries (handleListSkills) or null.
  const defaultFirst = "firstResult" in (overrides ?? {})
    ? (overrides?.firstResult ?? null)
    : { cnt: (overrides?.allResults ?? []).length };

  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(defaultFirst),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

const sampleRow = {
  skill_id: "sk-001",
  ontology_id: "ont-001",
  domain: "퇴직연금",
  subdomain: null,
  language: "ko",
  version: "1.0.0",
  r2_key: "skill-packages/sk-001.skill.json",
  policy_count: 3,
  trust_level: "reviewed",
  trust_score: 0.85,
  tags: '["퇴직연금"]',
  author: "analyst",
  status: "draft",
  created_at: "2026-02-28T00:00:00.000Z",
  updated_at: "2026-02-28T00:00:00.000Z",
};

function mockR2(body?: string) {
  return {
    get: vi.fn().mockResolvedValue(
      body != null
        ? { text: vi.fn().mockResolvedValue(body), arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) }
        : null,
    ),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0], r2Body?: string): Env {
  return {
    DB_SKILL: mockDb(dbOverrides),
    R2_SKILL_PACKAGES: mockR2(r2Body),
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) },
    INTERNAL_API_SECRET: "test",
  } as unknown as Env;
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn() } as unknown as ExecutionContext;
}

// ── handleListSkills ──────────────────────────────────────────────

describe("handleListSkills", () => {
  it("returns empty list with total=0", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/skills");
    const res = await handleListSkills(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ skills: unknown[]; total: number; limit: number }>;
    expect(body.data.skills).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.limit).toBe(50);
  });

  it("returns formatted skills with total", async () => {
    const env = mockEnv({ allResults: [sampleRow] });
    const req = new Request("https://test.internal/skills?domain=퇴직연금");
    const res = await handleListSkills(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ skills: Array<{ skillId: string }>; total: number }>;
    expect(body.data.skills).toHaveLength(1);
    expect(body.data.skills[0]?.skillId).toBe("sk-001");
    expect(body.data.total).toBe(1);
  });

  it("caps limit at 100", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/skills?limit=500");
    const res = await handleListSkills(req, env);
    const body = await res.json() as ApiOk<{ limit: number }>;
    expect(body.data.limit).toBe(100);
  });

  it("applies status and trustLevel filters", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/skills?status=draft&trustLevel=reviewed");
    const res = await handleListSkills(req, env);
    expect(res.status).toBe(200);
  });
});

// ── handleGetSkill ────────────────────────────────────────────────

describe("handleGetSkill", () => {
  it("returns 404 when not found", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/skills/sk-999");
    const res = await handleGetSkill(req, env, "sk-999");
    expect(res.status).toBe(404);
  });

  it("returns skill detail when found", async () => {
    const env = mockEnv({ firstResult: sampleRow });
    const req = new Request("https://test.internal/skills/sk-001");
    const res = await handleGetSkill(req, env, "sk-001");
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ skillId: string; ontologyId: string }>;
    expect(body.data.skillId).toBe("sk-001");
    expect(body.data.ontologyId).toBe("ont-001");
  });
});

// ── handleDownloadSkill ───────────────────────────────────────────

describe("handleDownloadSkill", () => {
  it("returns 404 when skill not in DB", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/skills/sk-999/download");
    const res = await handleDownloadSkill(req, env, "sk-999", mockCtx());
    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 object missing", async () => {
    const env = {
      DB_SKILL: mockDb({ firstResult: { r2_key: "skill-packages/sk-001.skill.json" } }),
      R2_SKILL_PACKAGES: { get: vi.fn().mockResolvedValue(null) },
    } as unknown as Env;
    const req = new Request("https://test.internal/skills/sk-001/download");
    const res = await handleDownloadSkill(req, env, "sk-001", mockCtx());
    expect(res.status).toBe(404);
  });

  it("returns skill package when found", async () => {
    const pkg = JSON.stringify({ skillId: "sk-001" });
    const env = {
      DB_SKILL: mockDb({ firstResult: { r2_key: "skill-packages/sk-001.skill.json" } }),
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(pkg).buffer),
        }),
      },
    } as unknown as Env;

    const req = new Request("https://test.internal/skills/sk-001/download");
    const ctx = mockCtx();
    const res = await handleDownloadSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("sk-001.skill.json");
  });
});
