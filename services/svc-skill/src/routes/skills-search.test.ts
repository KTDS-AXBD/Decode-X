/**
 * Tests for Sprint 2 search enhancements:
 * - Text search (q param)
 * - Tag filter (tag param)
 * - Subdomain filter (subdomain param)
 * - Sort options (sort param)
 * - Total count in response
 * - GET /skills/search/tags endpoint
 * - GET /skills/stats endpoint
 */

import { describe, it, expect, vi } from "vitest";
import {
  handleListSkills,
  handleSearchTags,
  handleGetSkillStats,
} from "./skills.js";
import type { Env } from "../env.js";

// ── Response type helper ─────────────────────────────────────────────

interface ApiOk<T> {
  success: true;
  data: T;
}

// ── Sample rows ──────────────────────────────────────────────────────

const row1 = {
  skill_id: "sk-001",
  ontology_id: "ont-001",
  domain: "퇴직연금",
  subdomain: "중도인출",
  language: "ko",
  version: "1.0.0",
  r2_key: "skill-packages/sk-001.skill.json",
  policy_count: 3,
  trust_level: "reviewed",
  trust_score: 0.85,
  tags: '["퇴직연금","중도인출","주택구입"]',
  author: "analyst-001",
  status: "draft",
  created_at: "2026-02-28T00:00:00.000Z",
  updated_at: "2026-02-28T00:00:00.000Z",
};

const row2 = {
  skill_id: "sk-002",
  ontology_id: "ont-002",
  domain: "퇴직연금",
  subdomain: "연금수령",
  language: "ko",
  version: "1.0.0",
  r2_key: "skill-packages/sk-002.skill.json",
  policy_count: 5,
  trust_level: "validated",
  trust_score: 0.92,
  tags: '["퇴직연금","연금수령"]',
  author: "analyst-002",
  status: "published",
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
};

const row3 = {
  skill_id: "sk-003",
  ontology_id: "ont-003",
  domain: "보험",
  subdomain: null,
  language: "ko",
  version: "2.0.0",
  r2_key: "skill-packages/sk-003.skill.json",
  policy_count: 2,
  trust_level: "unreviewed",
  trust_score: 0.5,
  tags: '["보험","실손보험"]',
  author: "analyst-003",
  status: "draft",
  created_at: "2026-03-02T00:00:00.000Z",
  updated_at: "2026-03-02T00:00:00.000Z",
};

// ── Mock factories ───────────────────────────────────────────────────

/**
 * Creates a mock D1Database that tracks all prepare() calls.
 * Supports multiple sequential prepare() calls with different results
 * via the `callSequence` option, used for handlers that call
 * prepare() more than once (e.g. count + data queries).
 */
function mockDbMulti(callSequence: Array<{
  first?: Record<string, unknown> | null;
  all?: Record<string, unknown>[];
}>) {
  let callIndex = 0;
  return {
    prepare: vi.fn().mockImplementation(() => {
      const idx = callIndex;
      callIndex++;
      const entry = callSequence[idx] ?? callSequence[callSequence.length - 1];
      const methods = {
        first: vi.fn().mockResolvedValue(entry?.first ?? null),
        all: vi.fn().mockResolvedValue({ results: entry?.all ?? [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      return {
        ...methods,
        bind: vi.fn().mockReturnValue(methods),
      };
    }),
  } as unknown as D1Database;
}

function mockEnvWith(db: D1Database): Env {
  return {
    DB_SKILL: db,
    R2_SKILL_PACKAGES: { get: vi.fn(), put: vi.fn() },
    QUEUE_PIPELINE: { send: vi.fn() },
    INTERNAL_API_SECRET: "test",
  } as unknown as Env;
}

// ── handleListSkills — text search (q) ──────────────────────────────

describe("handleListSkills — text search", () => {
  it("applies q param as LIKE across domain, subdomain, author, tags", async () => {
    const db = mockDbMulti([
      { first: { cnt: 1 } },
      { all: [row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?q=중도인출");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{ skills: Array<{ skillId: string }>; total: number }>;
    expect(body.data.skills).toHaveLength(1);
    expect(body.data.total).toBe(1);

    // Verify the prepared SQL contains LIKE clauses
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = prepareCalls[0]?.[0] as string;
    expect(countSql).toContain("LIKE");
    expect(countSql).toContain("domain LIKE");
    expect(countSql).toContain("subdomain LIKE");
    expect(countSql).toContain("author LIKE");
    expect(countSql).toContain("tags LIKE");
  });

  it("returns empty results when q matches nothing", async () => {
    const db = mockDbMulti([
      { first: { cnt: 0 } },
      { all: [] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?q=nonexistent");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{ skills: unknown[]; total: number }>;
    expect(body.data.skills).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("combines q with domain filter", async () => {
    const db = mockDbMulti([
      { first: { cnt: 1 } },
      { all: [row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?domain=퇴직연금&q=주택");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = prepareCalls[0]?.[0] as string;
    expect(countSql).toContain("domain = ?");
    expect(countSql).toContain("LIKE");
  });
});

// ── handleListSkills — tag filter ───────────────────────────────────

describe("handleListSkills — tag filter", () => {
  it("filters by tag using LIKE with JSON pattern", async () => {
    const db = mockDbMulti([
      { first: { cnt: 1 } },
      { all: [row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?tag=주택구입");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{ skills: Array<{ skillId: string }> }>;
    expect(body.data.skills).toHaveLength(1);

    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = prepareCalls[0]?.[0] as string;
    expect(countSql).toContain("tags LIKE ?");
  });

  it("combines tag and q filters", async () => {
    const db = mockDbMulti([
      { first: { cnt: 1 } },
      { all: [row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?tag=퇴직연금&q=인출");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = prepareCalls[0]?.[0] as string;
    // Should have both LIKE from q and LIKE from tag
    const likeCount = (countSql.match(/LIKE/g) ?? []).length;
    expect(likeCount).toBeGreaterThanOrEqual(5); // 4 from q + 1 from tag
  });
});

// ── handleListSkills — subdomain filter ─────────────────────────────

describe("handleListSkills — subdomain filter", () => {
  it("filters by exact subdomain", async () => {
    const db = mockDbMulti([
      { first: { cnt: 1 } },
      { all: [row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?subdomain=중도인출");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = prepareCalls[0]?.[0] as string;
    expect(countSql).toContain("subdomain = ?");
  });

  it("combines domain and subdomain filters", async () => {
    const db = mockDbMulti([
      { first: { cnt: 1 } },
      { all: [row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?domain=퇴직연금&subdomain=중도인출");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = prepareCalls[0]?.[0] as string;
    expect(countSql).toContain("domain = ?");
    expect(countSql).toContain("subdomain = ?");
  });
});

// ── handleListSkills — sort options ─────────────────────────────────

describe("handleListSkills — sort options", () => {
  it("defaults to newest (created_at DESC)", async () => {
    const db = mockDbMulti([
      { first: { cnt: 2 } },
      { all: [row2, row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const dataSql = prepareCalls[1]?.[0] as string;
    expect(dataSql).toContain("ORDER BY created_at DESC");
  });

  it("sorts by oldest (created_at ASC)", async () => {
    const db = mockDbMulti([
      { first: { cnt: 2 } },
      { all: [row1, row2] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?sort=oldest");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const dataSql = prepareCalls[1]?.[0] as string;
    expect(dataSql).toContain("ORDER BY created_at ASC");
  });

  it("sorts by trust_desc (trust_score DESC)", async () => {
    const db = mockDbMulti([
      { first: { cnt: 2 } },
      { all: [row2, row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?sort=trust_desc");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const dataSql = prepareCalls[1]?.[0] as string;
    expect(dataSql).toContain("ORDER BY trust_score DESC");
  });

  it("sorts by trust_asc (trust_score ASC)", async () => {
    const db = mockDbMulti([
      { first: { cnt: 2 } },
      { all: [row3, row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?sort=trust_asc");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const dataSql = prepareCalls[1]?.[0] as string;
    expect(dataSql).toContain("ORDER BY trust_score ASC");
  });

  it("sorts by policy_count (policy_count DESC)", async () => {
    const db = mockDbMulti([
      { first: { cnt: 2 } },
      { all: [row2, row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?sort=policy_count");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const dataSql = prepareCalls[1]?.[0] as string;
    expect(dataSql).toContain("ORDER BY policy_count DESC");
  });

  it("falls back to newest for invalid sort value", async () => {
    const db = mockDbMulti([
      { first: { cnt: 0 } },
      { all: [] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?sort=invalid_sort");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const dataSql = prepareCalls[1]?.[0] as string;
    expect(dataSql).toContain("ORDER BY created_at DESC");
  });
});

// ── handleListSkills — total count ──────────────────────────────────

describe("handleListSkills — total count", () => {
  it("returns total alongside skills, limit, offset", async () => {
    const db = mockDbMulti([
      { first: { cnt: 42 } },
      { all: [row1, row2] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?limit=2&offset=0");
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{
      skills: unknown[];
      total: number;
      limit: number;
      offset: number;
    }>;
    expect(body.data.total).toBe(42);
    expect(body.data.skills).toHaveLength(2);
    expect(body.data.limit).toBe(2);
    expect(body.data.offset).toBe(0);
  });

  it("returns total=0 for empty result set", async () => {
    const db = mockDbMulti([
      { first: { cnt: 0 } },
      { all: [] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills");
    const res = await handleListSkills(req, env);

    const body = (await res.json()) as ApiOk<{ total: number }>;
    expect(body.data.total).toBe(0);
  });

  it("handles null count result gracefully", async () => {
    const db = mockDbMulti([
      { first: null },
      { all: [] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills");
    const res = await handleListSkills(req, env);

    const body = (await res.json()) as ApiOk<{ total: number }>;
    expect(body.data.total).toBe(0);
  });
});

// ── handleSearchTags ────────────────────────────────────────────────

describe("handleSearchTags", () => {
  it("returns unique sorted tags from all non-archived skills", async () => {
    const db = mockDbMulti([
      {
        all: [
          { tags: '["퇴직연금","중도인출","주택구입"]' },
          { tags: '["퇴직연금","연금수령"]' },
          { tags: '["보험","실손보험"]' },
        ],
      },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/search/tags");
    const res = await handleSearchTags(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{ tags: string[] }>;
    expect(body.data.tags).toEqual([
      "보험",
      "실손보험",
      "연금수령",
      "주택구입",
      "중도인출",
      "퇴직연금",
    ]);
  });

  it("returns empty array when no skills exist", async () => {
    const db = mockDbMulti([{ all: [] }]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/search/tags");
    const res = await handleSearchTags(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{ tags: string[] }>;
    expect(body.data.tags).toEqual([]);
  });

  it("handles rows with invalid JSON tags gracefully", async () => {
    const db = mockDbMulti([
      {
        all: [
          { tags: '["valid"]' },
          { tags: "broken-json" },
          { tags: '["another"]' },
        ],
      },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/search/tags");
    const res = await handleSearchTags(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{ tags: string[] }>;
    expect(body.data.tags).toEqual(["another", "valid"]);
  });

  it("deduplicates tags across skills", async () => {
    const db = mockDbMulti([
      {
        all: [
          { tags: '["퇴직연금","중도인출"]' },
          { tags: '["퇴직연금","연금수령"]' },
          { tags: '["퇴직연금"]' },
        ],
      },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/search/tags");
    const res = await handleSearchTags(req, env);

    const body = (await res.json()) as ApiOk<{ tags: string[] }>;
    // Each tag appears exactly once
    expect(body.data.tags).toEqual(["연금수령", "중도인출", "퇴직연금"]);
  });

  it("queries only non-archived skills", async () => {
    const db = mockDbMulti([{ all: [] }]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/search/tags");
    await handleSearchTags(req, env);

    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const sql = prepareCalls[0]?.[0] as string;
    expect(sql).toContain("status != 'archived'");
  });
});

// ── handleGetSkillStats ─────────────────────────────────────────────

describe("handleGetSkillStats", () => {
  it("returns complete stats structure", async () => {
    const db = mockDbMulti([
      // 1st: totals
      { first: { total_skills: 10, total_policies: 25 } },
      // 2nd: trust level breakdown
      {
        all: [
          { trust_level: "unreviewed", cnt: 3 },
          { trust_level: "reviewed", cnt: 5 },
          { trust_level: "validated", cnt: 2 },
        ],
      },
      // 3rd: domain breakdown
      {
        all: [
          { domain: "퇴직연금", cnt: 7 },
          { domain: "보험", cnt: 3 },
        ],
      },
      // 4th: tags for topTags
      {
        all: [
          { tags: '["퇴직연금","중도인출"]' },
          { tags: '["퇴직연금","연금수령"]' },
          { tags: '["보험"]' },
        ],
      },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/stats");
    const res = await handleGetSkillStats(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{
      totalSkills: number;
      totalPolicies: number;
      byTrustLevel: Record<string, number>;
      byDomain: Record<string, number>;
      topTags: Array<{ tag: string; count: number }>;
    }>;

    expect(body.data.totalSkills).toBe(10);
    expect(body.data.totalPolicies).toBe(25);

    expect(body.data.byTrustLevel).toEqual({
      unreviewed: 3,
      reviewed: 5,
      validated: 2,
    });

    expect(body.data.byDomain).toEqual({
      "퇴직연금": 7,
      "보험": 3,
    });

    expect(body.data.topTags).toEqual([
      { tag: "퇴직연금", count: 2 },
      { tag: "보험", count: 1 },
      { tag: "연금수령", count: 1 },
      { tag: "중도인출", count: 1 },
    ]);
  });

  it("returns zeros for empty database", async () => {
    const db = mockDbMulti([
      { first: { total_skills: 0, total_policies: 0 } },
      { all: [] },
      { all: [] },
      { all: [] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/stats");
    const res = await handleGetSkillStats(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{
      totalSkills: number;
      totalPolicies: number;
      byTrustLevel: Record<string, number>;
      byDomain: Record<string, number>;
      topTags: Array<{ tag: string; count: number }>;
    }>;

    expect(body.data.totalSkills).toBe(0);
    expect(body.data.totalPolicies).toBe(0);
    expect(body.data.byTrustLevel).toEqual({ unreviewed: 0, reviewed: 0, validated: 0 });
    expect(body.data.byDomain).toEqual({});
    expect(body.data.topTags).toEqual([]);
  });

  it("handles null totals query result", async () => {
    const db = mockDbMulti([
      { first: null },
      { all: [] },
      { all: [] },
      { all: [] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/stats");
    const res = await handleGetSkillStats(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiOk<{ totalSkills: number; totalPolicies: number }>;
    expect(body.data.totalSkills).toBe(0);
    expect(body.data.totalPolicies).toBe(0);
  });

  it("limits topTags to 20 entries", async () => {
    // Create 25 unique tags
    const tags = Array.from({ length: 25 }, (_, i) => `tag-${String(i + 1).padStart(2, "0")}`);
    const tagRows = tags.map((t) => ({ tags: JSON.stringify([t]) }));

    const db = mockDbMulti([
      { first: { total_skills: 25, total_policies: 50 } },
      { all: [] },
      { all: [] },
      { all: tagRows },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/stats");
    const res = await handleGetSkillStats(req, env);

    const body = (await res.json()) as ApiOk<{ topTags: Array<{ tag: string; count: number }> }>;
    expect(body.data.topTags).toHaveLength(20);
  });

  it("sorts topTags by count descending then alphabetically", async () => {
    const db = mockDbMulti([
      { first: { total_skills: 4, total_policies: 8 } },
      { all: [] },
      { all: [] },
      {
        all: [
          { tags: '["alpha","beta"]' },
          { tags: '["alpha","gamma"]' },
          { tags: '["alpha","beta"]' },
          { tags: '["delta"]' },
        ],
      },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/stats");
    const res = await handleGetSkillStats(req, env);

    const body = (await res.json()) as ApiOk<{ topTags: Array<{ tag: string; count: number }> }>;
    expect(body.data.topTags[0]).toEqual({ tag: "alpha", count: 3 });
    expect(body.data.topTags[1]).toEqual({ tag: "beta", count: 2 });
    // delta and gamma both have count 1, sorted alphabetically
    expect(body.data.topTags[2]).toEqual({ tag: "delta", count: 1 });
    expect(body.data.topTags[3]).toEqual({ tag: "gamma", count: 1 });
  });

  it("initializes all trust levels even if not in DB", async () => {
    const db = mockDbMulti([
      { first: { total_skills: 3, total_policies: 6 } },
      { all: [{ trust_level: "reviewed", cnt: 3 }] },
      { all: [] },
      { all: [] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills/stats");
    const res = await handleGetSkillStats(req, env);

    const body = (await res.json()) as ApiOk<{ byTrustLevel: Record<string, number> }>;
    expect(body.data.byTrustLevel).toEqual({
      unreviewed: 0,
      reviewed: 3,
      validated: 0,
    });
  });
});

// ── handleListSkills — combined filters ─────────────────────────────

describe("handleListSkills — combined filters", () => {
  it("applies all filters together: domain + subdomain + tag + q + sort", async () => {
    const db = mockDbMulti([
      { first: { cnt: 1 } },
      { all: [row1] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request(
      "https://test.internal/skills?domain=퇴직연금&subdomain=중도인출&tag=주택구입&q=analyst&sort=trust_desc",
    );
    const res = await handleListSkills(req, env);

    expect(res.status).toBe(200);
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = prepareCalls[0]?.[0] as string;
    const dataSql = prepareCalls[1]?.[0] as string;

    expect(countSql).toContain("domain = ?");
    expect(countSql).toContain("subdomain = ?");
    expect(countSql).toContain("tags LIKE ?");
    expect(countSql).toContain("domain LIKE");
    expect(dataSql).toContain("ORDER BY trust_score DESC");
  });

  it("pagination with offset and limit", async () => {
    const db = mockDbMulti([
      { first: { cnt: 100 } },
      { all: [row2] },
    ]);
    const env = mockEnvWith(db);
    const req = new Request("https://test.internal/skills?limit=10&offset=20&sort=oldest");
    const res = await handleListSkills(req, env);

    const body = (await res.json()) as ApiOk<{
      total: number;
      limit: number;
      offset: number;
      skills: unknown[];
    }>;
    expect(body.data.total).toBe(100);
    expect(body.data.limit).toBe(10);
    expect(body.data.offset).toBe(20);
  });
});
