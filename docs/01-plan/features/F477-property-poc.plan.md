---
id: AIF-PLAN-109
sprint: 311
feature: F477
title: Property Mgmt 41번째 도메인 신규 (임대관리 산업, 30번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-108]
req: AIF-REQ-035
---

# F477 Plan — AIF-PLAN-109

## 목표

41번째 도메인 임대관리(Property Mgmt) 신규 — **30번째 신규 산업** round number 마일스톤. 39 Sprint 연속 정점. RE 부동산 + PR 임대관리 클러스터.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | property.ts source | ~280 lines, 6 함수 + PropertyError |
| 2 | spec-container/property 15 sub-files | provenance + property-rules + PR-001~006 + test |
| 3 | DOMAIN_MAP 41번째 entry | container='property' |
| 4 | parser regex `PR` prefix | longer match first |
| 5 | REGISTRY PR-001~006 | withRuleId 39 Sprint 연속 정점 |
| 6 | utils test count 225→231 | +PR × 6 |
| 7 | utils 331 PASS (회귀 0) | 325+6 |
| 8 | typecheck PASS | turbo --force |
| 9 | detect-bl 41 containers | property 6 BLs, 0 ABSENCE. coverage ≥ 93.2% |
| 10 | write-provenance --apply | 0/41 changes |
| 11 | 🏆 30 산업 연속 0 ABSENCE round number 마일스톤 | |
| 12 | Plan + Report + SPEC | AIF-PLAN-109 + §6 Sprint 311 |

## BL 정의 (6종)

| BL | 영역 | Detector | 함수 |
|----|------|----------|------|
| PR-001 | utility billing — 공과금 한도 | Threshold | `computeUtilityBill()` |
| PR-002 | maintenance budget tier — 유지보수 한도 비교 | Threshold (var-vs-var, F445 Path B `maintenanceBudgetLimit` keyword) | `approveMaintenance()` |
| PR-003 | lease renewal atomic — 계약 검증 + 갱신 + 보증금 정산 | Atomic | `renewLease()` |
| PR-004 | lease status transition — pending → active → renewed → terminated → archived | Status | `transitionLeaseStatus()` |
| PR-005 | inspection batch — 정기 점검 일괄 | Status (CC-005 30번째 재사용) | `markInspectionBatch()` |
| PR-006 | eviction atomic — 통보 + 법적 절차 + 명도 + 정산 | Atomic | `processEviction()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 (31번째 정착)

## Implementation

Sprint 310 (F476) 동일 패턴 복제. **prefix conflict 주의**: PR은 기존 `P` (miraeasset-pension) 다음에 배치 — longer match first 적용 (LP/CC/.../PT 다음).

## 메타

- withRuleId 39 Sprint 연속 정점
- 🏆 **30 산업 연속 0 ABSENCE round number 마일스톤** (regulator 6종 + service 클러스터 등)
- 41번째 도메인 마일스톤
- 누적 49 Sprint, coverage 13.2% → 93.2%+
