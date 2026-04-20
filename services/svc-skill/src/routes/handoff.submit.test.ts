import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSubmitHandoff, handleHandoffCallback } from "./handoff.js";
import type { Env } from "../env.js";
import type { Fetcher } from "@cloudflare/workers-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, path = "/handoff/submit"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": "test-secret",
    },
    body: JSON.stringify(body),
  });
}

function makeManifestRow() {
  return {
    skill_id: "lpon-payment",
    organization_id: "LPON",
    domain: "lpon-payment",
    r2_key: "skills/lpon-payment.json",
    status: "published",
    created_at: "2026-04-20T00:00:00Z",
    document_ids: JSON.stringify(["doc-1"]),
  };
}

function makeSkillPkg() {
  const policy = {
    code: "POL-PAYMENT-APPV-001",
    title: "결제 승인 판정",
    description: "결제 요청 승인 여부 판정 — 잔액과 한도를 기준으로 승인 또는 거절",
    condition: "결제 요청이 수신되고 사용자 잔액이 조회된 경우",
    criteria: "잔액 ≥ 결제 금액이고 일한도 미초과일 것 (API /payment/approve, fieldName: approvalCode)",
    outcome: "결제를 승인하고 approvalCode를 반환하거나 잔액 부족으로 거절 응답 반환",
    source: { documentId: "doc-1", pageRef: "p.3", excerpt: "결제 승인 로직 — 잔액 확인 후 승인" },
    trust: { level: "reviewed" as const, score: 0.9 },
    tags: ["결제", "승인"],
  };
  return {
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId: "lpon-payment",
    metadata: {
      domain: "lpon-payment",
      language: "ko" as const,
      version: "1.0.0",
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
      tags: ["결제"],
    },
    ontologyRef: {
      graphId: "graph-payment",
      termUris: ["urn:lpon:term:payment", "urn:lpon:term:approval"],
      skosConceptScheme: "urn:lpon:skos:payment",
    },
    provenance: {
      sourceDocumentIds: ["doc-1"],
      organizationId: "LPON",
      extractedAt: "2026-04-20T00:00:00.000Z",
      pipeline: {
        stages: ["ingestion", "extraction", "policy", "ontology", "skill"],
        models: { policy: "claude-opus" },
      },
    },
    trust: { level: "reviewed" as const, score: 0.9 },
    adapters: {},
    policies: [
      { ...policy, code: "POL-PAYMENT-APPV-001" },
      { ...policy, code: "POL-PAYMENT-APPV-002" },
      { ...policy, code: "POL-PAYMENT-APPV-003" },
    ],
  };
}

function makeEnv(overrides?: Partial<Env>): Env {
  const mockStmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn().mockResolvedValue({ success: true }),
  };

  const skillRow = makeManifestRow();
  const pkg = makeSkillPkg();

  return {
    DB_SKILL: {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT skill_id")) {
          return { ...mockStmt, first: vi.fn().mockResolvedValue(skillRow) };
        }
        if (sql.includes("tacit_spec_fragments")) {
          return { ...mockStmt, all: vi.fn().mockResolvedValue({ results: [] }) };
        }
        if (sql.includes("SELECT id FROM handoff_jobs")) {
          return { ...mockStmt, first: vi.fn().mockResolvedValue({ id: "HPK-LPON-lpon-payment-test" }) };
        }
        return mockStmt;
      }),
    } as unknown as D1Database,
    R2_SKILL_PACKAGES: {
      get: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(pkg),
      }),
    } as unknown as R2Bucket,
    KV_SKILL_CACHE: {} as KVNamespace,
    QUEUE_PIPELINE: {} as Queue,
    LLM_ROUTER_URL: "http://localhost:8706",
    FOUNDRY_X_URL: "http://localhost:8710",
    SVC_POLICY: {} as unknown as Fetcher,
    SVC_ONTOLOGY: {} as unknown as Fetcher,
    SVC_EXTRACTION: {} as unknown as Fetcher,
    SVC_INGESTION: {} as unknown as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-skill",
    INTERNAL_API_SECRET: "test-secret",
    FOUNDRY_X_SECRET: "fx-secret",
    ...overrides,
  };
}

// ── handleSubmitHandoff ──────────────────────────────────────────────────────

describe("handleSubmitHandoff", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/handoff/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": "test-secret" },
      body: "not-json",
    });
    const res = await handleSubmitHandoff(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 when orgId is missing", async () => {
    const res = await handleSubmitHandoff(makeRequest({ skillId: "lpon-payment" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 409 when gate fails (ai_ready < 0.75)", async () => {
    const env = makeEnv();
    // No policies + no $schema → low AI-ready score (< 0.75)
    (env.R2_SKILL_PACKAGES.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        skillId: "lpon-payment",
        metadata: { domain: "lpon-payment", language: "ko", version: "1.0.0", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:00.000Z", tags: [] },
        ontologyRef: { termUris: [], skosConceptScheme: "" },
        provenance: { sourceDocumentIds: [], organizationId: "LPON", extractedAt: "2026-04-20T00:00:00.000Z", pipeline: { stages: [] } },
        trust: { level: "draft" as const, score: 0.1 },
        adapters: {},
        policies: [],
      }),
    });

    const res = await handleSubmitHandoff(
      makeRequest({ orgId: "LPON", skillId: "lpon-payment" }),
      env,
    );
    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("GATE_FAILED");
  });

  it("returns 502 when Foundry-X is unreachable", async () => {
    const env = makeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

    const res = await handleSubmitHandoff(
      makeRequest({ orgId: "LPON", skillId: "lpon-payment" }),
      env,
    );
    expect(res.status).toBe(502);
    vi.unstubAllGlobals();
  });

  it("returns 201 on successful submission", async () => {
    const env = makeEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ jobId: "proto-lpon-payment-001", status: "queued" }), { status: 200 }),
      ),
    );

    const res = await handleSubmitHandoff(
      makeRequest({ orgId: "LPON", skillId: "lpon-payment" }),
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ success: boolean; data: { jobId: string; foundryJobId: string; status: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("submitted");
    expect(body.data.foundryJobId).toBe("proto-lpon-payment-001");
    vi.unstubAllGlobals();
  });
});

// ── handleHandoffCallback ────────────────────────────────────────────────────

describe("handleHandoffCallback", () => {
  const foundryJobId = "proto-lpon-payment-001";

  it("returns 400 for invalid verdict", async () => {
    const req = makeRequest({ jobId: foundryJobId, verdict: "invalid" }, "/callback/proto-lpon-payment-001");
    const res = await handleHandoffCallback(req, makeEnv(), foundryJobId);
    expect(res.status).toBe(400);
  });

  it("returns 404 when foundry_job_id not found", async () => {
    const env = makeEnv();
    (env.DB_SKILL.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });

    const req = makeRequest({ jobId: foundryJobId, verdict: "green" }, `/callback/${foundryJobId}`);
    const res = await handleHandoffCallback(req, env, foundryJobId);
    expect(res.status).toBe(404);
  });

  it("returns 200 and updates DB on green verdict", async () => {
    const env = makeEnv();
    const req = makeRequest(
      {
        jobId: foundryJobId,
        verdict: "green",
        syncResult: { specMatch: 0.95, codeMatch: 0.92, testMatch: 0.88 },
        roundTripRate: 0.91,
        prototypeUrl: "https://foundry-x.workers.dev/prototypes/proto-001",
      },
      `/callback/${foundryJobId}`,
    );

    const res = await handleHandoffCallback(req, env, foundryJobId);
    expect(res.status).toBe(200);
    const body = await res.json<{ success: boolean; data: { verdict: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.verdict).toBe("green");
  });

  it("accepts yellow and red verdicts", async () => {
    for (const verdict of ["yellow", "red"] as const) {
      const req = makeRequest({ jobId: foundryJobId, verdict }, `/callback/${foundryJobId}`);
      const res = await handleHandoffCallback(req, makeEnv(), foundryJobId);
      expect(res.status).toBe(200);
    }
  });
});
