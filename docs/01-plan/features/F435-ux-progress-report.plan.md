---
id: AIF-PLAN-066
sprint: 268
feature: F435
title: 진행 현황 리포트 UX 개선 — 3단계 구조 + accordion + 게이지/스코어카드
status: active
estimated_hours: 2
created: 2026-05-06
req: AIF-REQ-018
---

# F435 Plan — AIF-PLAN-066

## 목표

`apps/app-web` 분석 리포트 페이지 "진행 현황" 탭의 UX를 개선한다.
3단계 계층 구조(Executive Summary → 핵심 지표 → 상세 보고서), accordion 섹션, 게이지/스코어카드 시각화를 통해 사용자 가시성을 직접 향상시킨다.

## 배경

AIF-REQ-018 (진행 현황 리포트 UX 개선) 범위의 Sprint 268 1차 구현.

**기구현 현황 (main 브랜치)**:
- `ProjectStatusTab.tsx` — Level 1 Executive Summary (ScoreGauge + ReadinessBar + TrafficCard + ComparisonCard) + Level 2 CollapsibleSection "파이프라인 현황" + Level 3 DynamicStatusReport
- `ScoreGauge.tsx` — SVG 기반 원형 게이지 (0~100 score)
- `CollapsibleSection.tsx` — accordion 래퍼
- `MetricCard.tsx` — `explanation` 인라인 설명 prop
- `FactCheckAnalysisSection.tsx` — Recharts BarChart/LineChart 커버리지 시각화
- `DynamicStatusReport.tsx` — SKIP_SECTION_KEYS(FactCheck/종합판정 중복 제거) + COLLAPSIBLE_SECTION_KEYS(향후과제 접기) + TaskListWithFold

**잔여 작업**:
1. E2E 스모크 테스트 — SPEC §4 #6 UX F-item Must 원칙 (UX 변경 F-item은 E2E 1건 이상 Must)
2. Plan/Report 문서 (PDCA 추적)
3. SPEC 상태 갱신 (PLANNED → DONE)

## DoD

| # | 항목 | 기준 |
|---|------|------|
| 1 | Plan 문서 (AIF-PLAN-066) | 이 파일 ✅ |
| 2 | E2E 스모크 테스트 | `e2e/progress-status.spec.ts` — 진행현황 탭 로드 + Executive Summary 표시 + accordion 토글 |
| 3 | typecheck/lint clean | `pnpm typecheck && pnpm lint` 오류 0 |
| 4 | Report (AIF-RPRT-066) | `reports/sprint-268-ux-progress-report-2026-05-06.md` |
| 5 | SPEC §6 Sprint 268 갱신 | PLANNED → DONE 마킹 |
| 6 | Match ≥ 90% | Gap analysis 통과 |

## 구현 범위

### 신규 파일
- `apps/app-web/e2e/progress-status.spec.ts` — E2E 스모크 (약 50 lines)
- `reports/sprint-268-ux-progress-report-2026-05-06.md` — Sprint 보고서 (AIF-RPRT-066)

### 검증 대상 (기존 구현 확인)
- `ProjectStatusTab.tsx` — 3-level 구조 완성 여부
- `ScoreGauge.tsx` — 0~100 score 렌더링
- `CollapsibleSection.tsx` — defaultOpen 제어
- `MetricCard.tsx` — explanation prop 렌더링
- `DynamicStatusReport.tsx` — SKIP/COLLAPSIBLE key 필터

## E2E 테스트 시나리오

```
진행 현황 탭 UX 스모크:
  1. /analysis?view=status 접속
  2. Executive Summary 섹션 표시 확인 (headline 또는 score text)
  3. "파이프라인 현황" 섹션 표시 확인
  4. accordion 토글: 접힌 섹션 클릭 → 펼쳐짐 확인
  5. "상세 분석 보고서" CollapsibleSection 표시 확인
```

## 위험 및 회피책

| 위험 | 회피책 |
|------|--------|
| E2E: API 데이터 없어 빈 상태 렌더링 | 빈 상태도 페이지 구조(헤딩/섹션 레이블)로 확인 가능 — API mock 불필요 |
| typecheck: `DynamicStatusReport` `selecteVersion` 타입 | 이미 main에서 통과됨 (사전 확인) |
| Production smoke test 변종 (rules/dev-workflow.md §14) | 이 Sprint은 backend 없는 순수 UI — wrangler dev 불필요, E2E smoke = frontend PASS 기준 |

## 의존성

없음 (apps/app-web 영역 — Sprint 267 services/svc-skill과 영역 분리 ✅)

## 사이즈

약 1~1.5h — E2E 테스트 작성(45min) + 문서 작성(30min) + 검증(15min)
