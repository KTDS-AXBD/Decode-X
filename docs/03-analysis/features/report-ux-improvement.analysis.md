---
code: AIF-ANLS-report-ux-improvement-analysis
title: "AIF-REQ-018 Report UX Improvement — Gap Analysis"
version: 1.0
status: active
category: analysis
created: 2026-03-19
updated: 2026-03-19
author: Sinclair Seo
---

# AIF-REQ-018 Report UX Improvement — Gap Analysis

> **Feature**: report-ux-improvement
> **Plan**: docs/01-plan/features/report-ux-improvement.plan.md
> **Date**: 2026-03-19
> **Match Rate**: 100% (6/6)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | ProjectStatusTab의 하드코딩 데이터 + FactCheck 중복 + 결론 프레임 고정 |
| **Solution** | API 데이터 기반 동적화 + 중복 섹션 필터 + 3단계 결론 분기 |
| **Function/UX Effect** | org 전환 시 정확한 수치 반영, 스크롤 감소, 데이터 기반 의사결정 |
| **Core Value** | 신뢰성·가독성·의사결정 지원이 강화된 리포트 |

---

## Gap Analysis Results

| FR | Requirement | Status | Evidence |
|----|-------------|:------:|----------|
| FR-01 | TrafficCard items를 PipelineCounts 데이터로 동적 생성 | ✅ MATCH | `approvedPolicies.toLocaleString()`, `totalTerms.toLocaleString()`, `totalSkills.toLocaleString()` 바인딩 |
| FR-02 | ComparisonCard 수치를 approvalRate/totalTerms 기반 범위 계산 | ✅ MATCH | `computeComparisonItems(approvalRate, totalTerms)` — policyRange/termRange/skillRange 3단계 분기 |
| FR-03 | FactCheck 섹션을 Level 2에만 유지, DynamicStatusReport에서 스킵 | ✅ MATCH | `SKIP_SECTION_KEYS = ["fact_check", "factcheck", "comprehensive_verdict"]` + `.filter()` |
| FR-04 | computeScore 기반 결론 문구 3단계 자동 분기 | ✅ MATCH | `generateVerdict(score)` — ≥80/≥50/<50 분기, headline + detail 반환 |
| FR-05 | DynamicStatusReport 향후과제/로드맵 접기/펼치기 | ✅ MATCH | `COLLAPSIBLE_SECTION_KEYS = ["next_steps", "roadmap", "future_tasks"]` + `CollapsibleSectionContent` |
| FR-06 | ReadinessBar segments 동적 산출 | ✅ MATCH | `computeReadinessSegments(approvalRate, approvedPolicies)` — 총합 100 보정 |

---

## Bonus Implementations (Plan 범위 외)

| # | 내용 |
|---|------|
| B-01 | `comprehensive_verdict` 키도 SKIP_SECTION_KEYS에 포함 (종합판정 중복 차단) |
| B-02 | `future_tasks` 키도 COLLAPSIBLE_SECTION_KEYS에 포함 (향후과제 변형 대응) |
| B-03 | ComparisonCard의 aiSummary도 approvalRate 기반 동적 분기 |
| B-04 | 승인율을 TrafficCard "보완 후 활용" 항목에 동적 표시 |

---

## Code Quality Notes (Low Priority)

| # | 위치 | 내용 | 심각도 |
|---|------|------|:------:|
| Q-01 | `getSourceInfo()` | org별 소스 파일 현황이 하드코딩 (API 미존재로 불가피) | Info |
| Q-02 | `computeReadinessSegments` | `* 55` 매직넘버 → 상수 추출 권장 | Low |

---

## Verification

- **typecheck**: 18/18 PASS (FULL TURBO)
- **lint**: app-web PASS (svc-extraction 기존 에러만)
- **변경 파일**: ProjectStatusTab.tsx (+71/-22), DynamicStatusReport.tsx (+52/-12)

---

## Conclusion

**Match Rate 100%** — 6개 FR 전부 Plan 의도와 일치. 4개 보너스 구현. 즉각 조치 필요 항목 없음.
