import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGenerateHandoff } from "./handoff.js";
import type { Env } from "../env.js";

// ── Fixtures ─────────────────────────────────────────────────────────

const basePolicy = {
  code: "POL-PENSION-WD-HOUSING-001",
  title: "무주택자 중도인출",
  description: "DC형 퇴직연금 가입자가 무주택자인 경우 중도인출 허용 여부 판정",
  condition: "가입자가 무주택자이며 DC형 퇴직연금에 가입한 경우 인출 요청이 들어왔을 때",
  criteria: "무주택 확인서 제출, 가입기간 1년 이상, API /withdrawal/apply 참조, fieldName: withdrawalLimit",
  outcome: "적립금의 50% 이내 중도인출 허용, 초과 시 거절 응답 반환 (withdrawalLimit 갱신)",
  source: {
    documentId: "SRC-001",
    pageRef: "p.12",
    excerpt: "무주택자 확인서 제출 시 중도인출이 가능하며 한도는 적립금의 50%이다 (DB: withdrawal_requests, col: limit_rate)",
  },
  trust: { level: "reviewed" as const, score: 0.9 },
  tags: ["중도인출", "무주택"],
};

const sampleSkillPackage = {
  $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
  skillId: "11111111-2222-3333-4444-555555555555",
  metadata: {
    domain: "PENSION",
    language: "ko",
    version: "1.0.0",
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
    author: "pipeline",
    tags: ["중도인출"],
  },
  policies: [
    basePolicy,
    { ...basePolicy, code: "POL-PENSION-WD-MEDICAL-002", title: "의료비 중도인출" },
    { ...basePolicy, code: "POL-PENSION-WD-EDUCATION-003", title: "교육비 중도인출" },
  ],
  trust: { level: "reviewed" as const, score: 0.88 },
  ontologyRef: {
    graphId: "g-1",
    termUris: ["urn:pension:term:withdrawal", "urn:pension:term:nhowner"],
    skosConceptScheme: "urn:pension:skos:withdrawal",
  },
  provenance: {
    sourceDocumentIds: ["SRC-001"],
    organizationId: "LPON",
    extractedAt: "2026-04-17T00:00:00.000Z",
    pipeline: { stages: ["ingestion", "extraction", "policy", "ontology", "skill"], models: { policy: "claude-opus" } },
  },
  adapters: {},
};

// ── Helpers ───────────────────────────────────────────────────────────

function mockDbWithSkill(skillRow: Record<string, unknown> | null) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(skillRow),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

function mockR2WithPkg(pkg: unknown) {
  return {
    get: vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(pkg),
    }),
  } as unknown as R2Bucket;
}

function makeEnv(db: D1Database, r2: R2Bucket): Env {
  return { DB_SKILL: db, R2_SKILL_PACKAGES: r2 } as unknown as Env;
}

function makeRequest(body: unknown): Request {
  return new Request("https://test.local/handoff/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("POST /handoff/generate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates handoff manifest for existing skill", async () => {
    const skillRow = {
      skill_id: "pension-wd-001",
      organization_id: "LPON",
      domain: "PENSION",
      r2_key: "skills/LPON/pension-wd-001.json",
      status: "published",
      created_at: "2026-04-17T00:00:00.000Z",
      document_ids: JSON.stringify(["SRC-001", "SRC-002"]),
    };
    const db = mockDbWithSkill(skillRow);
    const r2 = mockR2WithPkg(sampleSkillPackage);
    const env = makeEnv(db, r2);
    const req = makeRequest({ orgId: "LPON", skillId: "pension-wd-001", reviewedBy: "REVIEWER-001" });

    const res = await handleGenerateHandoff(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { reportId: string; verdict: string; skillId: string } };
    expect(body.data.reportId).toMatch(/^HPK-LPON-pension-wd-001-/);
    expect(body.data.skillId).toBe("pension-wd-001");
    expect(["APPROVED", "DRAFT", "DENIED"]).toContain(body.data.verdict);
  });

  it("returns 404 if skill not found", async () => {
    const db = mockDbWithSkill(null);
    const r2 = mockR2WithPkg(null);
    const env = makeEnv(db, r2);
    const req = makeRequest({ orgId: "LPON", skillId: "nonexistent-skill" });

    const res = await handleGenerateHandoff(req, env);
    expect(res.status).toBe(404);
  });

  it("returns 400 if orgId is missing", async () => {
    const db = mockDbWithSkill(null);
    const r2 = mockR2WithPkg(null);
    const env = makeEnv(db, r2);
    const req = makeRequest({ skillId: "pension-wd-001" });

    const res = await handleGenerateHandoff(req, env);
    expect(res.status).toBe(400);
  });

  it("sets verdict to DRAFT when no reviewedBy provided", async () => {
    const skillRow = {
      skill_id: "pension-wd-001",
      organization_id: "LPON",
      domain: "PENSION",
      r2_key: "skills/LPON/pension-wd-001.json",
      status: "published",
      created_at: "2026-04-17T00:00:00.000Z",
      document_ids: JSON.stringify(["SRC-001"]),
    };
    const db = mockDbWithSkill(skillRow);
    const r2 = mockR2WithPkg(sampleSkillPackage);
    const env = makeEnv(db, r2);
    const req = makeRequest({ orgId: "LPON", skillId: "pension-wd-001" });

    const res = await handleGenerateHandoff(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { verdict: string } };
    expect(body.data.verdict).toBe("DRAFT");
  });
});
