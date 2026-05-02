import { describe, it, expect, vi, beforeEach } from "vitest";
import { aggregateSourceSpec, combinePath, extractShortClassName, buildAlternativePaths, stripAppPrefix } from "../factcheck/source-aggregator.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

/** Build a mock Env with SVC_INGESTION fetcher. */
function createMockEnv(fetchResponses: Map<string, unknown>): Env {
  return {
    DB_EXTRACTION: {} as D1Database,
    QUEUE_PIPELINE: { send: vi.fn() } as unknown as Queue,
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
    SVC_INGESTION: {
      fetch: vi.fn().mockImplementation((url: string) => {
        // Match URL pattern against registered responses
        for (const [pattern, data] of fetchResponses) {
          if (url.includes(pattern)) {
            return Promise.resolve(
              new Response(JSON.stringify(data), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
          }
        }
        // Default: empty success
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
        );
      }),
    } as unknown as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-extraction",
    INTERNAL_API_SECRET: "test-secret",
    R2_SPEC_PACKAGES: {} as unknown as R2Bucket,
  };
}

function makeControllerChunkText(overrides?: Partial<{
  className: string;
  basePath: string;
  endpoints: Array<{
    httpMethod: string[];
    path: string;
    methodName: string;
    parameters: Array<{ name: string; type: string; required: boolean }>;
    returnType: string;
    swaggerSummary?: string;
  }>;
  sourceFile: string;
}>): string {
  return JSON.stringify({
    className: overrides?.className ?? "BalanceController",
    packageName: "com.kt.onnuri.controller",
    basePath: overrides?.basePath ?? "/api/balance",
    endpoints: overrides?.endpoints ?? [
      {
        httpMethod: ["GET"],
        path: "/{id}",
        methodName: "getBalance",
        parameters: [{ name: "id", type: "Long", required: true, annotation: "@PathVariable" }],
        returnType: "BalanceVO",
        swaggerSummary: "잔액 조회",
      },
      {
        httpMethod: ["POST"],
        path: "",
        methodName: "createBalance",
        parameters: [{ name: "body", type: "BalanceVO", required: true, annotation: "@RequestBody" }],
        returnType: "ResponseEntity",
      },
    ],
    sourceFile: overrides?.sourceFile ?? "BalanceController.java",
  });
}

function makeMapperChunkText(overrides?: Partial<{
  namespace: string;
  mapperName: string;
  resultMaps: Array<{
    id: string;
    type: string;
    typeName: string;
    columns: Array<{ column: string; property: string; javaType?: string; jdbcType?: string; isPrimaryKey?: boolean }>;
  }>;
  queries: Array<{ id: string; queryType: string; tables: string[]; columnNames: string[] }>;
  tables: string[];
  sourceFile: string;
}>): string {
  return JSON.stringify({
    namespace: overrides?.namespace ?? "com.kt.onnuri.mapper.BalanceMapper",
    mapperName: overrides?.mapperName ?? "BalanceMapper",
    resultMaps: overrides?.resultMaps ?? [
      {
        id: "BalanceResultMap",
        type: "com.kt.onnuri.model.BalanceVO",
        typeName: "BalanceVO",
        columns: [
          { column: "BALANCE_ID", property: "balanceId", javaType: "Long", jdbcType: "BIGINT", isPrimaryKey: true },
          { column: "AMOUNT", property: "amount", javaType: "BigDecimal", jdbcType: "DECIMAL", isPrimaryKey: false },
          { column: "USER_ID", property: "userId", javaType: "String", jdbcType: "VARCHAR", isPrimaryKey: false },
        ],
      },
    ],
    queries: overrides?.queries ?? [
      { id: "selectBalance", queryType: "select", tables: ["TB_BALANCE"], parameterType: "Long", resultMapRef: "BalanceResultMap", columnNames: ["BALANCE_ID", "AMOUNT", "USER_ID"] },
    ],
    tables: overrides?.tables ?? ["TB_BALANCE"],
    sourceFile: overrides?.sourceFile ?? "BalanceMapper.xml",
  });
}

function makeDataModelChunkText(overrides?: Partial<{
  className: string;
  packageName: string;
  fields: Array<{ name: string; type: string; nullable: boolean }>;
  sourceFile: string;
}>): string {
  return JSON.stringify({
    className: overrides?.className ?? "BalanceVO",
    packageName: overrides?.packageName ?? "com.kt.onnuri.model",
    modelType: "vo",
    fields: overrides?.fields ?? [
      { name: "balanceId", type: "Long", nullable: false },
      { name: "amount", type: "BigDecimal", nullable: true },
      { name: "userId", type: "String", nullable: false },
    ],
    sourceFile: overrides?.sourceFile ?? "BalanceVO.java",
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe("aggregateSourceSpec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("빈 소스 문서 → 빈 SourceSpec 반환", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents", {
      success: true,
      data: { documents: [], total: 0 },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    expect(spec.apis).toEqual([]);
    expect(spec.tables).toEqual([]);
    expect(spec.stats.controllerCount).toBe(0);
    expect(spec.stats.endpointCount).toBe(0);
    expect(spec.stats.tableCount).toBe(0);
    expect(spec.stats.mapperCount).toBe(0);
  });

  it("CodeController → SourceApi 변환 (basePath + endpoint.path 결합)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-ctrl-1", status: "parsed", original_name: "test.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-ctrl-1/chunks", {
      success: true,
      data: {
        documentId: "doc-ctrl-1",
        chunks: [
          {
            chunk_id: "c-1",
            chunk_index: 0,
            element_type: "CodeController",
            masked_text: makeControllerChunkText(),
            classification: "source_controller",
            word_count: 100,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    expect(spec.stats.controllerCount).toBe(1);
    expect(spec.stats.endpointCount).toBe(2);
    expect(spec.apis).toHaveLength(2);

    // Verify basePath + endpoint path combination
    const getApi = spec.apis.find((a) => a.methodName === "getBalance");
    expect(getApi).toBeDefined();
    expect(getApi?.path).toBe("/api/balance/{id}");
    expect(getApi?.httpMethods).toEqual(["GET"]);
    expect(getApi?.controllerClass).toBe("BalanceController");
    expect(getApi?.documentId).toBe("doc-ctrl-1");
    expect(getApi?.parameters).toHaveLength(1);
    expect(getApi?.parameters[0]?.name).toBe("id");

    // Empty endpoint path → basePath only
    const postApi = spec.apis.find((a) => a.methodName === "createBalance");
    expect(postApi?.path).toBe("/api/balance");
    expect(postApi?.httpMethods).toEqual(["POST"]);
  });

  it("CodeMapper → SourceTable 변환 (resultMap columns → SourceTableColumn)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-mapper-1", status: "parsed", original_name: "mapper.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-mapper-1/chunks", {
      success: true,
      data: {
        documentId: "doc-mapper-1",
        chunks: [
          {
            chunk_id: "c-m1",
            chunk_index: 0,
            element_type: "CodeMapper",
            masked_text: makeMapperChunkText(),
            classification: "source_mapper",
            word_count: 200,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    expect(spec.stats.mapperCount).toBe(1);
    expect(spec.tables.length).toBeGreaterThanOrEqual(1);

    // Find the table created from resultMap
    const balanceTable = spec.tables.find((t) => t.tableName === "TB_BALANCE");
    expect(balanceTable).toBeDefined();
    expect(balanceTable?.source).toBe("mybatis");
    expect(balanceTable?.voClassName).toBe("BalanceVO");
    expect(balanceTable?.columns).toHaveLength(3);

    const idCol = balanceTable?.columns.find((c) => c.name === "BALANCE_ID");
    expect(idCol?.javaProperty).toBe("balanceId");
    expect(idCol?.isPrimaryKey).toBe(true);
    expect(idCol?.sqlType).toBe("BIGINT");
  });

  it("CodeDataModel VO ↔ Mapper 매칭 (voClassName 교차 참조)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-vo-1", status: "parsed", original_name: "vo.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-vo-1/chunks", {
      success: true,
      data: {
        documentId: "doc-vo-1",
        chunks: [
          {
            chunk_id: "c-dm1",
            chunk_index: 0,
            element_type: "CodeDataModel",
            masked_text: makeDataModelChunkText(),
            classification: "source_vo",
            word_count: 50,
          },
          {
            chunk_id: "c-m2",
            chunk_index: 1,
            element_type: "CodeMapper",
            masked_text: makeMapperChunkText(),
            classification: "source_vo",
            word_count: 150,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    // Mapper resultMap.type "com.kt.onnuri.model.BalanceVO" → short name "BalanceVO"
    // Should match CodeDataModel className "BalanceVO"
    const table = spec.tables.find((t) => t.voClassName === "BalanceVO");
    expect(table).toBeDefined();

    // VO fields should enrich table columns
    const userIdCol = table?.columns.find((c) => c.javaProperty === "userId");
    expect(userIdCol).toBeDefined();
    // VO field nullable=false should override mapper default
    expect(userIdCol?.nullable).toBe(false);

    // javaType from VO enrichment
    const amountCol = table?.columns.find((c) => c.javaProperty === "amount");
    expect(amountCol?.javaType).toBeDefined();
  });

  it("source_* 분류만 필터링 (비소스 문서 제외)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-src", status: "parsed", original_name: "src.zip", file_type: "zip" },
          { document_id: "doc-pdf", status: "parsed", original_name: "report.pdf", file_type: "pdf" },
          { document_id: "doc-pending", status: "pending", original_name: "wait.zip", file_type: "zip" },
        ],
        total: 3,
      },
    });
    // Source doc with CodeController
    responses.set("/documents/doc-src/chunks", {
      success: true,
      data: {
        documentId: "doc-src",
        chunks: [
          {
            chunk_id: "c-src-1",
            chunk_index: 0,
            element_type: "CodeController",
            masked_text: makeControllerChunkText({
              className: "UserController",
              basePath: "/api/user",
              endpoints: [{
                httpMethod: ["GET"],
                path: "/list",
                methodName: "listUsers",
                parameters: [],
                returnType: "List",
              }],
              sourceFile: "UserController.java",
            }),
            classification: "source_controller",
            word_count: 80,
          },
        ],
      },
    });
    // Non-source doc (PDF classification)
    responses.set("/documents/doc-pdf/chunks", {
      success: true,
      data: {
        documentId: "doc-pdf",
        chunks: [
          {
            chunk_id: "c-pdf-1",
            chunk_index: 0,
            element_type: "Title",
            masked_text: "퇴직연금 설계서",
            classification: "requirements",
            word_count: 3,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    // Only the source controller doc should be processed
    expect(spec.apis).toHaveLength(1);
    expect(spec.apis[0]?.controllerClass).toBe("UserController");
    expect(spec.stats.controllerCount).toBe(1);
    // PDF doc and pending doc should be excluded
    expect(spec.tables).toHaveLength(0);
  });

  it("잘못된 JSON chunk는 안전하게 무시", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-bad", status: "parsed", original_name: "bad.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-bad/chunks", {
      success: true,
      data: {
        documentId: "doc-bad",
        chunks: [
          {
            chunk_id: "c-bad",
            chunk_index: 0,
            element_type: "CodeController",
            masked_text: "this is not valid json {{{",
            classification: "source_controller",
            word_count: 5,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    // Should return empty spec without throwing
    expect(spec.apis).toEqual([]);
    expect(spec.stats.controllerCount).toBe(0);
  });
});

// ── Pure helper tests ────────────────────────────────────────────

describe("combinePath", () => {
  it("basePath + endpoint path 결합", () => {
    expect(combinePath("/api/balance", "/{id}")).toBe("/api/balance/{id}");
  });

  it("빈 endpoint path → basePath만 반환", () => {
    expect(combinePath("/api/balance", "")).toBe("/api/balance");
  });

  it("빈 basePath → /endpoint 반환", () => {
    expect(combinePath("", "/list")).toBe("/list");
  });

  it("중복 슬래시 제거", () => {
    expect(combinePath("/api/", "/items")).toBe("/api/items");
  });

  it("basePath에 / 없이 시작", () => {
    expect(combinePath("api/v1", "users")).toBe("/api/v1/users");
  });
});

describe("extractShortClassName", () => {
  it("FQCN에서 짧은 클래스명 추출", () => {
    expect(extractShortClassName("com.kt.onnuri.model.BalanceVO")).toBe("BalanceVO");
  });

  it("패키지 없는 클래스명 → 그대로 반환", () => {
    expect(extractShortClassName("BalanceVO")).toBe("BalanceVO");
  });

  it("중첩 패키지", () => {
    expect(extractShortClassName("a.b.c.d.MyClass")).toBe("MyClass");
  });
});

// ── buildAlternativePaths ────────────────────────────────────────

describe("buildAlternativePaths", () => {
  it("LPON 패턴: basePath + ep.path + methodName 대안 생성", () => {
    const alts = buildAlternativePaths(
      "/onnuripay/v1.0/charge/chargeDealing",
      "insertChargeDeal",
      "/onnuripay/v1.0/charge",
    );
    // Should include: path+methodName, stripped, stripped+methodName, domain-root
    expect(alts.some((a) => a.includes("insertChargeDeal"))).toBe(true);
    // Should include stripped app prefix
    expect(alts.some((a) => a === "/charge/chargeDealing" || a.startsWith("/charge/"))).toBe(true);
  });

  it("methodName이 이미 path 끝에 있으면 중복 대안 제외", () => {
    const alts = buildAlternativePaths(
      "/api/v2/voucher/issue",
      "issue",
      "/api/v2/voucher",
    );
    // /api/v2/voucher/issue/issue 는 생성되지만, 중복 제거됨
    const withoutDups = new Set(alts.map((a) => a.toLowerCase()));
    expect(withoutDups.size).toBe(alts.length);
  });

  it("앱 프리픽스 없는 짧은 경로 → 대안 최소", () => {
    const alts = buildAlternativePaths(
      "/api/users",
      "listUsers",
      "/api",
    );
    // 대안: /api/users/listUsers, domain 경로 등
    expect(alts.some((a) => a.includes("listUsers"))).toBe(true);
  });

  it("빈 methodName → 대안 없거나 최소", () => {
    const alts = buildAlternativePaths(
      "/api/v2/health",
      "",
      "/api/v2",
    );
    // combinePath("/api/v2/health", "") === "/api/v2/health" → 중복으로 제외
    expect(alts.every((a) => a !== "/api/v2/health")).toBe(true);
  });
});

// ── stripAppPrefix ──────────────────────────────────────────────

describe("stripAppPrefix", () => {
  it("LPON 패턴: /onnuripay/v1.0/... → /...", () => {
    expect(stripAppPrefix("/onnuripay/v1.0/charge/chargeDealing"))
      .toBe("/charge/chargeDealing");
  });

  it("버전 없는 v 접두사: /onnuripay/1.0/... → /...", () => {
    expect(stripAppPrefix("/onnuripay/1.0/auth/login"))
      .toBe("/auth/login");
  });

  it("앱 프리픽스 없는 경로 → 원본 반환", () => {
    expect(stripAppPrefix("/api/v2/voucher/issue"))
      .toBe("/api/v2/voucher/issue");
  });

  it("짧은 경로 → 원본 반환", () => {
    expect(stripAppPrefix("/health")).toBe("/health");
  });

  it("루트 경로 → 원본 반환", () => {
    expect(stripAppPrefix("/")).toBe("/");
  });
});

// ── lib-only SourceProjectSummary 처리 ──────────────────────────────

describe("aggregateSourceSpec — lib-only detection", () => {
  it("lib-only zip은 libOnlyProjects에 포함됨", async () => {
    const libOnlySummary = JSON.stringify({
      projectName: "lpon-d7lib",
      stats: { totalFiles: 12, javaFiles: 12, sqlFiles: 0, controllerCount: 0, endpointCount: 0, dataModelCount: 0, transactionCount: 0, ddlTableCount: 0, mapperCount: 0 },
    });
    const normalChunk = JSON.stringify({
      projectName: "lpon-charge",
      stats: { totalFiles: 88, javaFiles: 60, sqlFiles: 12, controllerCount: 14, endpointCount: 47, dataModelCount: 22, transactionCount: 31, ddlTableCount: 8, mapperCount: 9 },
    });

    const fetchResponses = new Map<string, unknown>([
      ["/documents?", {
        success: true,
        data: {
          documents: [
            { document_id: "doc-lib", status: "parsed", original_name: "lpon-d7lib.zip", file_type: "zip" },
            { document_id: "doc-normal", status: "parsed", original_name: "lpon-charge.zip", file_type: "zip" },
          ],
        },
      }],
      ["/documents/doc-lib/chunks", {
        success: true,
        data: {
          chunks: [
            { chunk_id: "c1", chunk_index: 0, element_type: "SourceProjectSummary", masked_text: libOnlySummary, classification: "source_project", word_count: 10 },
          ],
        },
      }],
      ["/documents/doc-normal/chunks", {
        success: true,
        data: {
          chunks: [
            { chunk_id: "c2", chunk_index: 0, element_type: "SourceProjectSummary", masked_text: normalChunk, classification: "source_project", word_count: 20 },
          ],
        },
      }],
      ["/documents/doc-lib/download", { success: false }],
      ["/documents/doc-normal/download", { success: false }],
    ]);

    const env = createMockEnv(fetchResponses);
    const spec = await aggregateSourceSpec(env, "org-1");

    expect(spec.libOnlyProjects).toBeDefined();
    expect(spec.libOnlyProjects?.length).toBe(1);
    expect(spec.libOnlyProjects?.[0]?.documentId).toBe("doc-lib");
    expect(spec.libOnlyProjects?.[0]?.projectName).toBe("lpon-d7lib");
  });

  it("normal zip은 libOnlyProjects에 포함 안 됨", async () => {
    const normalChunk = JSON.stringify({
      projectName: "lpon-charge",
      stats: { totalFiles: 88, javaFiles: 60, sqlFiles: 12, controllerCount: 14, endpointCount: 47, dataModelCount: 22, transactionCount: 31, ddlTableCount: 8, mapperCount: 9 },
    });
    const fetchResponses = new Map<string, unknown>([
      ["/documents?", {
        success: true,
        data: {
          documents: [
            { document_id: "doc-1", status: "parsed", original_name: "lpon-charge.zip", file_type: "zip" },
          ],
        },
      }],
      ["/documents/doc-1/chunks", {
        success: true,
        data: {
          chunks: [
            { chunk_id: "c1", chunk_index: 0, element_type: "SourceProjectSummary", masked_text: normalChunk, classification: "source_project", word_count: 20 },
          ],
        },
      }],
      ["/documents/doc-1/download", { success: false }],
    ]);
    const env = createMockEnv(fetchResponses);
    const spec = await aggregateSourceSpec(env, "org-2");
    expect(spec.libOnlyProjects).toBeUndefined();
  });
});
