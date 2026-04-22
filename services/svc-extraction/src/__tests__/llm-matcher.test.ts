import { describe, it, expect, afterEach, vi } from "vitest";
import { llmSemanticMatch } from "../factcheck/llm-matcher.js";
import type { MatchResult } from "../factcheck/matcher.js";
import type { DocSpec, SourceApi, SourceTable, DocApi, DocTable } from "../factcheck/types.js";
import type { LlmClientEnv } from "@ai-foundry/utils";

// ── Mock LLM Router ──────────────────────────────────────────────

let mockLlmResponse: string;
const originalFetch = globalThis.fetch;

function mockFetchSuccess() {
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    return Response.json({
      success: true,
      data: { content: mockLlmResponse, provider: "anthropic", model: "sonnet" },
    });
  });
}

function mockFetchError() {
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    return new Response("Internal Server Error", { status: 500 });
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function makeSourceApi(overrides: Partial<SourceApi> = {}): SourceApi {
  return {
    path: "/api/v2/voucher/issue",
    httpMethods: ["POST"],
    methodName: "issueVoucher",
    controllerClass: "VoucherController",
    parameters: [],
    returnType: "ResponseEntity",
    documentId: "src-doc-1",
    sourceFile: "VoucherController.java",
    ...overrides,
  };
}

function makeSourceTable(overrides: Partial<SourceTable> = {}): SourceTable {
  return {
    tableName: "account_balance",
    columns: [
      { name: "account_no", javaProperty: "accountNo", nullable: false, isPrimaryKey: true },
    ],
    source: "mybatis",
    documentId: "src-doc-1",
    sourceFile: "AccountMapper.xml",
    ...overrides,
  };
}

function makeDocApi(overrides: Partial<DocApi> = {}): DocApi {
  return {
    path: "/api/v2/voucher/issue",
    httpMethod: "POST",
    documentId: "doc-doc-1",
    location: "인터페이스설계서.xlsx:Sheet1:Row5",
    ...overrides,
  };
}

function makeDocTable(overrides: Partial<DocTable> = {}): DocTable {
  return {
    tableName: "TB_ACCOUNT_BALANCE",
    columns: [
      { name: "account_no", dataType: "VARCHAR(20)", isPrimaryKey: true },
    ],
    documentId: "doc-doc-1",
    location: "테이블정의서.xlsx:Sheet3:Row2",
    ...overrides,
  };
}

function makeDocSpec(apis: DocApi[] = [], tables: DocTable[] = []): DocSpec {
  return {
    apis,
    tables,
    stats: {
      apiDocCount: apis.length > 0 ? 1 : 0,
      tableDocCount: tables.length > 0 ? 1 : 0,
      totalApis: apis.length,
      totalTables: tables.length,
    },
  };
}

function emptyMatchResult(): MatchResult {
  return {
    matchedItems: [],
    unmatchedSourceApis: [],
    unmatchedDocApis: [],
    unmatchedSourceTables: [],
    unmatchedDocTables: [],
  };
}

function mockEnv(): LlmClientEnv {
  return {
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("llmSemanticMatch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("빈 unmatched → 처리 없음", async () => {
    const mr = emptyMatchResult();
    const docSpec = makeDocSpec();
    mockFetchSuccess();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.stats.processed).toBe(0);
    expect(result.newMatches).toHaveLength(0);
    expect(result.confirmedGaps).toHaveLength(0);
  });

  it("LLM이 found=true 반환 → newMatches에 추가", async () => {
    mockLlmResponse = JSON.stringify({
      found: true,
      docRef: "/api/v2/voucher/publish",
      isNamingDiff: true,
      severity: null,
      reasoning: "issue와 publish는 동일 기능의 다른 표현",
    });

    const mr = emptyMatchResult();
    mr.unmatchedSourceApis = [makeSourceApi({ path: "/api/v2/voucher/issue" })];

    const docSpec = makeDocSpec([makeDocApi({ path: "/api/v2/voucher/publish" })]);
    mockFetchSuccess();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.stats.processed).toBe(1);
    expect(result.stats.matched).toBe(1);
    expect(result.newMatches).toHaveLength(1);
    expect(result.newMatches[0]!.matchMethod).toBe("llm");
    expect(result.newMatches[0]!.matchScore).toBe(0.7); // naming diff → 0.7
    expect(result.newMatches[0]!.sourceRef.name).toBe("/api/v2/voucher/issue");
  });

  it("LLM이 found=false 반환 → confirmedGaps에 추가", async () => {
    mockLlmResponse = JSON.stringify({
      found: false,
      docRef: null,
      isNamingDiff: false,
      severity: "HIGH",
      reasoning: "해당 API는 문서에 전혀 기술되지 않았으며 핵심 비즈니스 기능입니다",
    });

    const mr = emptyMatchResult();
    mr.unmatchedSourceApis = [makeSourceApi({ path: "/api/v2/payment/refund" })];

    const docSpec = makeDocSpec();
    mockFetchSuccess();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.stats.processed).toBe(1);
    expect(result.stats.confirmed).toBe(1);
    expect(result.confirmedGaps).toHaveLength(1);
    expect(result.confirmedGaps[0]!.sourceName).toBe("/api/v2/payment/refund");
    expect(result.confirmedGaps[0]!.severity).toBe("HIGH");
  });

  it("unmatched table도 LLM으로 처리", async () => {
    mockLlmResponse = JSON.stringify({
      found: true,
      docRef: "TB_ACCT_BAL",
      isNamingDiff: true,
      severity: null,
      reasoning: "account_balance와 TB_ACCT_BAL은 동일 테이블의 축약명",
    });

    const mr = emptyMatchResult();
    mr.unmatchedSourceTables = [makeSourceTable({ tableName: "account_balance" })];

    const docSpec = makeDocSpec([], [makeDocTable({ tableName: "TB_ACCT_BAL" })]);
    mockFetchSuccess();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.stats.processed).toBe(1);
    expect(result.newMatches).toHaveLength(1);
    expect(result.newMatches[0]!.sourceRef.type).toBe("table");
    expect(result.newMatches[0]!.matchMethod).toBe("llm");
  });

  it("naming diff가 아닌 found=true → matchScore 0.5", async () => {
    mockLlmResponse = JSON.stringify({
      found: true,
      docRef: "/api/v2/legacy/voucher",
      isNamingDiff: false,
      severity: null,
      reasoning: "레거시 엔드포인트에 유사 기능이 존재함",
    });

    const mr = emptyMatchResult();
    mr.unmatchedSourceApis = [makeSourceApi()];

    const docSpec = makeDocSpec([makeDocApi()]);
    mockFetchSuccess();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.newMatches[0]!.matchScore).toBe(0.5);
  });

  it("LLM 응답이 유효하지 않은 JSON → 에러 처리 (found=false 기본값)", async () => {
    mockLlmResponse = "이것은 JSON이 아닙니다. 분석 결과...";

    const mr = emptyMatchResult();
    mr.unmatchedSourceApis = [makeSourceApi()];

    const docSpec = makeDocSpec();
    mockFetchSuccess();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.stats.processed).toBe(1);
    expect(result.confirmedGaps).toHaveLength(1);
    expect(result.confirmedGaps[0]!.reasoning).toContain("파싱 실패");
  });

  it("LLM 응답에 code fence 감싸져 있어도 파싱 성공", async () => {
    mockLlmResponse = '```json\n{"found":true,"docRef":"/api/v2/test","isNamingDiff":true,"severity":null,"reasoning":"동일 기능"}\n```';

    const mr = emptyMatchResult();
    mr.unmatchedSourceApis = [makeSourceApi()];

    const docSpec = makeDocSpec([makeDocApi()]);
    mockFetchSuccess();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.newMatches).toHaveLength(1);
  });

  it("LLM Router 500 에러 → errors 카운트 증가", async () => {
    const mr = emptyMatchResult();
    mr.unmatchedSourceApis = [makeSourceApi()];

    const docSpec = makeDocSpec();
    mockFetchError();

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.stats.errors).toBe(1);
    expect(result.stats.processed).toBe(0);
    expect(result.newMatches).toHaveLength(0);
    expect(result.confirmedGaps).toHaveLength(0);
  });

  it("복합 시나리오 — API 2개 + table 1개 unmatched", async () => {
    let callCount = 0;
    const responses = [
      JSON.stringify({ found: true, docRef: "/api/match1", isNamingDiff: true, severity: null, reasoning: "매칭" }),
      JSON.stringify({ found: false, docRef: null, isNamingDiff: false, severity: "MEDIUM", reasoning: "누락" }),
      JSON.stringify({ found: true, docRef: "TB_MATCH", isNamingDiff: true, severity: null, reasoning: "테이블 매칭" }),
    ];

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const resp = responses[callCount] ?? '{"found":false,"docRef":null,"isNamingDiff":false,"severity":"MEDIUM","reasoning":"fallback"}';
      callCount++;
      return Response.json({
        success: true,
        data: { content: resp, provider: "anthropic", model: "sonnet" },
      });
    });

    const mr = emptyMatchResult();
    mr.unmatchedSourceApis = [
      makeSourceApi({ path: "/api/v2/a" }),
      makeSourceApi({ path: "/api/v2/b" }),
    ];
    mr.unmatchedSourceTables = [makeSourceTable({ tableName: "tbl_c" })];

    const docSpec = makeDocSpec([makeDocApi()], [makeDocTable()]);

    const result = await llmSemanticMatch(mr, docSpec, mockEnv());

    expect(result.stats.processed).toBe(3);
    expect(result.stats.matched).toBe(2);
    expect(result.stats.confirmed).toBe(1);
    expect(callCount).toBe(3);
  });
});
