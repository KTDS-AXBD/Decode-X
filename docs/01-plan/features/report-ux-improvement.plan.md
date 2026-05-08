---
code: AIF-PLAN-report-ux-improvement-plan
title: "AIF-REQ-018 진행 현황 리포트 UX 개선 — Planning Document"
version: 1.0
status: active
category: plan
created: 2026-03-19
updated: 2026-03-19
author: Sinclair Seo
---

# AIF-REQ-018 진행 현황 리포트 UX 개선 — Planning Document

> **Summary**: ProjectStatusTab의 하드코딩 데이터를 동적화하고, 중복 섹션을 통합하며, 결론 프레임을 강화한다.
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-19
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Executive Summary의 TrafficCard/ComparisonCard 숫자가 하드코딩되어 org 전환 시 정확하지 않고, FactCheck 섹션이 Level 2·3에 중복 노출 가능 |
| **Solution** | 하드코딩 데이터를 API 데이터 기반으로 동적화하고, 중복 섹션을 통합하며, 결론 프레임을 데이터 기반으로 강화 |
| **Function/UX Effect** | org 전환 시 정확한 수치 즉시 반영, 스크롤 피로 감소(중복 제거), 의사결정 지원 강화(데이터 기반 결론) |
| **Core Value** | "분석 결과를 보는 사람이 즉시 판단할 수 있는" 리포트 — 신뢰성·가독성·의사결정 지원 |

---

## 1. Overview

### 1.1 Purpose

ProjectStatusTab의 UX를 개선하여, 경영진/분석가가 리포트를 보고 바로 "이 결과를 쓸 수 있는가"를 판단할 수 있게 한다.

### 1.2 Background

현재 ProjectStatusTab은 세션 161에서 3-Level 구조로 리팩토링되었고, 기본 틀은 잘 갖추어져 있다:
- Level 1: Executive Summary (ScoreGauge + ReadinessBar + TrafficCard + ComparisonCard)
- Level 2: 파이프라인 현황 (MetricCard + FactCheck)
- Level 3: 상세 분석 보고서 (DynamicStatusReport)

그러나 다음 문제가 남아있다:
1. **하드코딩된 숫자**: TrafficCard의 "정책 848건", "커버리지 31%", ComparisonCard의 "80~90%" 등이 리터럴로 박혀있어 org 전환 시 부정확
2. **중복 가능성**: FactCheck가 Level 2 (ProjectStatusTab)와 Level 3 (DynamicStatusReport 내부)에서 중복 노출 가능
3. **결론 프레임 하드코딩**: "즉시 활용 가능" 등의 결론도 데이터에 기반하지 않음
4. **DynamicStatusReport 내 향후과제 섹션**: 접기/펼치기가 적용되지 않은 긴 목록

### 1.3 Related Documents

- SPEC.md §7: AIF-REQ-018
- `apps/app-web/src/components/analysis-report/ProjectStatusTab.tsx` (핵심 대상)

---

## 2. Scope

### 2.1 In Scope

- [ ] FR-01: TrafficCard 숫자를 API 데이터 기반으로 동적화
- [ ] FR-02: ComparisonCard 수치를 데이터 기반 범위 표현으로 변경
- [ ] FR-03: FactCheck 섹션 중복 제거 (Level 2에서만 표시)
- [ ] FR-04: 결론 프레임("쓸 수 있는가?") 판정을 computeScore 기반으로 동적 생성
- [ ] FR-05: DynamicStatusReport 내 향후과제/로드맵 섹션 접기/펼치기 적용
- [ ] FR-06: ReadinessBar segments를 데이터 기반으로 산출

### 2.2 Out of Scope

- DynamicStatusReport 백엔드 API 변경 (기존 svc-analytics API 유지)
- 새로운 시각화 컴포넌트 신규 개발 (ScoreGauge, ReadinessBar 등 기존 컴포넌트 활용)
- 모바일 반응형 최적화 (기존 수준 유지)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | TrafficCard items를 PipelineCounts + FactCheck API 데이터로 동적 생성 | High | Pending |
| FR-02 | ComparisonCard 수치를 policyScore/termScore 기반 범위 계산으로 변경 | Medium | Pending |
| FR-03 | FactCheck 섹션을 Level 2에만 유지, Level 3 DynamicStatusReport에서 "종합판정" 섹션으로 통합 | High | Pending |
| FR-04 | computeScore 결과에 따라 결론 문구를 3단계로 자동 분기 (≥80/≥50/<50) | High | Pending |
| FR-05 | DynamicStatusReport의 next_steps/roadmap contentType 섹션에 접기/펼치기 적용 | Low | Pending |
| FR-06 | ReadinessBar segments를 파이프라인 완성도 기반으로 산출 (현재 50/33/17 하드코딩) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 리포트 로딩 2초 이내 (현행 수준 유지) | 기존 API 재사용, 추가 호출 없음 |
| UX | org 전환 시 모든 숫자 즉시 반영 | 수동 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] TrafficCard/ComparisonCard/ReadinessBar의 하드코딩 숫자 0건
- [ ] org 전환 시 Executive Summary 숫자가 정확히 반영
- [ ] FactCheck 섹션이 Level 2에서만 1회 표시
- [ ] 결론 문구가 computeScore에 연동
- [ ] typecheck + lint PASS

### 4.2 Quality Criteria

- [ ] Zero lint errors
- [ ] Build succeeds
- [ ] org별 수동 검증 (Miraeasset, LPON)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| FactCheck API가 org에서 데이터 없을 때 TrafficCard 빈 값 | Medium | Medium | fallback 표시 ("데이터 없음") |
| DynamicStatusReport에서 종합판정 섹션 키가 org별로 다를 수 있음 | Low | Medium | contentType 기반 필터링 (section_key 불문) |

---

## 6. Implementation Approach

### 6.1 변경 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `ProjectStatusTab.tsx` | FR-01,02,03,04,06: TrafficCard/ComparisonCard/ReadinessBar 동적화, 결론 분기, FactCheck 유지 |
| `DynamicStatusReport.tsx` | FR-05: next_steps/roadmap 섹션에 접기/펼치기 래퍼 적용 |

### 6.2 데이터 흐름

```
PipelineCounts (기존 API)
├─ totalDocs, approvedPolicies, totalPolicies, totalTerms, totalSkills
├─ → computeScore() → score (0-100)
├─ → generateTrafficItems(counts) → TrafficCard items 동적 생성
├─ → generateComparisonRanges(counts) → ComparisonCard 수치 범위
└─ → computeReadinessSegments(counts, factcheckCoverage) → ReadinessBar segments

FactCheck API (기존)
├─ coveragePct → TrafficCard "보완 후 활용" 항목
└─ (Level 2에서만 사용, Level 3에서 중복 제거)
```

### 6.3 결론 프레임 분기 로직

```typescript
function generateVerdict(score: number, approvalRate: number) {
  if (score >= 80) return {
    headline: "이 분석 결과, 즉시 활용 가능",
    detail: "정책·용어·Skill은 즉시 활용 가능. 시스템 통합 설계만 전문가 보완 권장."
  };
  if (score >= 50) return {
    headline: "이 분석 결과, 조건부 활용 가능",
    detail: "핵심 정책은 활용 가능하나, 커버리지 보완이 필요."
  };
  return {
    headline: "이 분석 결과, 추가 작업 필요",
    detail: "파이프라인 완성도가 낮아 추가 문서 투입 및 HITL 검토 필요."
  };
}
```

---

## 7. Next Steps

1. [ ] ~~Write design document~~ (스킵 — UI 컴포넌트 리팩토링이므로 Plan→Do 직행)
2. [ ] 구현: ProjectStatusTab.tsx 동적화 (FR-01~04,06)
3. [ ] 구현: DynamicStatusReport.tsx 접기/펼치기 (FR-05)
4. [ ] 수동 검증: Miraeasset/LPON org 전환 테스트
5. [ ] Gap Analysis

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-19 | Initial draft | Sinclair Seo |
