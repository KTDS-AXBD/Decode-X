import { describe, it, expect, vi } from "vitest";
import { handleExportCc } from "./export-cc.js";
import type { Env } from "../env.js";

const SKILL_JSON = JSON.stringify({
  $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
  skillId: "sk-test-001",
  metadata: {
    domain: "퇴직연금",
    language: "ko",
    version: "1.0.0",
    createdAt: "2026-02-28T00:00:00.000Z",
    updatedAt: "2026-02-28T00:00:00.000Z",
    author: "test",
    tags: [],
  },
  policies: [
    {
      code: "POL-PENSION-WD-001",
      title: "중도인출 조건",
      condition: "가입 후 5년 경과",
      criteria: "잔액 50% 이내",
      outcome: "중도인출 허용",
      source: { documentId: "doc-1" },
      trust: { level: "reviewed", score: 0.8 },
      tags: [],
    },
  ],
  trust: { level: "reviewed", score: 0.8 },
  ontologyRef: { graphId: "g-1", termUris: ["urn:1"] },
  provenance: {
    sourceDocumentIds: ["doc-1"],
    organizationId: "org-1",
    extractedAt: "2026-02-28T00:00:00.000Z",
    pipeline: { stages: ["s1"], models: { s1: "claude" } },
  },
  adapters: {},
});

function makeEnv(overrides?: {
  dbRow?: { r2_key: string; name: string | null } | null;
  r2Body?: string | null;
}): Env {
  const dbRow = overrides?.dbRow !== undefined ? overrides.dbRow : { r2_key: "skills/sk-test-001.skill.json", name: "test-skill" };
  const r2Body = overrides?.r2Body !== undefined ? overrides.r2Body : SKILL_JSON;

  return {
    DB_SKILL: {
      prepare: () => ({
        bind: () => ({
          first: vi.fn().mockResolvedValue(dbRow),
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    },
    R2_SKILL_PACKAGES: {
      get: vi.fn().mockResolvedValue(
        r2Body != null ? { text: () => Promise.resolve(r2Body) } : null,
      ),
    },
    KV_SKILL_CACHE: { get: vi.fn(), put: vi.fn() },
    QUEUE_PIPELINE: {} as Queue,
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
    SVC_POLICY: {} as Fetcher,
    SVC_ONTOLOGY: {} as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-skill",
    INTERNAL_API_SECRET: "test-secret",
  } as unknown as Env;
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

describe("handleExportCc", () => {
  it("returns 404 when skill not found in DB", async () => {
    const env = makeEnv({ dbRow: null });
    const req = new Request("http://localhost/skills/sk-missing/export-cc");
    const res = await handleExportCc(req, env, "sk-missing", makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 object missing", async () => {
    const env = makeEnv({ r2Body: null });
    const req = new Request("http://localhost/skills/sk-test-001/export-cc");
    const res = await handleExportCc(req, env, "sk-test-001", makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns ZIP with correct Content-Type", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/skills/sk-test-001/export-cc");
    const res = await handleExportCc(req, env, "sk-test-001", makeCtx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
  });

  it("includes Content-Disposition with filename", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/skills/sk-test-001/export-cc");
    const res = await handleExportCc(req, env, "sk-test-001", makeCtx());
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("cc-skill.zip");
    expect(disposition).toContain("UTF-8''");
  });

  it("returns non-empty body", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/skills/sk-test-001/export-cc");
    const res = await handleExportCc(req, env, "sk-test-001", makeCtx());
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it("records download via waitUntil", async () => {
    const env = makeEnv();
    const ctx = makeCtx();
    const req = new Request("http://localhost/skills/sk-test-001/export-cc");
    await handleExportCc(req, env, "sk-test-001", ctx);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });
});
