# v0.7.4 Pivot Plan — Source-Document Fact Check + Dev Spec Package

> **Summary**: PRD v0.7.4 방향 전환에 따른 전체 로드맵. 기존 v0.6 Skill 파이프라인을 유지하면서, 소스코드-문서 팩트 체크 엔진과 개발 Spec 패키지 출력을 병행 구축한다. 1차 파일럿 대상: 온누리상품권(LPON).
>
> **Project**: RES AI Foundry
> **Version**: v1.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-06
> **Status**: Draft
> **PRD Reference**: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`

---

## 0. Key Decisions

| # | 항목 | 결정 | 근거 |
|---|------|------|------|
| D-1 | **기존 파이프라인** | 유지 + 병행 | Miraeasset 948건 + LPON 61건 데이터 보존. svc-ontology/svc-skill은 현 상태 유지 |
| D-2 | **소스코드 AST 파싱** | Regex 기반 annotation 추출 (Pilot Core) | Workers 환경에서 JavaParser 불가. Tree-sitter WASM은 Pilot Plus로 이연 |
| D-3 | **팩트 체크 엔진** | svc-extraction 내 `factcheck/` 모듈 추가 | 기존 extraction 인프라(D1, Queue, LLM) 재활용 |
| D-4 | **Spec 타입** | `packages/types/src/spec.ts` 신규 | 기존 skill.ts, analysis.ts와 병렬. API/Table/Policy Spec + FactCheck 타입 |
| D-5 | **프론트엔드** | 기존 페이지 유지 + 신규 Fact Check 페이지 추가 | 점진적 전환. 기존 15 페이지 + 신규 4~5 페이지 |
| D-6 | **페르소나** | v0.6 RBAC 유지 + v0.7.4 매핑 레이어 | Analyst→개발자/DA, Reviewer→AA/기획자, Executive→PM/PMO |
| D-7 | **파일럿 데이터** | LPON 온누리상품권 소스코드 + 산출물 | PRD §2.1 기준. 소스+문서 모두 보유 |
| D-8 | **개발 우선순위** | Fact Check Engine → API/Table 추출 → Export → UI (PRD §7.5) | 엔진이 핵심 가치. UI는 마지막 |

---

## 1. As-Is (현재 시스템 — v0.6)

### 1.1 파이프라인
```
Stage 1 (svc-ingestion) → Stage 2 (svc-extraction) → Stage 3 (svc-policy)
    → Stage 4 (svc-ontology) → Stage 5 (svc-skill)
```
- **입력**: PDF, PPTX, DOCX, XLSX, PNG, TXT (문서 전용)
- **출력**: .skill.json (정책 트리플 패키지)
- **데이터**: Miraeasset 948건 + LPON 61건 (1,009 documents)

### 1.2 서비스별 현황

| 서비스 | 핵심 기능 | LOC (src/) | 테스트 |
|--------|----------|-----------|--------|
| svc-ingestion | 문서 파싱 (XLSX/DOCX/PDF via Unstructured.io) | ~1,200 | 있음 |
| svc-extraction | 3-Pass 분석 (추출→스코어링→진단) | ~2,500 | 있음 |
| svc-policy | 정책 후보 생성 + HITL (DO) | ~2,000 | 105 tests |
| svc-ontology | Neo4j 그래프 + 용어사전 | ~1,500 | 18 tests (일부 실패) |
| svc-skill | Skill 패키징 + MCP 어댑터 | ~1,200 | 있음 |
| svc-llm-router | 4-provider fallback + AI Gateway | ~800 | 있음 |
| svc-security | RBAC + PII masking + 감사 로그 | ~600 | 있음 |
| app-web | 15 페이지, 64 컴포넌트, 13 API 모듈 | ~4,000 | 없음 |

### 1.3 부재 기능 (v0.7.4 대비 Gap)
- **소스코드 파싱**: 없음 (Java/React AST)
- **소스↔문서 팩트 체크**: 없음
- **Gap 분류 체계**: 없음 (SM/MC/PM/TM)
- **Spec 출력 타입**: 없음 (spec-api.json, spec-table.json)
- **페르소나 기반 편집 UI**: 없음
- **Export 기능**: 없음 (Word/Markdown/JSON/Excel)

---

## 2. To-Be (목표 시스템 — v0.7.4)

### 2.1 새 파이프라인 (PRD §7.2)
```
Stage 1-A: 문서 파싱 (기존 유지)
Stage 1-B: 소스코드 파싱 (신규 — Regex/AST → JSON)
Stage 2:   통합 추출 + 팩트 체크 (핵심 — 소스+문서 병렬 분석, Gap 탐지)
Stage 3-A: API/Table Spec 확정 (높은 신뢰도 — 자동 + 담당자 확인)
Stage 3-B: 정책 후보 생성 (중간 신뢰도 — 기획자 검증, Pilot Plus)
Stage 4:   Spec 정제 + 검토/수정 (페르소나별 HITL)
Stage 5:   Spec 패키지 출력 (§5.3 샘플 형식)
```

### 2.2 Spec 출력 형식 (PRD §5.3-5.4)

| 파일 | 형식 | 용도 |
|------|------|------|
| `spec-api.json` | JSON (OpenAPI 3.0 호환) | API Spec — 엔드포인트, 파라미터, 응답 스키마 |
| `spec-table.json` | JSON (ERD 구조화) | Table Spec — 테이블, 컬럼, 관계, FK |
| `spec-policy.json` | JSON (조건-기준-결과) | Policy Spec — 비즈니스 규칙 후보 (Pilot Plus) |
| `fact-check-report.md` | Markdown | Gap 탐지 결과 리포트 |
| `spec-summary.xlsx` | Excel | 경영진 보고용 요약 |

### 2.3 KPI (PRD §8.2)

| 지표 | 목표 | 공식 |
|------|------|------|
| Critical API Coverage | >= 80% | (추출 API ∩ 문서 API) / 문서 API |
| Critical Table Coverage | >= 80% | (추출 Table ∩ 문서 Table) / 문서 Table |
| Reviewer Acceptance Rate | >= 70% | 수정 없이 수용한 항목 / 전체 |
| Gap Precision | >= 75% | 실제 Gap / 자동 탐지 Gap |
| Spec 편집 시간 단축률 | >= 30% | 기존 수작업 대비 |

---

## 3. 서비스 재활용 평가

| 서비스 | 판정 | 변경 범위 | 예상 작업량 |
|--------|------|----------|------------|
| **svc-ingestion** | 🔄 확장 | `parsing/java-spring.ts` + `parsing/ddl.ts` 신규. ALLOWED_TYPES 확장 | 중 (2세션) |
| **svc-extraction** | 🔄 확장 | `factcheck/` 모듈 디렉토리 신규. 기존 3-Pass에 Fact Check Pass 추가 | 대 (4~5세션) |
| **svc-policy** | 🔄 확장 | 정책 후보 생성 모드 추가 (기존 HITL 유지) | 소 (Pilot Plus) |
| **svc-llm-router** | ✅ 재활용 | 변경 없음 | — |
| **svc-security** | ✅ 재활용 | 변경 없음 | — |
| **svc-governance** | ✅ 재활용 | 변경 없음 | — |
| **svc-ontology** | ⏸ 보류 | Pilot Plus 이후 재검토 | — |
| **svc-skill** | ⏸ 보류 | Spec 패키지 출력 기능 전환 검토 (Pilot Plus) | — |
| **svc-queue-router** | ✅ 재활용 | 새 이벤트 타입 추가 시 재배포 | 소 |
| **svc-mcp-server** | ✅ 재활용 | Spec 조회 tool 추가 가능 | 소 (Pilot Plus) |
| **app-web** | 🔄 확장 | 신규 4~5 페이지 + Spec 관련 컴포넌트 | 대 (3~4세션) |
| **packages/types** | 🔄 확장 | `spec.ts`, `factcheck.ts` 신규 타입 | 중 (1세션) |

---

## 4. Phase 2-A: 소스코드 파싱 (Foundation)

### 4.1 목표
Java Spring 프로젝트 소스코드를 업로드하여 구조화된 AST JSON으로 변환한다.
LLM을 사용하지 않는 정적 분석 단계 (PRD §7.4 1단계).

### 4.2 파싱 대상 (PRD §7.3 — Pilot Core 범위)

| 파싱 대상 | 추출 방법 | 출력 요소 |
|-----------|----------|----------|
| `@Controller` / `@RestController` | Regex 패턴 매칭 | `CodeController` (클래스명, 베이스 경로) |
| `@RequestMapping` / `@GetMapping` 등 | Regex 패턴 매칭 | `CodeEndpoint` (HTTP 메서드, 경로, 파라미터) |
| `@Entity` / `@Table` / `@Column` | Regex 패턴 매칭 | `CodeEntity` (테이블명, 컬럼 목록, 타입, PK/FK) |
| DDL (schema.sql, Flyway) | SQL 파서 (regex) | `CodeDDL` (CREATE TABLE, 컬럼, 제약조건) |
| `@Transactional` 서비스 메서드 | Regex 패턴 매칭 | `CodeTransaction` (메서드명, DB write 대상) |

### 4.3 기술 설계

**왜 Regex인가 (Tree-sitter WASM 대신)**:
- Cloudflare Workers는 WASM 번들 크기 제한 (1MB compressed)
- Tree-sitter Java grammar WASM은 ~500KB — 가능하나 복잡
- Spring annotation은 구조가 정규적이어서 Regex로 95%+ 커버 가능
- Pilot Core에서 Regex 검증 후, Pilot Plus에서 Tree-sitter 도입 판단

**구현 계획**:

```
services/svc-ingestion/src/parsing/
├── java-spring.ts      # @Controller, @RequestMapping, @Service 등
├── jpa-entity.ts       # @Entity, @Table, @Column, @Id, @ManyToOne 등
├── ddl.ts              # CREATE TABLE, ALTER TABLE, FK constraints
├── java-transactional.ts  # @Transactional 메서드 + DB write 감지
└── code-classifier.ts  # 소스 파일 분류 (Controller/Entity/Service/Repository)
```

**새 element types** (기존 `XlSheet:*`, `Table`, `NarrativeText` 등에 추가):
- `CodeController` — 컨트롤러 클래스 메타데이터
- `CodeEndpoint` — API 엔드포인트 (method, path, params, returnType)
- `CodeEntity` — JPA 엔티티 (tableName, columns[], constraints[])
- `CodeDDL` — DDL 스키마 (tableName, columns[], foreignKeys[])
- `CodeTransaction` — 트랜잭션 서비스 메서드 (methodName, dbWrites[])

**svc-ingestion 변경사항**:
1. `routes/upload.ts` — ALLOWED_TYPES에 `.java`, `.sql` 추가
2. `queue.ts` — 소스 파일 라우팅 분기 추가
3. `parsing/validator.ts` — Java/SQL 파일 검증 로직
4. `env.ts` — 변경 없음 (기존 바인딩 재활용)

**Queue 이벤트**: 기존 `ingestion.completed` 그대로 사용. `classification`에 `source_controller`, `source_entity`, `source_ddl`, `source_service` 추가.

### 4.4 산출물
- `parsing/java-spring.ts` + `jpa-entity.ts` + `ddl.ts` + `java-transactional.ts` (4 파서 모듈)
- 단위 테스트 (실제 Spring Boot 코드 샘플 기반)
- `packages/types/src/spec.ts` — CodeElement 타입 정의

### 4.5 의존성
- 없음 (독립 구현 가능)

### 4.6 예상: 2세션

---

## 5. Phase 2-B: 팩트 체크 엔진 (Core Value)

### 5.1 목표
소스코드 추출 결과(Stage 1-B)와 문서 추출 결과(Stage 1-A)를 교차 비교하여 Gap을 탐지한다.
PRD §4.3 기준: 4종 Gap 유형 + 3단계 Severity.

### 5.2 Gap 유형 (PRD §4.3)

| Gap 유형 | 정의 | 소스 | KPI 목표 |
|----------|------|------|----------|
| Schema Mismatch (SM) | 소스-문서 스키마 구조 불일치 | Entity vs ERD | >= 70% |
| Missing Column (MC) | 소스에 있으나 문서에 없는 컬럼 | Entity vs 테이블정의서 | >= 80% |
| Parameter Mismatch (PM) | API 파라미터 불일치 | Controller vs API정의서 | >= 75% |
| Type Mismatch (TM) | 데이터 타입 불일치 | Entity vs 테이블정의서 | >= 80% |

### 5.3 Gap Severity (PRD §4.3 v0.7.4 신규)

| Severity | 판단 기준 | 처리 방침 |
|----------|----------|----------|
| HIGH | 외부 API 필수 파라미터 불일치, 핵심 테이블 컬럼 누락 | 리뷰어 필수 확인 |
| MEDIUM | 데이터 타입 차이, 선택 파라미터 불일치 | 검토 권장 |
| LOW | 명명 규칙 차이, 내부 유틸 API 표기 차이 | 자동 수용 가능 |

### 5.4 기술 설계

**2단계 매칭 전략**:

```
Step 1: Structural Matching (LLM 미사용)
  - 이름 기반 매칭: 테이블명, API 경로, 컬럼명 fuzzy match
  - 타입 매핑 테이블: Java↔SQL 타입 변환 규칙 (Long↔BIGINT, String↔VARCHAR 등)
  - FK 참조 그래프 비교

Step 2: Semantic Matching (LLM 사용 — Sonnet)
  - Step 1에서 매칭되지 않은 항목 → LLM이 의미 기반 매칭 시도
  - Gap 해석: "이것은 명명 규칙 차이인가, 실제 누락인가?"
  - Severity 자동 판정 (기본 매핑 + 컨텍스트 보정)
```

**구현 계획**:

```
services/svc-extraction/src/factcheck/
├── matcher.ts         # Step 1: 구조적 매칭 (이름, 타입, FK)
├── gap-detector.ts    # Gap 유형 분류 (SM/MC/PM/TM)
├── severity.ts        # Severity 판정 (기본 매핑 + 조건 상향/하향)
├── llm-matcher.ts     # Step 2: LLM 시맨틱 매칭 (Sonnet)
├── types.ts           # 모듈 내부 타입 (MatchResult, GapRecord 등)
└── report.ts          # fact-check-report.md 생성
```

**D1 스키마 확장** (`db-structure`):

```sql
-- 0005_factcheck.sql
CREATE TABLE fact_check_results (
  result_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  source_document_id TEXT,          -- 소스코드 document_id
  organization_id TEXT NOT NULL,
  spec_type TEXT NOT NULL,          -- 'api' | 'table'
  total_items INTEGER DEFAULT 0,
  matched_items INTEGER DEFAULT 0,
  gap_count INTEGER DEFAULT 0,
  coverage_pct REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',    -- pending | completed | failed
  result_json TEXT,                 -- 전체 매칭 결과 JSON
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE fact_check_gaps (
  gap_id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  gap_type TEXT NOT NULL,           -- SM | MC | PM | TM
  severity TEXT NOT NULL,           -- HIGH | MEDIUM | LOW
  source_item TEXT NOT NULL,        -- 소스 측 항목 (JSON)
  document_item TEXT,               -- 문서 측 항목 (JSON, NULL=missing)
  description TEXT NOT NULL,
  evidence TEXT,
  auto_resolved BOOLEAN DEFAULT FALSE,
  review_status TEXT DEFAULT 'pending',  -- pending | confirmed | dismissed | modified
  reviewer_id TEXT,
  reviewer_comment TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_fc_results_org ON fact_check_results(organization_id);
CREATE INDEX idx_fc_results_doc ON fact_check_results(document_id);
CREATE INDEX idx_fc_gaps_result ON fact_check_gaps(result_id);
CREATE INDEX idx_fc_gaps_severity ON fact_check_gaps(severity);
CREATE INDEX idx_fc_gaps_type ON fact_check_gaps(gap_type);
CREATE INDEX idx_fc_gaps_review ON fact_check_gaps(review_status);
```

**새 Queue 이벤트**:
- `factcheck.requested` — 소스+문서 쌍이 준비되면 팩트 체크 시작
- `factcheck.completed` — 팩트 체크 결과 준비 완료

**API 엔드포인트** (svc-extraction 확장):
- `POST /factcheck` — 소스-문서 쌍 팩트 체크 트리거
- `GET /factcheck/:resultId` — 결과 조회
- `GET /factcheck/:resultId/gaps` — Gap 목록 (필터: type, severity, review_status)
- `POST /factcheck/gaps/:gapId/review` — Gap 리뷰 (confirm/dismiss/modify)
- `GET /factcheck/summary` — 조직별 팩트 체크 요약 (KPI 대시보드용)

### 5.5 LLM 비용 관리 (PRD §7.4)

| 단계 | 처리 주체 | LLM | 예상 비용 |
|------|----------|-----|----------|
| AST Pre-parsing | Regex (svc-ingestion) | 미사용 | $0 |
| 구조적 매칭 | matcher.ts (svc-extraction) | 미사용 | $0 |
| 시맨틱 매칭 | llm-matcher.ts | Sonnet | ~$0.01/매칭쌍 |
| Gap Severity | severity.ts + LLM | Sonnet (복잡한 경우만) | ~$0.005/Gap |
| Spec 구조화 | (Phase 2-C) | Sonnet | ~$0.02/Spec |

**원칙**: LLM은 구조적 매칭 실패 시에만 투입. 전체 대비 10~20% 수준 목표.

### 5.6 산출물
- `factcheck/` 모듈 6개 파일
- D1 마이그레이션 (`0005_factcheck.sql`)
- API 엔드포인트 5개
- 단위 테스트 (실제 온누리상품권 소스-문서 샘플 기반)

### 5.7 의존성
- Phase 2-A (소스 파싱 결과 필요)
- 기존 svc-extraction 인프라 (D1, Queue, LLM Router)

### 5.8 예상: 4~5세션

---

## 6. Phase 2-C: Spec 출력 & Export

### 6.1 목표
팩트 체크 결과를 기반으로 §5.3 샘플 형식의 Spec 패키지를 생성한다.

### 6.2 타입 정의 (`packages/types/src/spec.ts`)

```typescript
// API Spec (§5.3 Sample A)
interface ApiSpec {
  specId: string;
  endpoint: string;          // POST /api/v1/vouchers/issue
  httpMethod: string;        // GET | POST | PUT | DELETE
  sourceLocation: string;    // VoucherController.java:L42
  parameters: ApiParam[];    // name, type, required, source
  responseSchema: object;    // JSON Schema
  documentRef: string;       // API정의서 p.34
  factCheck: FactCheckRef;   // Gap 참조
  confidence: number;        // 0-1
}

// Table Spec (§5.3 Sample B)
interface TableSpec {
  specId: string;
  tableName: string;         // TB_VOUCHER
  sourceLocation: string;    // Voucher.java (@Entity)
  columns: TableColumn[];    // name, type, nullable, pk, fk
  documentRef: string;       // 물리ERD, 테이블정의서
  factCheck: FactCheckRef;   // Gap 참조
  confidence: number;
}

// Fact Check Reference
interface FactCheckRef {
  totalGaps: number;
  highGaps: number;
  gapIds: string[];
  coveragePct: number;
}
```

### 6.3 Export 모듈

```
services/svc-extraction/src/export/
├── spec-api.ts        # API Spec JSON 생성 (OpenAPI 3.0 호환)
├── spec-table.ts      # Table Spec JSON 생성 (ERD 구조)
├── factcheck-report.ts  # Markdown Gap 리포트 생성
├── spec-summary.ts    # Excel 요약 (Pilot Plus — 간단한 CSV로 선행)
└── packager.ts        # 전체 패키지 조립 + R2 저장
```

**API 엔드포인트**:
- `POST /export/spec-package` — Spec 패키지 생성 + R2 저장
- `GET /export/:packageId` — 패키지 다운로드
- `GET /export/:packageId/api-spec` — API Spec JSON만
- `GET /export/:packageId/table-spec` — Table Spec JSON만
- `GET /export/:packageId/report` — Markdown 리포트만

### 6.4 산출물
- `packages/types/src/spec.ts` (타입 정의)
- `export/` 모듈 5개 파일
- API 엔드포인트 5개
- R2 저장 (`spec-packages/{orgId}/{packageId}/`)

### 6.5 의존성
- Phase 2-B (팩트 체크 결과 필요)

### 6.6 예상: 2세션

---

## 7. Phase 2-D: Pilot Core UI

### 7.1 목표
팩트 체크 결과와 Spec을 열람/편집/승인하는 최소 검토 UI 구축.

### 7.2 신규 페이지 (기존 15 페이지에 추가)

| # | 라우트 | 페이지 | 주요 기능 |
|---|--------|--------|----------|
| 1 | `/source-upload` | 소스코드 업로드 | Java/.sql 파일 업로드, 프로젝트 구조 표시 |
| 2 | `/fact-check` | 팩트 체크 결과 | Gap 목록 (type/severity 필터), 소스↔문서 병렬 비교 뷰 |
| 3 | `/specs` | Spec 목록 | API Spec + Table Spec 카탈로그, Coverage KPI |
| 4 | `/specs/:id` | Spec 상세 | §5.3 샘플 형식 표시, 인라인 편집, Gap 연결 |
| 5 | `/export` | Export 센터 | Spec 패키지 생성/다운로드, PM 승인 게이트 |

### 7.3 주요 컴포넌트

```
apps/app-web/src/
├── pages/
│   ├── source-upload.tsx       # 소스코드 업로드 (drag-and-drop, 진행률)
│   ├── fact-check.tsx          # 팩트 체크 대시보드
│   ├── spec-catalog.tsx        # Spec 목록 + 검색
│   ├── spec-detail.tsx         # Spec 상세 + 편집
│   └── export-center.tsx       # Export 패키지 관리
├── components/
│   ├── factcheck/
│   │   ├── GapList.tsx         # Gap 테이블 (severity 배지, 필터)
│   │   ├── GapDetail.tsx       # Gap 상세 + 리뷰 액션
│   │   ├── SourceDocDiff.tsx   # 소스↔문서 병렬 비교 뷰
│   │   └── CoverageCard.tsx    # Coverage KPI 카드
│   ├── spec/
│   │   ├── ApiSpecView.tsx     # API Spec 뷰어 (§5.3 Sample A)
│   │   ├── TableSpecView.tsx   # Table Spec 뷰어 (§5.3 Sample B)
│   │   ├── SpecEditor.tsx      # 인라인 편집 (페르소나별 필드 제한은 Pilot Plus)
│   │   └── SpecApproval.tsx    # PM 승인 게이트
│   └── export/
│       ├── ExportForm.tsx      # 패키지 설정 + 생성
│       └── PackageList.tsx     # 생성된 패키지 목록
└── api/
    ├── factcheck.ts            # Fact Check API 클라이언트
    ├── spec.ts                 # Spec API 클라이언트
    └── export.ts               # Export API 클라이언트
```

### 7.4 산출물
- 5 신규 페이지 + 10+ 컴포넌트 + 3 API 클라이언트
- 라우터 업데이트 (`app.tsx`)
- 사이드바 메뉴 추가

### 7.5 의존성
- Phase 2-B (Fact Check API)
- Phase 2-C (Export API)

### 7.6 예상: 3~4세션

---

## 8. Phase 2-E: Pilot Core 실행 & KPI 측정

### 8.1 목표
온누리상품권 실 산출물을 투입하여 §8.2 KPI를 측정한다.

### 8.2 착수 조건 (PRD §11.1)

| # | 조건 | 현재 상태 | 해결 방법 |
|---|------|----------|----------|
| 1 | 소스코드 접근 | LPON 소스 확보 (docs/LPON...) | ✅ 이미 보유 |
| 2 | 산출물 접근 | LPON 문서 61건 업로드 완료 | ✅ 완료 |
| 3 | 리뷰 참여자 | 미확인 | DA+AA+기획자 최소 1명씩 확보 필요 |
| 4 | 인프라 | 12 Workers 배포 정상 | ✅ 확인됨 |
| 5 | 보안 처리 방침 | PII masking 파이프라인 존재 | ✅ 기존 체계 활용 |
| 6 | KPI 합의 | 미확인 | 팀 내 검토 필요 |
| 7 | 문서 품질 샘플링 | LPON xlsx 15건 파싱 성공 | 부분 확인 (pptx/pdf 미완) |

### 8.3 실행 계획
1. LPON 소스코드 (Java Spring) 업로드 → Stage 1-B 파싱
2. LPON 산출물 (API정의서, 테이블정의서) 대상 식별
3. 소스↔문서 팩트 체크 실행
4. Gap 리뷰 (DA, AA 참여)
5. Spec 패키지 Export
6. KPI 측정 + Pilot Core 종료 조건 확인

### 8.4 예상: 2~3세션

---

## 9. Phase 2-F: Pilot Plus (Post Core)

> Pilot Core 종료 조건 충족 후 착수. 상세 설계는 Core 결과 반영 후.

### 9.1 범위 (PRD §6.2)
- 정책 후보 생성 + 기획자 승인 UI
- 페르소나별 전문 영역 편집 UI
- 다단계 승인 워크플로우 (HITL)
- 품질 점수 / 신뢰도 대시보드
- Tree-sitter WASM 도입 (복잡한 AST 파싱)

### 9.2 기존 자산 활용
- svc-policy HITL (DO + Queues) → 승인 워크플로우 기반
- svc-governance Prompt Registry → 품질 대시보드 기반
- svc-ontology → Pilot Plus 이후 재검토
- svc-skill → Spec 패키지로 전환 검토

---

## 10. 기존 파이프라인 병행 전략

### 10.1 원칙
- v0.6 Skill 파이프라인(Stage 1→2→3→4→5)은 **그대로 유지**
- Miraeasset 948건 + LPON 61건 데이터 보존
- 새 Fact Check 파이프라인은 **병렬 경로**로 추가
- 기존 API 엔드포인트 하위 호환 유지

### 10.2 공존 아키텍처

```
[문서 업로드] → svc-ingestion ─→ ingestion.completed ─→ svc-extraction (기존 3-Pass)
                                                          ↓
[소스 업로드] → svc-ingestion ─→ ingestion.completed ─→ svc-extraction (Fact Check)
                  (Stage 1-B)     (classification:        (factcheck/ 모듈)
                                   source_*)                   ↓
                                                    factcheck.completed
                                                          ↓
                                                    Spec Export
```

**라우팅 로직**: `classification`이 `source_*`인 경우 → Fact Check 경로. 그 외 → 기존 경로.
기존 extraction/analysis 경로는 변경 없이 동작.

### 10.3 DB 공존
- 기존 테이블 (extractions, analyses, diagnosis_findings) 유지
- 새 테이블 (fact_check_results, fact_check_gaps) 추가
- 동일 DB (`db-structure`) 사용 — 교차 참조 가능

### 10.4 프론트엔드 공존
- 기존 15 페이지 유지 (Sidebar 메뉴 그대로)
- 신규 5 페이지 추가 (Sidebar에 "Fact Check" 섹션 추가)
- 기존 Analysis, HITL, Skills 페이지는 v0.6 데이터 표시 지속

---

## 11. 리스크 & 대응

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R-1 | Regex 파싱 정확도 부족 (복잡한 Spring 코드) | 중 | Pilot Core에서 실측 후 정확도 < 80% → Tree-sitter WASM 도입 |
| R-2 | 온누리상품권 소스코드 접근 불가/보안 제약 | 높 | §11.1 착수 조건 #1. 사전 확인 필수 |
| R-3 | 문서 표 파싱 품질 낮음 (이미지 캡처, merged cell) | 중 | §11.1 착수 조건 #7. 사전 샘플링 + 대상 문서 제한 |
| R-4 | LLM 비용 초과 (시맨틱 매칭 빈도 높음) | 중 | 구조적 매칭 우선 + 프로그래밍 기반 대체 (기존 패턴) |
| R-5 | Unstructured.io 쿼터 소진 (기존 이슈) | 중 | xlsx는 커스텀 파서. API정의서/테이블정의서가 DOCX면 기존 docx.ts 활용 |
| R-6 | 리뷰 참여자 확보 어려움 | 낮 | §11.1 착수 조건 #3. 최소 DA+AA+기획자 1명 |
| R-7 | Workers WASM 번들 크기 제한 | 낮 | Pilot Core는 Regex만 사용. WASM은 Pilot Plus |

---

## 12. Phase 의존성 그래프

```
Phase 2-A (소스 파싱)     ← 독립
    ↓
Phase 2-B (팩트 체크)     ← 2-A 의존
    ↓
Phase 2-C (Spec Export)   ← 2-B 의존
    ↓
Phase 2-D (UI)            ← 2-B, 2-C 의존
    ↓
Phase 2-E (파일럿 실행)    ← 2-A~2-D 모두 + 착수 조건
    ↓
Phase 2-F (Pilot Plus)    ← 2-E 종료 조건 충족
```

### 타임라인 (세션 기준)

| Phase | 세션 수 | 누적 |
|-------|---------|------|
| 2-A 소스 파싱 | 2 | 2 |
| 2-B 팩트 체크 | 4~5 | 6~7 |
| 2-C Spec Export | 2 | 8~9 |
| 2-D UI | 3~4 | 11~13 |
| 2-E 파일럿 실행 | 2~3 | 13~16 |
| **Pilot Core 합계** | **13~16 세션** | |
| 2-F Pilot Plus | TBD | Core 이후 |

---

## 13. 즉시 실행 가능 항목 (Phase 2-A 착수)

다음 세션에서 바로 시작할 수 있는 작업:

1. **`packages/types/src/spec.ts`** — Spec 관련 타입 정의 (CodeElement, ApiSpec, TableSpec, FactCheckResult, Gap)
2. **`packages/types/src/events.ts`** — `factcheck.requested`, `factcheck.completed` 이벤트 추가
3. **`services/svc-ingestion/src/parsing/java-spring.ts`** — Spring annotation Regex 파서
4. **`services/svc-ingestion/src/parsing/jpa-entity.ts`** — JPA Entity Regex 파서

착수 전 확인 필요:
- [ ] LPON 소스코드 (Java Spring) 파일 확보 여부 확인
- [ ] API정의서 / 테이블정의서 DOCX/XLSX 파일 식별
- [ ] 팀 내 v0.7.4 방향 합의 확인
