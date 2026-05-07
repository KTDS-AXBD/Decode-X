---
id: AIF-PLAN-068
sprint: 270
feature: F437
title: AIF-REQ-018 Phase 2 — Recharts RadialBarChart 게이지 세트 + Storybook
status: active
estimated_hours: 3
created: 2026-05-08
req: AIF-REQ-018
---

# F437 Plan — AIF-PLAN-068

## 목표

`apps/app-web` 진행 현황 리포트 페이지의 게이지 시각화를 Phase 1 단일 ScoreGauge → **3종 RadialBarChart 게이지 세트(coverage / score / trust)**로 확장한다. 동시에 `apps/app-web/.storybook/`을 도입하여 핵심 UI 컴포넌트 4건의 스토리를 작성한다.

## 배경

- AIF-REQ-018 (진행 현황 리포트 UX 개선) Phase 1 ✅ Sprint 268 F435 완결 — 3단계 구조(Executive Summary + accordion 상세) + 단일 ScoreGauge + CollapsibleSection + Recharts BarChart/LineChart.
- Phase 2 후속 — Sprint 268 §6 후속 명시: "Recharts RadialBarChart 게이지 세트 확장 + Storybook 스토리".
- ScoreGauge는 SVG 기반 단일 score 게이지. Coverage/Trust 등 다른 차원 지표는 별도 ReadinessBar/MetricCard로 분리되어 일관성 부족.
- Storybook 미도입 — 컴포넌트 회귀 검증 + 디자인 리뷰 인프라 부재.

## DoD

| # | 항목 | 기준 |
|---|------|------|
| 1 | Plan 문서 (AIF-PLAN-068) | 이 파일 ✅ |
| 2 | `<GaugeSet>` 컴포넌트 | `apps/app-web/src/components/dashboard/GaugeSet.tsx` — 3종 RadialBarChart 가로 배치, props {coverage, score, trust} 0~100 |
| 3 | RadialBarChart 적용 | Recharts `RadialBarChart` + 색상/임계값(green ≥ 80, yellow 50~79, red < 50) prop 별도 |
| 4 | Storybook 셋업 | `apps/app-web/.storybook/{main.ts, preview.ts}` + `@storybook/react-vite` + `@storybook/addon-essentials` 설치 |
| 5 | Storybook 스토리 4건 | `*.stories.tsx` — ScoreGauge / GaugeSet / CollapsibleSection / ExecutiveSummary 각 1건 + 변형(default + edge case 2~3) |
| 6 | 진행 현황 페이지 통합 | `ProjectStatusTab.tsx`에서 ScoreGauge → GaugeSet 교체 (또는 GaugeSet 추가, ScoreGauge 별도 위치 유지) |
| 7 | E2E 1건 | `e2e/progress-status-gauge-set.spec.ts` — GaugeSet 렌더링 + 3 gauge text value 검증 |
| 8 | typecheck/lint clean | `pnpm typecheck && pnpm lint` 오류 0 (apps/app-web) |
| 9 | Match ≥ 90% | Gap analysis 통과 |
| 10 | Report (AIF-RPRT-068) | `reports/sprint-270-ux-progress-report-phase-2-2026-05-08.md` |

## 구현 범위

### 신규 파일
- `apps/app-web/src/components/dashboard/GaugeSet.tsx` — 메인 컴포넌트 (~120 lines)
- `apps/app-web/.storybook/main.ts` — Storybook config
- `apps/app-web/.storybook/preview.ts` — 글로벌 preview
- `apps/app-web/src/components/dashboard/ScoreGauge.stories.tsx`
- `apps/app-web/src/components/dashboard/GaugeSet.stories.tsx`
- `apps/app-web/src/components/dashboard/CollapsibleSection.stories.tsx`
- `apps/app-web/src/components/dashboard/ExecutiveSummary.stories.tsx`
- `apps/app-web/e2e/progress-status-gauge-set.spec.ts` (~50 lines)
- `reports/sprint-270-ux-progress-report-phase-2-2026-05-08.md`

### 수정 파일
- `apps/app-web/src/components/dashboard/ProjectStatusTab.tsx` — GaugeSet 통합
- `apps/app-web/package.json` — `@storybook/react-vite`, `@storybook/addon-essentials` 추가
- `apps/app-web/vite.config.ts` (필요 시) — Storybook 호환 패치

## 4-Step 실행

| Step | 시간 | 작업 |
|------|------|------|
| 1 | 0.7h | Storybook 셋업 (`@storybook/react-vite` 설치 + main.ts + preview.ts + sample 스토리 1건 verify) |
| 2 | 1h | `<GaugeSet>` 컴포넌트 (Recharts RadialBarChart 3개 가로 배치 + 색상/임계값 prop) + 단위 동작 verify |
| 3 | 0.5h | 4 Storybook 스토리 작성 (default + edge case 2~3) |
| 4 | 0.8h | ProjectStatusTab.tsx 통합 + E2E spec + Report + typecheck/lint clean |

## 검증 시나리오

- **단위**: Storybook에서 GaugeSet props {coverage:90, score:75, trust:60} → 3 게이지 색상 (green/yellow/red) 시각 확인
- **E2E**: 진행 현황 페이지 진입 → GaugeSet locator → 3 gauge text "90%", "75%", "60%" 검증
- **회귀**: 기존 ScoreGauge spec PASS 유지 + ExecutiveSummary 표시 정상 + CollapsibleSection 토글 정상

## 사용자 결정 (사전)

- 모드 = **Sprint Pipeline 자동** (Sprint 269 F436과 Batch 1 병렬)
- 게이지 차원 = **3종 (coverage / score / trust)** — Sprint 268 §6 후속 명시 기준 그대로
- Storybook 7+ 도입 여부 = **YES** (Sprint 268 §6 후속 명시)

## 리스크 / 대응

- **R1**: Storybook 7+ Vite 통합이 wrangler/Workers 빌드와 충돌 가능성
  - **대응**: `apps/app-web` SPA 영역에 격리. `pnpm storybook` 별도 dev 명령으로 분리. wrangler build/deploy 영향 0.
- **R2**: Recharts RadialBarChart의 단일 게이지 mode가 SVG 직접 렌더보다 무거움 (번들 크기)
  - **대응**: 기존 Recharts 이미 LineChart/BarChart로 import 중 (Sprint 268). RadialBarChart 추가는 ~5KB 미만 incremental. 측정 후 SPEC §10 번들 크기 갱신.
- **R3**: `<GaugeSet>` props 시그니처가 향후 게이지 추가(예: completeness)와 충돌
  - **대응**: props 형식 `{ gauges: GaugeConfig[] }` 객체 배열로 일반화 (확장성 + 단순 시그니처). variant `compact`/`detailed` future flag.

## 참조

- AIF-REQ-018 IN_PROGRESS — 진행 현황 리포트 UX 개선
- Sprint 268 F435 (`docs/01-plan/features/F435-ux-progress-report.plan.md`) Phase 1 완결
- 기구현 컴포넌트: `apps/app-web/src/components/dashboard/ScoreGauge.tsx` + `CollapsibleSection.tsx` + `ExecutiveSummary.tsx`
- SPEC §4 #6 — UX F-item Must (E2E 1건 이상 Must 인수 기준)
