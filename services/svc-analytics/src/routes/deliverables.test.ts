import { describe, it, expect, vi } from "vitest";
import {
  handleExportInterfaceSpec,
  handleExportBusinessRules,
  handleExportGlossary,
  handleExportGapReport,
  handleExportComparison,
  handleExportAll,
} from "./deliverables.js";
import { renderBusinessRules } from "../renderers/business-rules-renderer.js";
import { renderInterfaceSpec } from "../renderers/interface-spec-renderer.js";
import { renderGlossary, buildHierarchyTree } from "../renderers/glossary-renderer.js";
import { renderGapReport } from "../renderers/gap-report-renderer.js";
import { renderComparison } from "../renderers/comparison-renderer.js";
import type { Env } from "../env.js";
import type { GapOverview, PolicyRow, TermRow, TermStats } from "../collectors/data-collector.js";

/* ─── Mock data ─── */

function mockPerspective(asIs = 10, toBe = 8, matched = 6) {
  return {
    asIsCount: asIs,
    toBeCount: toBe,
    matchedCount: matched,
    gapCount: asIs - matched,
    coveragePct: asIs > 0 ? (matched / asIs) * 100 : 0,
    items: [
      { name: "api-1", source: "code", status: "matched", severity: "LOW", detail: "test" },
      { name: "api-2", source: "document", status: "gap-in-code", severity: "HIGH", detail: "missing" },
    ],
  };
}

function mockOverview(): GapOverview {
  return {
    organizationId: "org-lpon",
    perspectives: {
      process: mockPerspective(5, 3, 2),
      architecture: mockPerspective(4, 4, 3),
      api: mockPerspective(20, 15, 12),
      table: mockPerspective(10, 5, 5),
    },
    sourceStats: {
      controllerCount: 8,
      endpointCount: 20,
      tableCount: 10,
      mapperCount: 5,
      transactionCount: 3,
    },
    generatedAt: "2026-03-09T00:00:00Z",
  };
}

function mockPolicies(): PolicyRow[] {
  return [
    {
      policyId: "p1",
      policyCode: "POL-GIFTVOUCHER-IS-001",
      title: "충전 한도 검증",
      condition: "충전 금액이 한도 초과 시",
      criteria: "일 충전 한도 50만원",
      outcome: "충전 거부 및 안내",
      sourceDocumentId: "doc-1",
      sourcePageRef: "p3",
      sourceExcerpt: null,
      status: "approved",
      trustLevel: "reviewed",
      trustScore: 0.85,
      tags: ["charge"],
      organizationId: "org-lpon",
    },
    {
      policyId: "p2",
      policyCode: "POL-GIFTVOUCHER-US-001",
      title: "사용 제한 확인",
      condition: "상품권 사용 요청 시",
      criteria: "유효기간 내",
      outcome: "사용 승인",
      sourceDocumentId: "doc-2",
      sourcePageRef: null,
      sourceExcerpt: null,
      status: "approved",
      trustLevel: "unreviewed",
      trustScore: 0.6,
      tags: ["usage"],
      organizationId: "org-lpon",
    },
  ];
}

function mockTerms(): TermRow[] {
  return [
    { termId: "t1", ontologyId: "ont-1", label: "상품권", definition: "금액이 표시된 유가증권", skosUri: "skos:giftvoucher", broaderTermId: null, termType: "entity", embeddingModel: "workers-ai" },
    { termId: "t2", ontologyId: "ont-1", label: "충전상품권", definition: "충전 가능한 상품권", skosUri: "skos:charge-voucher", broaderTermId: "t1", termType: "entity", embeddingModel: "workers-ai" },
    { termId: "t3", ontologyId: "ont-1", label: "충전", definition: "금액을 추가", skosUri: "skos:charge", broaderTermId: null, termType: "relationship", embeddingModel: "workers-ai" },
  ];
}

function mockTermStats(): TermStats {
  return { totalTerms: 3, distinctLabels: 3, ontologyCount: 1, typeDistribution: { entity: 2, relationship: 1 } };
}

/* ─── Mock env ─── */

function mockSvcFetcher(response: unknown): Fetcher {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } }),
    ),
  } as unknown as Fetcher;
}

function mockFailingFetcher(): Fetcher {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    ),
  } as unknown as Fetcher;
}

/** SVC_ONTOLOGY receives 2 calls: 1st /terms/stats → TermStats, 2nd /terms → {terms,total} */
function mockOntologyFetcher(): Fetcher {
  return {
    fetch: vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTermStats()), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ terms: mockTerms(), total: 3 }), { status: 200, headers: { "Content-Type": "application/json" } })),
  } as unknown as Fetcher;
}

function mockEnv(overrides?: Partial<Pick<Env, "SVC_POLICY" | "SVC_ONTOLOGY" | "SVC_EXTRACTION">>): Env {
  return {
    DB_ANALYTICS: {} as D1Database,
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-analytics",
    INTERNAL_API_SECRET: "test-secret",
    SVC_POLICY: overrides?.SVC_POLICY ?? mockSvcFetcher({ policies: mockPolicies(), total: 2 }),
    SVC_ONTOLOGY: overrides?.SVC_ONTOLOGY ?? mockOntologyFetcher(),
    SVC_EXTRACTION: overrides?.SVC_EXTRACTION ?? mockSvcFetcher(mockOverview()),
  };
}

/* ─── Renderer unit tests ─── */

describe("renderBusinessRules", () => {
  it("renders markdown with policy table grouped by domain", () => {
    const md = renderBusinessRules(mockPolicies());
    expect(md).toContain("# 업무규칙 정의서");
    expect(md).toContain("POL-GIFTVOUCHER-IS-001");
    expect(md).toContain("POL-GIFTVOUCHER-US-001");
    expect(md).toContain("발행 (Issuance)");
    expect(md).toContain("사용 (Usage)");
    expect(md).toContain("총 규칙 수: 2건");
  });

  it("includes trust level stats", () => {
    const md = renderBusinessRules(mockPolicies());
    expect(md).toContain("reviewed 1건");
    expect(md).toContain("unreviewed 1건");
  });

  it("includes review history placeholder", () => {
    const md = renderBusinessRules(mockPolicies());
    expect(md).toContain("검토 및 조정 이력");
    expect(md).toContain("인터뷰 후 추가");
  });
});

describe("renderInterfaceSpec", () => {
  it("renders markdown with API summary and perspectives", () => {
    const md = renderInterfaceSpec(mockOverview());
    expect(md).toContain("# 인터페이스 설계서");
    expect(md).toContain("컨트롤러 수");
    expect(md).toContain("검증 완료");
    expect(md).toContain("미문서화");
    expect(md).toContain("As-Is vs To-Be");
  });
});

describe("renderGlossary", () => {
  it("renders markdown with term tables and hierarchy tree", () => {
    const md = renderGlossary(mockTerms(), mockTermStats());
    expect(md).toContain("# 용어사전");
    expect(md).toContain("총 용어 수: 3건");
    expect(md).toContain("상품권");
    expect(md).toContain("충전상품권");
    expect(md).toContain("Entity");
  });

  it("builds hierarchy tree correctly", () => {
    const tree = buildHierarchyTree(mockTerms());
    // "상품권" (t1) and "충전" (t3) are roots
    expect(tree.length).toBe(2);
    const root = tree.find(n => n.label === "상품권");
    expect(root).toBeDefined();
    expect(root!.children.length).toBe(1);
    expect(root!.children[0]!.label).toBe("충전상품권");
  });
});

describe("renderGapReport", () => {
  it("renders markdown with executive summary and perspectives", () => {
    const md = renderGapReport(mockOverview());
    expect(md).toContain("# Gap 분석 종합 보고서");
    expect(md).toContain("Executive Summary");
    expect(md).toContain("전체 커버리지");
    expect(md).toContain("분석 방법론");
    expect(md).toContain("Perspective별 분석");
    expect(md).toContain("As-Is vs To-Be 종합 비교");
  });

  it("includes domain gap summary section", () => {
    const md = renderGapReport(mockOverview());
    expect(md).toContain("도메인별 Gap 분포");
  });
});

describe("renderComparison", () => {
  it("renders comparison matrix with all sections", () => {
    const md = renderComparison({ overview: mockOverview(), policyCount: 848, termCount: 7332 });
    expect(md).toContain("As-Is vs To-Be 비교 매트릭스");
    expect(md).toContain("848");
    expect(md).toContain("7332");
    expect(md).toContain("소스코드(As-Is) vs 설계문서(To-Be)");
    expect(md).toContain("기존 산출물(As-Is) vs AI 추출(To-Be)");
  });
});

/* ─── Route handler tests ─── */

describe("handleExportInterfaceSpec", () => {
  it("returns 400 without organizationId", async () => {
    const res = await handleExportInterfaceSpec(new Request("https://test/deliverables/export/interface-spec"), mockEnv());
    expect(res.status).toBe(400);
  });

  it("returns markdown with Content-Disposition", async () => {
    const env = mockEnv();
    const res = await handleExportInterfaceSpec(new Request("https://test/deliverables/export/interface-spec?organizationId=org-lpon"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain("D1-interface-spec-org-lpon");
    const body = await res.text();
    expect(body).toContain("# 인터페이스 설계서");
  });

  it("returns error markdown on collector failure", async () => {
    const env = mockEnv({ SVC_EXTRACTION: mockFailingFetcher() });
    const res = await handleExportInterfaceSpec(new Request("https://test/deliverables/export/interface-spec?organizationId=org-lpon"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("데이터 수집 실패");
  });
});

describe("handleExportBusinessRules", () => {
  it("returns 400 without organizationId", async () => {
    const res = await handleExportBusinessRules(new Request("https://test/deliverables/export/business-rules"), mockEnv());
    expect(res.status).toBe(400);
  });

  it("returns markdown with policy data", async () => {
    const res = await handleExportBusinessRules(new Request("https://test/deliverables/export/business-rules?organizationId=org-lpon"), mockEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("업무규칙 정의서");
    expect(body).toContain("POL-GIFTVOUCHER");
  });
});

describe("handleExportGlossary", () => {
  it("returns markdown with terms", async () => {
    // collectTerms calls: 1st /terms/stats → TermStats, 2nd /terms → {terms, total}
    const env = mockEnv();
    const res = await handleExportGlossary(new Request("https://test/deliverables/export/glossary?organizationId=org-lpon"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("용어사전");
  });
});

describe("handleExportGapReport", () => {
  it("returns markdown with gap analysis", async () => {
    const res = await handleExportGapReport(new Request("https://test/deliverables/export/gap-report?organizationId=org-lpon"), mockEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Gap 분석 종합 보고서");
  });
});

describe("handleExportComparison", () => {
  it("returns comparison matrix", async () => {
    const env = mockEnv();
    const res = await handleExportComparison(new Request("https://test/deliverables/export/comparison?organizationId=org-lpon"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("비교 매트릭스");
  });

  it("handles partial failure gracefully", async () => {
    const env = mockEnv({ SVC_POLICY: mockFailingFetcher(), SVC_ONTOLOGY: mockFailingFetcher() });
    const res = await handleExportComparison(new Request("https://test/deliverables/export/comparison?organizationId=org-lpon"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("비교 매트릭스");
  });
});

describe("handleExportAll", () => {
  it("returns combined document with separators", async () => {
    const env = mockEnv();
    const res = await handleExportAll(new Request("https://test/deliverables/export/all?organizationId=org-lpon"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("인터페이스 설계서");
    expect(body).toContain("업무규칙 정의서");
    expect(body).toContain("Gap 분석 종합 보고서");
    expect(body).toContain("---");
  });

  it("handles complete failure gracefully", async () => {
    const env = mockEnv({
      SVC_EXTRACTION: mockFailingFetcher(),
      SVC_POLICY: mockFailingFetcher(),
      SVC_ONTOLOGY: mockFailingFetcher(),
    });
    const res = await handleExportAll(new Request("https://test/deliverables/export/all?organizationId=org-lpon"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("데이터 수집 실패");
  });
});
