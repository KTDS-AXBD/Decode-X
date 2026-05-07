---
id: AIF-DSGN-068
sprint: 270
feature: F437
title: AIF-REQ-018 Phase 2 — GaugeSet 컴포넌트 + Storybook 셋업 설계
status: active
created: 2026-05-08
plan: AIF-PLAN-068
---

# F437 Design — AIF-DSGN-068

## §1 범위

`apps/app-web` 단독 변경. 다른 서비스/패키지 무영향.

## §2 컴포넌트 설계

### 2-1. GaugeSet

**경로**: `apps/app-web/src/components/analysis-report/GaugeSet.tsx`

```ts
interface GaugeConfig {
  key: string;
  label: string;
  value: number;     // 0-100
  color?: string;    // 자동 임계값 색상 우선, 명시 시 override
}

interface GaugeSetProps {
  gauges: GaugeConfig[];
  size?: number;     // 각 게이지 픽셀 크기 (기본 100)
}
```

**렌더링**: `gauges` 배열을 `flex gap-4`로 가로 나열. 각 항목은 `Recharts RadialBarChart` (단일 RadialBar + background track) + 중앙 수치 오버레이 + 하단 label.

**색상 임계값**:
- value ≥ 80 → `#10b981` (green, ScoreGauge 일관)
- value 50~79 → `#f59e0b` (yellow)
- value < 50 → `#ef4444` (red)

**Recharts 설정**:
```
RadialBarChart: startAngle=90, endAngle=-270 (전체 원)
PolarAngleAxis: type="number", domain=[0, 100], tick=false
RadialBar: dataKey="value", background={{ fill: borderColor }}, cornerRadius=3
데이터: [{ value, fill: gaugeColor }]
```

### 2-2. ExecutiveSummary

**경로**: `apps/app-web/src/components/analysis-report/ExecutiveSummary.tsx`

Props: `{ score: number; headline: string; detail: string }` — Storybook 스토리용 순수 프레젠테이션 컴포넌트. ProjectStatusTab 내부의 executive summary 블록과 동일 JSX를 독립 export.

### 2-3. ProjectStatusTab 수정

ScoreGauge 단일 게이지 옆에 GaugeSet 추가. 레이아웃:
```
[ ScoreGauge ]  [ GaugeSet: coverage | score | trust ]
```

`coverage` = `approvalRate * 100` (정책 승인율)
`score` = `computeScore()` 반환값 (기존 score)
`trust` = `totalTerms > 100 ? 85 : 60` (온톨로지 커버리지 휴리스틱)

## §3 Storybook 셋업

**의존성** (devDependencies):
```
storybook@^8
@storybook/react@^8
@storybook/react-vite@^8
@storybook/addon-essentials@^8
```

**스크립트**:
```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```

**.storybook/main.ts**: 스토리 glob `../src/**/*.stories.@(ts|tsx)`, framework `@storybook/react-vite`, addons `@storybook/addon-essentials`.

**.storybook/preview.ts**: `../src/styles/index.css` import, React 기본 parameters.

## §4 스토리 4건

| 파일 | 컴포넌트 | 스토리 변형 |
|------|----------|-------------|
| `ScoreGauge.stories.tsx` | ScoreGauge | Default(75), High(95), Low(30) |
| `GaugeSet.stories.tsx` | GaugeSet | Default(3 gauges mixed), AllHigh, AllLow |
| `CollapsibleSection.stories.tsx` | CollapsibleSection | DefaultClosed, DefaultOpen |
| `ExecutiveSummary.stories.tsx` | ExecutiveSummary | ReadyHigh(90), ReadyMid(65), ReadyLow(30) |

**스토리 위치**: 각 컴포넌트와 동일 디렉토리 (`analysis-report/`)

## §5 E2E

**파일**: `apps/app-web/e2e/progress-status-gauge-set.spec.ts`

**시나리오**: 진행 현황 페이지(`/analysis-report` 라우트) 진입 → GaugeSet 컨테이너 확인 → 3개 gauge label("정책 승인율" / "활용 준비도" / "신뢰도") 텍스트 존재 검증.

> E2E는 원격 배포 환경 대상(`DEV_PROXY=remote`). GaugeSet은 실제 API 수치와 무관하게 항상 렌더됨.

## §6 Worker 파일 매핑

| Worker | 파일 | 작업 |
|--------|------|------|
| app-web | `src/components/analysis-report/GaugeSet.tsx` | 신규 생성 |
| app-web | `src/components/analysis-report/ExecutiveSummary.tsx` | 신규 생성 |
| app-web | `src/components/analysis-report/ProjectStatusTab.tsx` | GaugeSet 통합 |
| app-web | `.storybook/main.ts` | 신규 생성 |
| app-web | `.storybook/preview.ts` | 신규 생성 |
| app-web | `src/components/analysis-report/*.stories.tsx` (4건) | 신규 생성 |
| app-web | `e2e/progress-status-gauge-set.spec.ts` | 신규 생성 |
| app-web | `package.json` | Storybook devDeps 추가 |
