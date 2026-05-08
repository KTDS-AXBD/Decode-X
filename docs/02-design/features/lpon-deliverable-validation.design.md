---
code: AIF-DSGN-lpon-deliverable-validation-design
title: "온누리상품권 분석 산출물 검증 및 문서화 Design Document"
version: 1.0
status: active
category: design
created: 2026-03-09
updated: 2026-03-09
author: Sinclair Seo
---

# 온누리상품권 분석 산출물 검증 및 문서화 Design Document

> **Summary**: AI Foundry 역공학 데이터를 4종 SI 산출물 마크다운으로 변환하는 Export 시스템 설계
>
> **Project**: AI Foundry (res-ai-foundry)
> **Version**: v0.6.0
> **Author**: AX BD팀
> **Date**: 2026-03-09
> **Status**: Draft
> **Planning Doc**: [lpon-deliverable-validation.plan.md](../01-plan/features/lpon-deliverable-validation.plan.md)
> **REQ**: AIF-REQ-017 (P0, Feature/Data)

---

## 1. Overview

### 1.1 Design Goals

1. 기존 API 데이터(policies, terms, gap-analysis)를 **신규 서비스 없이** SI 산출물 마크다운으로 변환
2. 기존 `svc-analytics` 마크다운 Export 인프라를 확장하여 4종 산출물 생성
3. As-Is vs To-Be 비교 매트릭스를 자동 산출
4. 인터뷰 평가 결과를 반영한 산출물 조정(trust level, 주석) 지원

### 1.2 Design Principles

- **기존 인프라 재사용**: `generateMarkdown()` 패턴 확장, 새로운 contentType 추가 불필요
- **데이터 수집 → 변환 분리**: API에서 원본 데이터 수집 후 마크다운 렌더링은 별도 함수
- **점진적 생성**: 4종 산출물을 독립적으로 생성 가능 (전체 일괄 또는 개별)

---

## 2. Architecture

### 2.1 Component Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  svc-policy  │     │ svc-ontology │     │svc-extraction│
│  (policies)  │     │   (terms)    │     │ (gap/facts)  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────┬───────┘────────────────────┘
                    │ Internal API (X-Internal-Secret)
                    ▼
          ┌─────────────────┐
          │  svc-analytics  │
          │  /deliverables  │  ◄── 신규 라우트
          │   /export/*     │
          └────────┬────────┘
                   │ Markdown
                   ▼
          ┌─────────────────┐
          │   docs/ 출력    │  4종 .md 파일
          │  또는 HTTP 응답  │
          └─────────────────┘
```

### 2.2 Data Flow

```
1. Client → GET /deliverables/export/{type}?organizationId={org}
2. svc-analytics → svc-policy: GET /policies?status=approved&organizationId={org}
                 → svc-ontology: GET /terms?organizationId={org}
                 → svc-extraction: GET /gap-analysis/overview?organizationId={org}
                 → svc-extraction: GET /gap-analysis/items?perspective={p}
3. 원본 데이터 수집 완료
4. deliverable-renderer.ts: 수집 데이터 → 마크다운 문서 변환
5. Response: Content-Disposition: attachment; filename="D1-인터페이스설계서-{org}-{date}.md"
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `deliverables.ts` (신규 라우트) | svc-policy (service binding) | 정책 데이터 조회 |
| `deliverables.ts` | svc-ontology (service binding) | 용어 데이터 조회 |
| `deliverables.ts` | svc-extraction (service binding) | Gap/FactCheck 데이터 조회 |
| `deliverable-renderer.ts` (신규) | 없음 (순수 함수) | 마크다운 변환 |

---

## 3. Data Model

### 3.1 수집 데이터 구조

4종 산출물 생성에 필요한 원본 데이터:

```typescript
/** D1 인터페이스 설계서용 데이터 */
interface InterfaceSpecData {
  // svc-extraction gap-analysis API에서 수집
  apiItems: PerspectiveItem[];      // perspective=api
  tableItems: PerspectiveItem[];    // perspective=table
  apiSummary: PerspectiveSummary;   // asIsCount, toBeCount, matchedCount, gapCount, coveragePct
  tableSummary: PerspectiveSummary;
  // svc-extraction factcheck에서 수집
  factCheckResults: FactCheckResult[];  // matched items with scores
  sourceStats: SourceStats;         // controllerCount, endpointCount, tableCount
}

/** D2 업무규칙 정의서용 데이터 */
interface BusinessRuleData {
  // svc-policy에서 수집
  policies: Policy[];               // status=approved, 848건
  // gap-categorizer 도메인 분류 적용
  domainSummaries: DomainGapSummary[];  // 17개 도메인별 집계
}

/** D3 용어사전용 데이터 */
interface GlossaryData {
  // svc-ontology에서 수집
  terms: Term[];                    // 7,332건
  termStats: TermStats;             // type distribution, Neo4j stats
  // 계층 구조
  hierarchyTree: HierarchyNode[];   // broader_term_id 기반 트리
}

/** D4 Gap 분석 종합 보고서용 데이터 */
interface GapReportData {
  overview: GapOverview;            // 4-perspective 종합
  domainSummaries: DomainGapSummary[];  // 도메인별 Gap
  findings: FindingSummary;
  // svc-analytics 기존 report sections
  existingSections: ReportSection[];
}
```

### 3.2 용어 계층 트리 구조 (신규)

```typescript
/** 용어사전의 계층 구조를 표현 */
interface HierarchyNode {
  termId: string;
  label: string;
  definition: string | null;
  termType: string;           // entity | relationship | attribute
  children: HierarchyNode[];  // broader_term_id로 연결된 하위 용어
  depth: number;              // 들여쓰기 깊이
}
```

DB 쿼리로 `broader_term_id IS NULL`인 루트 노드를 찾고, 재귀적으로 자식 노드를 연결한다.

---

## 4. API Specification

### 4.1 신규 Endpoint 목록

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /deliverables/export/interface-spec | D1 인터페이스 설계서 마크다운 다운로드 | Internal |
| GET | /deliverables/export/business-rules | D2 업무규칙 정의서 마크다운 다운로드 | Internal |
| GET | /deliverables/export/glossary | D3 용어사전 마크다운 다운로드 | Internal |
| GET | /deliverables/export/gap-report | D4 Gap 분석 종합 보고서 마크다운 다운로드 | Internal |
| GET | /deliverables/export/all | 4종 일괄 생성 (ZIP 또는 연결) | Internal |
| GET | /deliverables/export/comparison | As-Is vs To-Be 비교 매트릭스 | Internal |

**공통 Query Parameters**:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `organizationId` | Yes | 대상 조직 ID (LPON org) |
| `format` | No | `markdown` (default) 또는 `json` (원본 데이터) |

### 4.2 D1 인터페이스 설계서 Export

#### `GET /deliverables/export/interface-spec?organizationId={org}`

**내부 동작**:
1. svc-extraction `/gap-analysis/overview` 호출 → API/Table perspective 수집
2. svc-extraction `/gap-analysis/items?perspective=api` 호출 → 개별 API 항목 수집
3. `renderInterfaceSpec(data)` → 마크다운 생성

**Response** (200 OK):
```
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="D1-인터페이스설계서-lpon-2026-03-09.md"
```

**마크다운 출력 구조**:
```markdown
# 인터페이스 설계서 — 온누리상품권

> 생성일: {date} | 생성 방식: AI Foundry 역공학 | 조직: {orgName}

## 1. 문서 개요
- 대상 시스템: 온누리상품권 (LPON)
- 분석 소스: 소스코드 {controllerCount}개 컨트롤러, {endpointCount}개 엔드포인트
- 설계 문서: {docCount}건 인터페이스 설계서
- 매칭 커버리지: {coveragePct}%

## 2. 인터페이스 요약

| # | API ID | URL | Method | 매칭 상태 | 매칭 점수 | 비고 |
|---|--------|-----|--------|-----------|-----------|------|
| 1 | API-001 | /chargeDealing/... | POST | matched | 0.95 | 문서 §3.2 |
...

## 3. 검증 완료 인터페이스 ({matchedCount}건)

### 3.1 {apiName}
- **URL**: {path}
- **Method**: {method}
- **소스 위치**: {controller}#{methodName}
- **매칭 문서**: {docRef}
- **매칭 점수**: {score}
- **파라미터**:

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|:----:|------|
...

## 4. 미문서화 인터페이스 ({gapCount}건)
### 4.1 {apiName} [P1/P2/P3]
- **URL**: {path}
- **역공학 출처**: AST 파서 / LLM 추출
- **보완 필요**: {description}

## 5. 구현 미확인 인터페이스 ({docOnlyCount}건)

## 6. As-Is vs To-Be 매핑 매트릭스

| 비교 축 | As-Is (소스) | To-Be (문서) | Gap | 커버리지 |
|----------|-------------|-------------|-----|----------|
| 외부 API | {n}건 | {m}건 | {g}건 | {p}% |
| 내부 API | {n}건 | 0건 | {n}건 | 0% |
| 테이블 | {n}건 | {m}건 | {g}건 | {p}% |

## 7. 개선 권고사항
```

### 4.3 D2 업무규칙 정의서 Export

#### `GET /deliverables/export/business-rules?organizationId={org}`

**내부 동작**:
1. svc-policy `/policies?status=approved&organizationId={org}&limit=1000` 호출 (페이징)
2. 각 정책을 `categorizeGapDomain()` 로직으로 도메인 분류
3. `renderBusinessRules(policies, domainSummaries)` → 마크다운 생성

**마크다운 출력 구조**:
```markdown
# 업무규칙 정의서 — 온누리상품권

> 생성일: {date} | 총 규칙 수: {totalPolicies}건 | 도메인: {domainCount}개

## 1. 문서 개요
- 추출 방식: AI Foundry Stage 3 (Claude Opus 정책 추론)
- 검증 상태: {approvedCount}건 승인 (HITL 검토 완료)
- 신뢰 수준 분포: validated {n}건 / reviewed {n}건 / unreviewed {n}건

## 2. 업무규칙 분류 체계

| 도메인 | 한글명 | 규칙 수 | HIGH | MED | LOW |
|--------|--------|---------|:----:|:---:|:---:|
| charge | 충전/결제 | {n} | {h} | {m} | {l} |
| gift | 선물/쿠폰 | {n} | {h} | {m} | {l} |
...

## 3. 도메인별 업무규칙

### 3.1 충전/결제 (charge) — {n}건

| # | 규칙 코드 | 제목 | 조건 (IF) | 판단 기준 | 결과 (THEN) | 신뢰도 | 출처 |
|---|-----------|------|-----------|-----------|-------------|:------:|------|
| 1 | POL-GIFTVOUCHER-IS-001 | {title} | {condition} | {criteria} | {outcome} | {trustLevel} | {sourceDoc} |
...

### 3.2 선물/쿠폰 (gift) — {n}건
...

## 4. 정책 코드 체계
- 형식: `POL-GIFTVOUCHER-{TYPE}-{SEQ}`
- TYPE 목록: IS(발행), DT(유통), US(사용), ST(정산), MG(관리), RG(규정), RF(환불), VL(검증), NF(알림), EX(예외)

## 5. 규칙 간 관계 분석
### 5.1 동일 출처 문서에서 추출된 규칙 그룹
### 5.2 도메인 간 교차 규칙

## 6. 검토 및 조정 이력
(인터뷰 후 추가)
```

### 4.4 D3 용어사전 Export

#### `GET /deliverables/export/glossary?organizationId={org}`

**내부 동작**:
1. svc-ontology `/terms?organizationId={org}&limit=10000` 호출 (페이징)
2. svc-ontology `/terms/stats?organizationId={org}` 호출
3. `broader_term_id` 기반 계층 트리 구축
4. `renderGlossary(terms, stats, hierarchy)` → 마크다운 생성

**계층 트리 구축 알고리즘**:
```typescript
function buildHierarchyTree(terms: Term[]): HierarchyNode[] {
  const byId = new Map(terms.map(t => [t.termId, t]));
  const roots: HierarchyNode[] = [];
  const nodeMap = new Map<string, HierarchyNode>();

  // 1차: 모든 노드 생성
  for (const term of terms) {
    nodeMap.set(term.termId, {
      termId: term.termId,
      label: term.label,
      definition: term.definition,
      termType: term.termType,
      children: [],
      depth: 0,
    });
  }

  // 2차: 부모-자식 연결
  for (const term of terms) {
    const node = nodeMap.get(term.termId)!;
    if (term.broaderTermId && nodeMap.has(term.broaderTermId)) {
      const parent = nodeMap.get(term.broaderTermId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }
  return roots;
}
```

**마크다운 출력 구조**:
```markdown
# 용어사전 — 온누리상품권

> 생성일: {date} | 총 용어 수: {totalTerms}건 | 고유 레이블: {distinctLabels}건

## 1. 문서 개요
- 추출 방식: AI Foundry Stage 4 (SKOS/JSON-LD + Neo4j)
- 임베딩 모델: {embeddingModel}
- Neo4j 동기화: {syncedCount}건

## 2. 용어 유형 분포

| 유형 | 건수 | 비율 |
|------|-----:|-----:|
| Entity (개체) | {n} | {p}% |
| Relationship (관계) | {n} | {p}% |
| Attribute (속성) | {n} | {p}% |

## 3. 핵심 용어 (Entity)

| # | 용어 | 정의 | 상위 개념 | SKOS URI | 출처 |
|---|------|------|-----------|----------|------|
| 1 | 상품권 | {definition} | — (루트) | {skosUri} | {ontologyId} |
| 2 | 충전상품권 | {definition} | 상품권 | {skosUri} | {ontologyId} |
...

## 4. 관계 용어 (Relationship)
(동일 테이블 형식)

## 5. 속성 용어 (Attribute)
(동일 테이블 형식)

## 6. 용어 계층 트리

```
상품권
├── 충전상품권
│   ├── 모바일충전
│   └── 카드충전
├── 선물상품권
│   ├── 전자선물
│   └── 실물선물
└── 환불
    ├── 전액환불
    └── 부분환불
```

## 7. 크로스 도메인 매핑
(퇴직연금 도메인과의 용어 대응 관계 — 향후)
```

### 4.5 D4 Gap 분석 종합 보고서 Export

#### `GET /deliverables/export/gap-report?organizationId={org}`

**내부 동작**:
1. svc-extraction `/gap-analysis/overview` 호출
2. 각 perspective별 `/gap-analysis/items` 호출
3. svc-analytics `/reports/sections` 호출 (기존 동적 보고서 데이터)
4. `renderGapReport(overview, domainSummaries, sections)` → 마크다운 생성

**마크다운 출력 구조**:
```markdown
# Gap 분석 종합 보고서 — 온누리상품권

> 생성일: {date} | AI Foundry v0.6.0 | FactCheck 3-Phase 매칭 엔진

## 1. Executive Summary

| 지표 | 값 |
|------|------|
| 분석 대상 문서 | 88건 (85건 파싱 성공) |
| 추출 정책 | 848건 (전량 approved) |
| 소스코드 API | 382건 (230 API + 152 Table) |
| 문서 API | 109건 (114 API + 12 Table) |
| **전체 커버리지** | **31.2%** (119/382) |
| 외부 API 커버리지 | 83.7% (103/123) |
| 문서 역방향 커버리지 | 90.4% (103/114) |
| 테이블 커버리지 | 100% (12/12) |

## 2. 분석 방법론
### 2.1 5-Stage 파이프라인
### 2.2 FactCheck 3-Phase 매칭
- Step 1: Exact match (path normalization)
- Step 1.5: Resource path match (score ≥ 0.85)
- Step 2: Fuzzy match (camelCase split + Jaccard ≥ 0.6)
- LLM Semantic: Claude Sonnet 개별 판정 (282건 → 21건 신규 매칭)

## 3. Perspective별 분석

### 3.1 Process Perspective
### 3.2 Architecture Perspective
### 3.3 API Perspective
(상세 테이블)
### 3.4 Table Perspective
(상세 테이블)

## 4. 도메인별 Gap 상세

| 도메인 | 한글명 | 총 Gap | HIGH | MED | LOW | 노이즈 |
|--------|--------|--------|:----:|:---:|:---:|:------:|
| charge | 충전/결제 | {n} | {h} | {m} | {l} | {noise} |
...

## 5. 미문서화 API 명세 (AIF-ANLS-018)

### P1 — 즉시 보완 필요 (7건)
(API 상세 명세)

### P2 — 중기 보완 (5건)
### P3 — 장기 / 선택 (4건)

## 6. As-Is vs To-Be 종합 비교

### 6.1 소스코드(As-Is) vs 설계문서(To-Be) Gap
| 비교 축 | As-Is | To-Be | 매칭 | Gap | 커버리지 |
|----------|-------|-------|------|-----|----------|
| 외부 API | 123 | 114 | 103 | 20 | 83.7% |
| 내부 API | 259 | 0 | 0 | 259 | 0% |
| 테이블 | 152 | 12 | 12 | 140 | 7.9% |

### 6.2 기존 산출물(As-Is) vs AI 추출(To-Be) 품질 비교
| 항목 | 기존 산출물 | AI 추출 | 비교 |
|------|-----------|---------|------|
| API 목록 | 114건 | 382건 | AI +268 (3.4x) |
| 업무규칙 | (수작업 추정) | 848건 | 자동 추출 |
| 용어 정의 | (수작업 추정) | 7,332건 | 자동 추출 |
| 소요 시간 | 수주~수개월 | ~2시간 | 90%+ 절감 |

## 7. 개선 로드맵 및 권고사항
## 8. 부록: 매칭 알고리즘 상세
```

### 4.6 As-Is vs To-Be 비교 매트릭스

#### `GET /deliverables/export/comparison?organizationId={org}`

4종 산출물의 핵심 지표를 하나의 비교표로 요약한다.

```markdown
# As-Is vs To-Be 비교 매트릭스 — 온누리상품권

| 산출물 | 항목 | As-Is (기존/소스) | To-Be (AI 추출) | 차이 | 판정 |
|--------|------|------------------|-----------------|------|------|
| D1 인터페이스 | API 목록 건수 | 114건 (설계서) | 382건 (역공학) | +268 | AI 우위 |
| D1 인터페이스 | 외부API 커버리지 | 기준 | 83.7% | — | 양호 |
| D2 업무규칙 | 규칙 건수 | ? (수작업) | 848건 | — | 평가필요 |
| D2 업무규칙 | 정확도 | 100% (검증) | ?% (인터뷰 전) | — | 평가필요 |
| D3 용어사전 | 용어 건수 | ? (수작업) | 7,332건 | — | 평가필요 |
| D4 Gap보고서 | 분석 관점 | 단일 | 4-perspective | — | AI 우위 |
| 공통 | 생성 소요 시간 | 수주 (추정) | ~2시간 | — | AI 우위 |
```

---

## 5. 구현 상세

### 5.1 파일 구조

```
services/svc-analytics/src/
├── routes/
│   ├── reports.ts                   (기존 — 변경 없음)
│   └── deliverables.ts              (신규 — 4종 산출물 Export 라우트)
├── renderers/
│   ├── interface-spec-renderer.ts   (신규 — D1 마크다운 렌더러)
│   ├── business-rules-renderer.ts   (신규 — D2 마크다운 렌더러)
│   ├── glossary-renderer.ts         (신규 — D3 마크다운 렌더러)
│   ├── gap-report-renderer.ts       (신규 — D4 마크다운 렌더러)
│   └── comparison-renderer.ts       (신규 — As-Is/To-Be 비교표)
└── collectors/
    └── data-collector.ts            (신규 — 다중 서비스 데이터 수집)
```

### 5.2 데이터 수집기 (data-collector.ts)

```typescript
/**
 * 다중 서비스에서 산출물 생성에 필요한 데이터를 병렬 수집한다.
 * Service Binding을 통해 내부 API를 호출한다.
 */
interface DataCollectorEnv {
  SVC_POLICY: Fetcher;      // service binding
  SVC_ONTOLOGY: Fetcher;    // service binding
  SVC_EXTRACTION: Fetcher;  // service binding
  INTERNAL_API_SECRET: string;
}

export async function collectPolicies(
  env: DataCollectorEnv,
  organizationId: string
): Promise<Policy[]> {
  // 페이징: limit=500씩 반복
  // svc-policy GET /policies?status=approved&organizationId={org}&limit=500&offset={n}
}

export async function collectTerms(
  env: DataCollectorEnv,
  organizationId: string
): Promise<{ terms: Term[]; stats: TermStats }> {
  // svc-ontology GET /terms?organizationId={org}&limit=5000&offset={n}
  // svc-ontology GET /terms/stats?organizationId={org}
}

export async function collectGapAnalysis(
  env: DataCollectorEnv,
  organizationId: string
): Promise<GapReportData> {
  // svc-extraction GET /gap-analysis/overview?organizationId={org}
  // svc-extraction GET /gap-analysis/items?perspective=api
  // svc-extraction GET /gap-analysis/items?perspective=table
}
```

### 5.3 라우트 핸들러 (deliverables.ts)

```typescript
import { Hono } from 'hono';

const deliverables = new Hono<{ Bindings: Env }>();

// D1 인터페이스 설계서
deliverables.get('/export/interface-spec', async (c) => {
  const orgId = c.req.query('organizationId');
  // 1. collectGapAnalysis(env, orgId)
  // 2. renderInterfaceSpec(data)
  // 3. return markdown with Content-Disposition
});

// D2 업무규칙 정의서
deliverables.get('/export/business-rules', async (c) => {
  const orgId = c.req.query('organizationId');
  // 1. collectPolicies(env, orgId)
  // 2. 도메인 분류 (categorizeGapDomain 로직 적용)
  // 3. renderBusinessRules(policies, domainSummaries)
});

// D3 용어사전
deliverables.get('/export/glossary', async (c) => {
  const orgId = c.req.query('organizationId');
  // 1. collectTerms(env, orgId)
  // 2. buildHierarchyTree(terms)
  // 3. renderGlossary(terms, stats, hierarchy)
});

// D4 Gap 종합 보고서
deliverables.get('/export/gap-report', async (c) => {
  const orgId = c.req.query('organizationId');
  // 1. collectGapAnalysis(env, orgId)
  // 2. collectPolicies(env, orgId) — 도메인 분류용
  // 3. renderGapReport(overview, domainSummaries, findings)
});

// 비교 매트릭스
deliverables.get('/export/comparison', async (c) => {
  const orgId = c.req.query('organizationId');
  // 1. collect all data
  // 2. renderComparison(allData)
});

// 4종 일괄 (연결된 단일 마크다운)
deliverables.get('/export/all', async (c) => {
  // 1~4 전부 수집 + 렌더링 후 연결
});

export default deliverables;
```

### 5.4 렌더러 공통 패턴

모든 렌더러는 동일한 패턴을 따른다:

```typescript
/**
 * 렌더러 공통 인터페이스
 * 입력: 수집된 원본 데이터
 * 출력: 마크다운 문자열
 */
export function renderInterfaceSpec(data: InterfaceSpecData): string {
  const lines: string[] = [];

  // 1. 문서 헤더
  lines.push(`# 인터페이스 설계서 — 온누리상품권`);
  lines.push('');
  lines.push(`> 생성일: ${new Date().toISOString().slice(0, 10)} | AI Foundry 역공학`);
  lines.push('');

  // 2. 요약 테이블
  lines.push('## 1. 문서 개요');
  // ...

  // 3. 상세 섹션
  // matched items → §3
  // gap items → §4
  // comparison matrix → §6

  return lines.join('\n');
}
```

### 5.5 도메인 분류 재사용

`svc-extraction`의 `categorizeGapDomain()` 함수는 Gap 항목(FactCheckGap)에 대한 분류기이다. 업무규칙 정의서(D2)에서는 **정책(Policy)**을 분류해야 하므로 약간의 어댑터가 필요하다:

```typescript
/**
 * 정책의 policy_code에서 도메인을 추출한다.
 * POL-GIFTVOUCHER-IS-001 → type="IS", domain="issuance"
 * 기존 gap-categorizer의 17개 도메인과 별도로,
 * 정책은 policy_code의 TYPE 코드로 1차 분류한다.
 */
function classifyPolicyDomain(policyCode: string): {
  typeCode: string;     // IS, DT, US, ST, MG, RG, RF, VL, NF, EX
  typeName: string;     // 발행, 유통, 사용, 정산, ...
} {
  const parts = policyCode.split('-');
  // POL-GIFTVOUCHER-IS-001 → parts[2] = "IS"
  const typeCode = parts[2] ?? 'UNKNOWN';
  const TYPE_NAMES: Record<string, string> = {
    IS: '발행', DT: '유통', US: '사용', ST: '정산',
    MG: '관리', RG: '규정', RF: '환불', VL: '검증',
    NF: '알림', EX: '예외',
  };
  return {
    typeCode,
    typeName: TYPE_NAMES[typeCode] ?? '미분류',
  };
}
```

---

## 6. Service Binding 설정

`svc-analytics`가 `svc-policy`, `svc-ontology`, `svc-extraction`을 호출하려면 service binding이 필요하다.

### 6.1 wrangler.toml 추가 (svc-analytics)

```toml
# 기존 bindings에 추가
[[services]]
binding = "SVC_POLICY"
service = "svc-policy"

[[services]]
binding = "SVC_ONTOLOGY"
service = "svc-ontology"

[[services]]
binding = "SVC_EXTRACTION"
service = "svc-extraction"

[env.production]
[[env.production.services]]
binding = "SVC_POLICY"
service = "svc-policy-production"

[[env.production.services]]
binding = "SVC_ONTOLOGY"
service = "svc-ontology-production"

[[env.production.services]]
binding = "SVC_EXTRACTION"
service = "svc-extraction-production"
```

### 6.2 Env 타입 업데이트

```typescript
// services/svc-analytics/src/types.ts
interface Env {
  // 기존...
  DB_ANALYTICS: D1Database;
  INTERNAL_API_SECRET: string;
  // 신규 service bindings
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_EXTRACTION: Fetcher;
}
```

---

## 7. 인터뷰 평가 반영 설계

인터뷰 결과를 산출물에 반영하는 방식:

### 7.1 마크다운 주석 방식 (경량)

인터뷰 후 산출물 마크다운에 직접 주석/표시를 추가한다:

```markdown
| 1 | POL-GIFTVOUCHER-IS-001 | 충전 한도 검증 | ... | reviewed | 문서A |
| | | **[T1 평가]** 정확 — 현업 확인 완료 | | | |
| 2 | POL-GIFTVOUCHER-IS-002 | 충전 취소 규칙 | ... | reviewed | 문서B |
| | | **[T1 평가]** 부정확 — 조건 수정 필요: "3일" → "5영업일" | | | |
```

### 7.2 trust level 업데이트 (시스템 반영)

인터뷰에서 "정확" 판정된 정책은 trust_level을 `validated`로 승격:

```
PATCH /policies/{id}
{ "trustLevel": "validated", "trustScore": 0.95 }
```

### 7.3 조정 이력 관리

산출물 마크다운 끝에 "검토 및 조정 이력" 섹션을 추가:

```markdown
## 검토 및 조정 이력

| 일자 | 평가자 | Tier | 변경 내용 |
|------|--------|------|-----------|
| 2026-03-15 | 김OO (현업) | T1 | IS-002 조건 수정, IS-015 누락 규칙 추가 |
| 2026-03-16 | 박OO (SI) | T2 | D1 §3.2 파라미터 보완, API-045 명세 추가 |
```

---

## 8. Error Handling

### 8.1 서비스 호출 실패 처리

| 실패 대상 | 영향 | 처리 |
|-----------|------|------|
| svc-policy 호출 실패 | D2 생성 불가 | 해당 섹션 "데이터 수집 실패" 표시, 나머지 산출물은 정상 생성 |
| svc-ontology 호출 실패 | D3 생성 불가 | 동일 |
| svc-extraction 호출 실패 | D1, D4 생성 불가 | 동일 |
| 부분 데이터 (페이징 중 오류) | 불완전 산출물 | 수집 건수 표시 + 경고 메시지 |

### 8.2 대용량 데이터 처리

- 정책 848건, 용어 7,332건 → 마크다운 렌더링 시 메모리 부담은 경미
- 30초 Workers timeout 내 충분히 처리 가능 (예상: 2~5초)
- 일괄 export (/all)의 경우 병렬 수집으로 시간 최적화

---

## 9. Test Plan

### 9.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit Test | 렌더러 함수 (마크다운 출력 정합성) | Vitest |
| Unit Test | 데이터 수집기 (API 호출 모킹) | Vitest + MSW |
| Unit Test | 도메인 분류 (정책 코드 파싱) | Vitest |
| Integration Test | /deliverables/export/* 엔드포인트 | Vitest + Miniflare |

### 9.2 Test Cases

- [ ] D1: FactCheck matched/gap 항목이 올바른 섹션에 배치되는가
- [ ] D2: 848건 정책이 policy_code TYPE별로 정확히 분류되는가
- [ ] D3: broader_term_id 기반 트리가 올바르게 구축되는가
- [ ] D3: 루트 노드(broader=null)가 최상위에 위치하는가
- [ ] D4: 4-perspective 커버리지 수치가 overview API와 일치하는가
- [ ] 비교 매트릭스: As-Is/To-Be 건수가 원본과 일치하는가
- [ ] 서비스 호출 실패 시 graceful degradation
- [ ] 마크다운 인코딩 (UTF-8 BOM 불필요, 한글 정상 출력)

---

## 10. Implementation Order

### 10.1 단계별 구현 순서

```
Step 1: 인프라 준비 (0.5일)
  ├─ svc-analytics wrangler.toml에 service binding 추가
  ├─ Env 타입에 SVC_POLICY, SVC_ONTOLOGY, SVC_EXTRACTION 추가
  └─ deliverables.ts 라우트 스켈레톤 + index.ts에 mount

Step 2: 데이터 수집기 (1일)
  ├─ data-collector.ts: collectPolicies(), collectTerms(), collectGapAnalysis()
  ├─ 페이징 처리 + 에러 핸들링
  └─ 유닛 테스트 (모킹)

Step 3: D2 업무규칙 정의서 렌더러 (0.5일)
  ├─ business-rules-renderer.ts
  ├─ classifyPolicyDomain() 도메인 분류
  └─ 테스트 + 실데이터 검증

Step 4: D1 인터페이스 설계서 렌더러 (0.5일)
  ├─ interface-spec-renderer.ts
  ├─ matched/gap/docOnly 섹션 분리
  └─ 테스트

Step 5: D3 용어사전 렌더러 (0.5일)
  ├─ glossary-renderer.ts
  ├─ buildHierarchyTree() 계층 구축
  └─ 테스트

Step 6: D4 Gap 보고서 렌더러 (0.5일)
  ├─ gap-report-renderer.ts
  ├─ 기존 report sections 데이터 통합
  └─ 테스트

Step 7: 비교 매트릭스 + 일괄 Export (0.5일)
  ├─ comparison-renderer.ts
  ├─ /export/all 엔드포인트
  └─ 통합 테스트

Step 8: 배포 + 실데이터 산출물 생성 (0.5일)
  ├─ staging 배포
  ├─ LPON org ID로 4종 산출물 실 생성
  └─ docs/ 디렉토리에 산출물 저장
```

### 10.2 핵심 파일 목록

| 파일 | 상태 | 설명 |
|------|------|------|
| `services/svc-analytics/src/routes/deliverables.ts` | 신규 | 6개 Export 엔드포인트 |
| `services/svc-analytics/src/collectors/data-collector.ts` | 신규 | 다중 서비스 데이터 수집 |
| `services/svc-analytics/src/renderers/interface-spec-renderer.ts` | 신규 | D1 렌더러 |
| `services/svc-analytics/src/renderers/business-rules-renderer.ts` | 신규 | D2 렌더러 |
| `services/svc-analytics/src/renderers/glossary-renderer.ts` | 신규 | D3 렌더러 |
| `services/svc-analytics/src/renderers/gap-report-renderer.ts` | 신규 | D4 렌더러 |
| `services/svc-analytics/src/renderers/comparison-renderer.ts` | 신규 | 비교표 렌더러 |
| `services/svc-analytics/wrangler.toml` | 수정 | service binding 추가 |
| `services/svc-analytics/src/types.ts` | 수정 | Env 타입 업데이트 |
| `services/svc-analytics/src/index.ts` | 수정 | deliverables 라우트 mount |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-09 | Initial draft | AX BD팀 |
