---
id: AIF-ANLS-066
title: "Sprint Pipeline Batch 1 (267+268) — 통합 Gap Analysis + E2E Audit"
sprint: [267, 268]
f_items: [F434, F435]
status: COMPLETED
created: 2026-05-06
session: 280
---

# Phase 3b Pipeline Batch 1 — 통합 분석

> Sprint Pipeline 스킬 Phase 6 산출물. Master inline 분석 (gap-detector agent 미사용 — token 효율).

## 1. 요약

| 지표 | 값 |
|------|-----|
| 평균 Match Rate | **95%** (267: 95% / 268: 95%) |
| Gap Sprint (< 90%) | 0건 |
| HIGH E2E Gap | 0건 |
| Phase 7 필요성 | SKIP — 양 Sprint 모두 통과 |
| 총 소요 | 47분 (16:40~17:27) |
| Master fix-forward | 3회 (S268 URL + S268 strict mode + S267 conflict) |

## 2. Sprint 267 (F434) Gap 분석

### 2.1 Plan DoD vs 실제 산출물

| DoD 항목 | 결과 | 상태 |
|----------|------|------|
| WS-1 BL-level production 통합 (7 containers) | detect-bl 31/48 = 64.6% + write-provenance 0/7 changes | ✅ 달성 |
| WS-2 DIVERGENCE 5건 재실측 | 4 RESOLVED + 1 OPEN (BL-026) | ✅ 달성 |
| WS-3 F356-A 재평가 (avg) | 0.740 ($0.1634, haiku) | ✅ 달성 |
| **WS-4 LPON R2 재패키징** | wrapper 생성 (`scripts/divergence/rebundle-all-domains.ts`) — 실 실행 **Phase 4 이관** | ⏳ 부분 |
| WS-5 TD-28 ✅ RESOLVED + SPEC 갱신 | F434 [x] DONE 마킹 + TD-28 RESOLVED | ✅ 달성 |
| typecheck/lint clean | utils 159/159 + svc-skill 419/419 PASS | ✅ 달성 |
| Match ≥ 90% | 95% (autopilot 자체 평가) | ✅ 달성 |

**Acknowledged Gap (Phase 4 이관)**: WS-4 R2 실 실행은 wrapper만 생성. Production smoke (Master ps+curl)는 미수행. autopilot Production Smoke 14회차 변종 패턴 무관 — 산출물 실파일(reports/*.json + analysis MD + report MD) 모두 검증됨.

### 2.2 Added/Changed Features (Design 외 추가 구현)

- `passThreshold` 스키마 0.6 → 0.75 변경 (`packages/types/src/ai-ready.ts:2`) — F356-A 재평가에 필요한 baseline 조정. Plan에 명시 없으나 합리적 추가.
- `services/svc-skill/src/ai-ready/repository.test.ts` 12 lines 변경 — passThreshold 변경 반영 테스트 보강.

## 3. Sprint 268 (F435) Gap 분석

### 3.1 Plan DoD vs 실제 산출물

| DoD 항목 | 결과 | 상태 |
|----------|------|------|
| Plan AIF-PLAN-066 | 작성 완료 | ✅ |
| E2E 스모크 테스트 | `progress-status.spec.ts` 5 cases (Master fix-forward 2회 후 CI PASS) | ✅ |
| typecheck/lint clean | CI PASS | ✅ |
| Report AIF-RPRT-066 | 작성 완료 | ✅ |
| SPEC §6 Sprint 268 갱신 | DONE 마킹 | ✅ |
| Match ≥ 90% | 95% | ✅ |

### 3.2 특이사항 — Master 사전 등록 hallucination 발견

세션 279 사전 등록 시 AIF-REQ-018 컴포넌트(Executive Summary + accordion + Recharts)가 **2026-03-10 commit `d30c002`에서 이미 구현 완료**된 상태였음을 인지하지 못함. autopilot이 grep으로 정확히 인식하여 잔여 E2E 1건 + Plan/Report로 적절히 종결. **autopilot 자체 평가 정확** — `feedback_sprint_pre_registration_audit.md` 신규 정착.

### 3.3 Master fix-forward 2회

| 차수 | 원인 | Fix |
|------|------|----|
| #1 | autopilot E2E URL `/analysis` 사용 — `app.tsx:160` redirect 미인지 | URL `/analysis-report?view=status` 5건 정정 |
| #2 | strict mode violation (`text=/파이프라인 현황|.../`이 2 elements 매칭) | `.first()` 추가 |

## 4. E2E Audit

### 4.1 라우트 커버리지

| 신규 라우트 | E2E spec | 상태 |
|------------|----------|------|
| (없음) | — | N/A |

Sprint 267: API/CLI 도구만 변경 (svc-skill evaluator 1줄, repository.test 12줄). 라우트 변경 0건.
Sprint 268: UX 컴포넌트는 main 기구현 — 신규 라우트 0건. 기존 `/analysis-report` 라우트 검증 추가.

**Route coverage**: N/A (신규 라우트 없음).

### 4.2 기능 커버리지

| F-item | 핵심 사용자 경로 | E2E 검증 |
|--------|-----------------|---------|
| F434 (BL detection) | CLI 실행 (`detect-bl --all-domains`) | unit test (utils 159/159) |
| F434 (F356-A 재평가) | API endpoint `/skills/:id/ai-ready/evaluate` | repository.test +12 lines |
| F435 (UX Executive Summary) | `/analysis-report?view=status` 페이지 로드 | E2E 1 case ✅ |
| F435 (accordion 토글) | 파이프라인 현황 헤더 클릭 | E2E 1 case ✅ |
| F435 (FactCheck 섹션) | FactCheck 커버리지 분석 표시 | E2E 1 case ✅ |
| F435 (상세 보고서 섹션) | Level 3 collapsible 표시 | E2E 1 case ✅ |
| F435 (Executive Summary 게이지/스코어) | ScoreGauge + Verdict 텍스트 | E2E 1 case ✅ |

**Feature coverage**: 5/5 핵심 경로 ✅ (Sprint 268 UX F-item Must 원칙 §4 #6 충족).

### 4.3 품질 anti-pattern 분석

| 패턴 | 검출 | 평가 |
|------|------|------|
| `waitForTimeout` 사용 | 0건 (모든 테스트 `waitForLoadState("networkidle")`) | ✅ Clean |
| 약한 assertion (toBeTruthy 등) | 0건 (`toBeVisible`만 사용) | ✅ Clean |
| API-only 검증 | 0건 (UI rendering 검증) | ✅ Clean |
| Strict mode violation | 1건 → fix-forward로 해소 | ⚠️ → ✅ |

**HIGH gap**: 0건 → Phase 7b 건너뜀.

## 5. 종합 판정

| Phase | 상태 | 메모 |
|-------|:---:|------|
| 6a Gap Analysis | ✅ 통과 | 평균 95%, gap sprint 0건 |
| 6b E2E Audit | ✅ 통과 | feature coverage 5/5, HIGH gap 0건 |
| 7 Auto Correction | SKIP | 통과 기준 충족 |
| 8 Session-End | 진행 예정 | SPEC F-item 보정 + commit + push |

## 6. 차기 권고

1. **WS-4 R2 실 실행** (Phase 4 이관) — `rebundle-all-domains.ts` 실행 + 5/5 HTTP 200 검증 → 별도 Sprint 또는 ad-hoc 작업으로 처리
2. **AIF-REQ-018 사전 등록 audit 표준화** — `/ax:todo plan` 시 코드 실재 점검 단계 명시 (`feedback_sprint_pre_registration_audit.md` 정착)
3. **Sprint 269 (F436 신규 도메인)** — Sprint 267 MERGED 의존 해소됨, Batch 2 진입 가능
