# Phase 2-C Design: Spec Export & Relevance Classification + KPI

> **Summary**: Fact Check 결과를 기반으로 PRD SS5.3 샘플 형식의 API/Table Spec JSON을 생성하고, R2에 패키지로 저장한다. PRD SS4.2 Option C 기준의 핵심/비핵심 선별(Relevance Classification)과, PRD SS8.2 기준 KPI 자동 측정 엔드포인트도 포함.
>
> **Project**: RES AI Foundry
> **Version**: v1.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-06
> **Status**: Draft
> **Plan Reference**: `docs/01-plan/features/v074-pivot.plan.md` Phase 2-C (SS6)
> **PRD Reference**: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx` SS4.2, SS5.3-5.4, SS8.2
> **Depends On**: Phase 2-B (Fact Check Engine) — completed (Sessions 1-3)

---

## 0. Design Decisions (Plan Corrections)

| # | Plan 원안 | 설계 보정 | 근거 |
|---|----------|----------|------|
| DD-1 | `spec-summary.ts`는 Excel 출력 | **CSV 출력으로 선행** | Workers 환경에서 xlsx 라이브러리 번들 크기 제약. CSV는 Excel에서 직접 열림. Excel은 Pilot Plus |
| DD-2 | R2 저장소 미지정 | **기존 `ai-foundry-skill-packages` R2 재활용** | 별도 버킷 생성 불필요. prefix `spec-packages/` 로 네임스페이스 분리 |
| DD-3 | R2 바인딩 svc-extraction에 없음 | **svc-ingestion service binding 경유** | svc-extraction에 R2 직접 바인딩 추가하면 wrangler.toml 변경+재배포. 대안: svc-ingestion의 R2 접근 API 활용. **결정: R2 직접 바인딩 추가** — 패키지 다운로드 시 service binding 경유는 불필요한 hop. `R2_SPEC_PACKAGES` 바인딩 신규 추가 |
| DD-4 | 핵심/비핵심 선별 로직 미상세 | **3-criteria 점수 기반 분류** | PRD SS4.2 Option C의 3가지 기준을 각각 0/1 점수화. 2개 이상 충족 시 "핵심" |
| DD-5 | KPI 5개 중 2개는 UI 의존 | **자동 계산 3개만 Phase 2-C** | Reviewer Acceptance Rate, Spec 편집 시간 단축률은 Phase 2-D UI에서 수집. Coverage + Gap Precision만 API 제공 |
| DD-6 | factcheck-report.ts 재구현 | **기존 `factcheck/report.ts` 래퍼** | 이미 구현된 `generateFactCheckReport()`를 그대로 재활용. packager에서 호출 |

---

## 1. Architecture Overview

```
POST /export/spec-package { organizationId, resultId? }
     |
     v
+--- Source Aggregator (기존 재활용) ---+
|   SourceSpec { apis[], tables[] }    |
+--------------------------------------+
     |                    |
     v                    v
+--- Relevance Scorer ------+    +--- Fact Check Results (D1) ---+
| 3-criteria classification |    | fact_check_results            |
| core / non-core / unknown |    | fact_check_gaps               |
+---------------------------+    +-------------------------------+
     |                    |                    |
     +--------------------+--------------------+
                          |
                          v
              +--- Spec Generators ---+
              | spec-api.ts           |  -> ApiSpecEntry[]
              | spec-table.ts         |  -> TableSpecEntry[]
              +----------------------+
                          |
                          v
              +--- Packager ----------+
              | assemble all outputs  |
              | store to R2           |
              | record in D1          |
              +-----------------------+
                          |
                          v
              R2: spec-packages/{orgId}/{packageId}/
                  ├── spec-api.json
                  ├── spec-table.json
                  ├── fact-check-report.md
                  ├── spec-summary.csv
                  └── manifest.json
```

---

## 2. Type Definitions (`packages/types/src/spec.ts` 확장)

### 2.1 API Spec Entry (PRD SS5.3 Sample A)

```typescript
// === Spec Export Types (v0.7.4 Phase 2-C) ===

export const ApiParamSpecSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  source: z.enum(["path", "query", "body", "header"]).optional(),
  description: z.string().optional(),
});

export const FactCheckRefSchema = z.object({
  totalGaps: z.number().int(),
  highGaps: z.number().int(),
  gapIds: z.array(z.string()),
  coveragePct: z.number(),
});

export const ApiSpecEntrySchema = z.object({
  specId: z.string(),
  endpoint: z.string(),              // "/api/v2/vouchers/issue"
  httpMethod: z.string(),            // "POST"
  controllerClass: z.string(),       // "VoucherController"
  methodName: z.string(),            // "issueVoucher"
  sourceLocation: z.string(),        // "VoucherController.java:L42"
  parameters: z.array(ApiParamSpecSchema),
  returnType: z.string(),
  documentRef: z.string().optional(), // "인터페이스설계서.xlsx:Sheet1:Row5"
  factCheck: FactCheckRefSchema,
  relevance: z.enum(["core", "non-core", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export type ApiParamSpec = z.infer<typeof ApiParamSpecSchema>;
export type FactCheckRef = z.infer<typeof FactCheckRefSchema>;
export type ApiSpecEntry = z.infer<typeof ApiSpecEntrySchema>;
```

### 2.2 Table Spec Entry (PRD SS5.3 Sample B)

```typescript
export const TableColumnSpecSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean(),
  isForeignKey: z.boolean().optional(),
  foreignKeyRef: z.string().optional(),  // "TB_OTHER.column"
  description: z.string().optional(),
});

export const TableSpecEntrySchema = z.object({
  specId: z.string(),
  tableName: z.string(),              // "TB_VOUCHER"
  sourceLocation: z.string(),         // "VoucherMapper.xml" or "Voucher.java"
  columns: z.array(TableColumnSpecSchema),
  documentRef: z.string().optional(), // "테이블정의서.xlsx:Sheet3"
  factCheck: FactCheckRefSchema,
  relevance: z.enum(["core", "non-core", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export type TableColumnSpec = z.infer<typeof TableColumnSpecSchema>;
export type TableSpecEntry = z.infer<typeof TableSpecEntrySchema>;
```

### 2.3 Spec Package Manifest

```typescript
export const SpecPackageManifestSchema = z.object({
  packageId: z.string(),
  organizationId: z.string(),
  resultId: z.string().optional(),     // Fact Check resultId (있으면)
  createdAt: z.string(),
  version: z.string().default("1.0.0"),
  stats: z.object({
    totalApis: z.number().int(),
    coreApis: z.number().int(),
    totalTables: z.number().int(),
    coreTables: z.number().int(),
    totalGaps: z.number().int(),
    highGaps: z.number().int(),
    apiCoveragePct: z.number(),
    tableCoveragePct: z.number(),
  }),
  files: z.array(z.object({
    name: z.string(),
    r2Key: z.string(),
    contentType: z.string(),
    sizeBytes: z.number().int(),
  })),
});

export type SpecPackageManifest = z.infer<typeof SpecPackageManifestSchema>;
```

### 2.4 Relevance Classification

```typescript
export const RelevanceCriteriaSchema = z.object({
  isExternalApi: z.boolean(),         // Criterion 1: @RestController public endpoint
  isCoreEntity: z.boolean(),          // Criterion 2: FK 참조 3개 이상
  isTransactionCore: z.boolean(),     // Criterion 3: @Transactional + DB write 2개+
  score: z.number().int().min(0).max(3),
  relevance: z.enum(["core", "non-core", "unknown"]),
});

export type RelevanceCriteria = z.infer<typeof RelevanceCriteriaSchema>;
```

---

## 3. Export Modules (`svc-extraction/src/export/`)

### 3.1 Module Structure

```
services/svc-extraction/src/export/
├── spec-api.ts            # API Spec JSON 생성
├── spec-table.ts          # Table Spec JSON 생성
├── spec-summary.ts        # CSV 요약 생성
├── relevance-scorer.ts    # 핵심/비핵심 분류
├── packager.ts            # 전체 패키지 조립 + R2 저장
└── types.ts               # Export 내부 타입 (필요시)
```

### 3.2 `spec-api.ts` — API Spec JSON Generator

**역할**: SourceSpec + DocSpec + FactCheckResult/Gaps → ApiSpecEntry[] 생성.

**데이터 흐름**:
1. `aggregateSourceSpec()`으로 조직의 SourceSpec 획득 (기존 모듈 재활용)
2. Fact Check 결과에서 API 관련 gaps 조회 (D1)
3. 각 SourceApi에 대해:
   - matched doc ref 연결 (MatchedItem에서 조회)
   - gap 집계 (해당 API의 gapIds, totalGaps, highGaps)
   - relevance 분류 (relevance-scorer 호출)
   - confidence 계산 (gaps가 없으면 1.0, HIGH gaps 있으면 감소)

```typescript
export interface ApiSpecGeneratorInput {
  sourceSpec: SourceSpec;
  matchResult: MatchResult;
  gaps: FactCheckGap[];
  relevanceMap: Map<string, RelevanceCriteria>;
}

export function generateApiSpec(input: ApiSpecGeneratorInput): ApiSpecEntry[] {
  // For each source API:
  //   1. Find matching doc ref from matchResult
  //   2. Collect gaps where sourceItem JSON contains this API path
  //   3. Build FactCheckRef
  //   4. Get relevance from relevanceMap
  //   5. Calculate confidence = 1.0 - (highGaps * 0.15) - (mediumGaps * 0.05)
  //   6. Assemble ApiSpecEntry
}
```

**출력 형식** (PRD SS5.3 Sample A 호환):
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "LPON API Spec — AI Foundry Export",
    "version": "1.0.0",
    "x-ai-foundry": {
      "packageId": "pkg-xxx",
      "organizationId": "LPON",
      "generatedAt": "2026-03-06T..."
    }
  },
  "paths": {
    "/api/v2/vouchers/issue": {
      "post": {
        "x-specId": "spec-api-001",
        "x-sourceLocation": "VoucherController.java:L42",
        "x-relevance": "core",
        "x-factCheck": { "totalGaps": 1, "highGaps": 0, "coveragePct": 95 },
        "x-confidence": 0.95,
        "parameters": [...],
        "responses": { "200": { "description": "..." } }
      }
    }
  }
}
```

### 3.3 `spec-table.ts` — Table Spec JSON Generator

**역할**: SourceSpec + DocSpec + FactCheckResult/Gaps → TableSpecEntry[] 생성.

**데이터 흐름**: API Spec과 동일 패턴. 각 SourceTable에 대해 gap 집계 + relevance + confidence.

**출력 형식** (PRD SS5.3 Sample B 호환):
```json
{
  "version": "1.0.0",
  "info": {
    "title": "LPON Table Spec — AI Foundry Export",
    "x-ai-foundry": { "packageId": "...", "organizationId": "..." }
  },
  "tables": [
    {
      "specId": "spec-tbl-001",
      "tableName": "TB_VOUCHER",
      "sourceLocation": "VoucherMapper.xml",
      "relevance": "core",
      "confidence": 0.90,
      "factCheck": { "totalGaps": 2, "highGaps": 1, "coveragePct": 85 },
      "columns": [
        {
          "name": "voucher_id",
          "dataType": "VARCHAR(36)",
          "nullable": false,
          "isPrimaryKey": true,
          "description": "상품권 식별자"
        }
      ]
    }
  ]
}
```

### 3.4 `spec-summary.ts` — CSV Summary Generator

**역할**: 경영진 보고용 요약 CSV. Excel에서 직접 열 수 있음.

```csv
Spec Type,Name,Source Location,Document Ref,Relevance,Gaps (Total),Gaps (HIGH),Coverage %,Confidence
API,/api/v2/vouchers/issue,VoucherController.java:L42,인터페이스설계서.xlsx:Row5,core,1,0,95.0,0.95
TABLE,TB_VOUCHER,VoucherMapper.xml,테이블정의서.xlsx:Sheet3,core,2,1,85.0,0.90
```

**BOM 접두**: UTF-8 BOM (`\uFEFF`) 추가하여 Excel에서 한글 깨짐 방지.

### 3.5 `relevance-scorer.ts` — 핵심/비핵심 선별 (PRD SS4.2 Option C)

**3가지 판정 기준**:

```typescript
/**
 * Criterion 1: External API (External Boundary)
 * @RestController public endpoint — 내부 API (/internal/, /health, /debug) 제외
 */
function isExternalApi(api: SourceApi): boolean {
  const path = api.path.toLowerCase();
  return !(path.includes("/internal/")
    || path.includes("/health")
    || path.includes("/debug")
    || path.includes("/test")
    || path.includes("/actuator"));
}

/**
 * Criterion 2: Core Entity (DB)
 * FK 참조 3개 이상인 테이블 = 핵심 엔티티
 * MyBatis 기반이므로 FK는 query JOIN 기반으로 추정
 */
function isCoreEntity(
  tableName: string,
  allTables: SourceTable[],
  mapperQueries: MyBatisQuery[],
): boolean {
  // Count how many other tables reference this table via JOIN
  let refCount = 0;
  for (const query of mapperQueries) {
    if (query.tables.includes(tableName) && query.tables.length > 1) {
      refCount++;
    }
  }
  return refCount >= 3;
}

/**
 * Criterion 3: Transaction Core
 * @Transactional + DB write 2개 이상 (INSERT/UPDATE/DELETE)
 * source_transaction chunks에서 판별
 */
function isTransactionCore(
  apiPath: string,
  transactions: CodeTransaction[],
): boolean {
  // Service method가 @Transactional이고 writeOps >= 2
  // API → Service 매핑: method name 기반 fuzzy match
  // Simplified: isTransactional === true인 메서드 중 관련 있는 것
}
```

**분류 규칙**:
```typescript
export function classifyRelevance(criteria: {
  isExternalApi: boolean;
  isCoreEntity: boolean;
  isTransactionCore: boolean;
}): "core" | "non-core" | "unknown" {
  const score =
    (criteria.isExternalApi ? 1 : 0) +
    (criteria.isCoreEntity ? 1 : 0) +
    (criteria.isTransactionCore ? 1 : 0);

  if (score >= 2) return "core";
  if (score === 0) return "non-core";
  return "unknown";  // 1개 기준만 충족 — 검토 필요
}
```

**API용 분류**: Criterion 1 (External API) + Criterion 3 (Transaction Core). Criterion 2는 해당 없음.
**Table용 분류**: Criterion 2 (Core Entity) 적용. API와 JOIN 관계가 있으면 Criterion 3도 적용.

### 3.6 `packager.ts` — 패키지 조립 + R2 저장

**역할**: 모든 출력물을 R2에 저장하고 D1에 메타데이터 기록.

**패키지 디렉토리 구조**:
```
spec-packages/{orgId}/{packageId}/
├── manifest.json          # SpecPackageManifest
├── spec-api.json          # OpenAPI 3.0 호환 API Spec
├── spec-table.json        # Table Spec (ERD 구조)
├── fact-check-report.md   # Markdown Gap 리포트
└── spec-summary.csv       # CSV 요약 (BOM 포함)
```

**R2 저장 흐름**:
```typescript
export async function assembleAndStore(
  env: Env,
  organizationId: string,
  resultId: string | undefined,
  apiSpecs: ApiSpecEntry[],
  tableSpecs: TableSpecEntry[],
  reportMarkdown: string,
  csvSummary: string,
): Promise<SpecPackageManifest> {
  const packageId = `pkg-${crypto.randomUUID().slice(0, 8)}`;
  const prefix = `spec-packages/${organizationId}/${packageId}`;

  // 1. Store each file to R2
  const files: SpecPackageManifest["files"] = [];

  const apiJson = JSON.stringify(buildOpenApiWrapper(apiSpecs, organizationId, packageId), null, 2);
  await env.R2_SPEC_PACKAGES.put(`${prefix}/spec-api.json`, apiJson, {
    httpMetadata: { contentType: "application/json" },
  });
  files.push({ name: "spec-api.json", r2Key: `${prefix}/spec-api.json`, contentType: "application/json", sizeBytes: new Blob([apiJson]).size });

  const tableJson = JSON.stringify(buildTableSpecWrapper(tableSpecs, organizationId, packageId), null, 2);
  await env.R2_SPEC_PACKAGES.put(`${prefix}/spec-table.json`, tableJson, {
    httpMetadata: { contentType: "application/json" },
  });
  files.push({ name: "spec-table.json", r2Key: `${prefix}/spec-table.json`, contentType: "application/json", sizeBytes: new Blob([tableJson]).size });

  await env.R2_SPEC_PACKAGES.put(`${prefix}/fact-check-report.md`, reportMarkdown, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });
  files.push({ name: "fact-check-report.md", r2Key: `${prefix}/fact-check-report.md`, contentType: "text/markdown", sizeBytes: new Blob([reportMarkdown]).size });

  await env.R2_SPEC_PACKAGES.put(`${prefix}/spec-summary.csv`, csvSummary, {
    httpMetadata: { contentType: "text/csv; charset=utf-8" },
  });
  files.push({ name: "spec-summary.csv", r2Key: `${prefix}/spec-summary.csv`, contentType: "text/csv", sizeBytes: new Blob([csvSummary]).size });

  // 2. Build + store manifest
  const manifest: SpecPackageManifest = {
    packageId,
    organizationId,
    ...(resultId !== undefined ? { resultId } : {}),
    createdAt: new Date().toISOString(),
    version: "1.0.0",
    stats: { /* computed from apiSpecs, tableSpecs, gaps */ },
    files,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  await env.R2_SPEC_PACKAGES.put(`${prefix}/manifest.json`, manifestJson, {
    httpMetadata: { contentType: "application/json" },
  });

  // 3. Record in D1
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO spec_packages
     (package_id, organization_id, result_id, r2_prefix, manifest_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
  )
    .bind(packageId, organizationId, resultId ?? null, prefix, manifestJson, manifest.createdAt)
    .run();

  return manifest;
}
```

---

## 4. D1 Schema Extension (`0006_spec_packages.sql`)

```sql
-- Migration: 0006_spec_packages.sql
-- Description: Spec Package Export — 패키지 메타데이터 + 핵심/비핵심 분류
-- Service: svc-extraction (db-structure)
-- Date: 2026-03-07

CREATE TABLE IF NOT EXISTS spec_packages (
  package_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  result_id TEXT,                     -- fact_check_results.result_id (nullable)
  r2_prefix TEXT NOT NULL,            -- "spec-packages/{orgId}/{packageId}"
  manifest_json TEXT NOT NULL,        -- Full SpecPackageManifest JSON
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS spec_classifications (
  classification_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  spec_type TEXT NOT NULL,            -- 'api' | 'table'
  item_name TEXT NOT NULL,            -- API path or table name
  is_external_api INTEGER DEFAULT 0,
  is_core_entity INTEGER DEFAULT 0,
  is_transaction_core INTEGER DEFAULT 0,
  relevance_score INTEGER DEFAULT 0,  -- 0-3
  relevance TEXT NOT NULL DEFAULT 'unknown',  -- core | non-core | unknown
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spec_pkg_org ON spec_packages(organization_id);
CREATE INDEX IF NOT EXISTS idx_spec_pkg_result ON spec_packages(result_id);
CREATE INDEX IF NOT EXISTS idx_spec_cls_org ON spec_classifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_spec_cls_relevance ON spec_classifications(relevance);
```

---

## 5. API Endpoints

### 5.1 Export Routes (`routes/export.ts`)

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/export/spec-package` | Analyst+ | Spec 패키지 생성 + R2 저장 |
| GET | `/export/packages` | Analyst+ | 조직의 패키지 목록 조회 |
| GET | `/export/:packageId` | Analyst+ | 패키지 매니페스트 (다운로드 링크 포함) |
| GET | `/export/:packageId/api-spec` | Analyst+ | API Spec JSON 직접 다운로드 |
| GET | `/export/:packageId/table-spec` | Analyst+ | Table Spec JSON 직접 다운로드 |
| GET | `/export/:packageId/report` | Analyst+ | Markdown 리포트 직접 다운로드 |
| GET | `/export/:packageId/summary` | Analyst+ | CSV 요약 직접 다운로드 |

**`POST /export/spec-package` Request**:
```typescript
{
  organizationId: string;           // 필수
  resultId?: string;                // fact check resultId (미지정 시 최신 completed 사용)
  includeNonCore?: boolean;         // default: true (비핵심 포함)
}
```

**`POST /export/spec-package` Response**:
```typescript
{
  success: true,
  data: {
    packageId: string;
    r2Prefix: string;
    stats: {
      totalApis: number;
      coreApis: number;
      totalTables: number;
      coreTables: number;
      totalGaps: number;
      highGaps: number;
      apiCoveragePct: number;
      tableCoveragePct: number;
    };
    files: Array<{ name: string; contentType: string; sizeBytes: number }>;
  }
}
```

**`GET /export/:packageId/api-spec` Response**:
- Content-Type: `application/json`
- Content-Disposition: `attachment; filename="spec-api.json"`
- Body: OpenAPI 3.0 호환 JSON

**`GET /export/:packageId/report` Response**:
- Content-Type: `text/markdown; charset=utf-8`
- Body: Markdown 리포트

**`GET /export/:packageId/summary` Response**:
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="spec-summary.csv"`
- Body: BOM + CSV

### 5.2 Classification Routes (기존 `routes/factcheck.ts` 확장)

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/specs/classify` | Analyst+ | 핵심/비핵심 분류 실행 |
| GET | `/specs/classified` | Analyst+ | 분류 결과 조회 (필터: relevance, specType) |

**`POST /specs/classify` Request**:
```typescript
{
  organizationId: string;
}
```

**`POST /specs/classify` Response**:
```typescript
{
  success: true,
  data: {
    totalApis: number;
    coreApis: number;
    nonCoreApis: number;
    unknownApis: number;
    totalTables: number;
    coreTables: number;
    nonCoreTables: number;
    unknownTables: number;
    classifications: Array<{
      specType: "api" | "table";
      itemName: string;
      relevance: "core" | "non-core" | "unknown";
      criteria: {
        isExternalApi: boolean;
        isCoreEntity: boolean;
        isTransactionCore: boolean;
        score: number;
      };
    }>;
  }
}
```

**`GET /specs/classified` Query Params**:
- `organizationId` — 필수 (header `X-Organization-Id`)
- `relevance` — `core`, `non-core`, `unknown` (필터)
- `specType` — `api`, `table` (필터)
- `limit` — default 100, max 500
- `offset` — default 0

### 5.3 KPI Route (기존 `routes/factcheck.ts` 확장)

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | `/factcheck/kpi` | Analyst+ | 자동 계산 KPI 3개 |

**`GET /factcheck/kpi` Response** (PRD SS8.2):
```typescript
{
  success: true,
  data: {
    organizationId: string;
    // KPI-1: Critical API Coverage
    criticalApiCoverage: {
      value: number;         // 0-100%
      target: 80;
      pass: boolean;
      detail: {
        sourceApis: number;
        documentApis: number;
        matchedApis: number;
      };
    };
    // KPI-2: Critical Table Coverage
    criticalTableCoverage: {
      value: number;
      target: 80;
      pass: boolean;
      detail: {
        sourceTables: number;
        documentTables: number;
        matchedTables: number;
      };
    };
    // KPI-3: Gap Precision
    gapPrecision: {
      value: number;         // 0-100%
      target: 75;
      pass: boolean;
      detail: {
        totalGaps: number;
        confirmedGaps: number;
        dismissedGaps: number;
        pendingGaps: number;
      };
    };
    // KPI-4 & 5: UI 의존 — placeholder
    reviewerAcceptanceRate: {
      value: null;           // Phase 2-D에서 채움
      target: 70;
      note: "Requires Phase 2-D UI tracking";
    };
    specEditTimeReduction: {
      value: null;
      target: 30;
      note: "Requires Phase 2-D UI tracking";
    };
    computedAt: string;
  }
}
```

**KPI 계산 로직**:

```typescript
// KPI-1: Critical API Coverage
// = (소스 API 중 문서에도 존재하는 수) / (전체 소스 API 수) × 100
// fact_check_results에서 spec_type='api' (또는 mixed)의
// matched_items / total_source_items

// KPI-2: Critical Table Coverage
// 동일 패턴. spec_type='table' (또는 mixed) 기준

// KPI-3: Gap Precision
// = confirmed_gaps / (confirmed_gaps + dismissed_gaps) × 100
// fact_check_gaps에서 review_status='confirmed' vs 'dismissed' 집계
// pending gaps는 아직 미검토이므로 제외
```

---

## 6. Infrastructure Changes

### 6.1 `svc-extraction/wrangler.toml` — R2 바인딩 추가

```toml
# R2 bucket for spec package storage
[[r2_buckets]]
binding = "R2_SPEC_PACKAGES"
bucket_name = "ai-foundry-skill-packages"

# staging
[[env.staging.r2_buckets]]
binding = "R2_SPEC_PACKAGES"
bucket_name = "ai-foundry-skill-packages-staging"

# production
[[env.production.r2_buckets]]
binding = "R2_SPEC_PACKAGES"
bucket_name = "ai-foundry-skill-packages"
```

> 기존 `ai-foundry-skill-packages` 버킷 재활용. prefix `spec-packages/`로 네임스페이스 분리.
> 별도 버킷 생성 불필요.

### 6.2 `svc-extraction/src/env.ts` — 바인딩 추가

```typescript
export interface Env {
  // ... existing bindings ...

  // R2 bucket for spec package storage (Phase 2-C)
  R2_SPEC_PACKAGES: R2Bucket;
}
```

### 6.3 `svc-extraction/src/index.ts` — 라우트 등록

```typescript
// /export/* routes
if (path.startsWith("/export")) {
  const rbacCtx = extractRbacContext(request);
  if (rbacCtx) {
    const action = method === "GET" ? "read" : "execute";
    const denied = await checkPermission(env, rbacCtx.role, "extraction", action);
    if (denied) return denied;
  }
  const resp = await handleExportRoutes(request, env, ctx, path, method, url);
  if (resp) return resp;
}

// /specs/* routes
if (path.startsWith("/specs")) {
  const rbacCtx = extractRbacContext(request);
  if (rbacCtx) {
    const action = method === "GET" ? "read" : "execute";
    const denied = await checkPermission(env, rbacCtx.role, "extraction", action);
    if (denied) return denied;
  }
  const resp = await handleSpecRoutes(request, env, ctx, path, method, url);
  if (resp) return resp;
}
```

---

## 7. Integration with Existing Code

### 7.1 기존 모듈 재활용

| 기존 모듈 | 재활용 방식 |
|----------|-----------|
| `factcheck/source-aggregator.ts` | `aggregateSourceSpec()` 직접 호출 — SourceSpec 획득 |
| `factcheck/doc-spec-extractor.ts` | `extractDocSpec()` 직접 호출 — DocSpec 획득 |
| `factcheck/matcher.ts` | `structuralMatch()` 직접 호출 — MatchResult로 matched/unmatched 분리 |
| `factcheck/report.ts` | `generateFactCheckReport()` 직접 호출 — Markdown 리포트 생성 |
| `factcheck/gap-detector.ts` | Gap 분류 로직은 D1에서 이미 저장된 결과 조회로 대체 |
| `factcheck/severity.ts` | `isTypeCompatible()` 재활용 (Table Spec 컬럼 타입 매핑) |

### 7.2 데이터 의존성

```
spec-api.ts / spec-table.ts
  ├── SourceSpec (from source-aggregator)
  ├── DocSpec (from doc-spec-extractor)
  ├── MatchResult (from matcher)
  ├── FactCheckGap[] (from D1 fact_check_gaps)
  └── RelevanceCriteria (from relevance-scorer)

packager.ts
  ├── ApiSpecEntry[] (from spec-api.ts)
  ├── TableSpecEntry[] (from spec-table.ts)
  ├── Markdown report (from factcheck/report.ts)
  ├── CSV summary (from spec-summary.ts)
  └── R2 + D1 (저장)
```

### 7.3 Fact Check 의존: resultId 기반 vs 실시간 계산

- **resultId 지정 시**: D1의 `fact_check_results`에서 기존 결과 로드 + gaps 조회. 소스/문서 재분석 없음.
- **resultId 미지정 시**: 최신 completed 결과 사용. 없으면 `aggregateSourceSpec` + `extractDocSpec` + `structuralMatch`를 실시간 실행.

---

## 8. Limits & Performance

| 항목 | 한도 | 근거 |
|------|------|------|
| 패키지 생성 타임아웃 | 30초 | Worker CPU limit. R2 put은 I/O이므로 CPU 영향 최소 |
| R2 파일 크기 | 5MB per file | API Spec JSON은 LPON 규모에서 ~100KB 이내 |
| D1 manifest JSON | 1MB | D1 TEXT 컬럼 한도 |
| 조직당 패키지 수 | 제한 없음 | R2 스토리지 기반, prefix로 분리 |
| CSV 행 수 | 10,000 | APIs + Tables 합산 상한 |
| 핵심/비핵심 분류 | 실시간 (캐시 없음) | LPON 규모(~200 APIs, ~50 tables)에서 밀리초 수준 |
| KPI 조회 | D1 집계 쿼리 | 인덱스 기반, 밀리초 수준 |

---

## 9. Test Strategy

### 9.1 spec-api.ts 테스트

```typescript
describe("generateApiSpec", () => {
  test("SourceApi + matched doc → ApiSpecEntry with factCheck", () => { ... });
  test("SourceApi without doc match → confidence 감소", () => { ... });
  test("HIGH gap이 있는 API → confidence < 0.7", () => { ... });
  test("OpenAPI 3.0 wrapper 구조 검증", () => { ... });
  test("빈 SourceSpec → 빈 배열 반환", () => { ... });
});
```

### 9.2 spec-table.ts 테스트

```typescript
describe("generateTableSpec", () => {
  test("SourceTable + matched doc → TableSpecEntry with columns", () => { ... });
  test("MyBatis 기반 테이블 → sqlType/javaType 모두 포함", () => { ... });
  test("TM gap이 있는 컬럼 → evidence 포함", () => { ... });
});
```

### 9.3 relevance-scorer.ts 테스트

```typescript
describe("classifyRelevance", () => {
  test("External API + Transaction Core → 'core' (score 2)", () => { ... });
  test("Internal API only → 'non-core' (score 0)", () => { ... });
  test("Core Entity only → 'unknown' (score 1)", () => { ... });
  test("모든 기준 충족 → 'core' (score 3)", () => { ... });
});

describe("isExternalApi", () => {
  test("/api/v2/vouchers/issue → true", () => { ... });
  test("/internal/health → false", () => { ... });
  test("/actuator/metrics → false", () => { ... });
});

describe("isCoreEntity", () => {
  test("3개 이상 JOIN 참조 → true", () => { ... });
  test("단독 사용 테이블 → false", () => { ... });
});
```

### 9.4 packager.ts 테스트

```typescript
describe("assembleAndStore", () => {
  test("R2에 5개 파일 저장 (manifest + api + table + report + csv)", () => {
    // Mock R2Bucket.put
    // Verify keys: spec-packages/{orgId}/{packageId}/*
  });
  test("D1에 spec_packages 레코드 생성", () => { ... });
  test("manifest stats 정확히 계산", () => { ... });
});
```

### 9.5 spec-summary.ts 테스트

```typescript
describe("generateCsvSummary", () => {
  test("BOM 접두 포함", () => {
    const csv = generateCsvSummary(specs);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });
  test("API + Table 행 모두 포함", () => { ... });
  test("한글 필드 정상 인코딩", () => { ... });
});
```

### 9.6 KPI 테스트

```typescript
describe("GET /factcheck/kpi", () => {
  test("completed 결과로 Coverage 계산 정확", () => { ... });
  test("confirmed/dismissed gaps로 Precision 계산", () => { ... });
  test("결과 없으면 모든 KPI 0", () => { ... });
  test("KPI-4,5는 null + note 반환", () => { ... });
});
```

### 9.7 Export API E2E 테스트

```typescript
describe("Export API", () => {
  test("POST /export/spec-package → 패키지 생성 + R2 저장", () => {
    // 1. Setup: fact_check_results + gaps in D1
    // 2. POST /export/spec-package { organizationId }
    // 3. Verify response: packageId, stats
    // 4. GET /export/:packageId → manifest
    // 5. GET /export/:packageId/api-spec → JSON
  });
});
```

---

## 10. Implementation Order (2 Sessions)

```
Session 1: Types + Export Modules + Relevance Scorer
  ├── packages/types/src/spec.ts — ApiSpecEntry, TableSpecEntry, SpecPackageManifest, RelevanceCriteria schemas 추가
  ├── packages/types/src/index.ts — new exports
  ├── services/svc-extraction/src/export/relevance-scorer.ts + tests
  ├── services/svc-extraction/src/export/spec-api.ts + tests
  ├── services/svc-extraction/src/export/spec-table.ts + tests
  ├── services/svc-extraction/src/export/spec-summary.ts + tests
  └── typecheck + lint + test

Session 2: Packager + Routes + D1 + Wrangler + Deploy
  ├── services/svc-extraction/src/export/packager.ts + tests
  ├── services/svc-extraction/src/routes/export.ts — export API endpoints
  ├── services/svc-extraction/src/routes/spec.ts — classify/classified endpoints
  ├── services/svc-extraction/src/routes/factcheck.ts — /factcheck/kpi endpoint 추가
  ├── services/svc-extraction/src/env.ts — R2_SPEC_PACKAGES 바인딩 추가
  ├── services/svc-extraction/src/index.ts — /export/*, /specs/* 라우트 등록
  ├── services/svc-extraction/wrangler.toml — R2 바인딩 추가
  ├── infra/migrations/db-structure/0006_spec_packages.sql
  ├── Deploy: svc-extraction (R2 바인딩 + 마이그레이션 + 코드)
  └── typecheck + lint + test + db-migrate + E2E curl
```

---

## 11. Risk & Mitigation

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R-1 | R2 버킷 권한 — 기존 `ai-foundry-skill-packages` 에 svc-extraction 접근 불가 | 중 | wrangler.toml에 R2 바인딩 추가 후 배포. 실패 시 별도 버킷 `ai-foundry-spec-packages` 생성 |
| R-2 | Transaction Core 판별 부정확 (API→Service 매핑 fuzzy) | 중 | 1차는 method name 기반 fuzzy. 정확도 부족 시 Phase 2-D에서 manual override UI 제공 |
| R-3 | Fact Check 결과 없이 Export 요청 | 저 | resultId 미지정 + completed 결과 없으면 badRequest 반환. 실시간 계산 fallback은 비용 대비 불필요 |
| R-4 | CSV에서 한글 깨짐 (Excel) | 저 | UTF-8 BOM 접두. 실패 시 Content-Type에 `charset=utf-8-sig` 대체 |
| R-5 | R2 put 실패 (Worker 타임아웃) | 저 | 파일당 최대 5MB. LPON 규모에서 ~100KB. 타임아웃 가능성 극히 낮음 |
| R-6 | Core Entity 기준 (FK 참조 3개) 부적절 | 중 | LPON 파일럿 결과 기반 임계값 조정. Phase 2-E KPI 측정 시 기준 검증 |

---

## 12. Files Changed Summary

### 신규 파일 (9)

| 파일 | 설명 |
|------|------|
| `services/svc-extraction/src/export/spec-api.ts` | API Spec JSON 생성 (OpenAPI 3.0 wrapper) |
| `services/svc-extraction/src/export/spec-table.ts` | Table Spec JSON 생성 (ERD 구조) |
| `services/svc-extraction/src/export/spec-summary.ts` | CSV 요약 (BOM 포함) |
| `services/svc-extraction/src/export/relevance-scorer.ts` | 핵심/비핵심 분류 (3-criteria) |
| `services/svc-extraction/src/export/packager.ts` | 패키지 조립 + R2 저장 + D1 기록 |
| `services/svc-extraction/src/routes/export.ts` | Export API 라우트 7개 |
| `services/svc-extraction/src/routes/spec.ts` | Classification API 라우트 2개 |
| `infra/migrations/db-structure/0006_spec_packages.sql` | D1 마이그레이션 (2 tables + 4 indexes) |
| `services/svc-extraction/src/export/__tests__/` | 테스트 파일들 |

### 수정 파일 (4)

| 파일 | 변경 | 설명 |
|------|------|------|
| `packages/types/src/spec.ts` | 추가 | ApiSpecEntry, TableSpecEntry, SpecPackageManifest, RelevanceCriteria Zod schemas |
| `packages/types/src/index.ts` | 추가 | 새 타입 export |
| `services/svc-extraction/src/env.ts` | 추가 | `R2_SPEC_PACKAGES: R2Bucket` 바인딩 |
| `services/svc-extraction/src/index.ts` | 추가 | `/export/*`, `/specs/*` 라우트 등록 |
| `services/svc-extraction/wrangler.toml` | 추가 | R2 바인딩 (dev/staging/production) |
| `services/svc-extraction/src/routes/factcheck.ts` | 추가 | `/factcheck/kpi` 엔드포인트 |

**신규 9 + 수정 6 = 총 15 파일**

---

## 13. Dependency Graph

```
packages/types (spec.ts — ApiSpecEntry, TableSpecEntry, Manifest, Relevance)
    |
    v
svc-extraction/src/export/
    ├── relevance-scorer.ts ── SourceSpec + CodeTransaction[]
    ├── spec-api.ts ────────── SourceSpec + MatchResult + Gaps + Relevance
    ├── spec-table.ts ─────── SourceSpec + MatchResult + Gaps + Relevance
    ├── spec-summary.ts ───── ApiSpecEntry[] + TableSpecEntry[]
    └── packager.ts ────────── All of above + R2 + D1
             |
             v
svc-extraction/src/routes/
    ├── export.ts ──────────── packager + R2 read
    ├── spec.ts ───────────── relevance-scorer + D1
    └── factcheck.ts ──────── D1 aggregate queries (KPI)
             |
             v
svc-extraction/src/factcheck/ (기존 — 재활용)
    ├── source-aggregator.ts → SourceSpec
    ├── doc-spec-extractor.ts → DocSpec
    ├── matcher.ts → MatchResult
    └── report.ts → Markdown
             |
             v
R2: ai-foundry-skill-packages (prefix: spec-packages/)
D1: db-structure (spec_packages + spec_classifications)
```
