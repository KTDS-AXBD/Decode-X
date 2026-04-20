---
id: DESIGN-SPRINT-212
sprint: 212
title: "svc-ingestion Java/Spring AST 파서 + Source-First Reconciliation 엔진"
status: IN_PROGRESS
created: "2026-04-20"
plan_ref: PLAN-SPRINT-212
---

# Sprint 212 — Design

## §1 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│  scripts/java-ast (offline CLI, Node.js)                │
│                                                         │
│  fs.readdir(.java files)                                │
│      ↓                                                  │
│  parseJavaController() / parseJavaService()             │
│  parseJavaDataModel() / parseMyBatisMapper()            │
│      ↓                                                  │
│  SourceAnalysisResult (JSON) → stdout or --out file     │
└────────────────────┬────────────────────────────────────┘
                     │ SourceAnalysisResult
                     ↓
┌─────────────────────────────────────────────────────────┐
│  packages/utils/src/reconcile.ts                        │
│                                                         │
│  reconcile(source: SourceAnalysisResult,                │
│            docSpec: DocApiSpec)                         │
│      ↓                                                  │
│  ReconciliationReport {                                 │
│    results: ReconcileResult[]   ← SOURCE_MISSING        │
│                                    DOC_ONLY             │
│                                    DIVERGENCE           │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

## §2 타입 설계 (`packages/types/src/reconcile.ts`)

```typescript
export type ReconcileMarker = "SOURCE_MISSING" | "DOC_ONLY" | "DIVERGENCE";

export interface DocEndpointSpec {
  path: string;
  method: string;
  description?: string;
  params?: Array<{ name: string; type: string; required: boolean }>;
}

export interface DocApiSpec {
  projectName: string;
  endpoints: DocEndpointSpec[];
}

export interface ReconcileResult {
  marker: ReconcileMarker;
  subject: string;           // endpoint path or entity name
  httpMethod?: string;
  sourceDetail?: string;     // what source code says
  docDetail?: string;        // what doc spec says
  divergenceReason?: string; // for DIVERGENCE: specific diff description
}

export interface ReconciliationReport {
  projectName: string;
  analyzedAt: string;        // ISO timestamp
  results: ReconcileResult[];
  summary: {
    sourceMissing: number;
    docOnly: number;
    divergences: number;
    total: number;
  };
}
```

## §3 Reconciliation 알고리즘

### 매칭 키
- 엔드포인트: `${httpMethod.toUpperCase()} ${normalizedPath}`
- 경로 정규화: trailing slash 제거, path variable `{id}` → `:id` 변환

### SOURCE_MISSING 판정
```
for each source_endpoint:
  key = buildKey(source_endpoint)
  if key not in doc_endpoint_keys:
    → SOURCE_MISSING
```

### DOC_ONLY 판정
```
for each doc_endpoint:
  key = buildKey(doc_endpoint)
  if key not in source_endpoint_keys:
    → DOC_ONLY
```

### DIVERGENCE 판정
```
for each matched (source, doc) pair:
  check param count diff → DIVERGENCE (reason: "paramCount")
  check required params diff → DIVERGENCE (reason: "requiredParams")
```

## §4 CLI 인터페이스 (`scripts/java-ast/`)

```bash
# 기본 사용
node dist/index.js --dir ./src/main/java --out ./ast-result.json

# stdout 출력
node dist/index.js --dir ./src/main/java

# 옵션
--dir <path>    Java 소스 루트 디렉토리 (재귀 탐색)
--out <path>    출력 파일 경로 (생략 시 stdout)
--project <name> 프로젝트명 (기본: 디렉토리명)
--verbose       처리 파일 목록 stderr 출력
```

## §5 Worker 파일 매핑

| Worker | 파일 | 작업 |
|--------|------|------|
| W1 | `packages/types/src/reconcile.ts` | 타입 정의 |
| W1 | `packages/types/src/index.ts` | re-export 추가 |
| W2 | `packages/utils/src/reconcile.ts` | Reconciliation 엔진 |
| W2 | `packages/utils/src/index.ts` | re-export 추가 |
| W3 | `scripts/java-ast/package.json` | CLI 패키지 |
| W3 | `scripts/java-ast/src/index.ts` | CLI 진입점 |
| W3 | `scripts/java-ast/src/runner.ts` | 파서 조합 |
| W4 | `packages/utils/src/__tests__/reconcile.test.ts` | 유닛 테스트 |

## §6 테스트 계획

### 유닛 테스트 (reconcile.test.ts)

| 시나리오 | 입력 | 기대 마커 |
|----------|------|-----------|
| 소스에만 있는 엔드포인트 | source: `POST /charge`, doc: (없음) | `SOURCE_MISSING` |
| 문서에만 있는 엔드포인트 | source: (없음), doc: `GET /balance` | `DOC_ONLY` |
| 파라미터 차이 | source: 2 params, doc: 3 params | `DIVERGENCE` |
| 완전 일치 | source == doc | markers: [] |

## §7 KPI 검증 방법

```bash
# KPI 1: AST 추출 성공
cd scripts/java-ast
node dist/index.js --dir ../../packages/utils/src/__tests__/fixtures/java --out /tmp/ast-result.json
cat /tmp/ast-result.json | jq '.stats'

# KPI 2: DIVERGENCE 로그 생성
pnpm test packages/utils -- --reporter=verbose 2>&1 | grep DIVERGENCE
```
