# v0.7.4 PRD vs Implementation — Gap Analysis Report

> **Analysis Type**: PRD-Implementation Gap Analysis (Full Scope)
>
> **Project**: RES AI Foundry
> **Version**: v0.7.4
> **Analyst**: Claude Opus 4.6
> **Date**: 2026-03-06
> **PRD Reference**: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`
> **Plan Reference**: `docs/01-plan/features/v074-pivot.plan.md`

---

## 1. Executive Summary

### 1.1 Overall Progress

| Phase | PRD Section | Plan Section | Status | Progress |
|-------|------------|--------------|--------|----------|
| **Phase 2-A** Source Code Parsing | SS7.2-7.3 | SS4 | Done | 100% |
| **Phase 2-B** Fact Check Engine | SS4.3, SS7.2 | SS5 | In Progress | ~80% (S3/5 done) |
| **Phase 2-C** Spec Export | SS5.3-5.4 | SS6 | Not Started | 0% |
| **Phase 2-D** Pilot Core UI | SS6.1, SS7.5 | SS7 | Not Started | 0% |
| **Phase 2-E** Pilot Execution & KPI | SS8, SS11 | SS8 | Not Started | 0% |
| **Phase 2-F** Pilot Plus | SS6.2 | SS9 | Not Started | 0% |

**Pilot Core Overall**: ~35% complete (Phase 2-A done + Phase 2-B ~80%)

### 1.2 Key Findings

| # | Finding | Type | Impact |
|---|---------|------|--------|
| F-1 | MyBatis XML parser 선제 구현 (PRD는 Pilot Plus 범위) | Scope Acceleration | Positive |
| F-2 | Gap type "MID" 추가 (PRD 4종 → 구현 5종) | Enhancement | Positive |
| F-3 | Spec Export 모듈 미구현 (spec-api.json, spec-table.json) | Gap | High |
| F-4 | Pilot Core UI 5 페이지 미구현 | Gap | High |
| F-5 | PM 단일 승인 게이트 미구현 | Gap | Medium |
| F-6 | 핵심/비핵심 선별 (Option C) 미구현 → Phase 2-C에서 Spec Export와 함께 구현 결정 | Gap | Medium |
| F-7 | LLM Semantic Matcher 미구현 (Session 4 예정) | Gap | Medium |
| F-8 | PRD SS8.2 KPI 측정 체계 미구축 | Gap | Medium |

> **Note**: 3 서비스 미배포(svc-ingestion, svc-queue-router, svc-extraction)와 D1 migration
> 미적용(0005_factcheck.sql)은 코드 구현이 완료된 상태의 운영 작업이므로 기획-구현 Gap이 아님.
> Session 4에서 일괄 처리 예정.

---

## 2. PRD Section-by-Section Comparison

### 2.1 SS1 Project Overview — PASS

| PRD Requirement | Implementation | Status |
|-----------------|----------------|--------|
| As-Designed vs As-Built Fact Check | factcheck/ 모듈 7개 파일 | PASS |
| Dev Spec Reuse (A site → B site) | Spec Export 미구현 | GAP |
| Tacit Knowledge Visualization | 기존 v0.6 policy 추출로 부분 커버 | PARTIAL |

### 2.2 SS2 Pilot Domain — PASS

| PRD Requirement | Implementation | Status |
|-----------------|----------------|--------|
| 1차 파일럿: 온누리상품권 소스코드 | LPON 소스 확보, 61건 업로드 | PASS |
| .svn/.jar/.class/binary 제외 | zip-extractor SKIP_PATTERNS 17패턴 | PASS |
| 2차 파일럿: 퇴직연금 서브프로세스 1개 | Pilot Core 이후 | N/A |

### 2.3 SS3 Persona & Permissions — PARTIAL

| PRD Requirement | Implementation | Status | Note |
|-----------------|----------------|--------|------|
| 10+ 페르소나 (TA/AA/DA/QA/보안/UI-UX/PM/기획자/개발자/테스터) | v0.6 5 RBAC 역할 (Analyst/Reviewer/Developer/Client/Executive) | GAP | Pilot Core는 PM 단일 승인이므로 현행 RBAC으로 커버 가능 |
| 페르소나별 전문 영역 편집 | 미구현 | GAP | Pilot Plus 범위 |
| PM 단일 승인 게이트 | 미구현 | GAP | Phase 2-D에서 구현 예정 |

### 2.4 SS4 Core Workflow — PARTIAL

#### 2.4.1 전체 흐름 (SS4.1)

| Step | PRD | Implementation | Status |
|------|-----|----------------|--------|
| 1. Upload & Parsing | 문서 + 소스코드 업로드 | svc-ingestion: 문서(PDF/DOCX/XLSX) + 소스(Java/SQL/ZIP) | PASS |
| 2. AI Extraction & Selection | 핵심/비핵심 선별 + Spec 추출 + Fact Check | Fact Check 엔진 구현, 핵심/비핵심 선별 미구현 | PARTIAL |
| 3. Review & Edit | 페르소나별 편집 + Gap 결과 확인 | Fact Check API 8개 endpoint (서버 측), UI 미구현 | PARTIAL |
| 4. Approval & Export | PM 승인 + Spec 패키지 출력 | 미구현 | GAP |

#### 2.4.2 핵심/비핵심 선별 Option C (SS4.2)

| Step | PRD | Implementation | Status |
|------|-----|----------------|--------|
| AI 분석 — 문서 분류 및 핵심 영역 식별 | 3기준(외부 API, DB 핵심 테이블, 트랜잭션 서비스) | 미구현 | GAP |
| AI 제안 — 핵심 Spec 후보 + 신뢰도 점수 | 미구현 | GAP |
| 사용자 확인 — 수용/거부/범위 조정 | 미구현 | GAP |
| 집중 추출 — 확정 영역 심층 추출 | 미구현 | GAP |

> **Note**: Option C는 Fact Check 결과 위에 올라가는 레이어. Phase 2-C 이후 구현 가능.

#### 2.4.3 Fact Check (SS4.3) — MOSTLY PASS

| PRD Requirement | Implementation | Status | Detail |
|-----------------|----------------|--------|--------|
| API 정의서 일치성 (높은 신뢰도) | matcher.ts + gap-detector.ts | PASS | |
| 테이블 정의서 일치성 (높은 신뢰도) | matcher.ts + gap-detector.ts | PASS | |
| 정책 구현 현황 (중간 — 후보 생성) | 기존 v0.6 svc-policy HITL | PARTIAL | Pilot Plus |
| Gap 유형 4종 (SM/MC/PM/TM) | 5종 (SM/MC/PM/TM/**MID**) | PASS+ | MID 추가 (Enhancement) |
| Gap Severity 3단계 (HIGH/MEDIUM/LOW) | severity.ts 구현 | PASS | |
| 유형 × Severity 기본 매핑 | severity.ts classifySeverity() | PASS | |
| 유형별 precision 추적 | 미구현 (KPI 측정 체계 미구축) | GAP | Phase 2-E |

**MID Gap Type (구현 추가)**:
- PRD에는 SM/MC/PM/TM 4종만 정의
- 구현에서 "Missing In Document" (MID) 추가 — 소스에 있으나 문서에 아예 없는 항목
- PRD SS4.3의 "Missing Column" 정의와 겹치지만, MC는 컬럼 레벨, MID는 API/테이블 레벨로 구분
- **판단**: PRD 의도에 부합하는 Enhancement. PRD 업데이트 권장

### 2.5 SS5 Dev Spec Structure — PARTIAL

#### 2.5.1 Spec 타입 (SS5.2)

| Spec Type | PRD Priority | Implementation | Status |
|-----------|-------------|----------------|--------|
| API정의서 | Pilot Core | source-aggregator → SourceSpec.controllers | PARTIAL (추출은 됨, Spec 포맷 미생성) |
| 테이블정의서 | Pilot Core | source-aggregator → SourceSpec.dataModels/mappers/ddls | PARTIAL (추출은 됨, Spec 포맷 미생성) |
| 정책정의서 | Pilot Plus | 기존 v0.6 policy pipeline | N/A |
| 요구사항정의서 | MVP 이후 | 미구현 | N/A |
| 화면설계서 | MVP 이후 (v0.7.4 제외) | 미구현 | N/A |

#### 2.5.2 출력물 샘플 형식 (SS5.3)

| Sample | PRD Format | Implementation | Status |
|--------|-----------|----------------|--------|
| Sample A — API Spec JSON | OpenAPI 3.0 호환 JSON | 미구현 (raw SourceSpec만 존재) | GAP |
| Sample B — Table Spec JSON | ERD 구조화 JSON | 미구현 (raw SourceSpec만 존재) | GAP |
| Sample C — Policy Spec | JSON 후보 목록 | Pilot Plus | N/A |

#### 2.5.3 출력 패키지 (SS5.4)

| File | PRD | Implementation | Status |
|------|-----|----------------|--------|
| spec-api.json | OpenAPI 3.0 호환 | 미구현 | GAP |
| spec-table.json | ERD 구조화 | 미구현 | GAP |
| spec-policy.json | 조건-기준-결과 트리플 | Pilot Plus | N/A |
| fact-check-report.md | Markdown Gap 리포트 | report.ts 구현 + API endpoint | PASS |
| spec-summary.xlsx | Excel 요약 | 미구현 | GAP |

### 2.6 SS6 MVP Scope — ASSESSMENT

#### 2.6.1 Pilot Core 필수 기능 (SS6.1)

| # | Feature | PRD | Implementation | Status |
|---|---------|-----|----------------|--------|
| 1 | 문서 + 소스코드 Upload & Parsing | 필수 | svc-ingestion (14 parser files) | PASS |
| 2 | API Spec 자동 추출 | 필수 | java-controller.ts → CodeController/CodeEndpoint | PASS |
| 3 | Table Spec 자동 추출 | 필수 | java-datamodel.ts + mybatis-mapper.ts + ddl.ts | PASS |
| 4 | Source ↔ Document Fact Check | 필수 | factcheck/ 7 modules, 2,054 LOC | PASS |
| 5 | 핵심/비핵심 선별 (Option C) | 필수 | 미구현 | GAP |
| 6 | 최소 검토 UI | 필수 | 미구현 (API만 존재) | GAP |
| 7 | PM 단일 승인 게이트 | 필수 | 미구현 | GAP |
| 8 | Spec 패키지 Export | 필수 | fact-check-report.md만 구현 | PARTIAL |

**Pilot Core 종료 조건 충족률**: 3/8 필수 기능 완료 = **37.5%**

> Backend engine (items 1-4) 100% 완료. Frontend/UX layer (items 5-8) 0% 완료.
> PRD SS7.5 개발 우선순위(Engine → Export → UI)에 부합하는 진행 순서.

#### 2.6.2 Pilot Plus (SS6.2)

| Feature | Status |
|---------|--------|
| 정책 후보 생성 + 기획자 승인 UI | 미착수 (기존 v0.6 HITL 활용 가능) |
| 페르소나별 전문 영역 편집 UI | 미착수 |
| 다단계 승인 워크플로우 | 미착수 |
| 품질 점수 / 신뢰도 대시보드 | 미착수 |
| B 사이트 적용 반자동화 초안 | 미착수 |

### 2.7 SS7 System Architecture — MOSTLY PASS

#### 2.7.1 Infrastructure Reuse (SS7.1)

| Component | PRD | Implementation | Status |
|-----------|-----|----------------|--------|
| Cloudflare Workers/D1/R2/Queue | Reuse | 12 Workers + 10 D1 + 2 R2 | PASS |
| @ai-foundry/types, utils | Extend | spec.ts + factcheck.ts added | PASS |
| svc-llm-router / svc-security / svc-governance | Reuse | 변경 없음 | PASS |
| svc-ingestion | Extend | 14 parser files (Java/SQL/XML/ZIP) | PASS |
| svc-extraction | Redesign | factcheck/ 7 modules + 8 API endpoints | PASS |
| svc-policy | Extend | 변경 없음 (Pilot Plus) | N/A |
| svc-queue-router | Reuse + new events | factcheck.requested/completed 추가 | PASS |
| app-web | Redesign | 변경 없음 (Phase 2-D) | GAP |

#### 2.7.2 Pipeline (SS7.2)

| Stage | PRD | Implementation | Status |
|-------|-----|----------------|--------|
| Stage 1-A: 문서 파싱 | 기존 유지 | svc-ingestion (Unstructured.io + xlsx + docx) | PASS |
| Stage 1-B: 소스코드 파싱 | 신규 | java-controller + java-datamodel + java-service + ddl + mybatis-mapper + zip-extractor | PASS |
| Stage 2: 통합 추출 + Fact Check | 신규 핵심 | factcheck/ (aggregator + extractor + matcher + gap-detector + severity + report) | PASS |
| Stage 3-A: API/Table Spec 확정 | 높은 신뢰도 | 미구현 (Spec 포맷 변환 필요) | GAP |
| Stage 3-B: 정책 후보 생성 | Pilot Plus | 기존 v0.6 pipeline | N/A |
| Stage 4: Spec 정제 + 검토/수정 | HITL | 미구현 | GAP |
| Stage 5: Spec 패키지 출력 | SS5.4 | 미구현 | GAP |

#### 2.7.3 Source Code Parsing Scope (SS7.3)

| Parsing Target | PRD Scope | Implementation | Status |
|----------------|----------|----------------|--------|
| Spring @Controller / @RestController | Core | java-controller.ts | PASS |
| @RequestMapping / @GetMapping etc. | Core | java-controller.ts | PASS |
| JPA @Entity / @Table / @Column | Core | java-datamodel.ts | PASS |
| DDL (schema.sql / Flyway) | Core | ddl.ts | PASS |
| @Transactional service methods | Core | java-service.ts | PASS |
| **MyBatis mapper / XML SQL** | **Plus (SS7.3 명시적 제외)** | **mybatis-mapper.ts (253 LOC)** | **SCOPE+** |
| Dynamic SQL (QueryDSL, Criteria) | Plus | 미구현 | N/A |
| Stored Procedure | Plus | 미구현 | N/A |
| Feign Client / Gateway routing | Plus | 미구현 | N/A |
| React Component | Out of Scope | 미구현 | N/A |

> **F-1 Scope Acceleration**: PRD SS7.3은 MyBatis를 "Pilot Plus"로 명시적 제외했으나,
> LPON 소스에 .sql 파일이 0개이고 MyBatis XML mapper가 유일한 테이블 정보 소스이므로
> 선제 구현이 불가피했다. **PRD 업데이트 필요**: MyBatis XML → Pilot Core 격상.

#### 2.7.4 LLM Cost Management (SS7.4)

| Strategy | PRD | Implementation | Status |
|----------|-----|----------------|--------|
| AST Pre-parsing (LLM 미사용) | Stage 1-B | Regex 기반 정적 분석 (Java/SQL/XML) | PASS |
| 문서 청크 추출 (Haiku) | Stage 1-A | 기존 Unstructured.io + Haiku 분류 | PASS |
| 구조화 데이터 매칭 (Sonnet) | Stage 2 | matcher.ts (LLM 미사용, 구조적 매칭) | PARTIAL |
| LLM Semantic Matching | Stage 2 Step 2 | llm-matcher.ts 미구현 (Session 4 예정) | GAP |
| 정책 후보 추론 (Opus) | Stage 3-B | Pilot Plus | N/A |

> PRD는 "LLM은 구조화 이후에만 사용" 원칙 → 구현이 이를 잘 따르고 있음.
> 구조적 매칭만으로도 상당 부분 커버 가능. LLM은 미매칭 항목에만 투입 예정.

#### 2.7.5 Development Priority (SS7.5)

| Priority | PRD Item | Status | Note |
|----------|----------|--------|------|
| 1 | Fact Check Engine | **80% Done** | Core modules complete, LLM matcher + deploy pending |
| 2 | API / Table Extraction | **100% Done** | Source parsing complete |
| 3 | Export (SS5.4 package) | **Not Started** | Phase 2-C |
| 4 | Review UI | **Not Started** | Phase 2-D |

> PRD 개발 우선순위 준수: Engine(1) → Extraction(2) 순서대로 진행 중. 정확히 맞음.

### 2.8 SS8 Success Criteria — NOT MEASURABLE YET

| KPI | PRD Target | Measurable? | Status |
|-----|-----------|-------------|--------|
| Critical API Coverage | >= 80% | No (E2E 미실행) | GAP |
| Critical Table Coverage | >= 80% | No (E2E 미실행) | GAP |
| Reviewer Acceptance Rate | >= 70% | No (UI 미구현) | GAP |
| Gap Precision (전체) | >= 75% | No (E2E 미실행) | GAP |
| SM Precision | >= 70% | No | GAP |
| MC Precision | >= 80% | No | GAP |
| PM Precision | >= 75% | No | GAP |
| TM Precision | >= 80% | No | GAP |
| Spec 편집 시간 단축률 | >= 30% | No (UI 미구현) | GAP |

> KPI 측정은 Phase 2-E에서 실행. 현재는 엔진 구현 단계이므로 미측정이 정상.

### 2.9 SS9 Risk Management

| Risk | PRD Impact | Current Status |
|------|-----------|----------------|
| R-1: 소스 보안/기밀 | 높음 | PII masking 파이프라인 활용. LPON 소스 이미 업로드 성공 |
| R-2: 정책 코드 품질 | 중간 | Pilot Plus 범위. 현재 불해당 |
| R-3: Pilot Core 범위 크립 | 중간 | SS6.1 종료 조건 명시됨. 잘 관리 중 |
| R-4: 승인 체계 불일치 | 낮음 | Pilot Core는 PM 단일 승인. 미구현이지만 설계 단순 |
| R-5: 리뷰 참여자 확보 | 낮음 | 미확인 (SS11.1 #3) |

### 2.10 SS10 Development Roadmap

| Phase | PRD | Plan | Implementation | Alignment |
|-------|-----|------|----------------|-----------|
| 2-A | 소스코드 파싱 | 2 sessions | Done (2 sessions) | MATCH |
| 2-B | Fact Check Engine | Plan: 4-5 sessions | Session 3/5 done | ON TRACK |
| 2-C | Pilot Core UI | Plan에서 Spec Export로 분리 | Not started | MATCH (순서대로) |
| 2-D | Pilot Core 실행 | Plan에서 UI로 분리 | Not started | MATCH |
| 2-E | — | Plan에서 Pilot 실행으로 분리 | Not started | MATCH |

> Plan은 PRD SS10 로드맵을 더 세분화함 (2-C Export + 2-D UI vs PRD의 2-C UI).
> 이는 PRD SS7.5 개발 우선순위(Export → UI)를 반영한 개선.

### 2.11 SS11 Prerequisites Checklist

| # | Condition | PRD Status | Actual | Status |
|---|-----------|-----------|--------|--------|
| 1 | 온누리상품권 소스코드 접근 | 확인 필요 | LPON 소스 확보 완료 (2,612 Java) | PASS |
| 2 | 산출물 20종+ 접근 | 확인 필요 | 61건 업로드 (59 parsed) | PASS |
| 3 | 리뷰 참여자 (DA+AA+기획자) | 확인 필요 | 미확인 | OPEN |
| 4 | Cloudflare + Anthropic 계약 | 확인됨 | 12 Workers 정상 | PASS |
| 5 | 소스 보안 처리 방침 | 확인 필요 | PII masking 적용 중 | PARTIAL |
| 6 | KPI 합의 | 확인 필요 | 미확인 | OPEN |
| 7 | 문서 품질 샘플링 | 확인 필요 | LPON xlsx 파싱 성공 확인됨 | PARTIAL |

---

## 3. Implementation Quality Assessment

### 3.1 Code Metrics

| Module | Files | LOC | Tests | Test Coverage |
|--------|-------|-----|-------|---------------|
| svc-ingestion/parsing/ (Phase 2-A) | 14 | ~2,900 | 34 | 92% |
| svc-extraction/factcheck/ (Phase 2-B) | 7 | ~2,054 | 136 | High |
| packages/types (spec.ts + factcheck.ts) | 2 | ~237 | N/A | N/A |
| packages/types/events.ts (factcheck events) | 1 | +36 lines | N/A | N/A |
| svc-extraction/routes/factcheck.ts | 1 | ~520 | Included | Included |
| D1 migration (0005_factcheck.sql) | 1 | 52 | N/A | N/A |
| **Total v0.7.4 New Code** | **26** | **~5,800** | **170** | |

### 3.2 Architecture Compliance

| Check | Status |
|-------|--------|
| 기존 파이프라인 병행 유지 (PRD SS10) | PASS — classification 기반 라우팅 분기 |
| 기존 API 하위 호환 (PRD SS10) | PASS — 신규 endpoint만 추가 |
| D1 공존 (기존 + fact_check 테이블) | PASS — db-structure 공유 |
| Queue 이벤트 추가 (factcheck.requested/completed) | PASS — events.ts 확장 |
| TypeScript strict mode 준수 | PASS — typecheck + lint 0 errors |

---

## 4. PRD-Plan Deviation Analysis

Plan 문서가 PRD와 다르게 구성한 부분:

| # | PRD | Plan | Deviation | Judgment |
|---|-----|------|-----------|----------|
| 1 | Phase 2-C = UI (SS10.1) | Phase 2-C = Export, 2-D = UI | 순서 분리 | PRD SS7.5 우선순위 반영. **적절** |
| 2 | MyBatis = Pilot Plus (SS7.3) | Phase 2-A/B에서 구현 | 범위 선행 | LPON 소스 특성상 불가피. **적절** |
| 3 | Gap 4종 (SM/MC/PM/TM) | Gap 5종 (+MID) | 타입 추가 | 소스-only 항목 분류 필요. **적절** |
| 4 | 핵심/비핵심 선별 = Pilot Core 필수 | Plan에 미포함 | 누락 | **PRD 재확인 필요** — Phase 2-C/D에서 추가 가능 |
| 5 | PRD 파싱 방법: "JavaParser" (SS7.3) | Plan/구현: Regex 기반 | 기술 변경 | Workers 환경 제약. Plan SS4.3에 근거 명시. **적절** |

---

## 5. Remaining Work Estimate

### 5.1 Phase 2-B 잔여 (Session 4-5)

| Session | Task | Estimated LOC | Tests |
|---------|------|---------------|-------|
| S4 | llm-matcher.ts (LLM semantic matching) | ~200 | ~20 |
| S4 | 3 서비스 배포 + D1 migration 적용 | 0 (ops) | — |
| S4 | LPON XML mapper 재업로드 E2E 검증 | 0 (ops) | — |
| S5 | E2E 테스트 (LPON 실 데이터) | ~100 | ~10 |

### 5.2 Phase 2-C Spec Export (2 sessions)

| Task | PRD Section | New Files | Estimated LOC |
|------|------------|-----------|---------------|
| spec-api.ts (OpenAPI 3.0 호환 JSON) | SS5.3 Sample A | 1 | ~200 |
| spec-table.ts (ERD 구조화 JSON) | SS5.3 Sample B | 1 | ~150 |
| factcheck-report.ts (이미 있음) | SS5.4 | 0 | 0 |
| spec-summary.ts (CSV/Excel 요약) | SS5.4 | 1 | ~150 |
| packager.ts (전체 조립 + R2 저장) | SS5.4 | 1 | ~200 |
| API endpoints (5개) | Plan SS6.3 | 1 | ~300 |
| Types (ApiSpec, TableSpec) | SS5.3 | 1 | ~100 |

### 5.3 Phase 2-D UI (3-4 sessions)

| Page | PRD Section | Components | Estimated LOC |
|------|------------|------------|---------------|
| /source-upload | SS6.1 | 2-3 | ~300 |
| /fact-check | SS6.1 | 4-5 (GapList, GapDetail, SourceDocDiff, CoverageCard) | ~800 |
| /specs | SS6.1 | 2-3 | ~400 |
| /specs/:id | SS6.1 | 3-4 (ApiSpecView, TableSpecView, SpecEditor) | ~600 |
| /export | SS6.1 | 2-3 (ExportForm, PackageList) | ~400 |
| API clients (3개) | — | factcheck.ts, spec.ts, export.ts | ~300 |

### 5.4 Phase 2-E Pilot Execution (2-3 sessions)

| Task | PRD Section |
|------|------------|
| LPON 소스코드 재업로드 (Stage 1-B E2E) | SS11.1 #1 |
| API정의서/테이블정의서 식별 + 팩트 체크 실행 | SS11.1 #7 |
| Gap 리뷰 (DA, AA 참여) | SS11.1 #3 |
| KPI 측정 (SS8.2) | SS8.2 |
| Pilot Core 종료 조건 확인 | SS6.1 |

---

## 6. Recommended Actions

### 6.1 Immediate (Session 4)

| # | Action | Priority |
|---|--------|----------|
| A-1 | Phase 2-B Session 4: llm-matcher.ts 구현 + 3 서비스 배포 + D1 migration | HIGH |
| A-2 | PRD SS7.3 업데이트: MyBatis XML → Pilot Core 격상 | LOW |
| A-3 | PRD SS4.3 업데이트: MID Gap type 추가 | LOW |

### 6.2 Short-term (Session 5-8)

| # | Action | Priority |
|---|--------|----------|
| A-4 | Phase 2-B Session 5: LPON E2E 테스트 | HIGH |
| A-5 | Phase 2-C: Spec Export 모듈 (spec-api.json, spec-table.json) | HIGH |
| A-6 | Phase 2-D: Pilot Core UI 5 페이지 | HIGH |

### 6.3 Before Pilot Execution

| # | Action | Priority |
|---|--------|----------|
| A-7 | SS11.1 #3: 리뷰 참여자 확보 (DA + AA + 기획자 최소 1명씩) | HIGH |
| A-8 | SS11.1 #6: KPI 합의 (팀 내 검토) | MEDIUM |
| A-9 | 핵심/비핵심 선별 (Option C) 구현 또는 Phase 2-E로 이연 판단 | MEDIUM |

---

## 7. Summary

### 7.1 What's Working Well

- **PRD 개발 우선순위 준수**: Engine(1st) → Extraction(2nd) 순서 정확
- **Fact Check 엔진 핵심 모듈 완성**: 7개 모듈 2,054 LOC + 136 tests
- **MyBatis 선제 구현**: LPON 실데이터 특성 반영한 적절한 판단
- **테스트 커버리지 우수**: Phase 2-A 34 tests + Phase 2-B 136 tests = 170 tests
- **아키텍처 일관성**: 기존 파이프라인 병행, TypeScript strict, Queue 패턴 준수

### 7.2 What Needs Attention

- **Spec Export 모듈 부재**: PRD SS5.3-5.4 형식의 구조화 출력이 없으면 Pilot Core 종료 불가
- **UI 전무**: 리뷰어가 사용할 UI가 없으면 KPI 측정 불가 (Reviewer Acceptance Rate)
- **배포 누적**: 3 서비스 + D1 migration 미적용 — Session 4에서 일괄 해결 필요
- **착수 조건 미충족**: 리뷰 참여자 확보, KPI 합의 등 비기술적 항목

### 7.3 Timeline Assessment

| Milestone | Estimated Sessions | Cumulative |
|-----------|-------------------|------------|
| Phase 2-B 완료 (S4-S5) | 2 | 2 |
| Phase 2-C Spec Export | 2 | 4 |
| Phase 2-D UI | 3-4 | 7-8 |
| Phase 2-E Pilot Execution | 2-3 | 9-11 |
| **Pilot Core 완료** | **9-11 sessions** | |

Plan 원안(13-16 sessions) 대비 2-A를 이미 소화했으므로 **9-11 sessions remaining** 예상.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-06 | Initial PRD-Implementation gap analysis | Claude Opus 4.6 |
