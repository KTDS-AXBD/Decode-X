---
code: AIF-PLAN-lpon-deliverable-validation-plan
title: "온누리상품권 분석 산출물 검증 및 문서화 Planning Document"
version: 1.0
status: active
category: plan
created: 2026-03-09
updated: 2026-03-09
author: Sinclair Seo
---

# 온누리상품권 분석 산출물 검증 및 문서화 Planning Document

> **Summary**: AI Foundry 역공학 분석 결과를 SI 산출물 형태로 재구성하고, 인터뷰 기반 평가를 통해 실효성을 검증한다.
>
> **Project**: AI Foundry (res-ai-foundry)
> **Version**: v0.6.0
> **Author**: AX BD팀
> **Date**: 2026-03-09
> **Status**: Draft
> **REQ**: AIF-REQ-017 (P0, Feature/Data)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | AI Foundry가 추출한 848개 정책, 7,332개 용어, 859개 스킬이 .skill.json(기계용)으로만 존재하여, 사람이 읽고 판단할 수 있는 형태가 없다. 역공학 결과의 비즈니스 가치를 증명할 수단이 부족하다. |
| **Solution** | 추출 데이터를 4종 SI 산출물(인터페이스 설계서, 업무규칙 정의서, 용어사전, Gap 분석 보고서)로 변환하고, 3-tier 인터뷰(현업+SI+내부) 기반 평가·조정 프로세스를 수행한다. |
| **Function/UX Effect** | 양방향 As-Is vs To-Be 비교(소스↔문서 Gap + 기존산출물↔AI추출물 품질)를 통해 역공학 결과를 객관적으로 평가하고 조정할 수 있다. |
| **Core Value** | AI 역공학 기술이 실제 SI 프로젝트에서 산출물 생성 시간을 단축하고 품질을 보장할 수 있음을 실증적으로 검증한다. |

---

## 1. Overview

### 1.1 Purpose

AI Foundry 5-Stage 파이프라인이 온누리상품권 도메인에서 추출한 분석 결과(policies, terms, skills)의 **실효성을 검증**하고, 기존 SI 프로젝트에서 사용하는 **산출물 형식으로 재구성**하여 비즈니스 가치를 증명한다.

현재 결과물은 `.skill.json` 형태의 기계 판독용 데이터로, 사람이 직접 읽고 업무에 활용하기 어렵다. 이를 SI 현장에서 익숙한 문서 형태(인터페이스 설계서, 업무규칙 정의서 등)로 변환하고, 도메인 전문가·SI 아키텍트·BD팀의 다층 평가를 거쳐 품질을 조정한다.

### 1.2 Background

- **Phase 4 Sprint 2 완료**: 12 Workers + Pages 배포, 1,586 tests
- **LPON 파일럿 완료**: 88문서 → 85 파싱 → 848 정책 → 7,332 용어 → 859 스킬
- **FactCheck 완료**: 382 source / 109 doc, 119건 매칭(31.2%), 외부API 83.7%, 문서역방향 90.4%
- **Gap**: 추출된 데이터의 "정확성"과 "활용 가능성"에 대한 체계적 검증이 미수행

### 1.3 Related Documents

- [[AIF-REQ-010]] SI 산출물 재구성 + Gap 분석 완료 (기존 Gap 분석 인프라)
- [[AIF-REQ-016]] LPON FactCheck 커버리지 분석 (소스↔문서 매칭)
- [[AIF-ANLS-018]] P1/P2 인터페이스 명세 (미문서화 API 분석)
- PRD v0.7.4 §18 RBAC, §44 Phase Plan

---

## 2. Scope

### 2.1 In Scope

- [ ] **산출물 D1: 인터페이스 설계서** — 소스코드 역공학 API 382건 + 문서 API 109건을 SI 인터페이스 설계서 형식으로 재구성. 매칭 여부(119건 matched / 263건 gap) 표시
- [ ] **산출물 D2: 업무규칙 정의서** — 848개 approved 정책(condition-criteria-outcome)을 도메인별로 분류하여 사람이 읽는 업무규칙 문서로 변환
- [ ] **산출물 D3: 용어사전** — 7,332개 온톨로지 용어를 계층 구조(broader/narrower) + 정의 + 출처 문서 참조로 정리
- [ ] **산출물 D4: Gap 분석 종합 보고서** — FactCheck 결과 + 도메인별 커버리지 + 미문서화 API 16건 + 개선 로드맵을 하나의 종합 보고서로 통합
- [ ] **As-Is vs To-Be 비교 프레임워크** — 양방향(소스↔문서 Gap + 기존산출물↔AI추출물 품질) 비교 매트릭스 정의
- [ ] **3-Tier 인터뷰 프로세스** — 현업 도메인 전문가, SI 아키텍트, BD팀 내부의 관점별 평가 체크리스트 및 조정 프로세스
- [ ] **실효성 검증 보고서** — 산출물 활용 시나리오, 시간 절감 효과, 품질 비교 결과 종합

### 2.2 Out of Scope

- .skill.json 스키마 자체의 변경 (기존 Skill 패키징은 유지)
- 신규 Worker 서비스 개발 (기존 svc-analytics의 export 기능 확장으로 대응)
- 퇴직연금(Miraeasset) 도메인 산출물 (온누리상품권 파일럿 완료 후 적용)
- 프로덕션 UI 개발 (산출물은 마크다운/문서 형태로 생성)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 정책 데이터(848건)를 도메인별로 분류하여 업무규칙 정의서 마크다운을 생성한다 | High | Pending |
| FR-02 | FactCheck 매칭 결과(382 source + 109 doc)를 인터페이스 설계서 형식으로 재구성한다 | High | Pending |
| FR-03 | 온톨로지 용어(7,332건)를 계층 구조 포함 용어사전으로 변환한다 | High | Pending |
| FR-04 | Gap 분석 4-perspective 결과를 종합 보고서로 통합 생성한다 | High | Pending |
| FR-05 | As-Is(소스코드 기반) vs To-Be(설계문서 기반) 비교 매트릭스를 자동 생성한다 | High | Pending |
| FR-06 | 기존 SI 산출물과 AI 추출물의 품질 비교 체크리스트를 제공한다 | Medium | Pending |
| FR-07 | 인터뷰 평가 결과를 반영하여 산출물을 조정(수정/보완/삭제)할 수 있다 | Medium | Pending |
| FR-08 | 최종 산출물 세트를 버전별로 스냅샷 관리한다 | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 문서 품질 | SI 산출물 표준 양식 준수율 ≥ 90% | 체크리스트 기반 자체 점검 |
| 데이터 정확성 | 역공학 추출 정책의 정확도 ≥ 80% (인터뷰 평가 기준) | 도메인 전문가 인터뷰 |
| 완성도 | 산출물 누락 항목 ≤ 10% | As-Is vs To-Be 매트릭스 |
| 활용 가능성 | 실무 활용 시나리오 ≥ 3건 구체화 | BD팀 내부 워크숍 |

---

## 4. 산출물 생성 방법론

### 4.1 D1: 인터페이스 설계서

**데이터 소스**: svc-extraction FactCheck 결과 + AST 파서 + Gap 분석
```
Source: db-structure.fact_check_results + fact_check_gaps
API: GET /gap-analysis/overview?organizationId={lpon-org-id}
     GET /gap-analysis/items?perspective=api
```

**생성 전략**:
1. FactCheck matched API 119건 → "검증 완료" 섹션 (소스↔문서 매핑 포함)
2. Source-only API 263건 → "미문서화 API" 섹션 (AST 파서 결과 기반 역공학 명세)
3. Doc-only API 6건 → "구현 미확인 API" 섹션
4. 각 API에 HTTP Method, Path, 파라미터, 응답 형태, 매칭 점수 표시

**문서 구조** (SI 인터페이스 설계서 표준):
```
1. 문서 개요
2. 시스템 구성도 (외부 연동 관점)
3. 인터페이스 목록 (API Summary Table)
4. 인터페이스 상세
   4.1 검증 완료 인터페이스 (119건)
       - API ID, URL, Method, I/O, 소스 매핑, 매칭 점수
   4.2 미문서화 인터페이스 (263건)
       - 역공학 기반 명세, 우선순위(P1/P2/P3), 보완 필요 사항
   4.3 구현 미확인 인터페이스 (6건)
       - 설계서에만 존재, 구현 상태 확인 필요
5. As-Is vs To-Be 매핑 매트릭스
6. 개선 권고사항
```

### 4.2 D2: 업무규칙 정의서

**데이터 소스**: svc-policy approved policies
```
Source: db-policy.policies WHERE status='approved' AND organization_id={lpon}
API: GET /policies?status=approved&organizationId={lpon-org-id}
```

**생성 전략**:
1. 848개 정책을 `categorizeGapDomain()` 17개 도메인으로 분류 (charge, gift, payment, member, auth, wallet 등)
2. 각 정책의 condition-criteria-outcome 트리플을 자연어 업무규칙으로 변환
3. 정책 간 의존관계/충돌 관계 분석
4. trust level(unreviewed/reviewed/validated) 기준 신뢰도 표시

**문서 구조**:
```
1. 문서 개요
2. 업무규칙 분류 체계 (17개 도메인 맵)
3. 도메인별 업무규칙
   3.N {도메인명} (예: 충전 거래)
       규칙 ID | 조건 | 판단 기준 | 결과 | 신뢰도 | 출처 문서
4. 규칙 간 관계 분석
   4.1 의존 관계 (규칙 A 선행 → 규칙 B)
   4.2 충돌/중복 후보
5. 정책 코드 체계 설명 (POL-GIFTVOUCHER-{TYPE}-{SEQ})
6. 검토 및 조정 이력
```

### 4.3 D3: 용어사전

**데이터 소스**: svc-ontology terms + Neo4j graph
```
Source: db-ontology.terms + Neo4j Term nodes
API: GET /ontologies?organizationId={lpon-org-id}
```

**생성 전략**:
1. 7,332개 용어를 term_type(entity/relation/attribute)별로 분류
2. broader/narrower 계층 구조를 들여쓰기로 시각화
3. SKOS URI 기반 크로스 조직 매핑 정보 포함
4. 각 용어의 출처 문서(source_document_id) 역참조

**문서 구조**:
```
1. 문서 개요
2. 용어 분류 체계
3. 핵심 용어 (Entity)
   - 용어 | 정의 | 상위 개념 | 하위 개념 | 관련 정책 | 출처
4. 관계 용어 (Relation)
5. 속성 용어 (Attribute)
6. 용어 계층 트리 (시각화)
7. 크로스 도메인 매핑 (퇴직연금 대비)
```

### 4.4 D4: Gap 분석 종합 보고서

**데이터 소스**: svc-extraction gap-analysis + svc-analytics reports
```
Source: db-structure.gap_analysis_snapshots + db-analytics.report_sections
API: GET /gap-analysis/overview + GET /reports/sections
```

**생성 전략**:
1. 4-perspective(Process/Architecture/API/Table) 결과 통합
2. FactCheck 커버리지 지표 시각화 (31.2% overall, 83.7% external, 90.4% doc-reverse)
3. 도메인별 Gap 분포 + 개선 우선순위
4. AIF-ANLS-018 미문서화 API 16건의 P1/P2/P3 분류

**문서 구조**:
```
1. Executive Summary (핵심 지표 요약)
2. 분석 방법론 (5-Stage 파이프라인 + FactCheck 3-Phase 매칭)
3. 커버리지 분석
   3.1 전체 커버리지 (31.2%)
   3.2 외부 API 커버리지 (83.7%)
   3.3 문서 역방향 커버리지 (90.4%)
   3.4 테이블 커버리지 (100%)
4. 도메인별 Gap 상세 (17개 도메인)
5. 미문서화 API 명세 (P1: 7건, P2: 5건, P3: 4건)
6. As-Is vs To-Be 종합 비교
7. 개선 로드맵 및 권고사항
8. 부록: 매칭 알고리즘 상세
```

---

## 5. As-Is vs To-Be 비교 프레임워크

### 5.1 방향 1: 소스코드(As-Is) vs 설계문서(To-Be) Gap

이미 FactCheck에서 수행한 분석을 SI 관점으로 재해석한다.

| 비교 축 | As-Is (소스코드) | To-Be (설계문서) | 비교 지표 |
|----------|------------------|------------------|-----------|
| API 커버리지 | 382건 (230 API + 152 Table) | 109건 (114 API + 12 Table) | 매칭률, Gap 건수 |
| 외부 인터페이스 | 123건 (고객 대면 API) | 114건 (인터페이스 설계서) | 83.7% 커버리지 |
| 내부 인터페이스 | 259건 (batch, manual 등) | 0건 (설계서 미기술) | 설계서 보완 필요 범위 |
| 데이터 모델 | DDL/Mapper 152건 | ERD 12건 | 100% 매칭 |

### 5.2 방향 2: 기존 SI 산출물(As-Is) vs AI 추출 결과(To-Be) 품질

수작업으로 만든 기존 SI 산출물과 AI Foundry가 자동 추출한 결과의 품질을 비교한다.

| 비교 항목 | 평가 기준 | 측정 방법 |
|-----------|-----------|-----------|
| **완성도** | 누락 항목 비율 | 기존 산출물 항목 수 vs AI 추출 항목 수 |
| **정확성** | 오류/왜곡 건수 | 도메인 전문가 샘플 검증 (20% 샘플링) |
| **일관성** | 명명 규칙, 형식 통일성 | 체크리스트 기반 점검 |
| **추적 가능성** | 출처 문서 역참조율 | provenance 필드 완전성 |
| **시간 효율** | 산출물 생성 소요 시간 | 수작업 추정 시간 vs AI 파이프라인 실행 시간 |

### 5.3 비교 매트릭스 출력 형태

```
┌──────────────┬────────────┬─────────────┬──────┬────────┐
│ 항목          │ As-Is(기존) │ To-Be(AI)   │ 차이  │ 판정   │
├──────────────┼────────────┼─────────────┼──────┼────────┤
│ API 목록 건수  │ 114건      │ 382건       │ +268 │ AI 우위 │
│ 업무규칙 건수  │ ?건 (수작업)│ 848건       │ +?   │ 비교   │
│ 용어 정의 건수 │ ?건        │ 7,332건     │ +?   │ 비교   │
│ 생성 시간     │ ?일 (추정) │ ~2시간(파이프)│ -?일  │ AI 우위 │
│ 정확도       │ 100%(검증) │ ?%(평가전)   │ -?%  │ 평가   │
└──────────────┴────────────┴─────────────┴──────┴────────┘
```

---

## 6. 인터뷰 기반 평가 프로세스

### 6.1 3-Tier 평가 체계

| Tier | 평가자 | 관점 | 평가 대상 | 기대 산출 |
|------|--------|------|-----------|-----------|
| **T1** | 도메인 전문가 (온누리상품권 업무 담당자) | 업무 정확성 | D2(업무규칙), D3(용어사전) | 정책 정확도 평점, 오류 목록, 누락 규칙 제안 |
| **T2** | SI 아키텍트/개발 리드 | 기술 완성도 | D1(인터페이스 설계서), D4(Gap 보고서) | 산출물 형식 적합성, API 명세 완성도, 활용 가능 판정 |
| **T3** | BD팀 내부 | 비즈니스 가치 | 전체 산출물 세트 + As-Is/To-Be 비교 | 고객 제안 활용 시나리오, 차별화 포인트, 개선 방향 |

### 6.2 인터뷰 프로세스

```
Phase 1: 준비 (산출물 생성)
  ├─ D1~D4 초안 생성 (AI 기반 자동 변환)
  ├─ As-Is vs To-Be 매트릭스 작성
  └─ 평가 체크리스트 준비

Phase 2: Tier별 인터뷰
  ├─ T1 인터뷰: 업무규칙 정확성 검증
  │   ├─ 20% 샘플링 (848건 중 ~170건)
  │   ├─ 각 정책에 대해: 정확/부정확/불명확/누락 판정
  │   └─ 누락된 업무규칙 제안 수집
  │
  ├─ T2 인터뷰: 기술 산출물 품질 검토
  │   ├─ 인터페이스 설계서 형식 적합성
  │   ├─ API 명세 완성도 (필수 필드 누락 여부)
  │   └─ 실제 SI 프로젝트 투입 가능성 판정
  │
  └─ T3 워크숍: 비즈니스 가치 검증
      ├─ 고객 제안서에 활용 가능한 형태인가?
      ├─ 기존 수작업 대비 시간/품질 개선 정도
      └─ 추가 도메인 확장 시 예상 효과

Phase 3: 조정 (Adjustment)
  ├─ 인터뷰 결과 반영하여 산출물 수정
  ├─ 오류 정책 표시 및 보정 (trust level 조정)
  ├─ 누락 항목 보완
  └─ 최종본 버전 스냅샷

Phase 4: 실효성 검증 보고서
  ├─ 정량 지표: 정확도, 커버리지, 시간 절감율
  ├─ 정성 평가: 활용 시나리오, 개선 권고
  └─ 다음 도메인 적용 계획
```

### 6.3 평가 체크리스트 (샘플)

**T1: 업무규칙 정확성 체크리스트**

| # | 평가 항목 | 1(매우낮음) ~ 5(매우높음) |
|---|-----------|:------------------------:|
| 1 | 조건(condition)이 실제 업무 상황을 정확히 반영하는가? | ☐ |
| 2 | 판단 기준(criteria)이 현업에서 사용하는 기준과 일치하는가? | ☐ |
| 3 | 결과(outcome)가 실제 업무 처리 절차와 부합하는가? | ☐ |
| 4 | 용어가 현업에서 사용하는 용어와 일치하는가? | ☐ |
| 5 | 누락된 중요 업무규칙이 있는가? (있다면 기술) | ☐ |

**T2: 기술 산출물 품질 체크리스트**

| # | 평가 항목 | 1(매우낮음) ~ 5(매우높음) |
|---|-----------|:------------------------:|
| 1 | SI 산출물 표준 양식을 준수하고 있는가? | ☐ |
| 2 | API 명세가 개발에 바로 활용 가능한 수준인가? | ☐ |
| 3 | 데이터 흐름(I/O)이 명확하게 기술되어 있는가? | ☐ |
| 4 | 기존 인터페이스 설계서 대비 정보량이 충분한가? | ☐ |
| 5 | 실제 SI 프로젝트에 투입 가능한가? | ☐ |

---

## 7. 실효성 검증 기준

### 7.1 정량 지표

| 지표 | 목표 | 현재 추정 | 측정 방법 |
|------|------|-----------|-----------|
| 정책 정확도 | ≥ 80% | 미측정 | T1 인터뷰 샘플링 |
| 용어 정확도 | ≥ 85% | 미측정 | T1 인터뷰 |
| API 명세 완성도 | ≥ 70% | 83.7% (외부 API) | T2 인터뷰 + FactCheck |
| 산출물 형식 적합도 | ≥ 90% | 미측정 | T2 체크리스트 |
| 시간 절감율 | ≥ 60% | 미측정 | 수작업 추정 vs 실제 소요 |

### 7.2 정성 평가

| 항목 | 검증 방법 |
|------|-----------|
| 고객 제안 활용 가능성 | BD팀 워크숍에서 3건 이상 활용 시나리오 도출 |
| 도메인 확장 가능성 | 퇴직연금→온누리상품권 전이 경험 기반 난이도 평가 |
| 차별화 포인트 | 경쟁사 대비 AI 역공학 접근법의 독자성 |

### 7.3 활용 시나리오 (예시)

1. **신규 SI 제안서**: "기존 시스템 분석에 X일 소요 → AI Foundry로 Y시간으로 단축" 실증 근거
2. **레거시 시스템 현행화**: 운영 중인 시스템의 문서가 없거나 낙후된 경우, 소스코드에서 산출물 자동 생성
3. **인수인계 문서**: 프로젝트 이관 시 자동 생성된 산출물로 인수인계 품질 향상
4. **컴플라이언스 감사**: 업무규칙의 출처 추적(provenance)을 통한 감사 대응

---

## 8. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 정책 정확도가 80% 미달 | High | Medium | 도메인별 샘플링 비율 조정, Opus 프롬프트 개선 후 재추출 |
| 인터뷰 대상자 확보 어려움 | Medium | Medium | BD팀 내부 자체 검증을 1차로, 외부 인터뷰를 2차로 분리 |
| SI 산출물 표준 양식 불일치 | Medium | Low | KT DS 내부 산출물 템플릿 사전 확보 |
| As-Is 기존 산출물 확보 어려움 | High | Medium | 온누리상품권 원본 문서(88건)에서 역추출 또는 고객사 협조 |
| 산출물 분량 과다 (848건 정책 전체 문서화) | Medium | High | 도메인별 대표 정책 선별 + 전체는 부록 처리 |

---

## 9. Implementation Approach

### 9.1 기술 구현 방안

**기존 인프라 활용** (신규 서비스 개발 불필요):

| 산출물 | 데이터 소스 | 변환 방식 | 출력 |
|--------|------------|-----------|------|
| D1 인터페이스 설계서 | svc-extraction gap-analysis API | svc-analytics export 확장 | Markdown → (선택) DOCX |
| D2 업무규칙 정의서 | svc-policy policies API | 신규 export endpoint | Markdown |
| D3 용어사전 | svc-ontology terms API | 신규 export endpoint | Markdown |
| D4 Gap 보고서 | svc-extraction + svc-analytics | 기존 markdown export 확장 | Markdown |

**구현 옵션**:
- **Option A (경량)**: 기존 API 데이터를 클라이언트에서 마크다운으로 변환. 프론트엔드 Export 버튼
- **Option B (중량)**: svc-analytics에 산출물 생성 API 추가. 서버사이드 렌더링
- **Option C (하이브리드)**: 데이터 수집은 API, 문서 변환은 Claude LLM 호출로 자연어 품질 향상

### 9.2 작업 단계

```
Step 1: 산출물 템플릿 확정 (1일)
  └─ KT DS SI 산출물 표준 양식 확보 및 마크다운 템플릿화

Step 2: 데이터 추출 + 자동 변환 (2~3일)
  ├─ D1: FactCheck API → 인터페이스 설계서 마크다운
  ├─ D2: Policy API → 업무규칙 정의서 마크다운
  ├─ D3: Ontology API → 용어사전 마크다운
  └─ D4: Gap Analysis + Reports API → 종합 보고서 마크다운

Step 3: As-Is vs To-Be 비교표 작성 (1일)
  ├─ 소스↔문서 Gap 비교 매트릭스
  └─ 기존산출물↔AI추출물 품질 비교표 (가능한 범위)

Step 4: 인터뷰 준비 + 실행 (3~5일)
  ├─ 평가 체크리스트 확정
  ├─ T1 도메인 전문가 인터뷰
  ├─ T2 SI 아키텍트 인터뷰
  └─ T3 BD팀 내부 워크숍

Step 5: 조정 + 최종본 (2일)
  ├─ 인터뷰 결과 반영 산출물 수정
  ├─ 버전 스냅샷
  └─ 실효성 검증 보고서 작성
```

---

## 10. Success Criteria

### 10.1 Definition of Done

- [ ] 4종 SI 산출물(D1~D4) 초안 생성 완료
- [ ] As-Is vs To-Be 비교 매트릭스 작성 완료
- [ ] 최소 1 Tier 이상 인터뷰 수행 완료
- [ ] 인터뷰 결과 반영 산출물 조정 완료
- [ ] 실효성 검증 보고서 작성 완료

### 10.2 Quality Criteria

- [ ] 정책 정확도 ≥ 80% (인터뷰 평가)
- [ ] 산출물 형식 적합도 ≥ 90% (체크리스트)
- [ ] 활용 시나리오 ≥ 3건 구체화

---

## 11. Next Steps

1. [ ] 산출물 템플릿 확정 → Design 문서 작성 (`/pdca design AIF-REQ-017`)
2. [ ] D1~D4 자동 생성 구현
3. [ ] 인터뷰 일정 조율 및 수행
4. [ ] 조정 및 최종 보고서

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-09 | Initial draft | AX BD팀 |
