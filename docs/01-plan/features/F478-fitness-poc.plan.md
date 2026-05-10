---
id: AIF-PLAN-110
sprint: 312
feature: F478
title: Fitness 42번째 도메인 신규 (피트니스 산업, 31번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-109]
req: AIF-REQ-035
---

# F478 Plan — AIF-PLAN-110

## 목표

42번째 도메인 피트니스(Fitness) 신규 — **31번째 신규 산업**. 40 Sprint 연속 정점. WL+SP+FT 클러스터 (서비스+이벤트+운동).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | fitness.ts source | ~280 lines, 6 함수 + FitnessError |
| 2 | spec-container/fitness 15 sub-files | provenance + fitness-rules + FT-001~006 + test |
| 3 | DOMAIN_MAP 42번째 entry | container='fitness' |
| 4 | parser regex `FT` prefix | longer match first |
| 5 | REGISTRY FT-001~006 | withRuleId 40 Sprint 연속 정점 (round) |
| 6 | utils test count 231→237 | +FT × 6 |
| 7 | utils 337 PASS (회귀 0) | 331+6 |
| 8 | typecheck PASS | turbo --force |
| 9 | detect-bl 42 containers | fitness 6 BLs, 0 ABSENCE. coverage ≥ 93.4% |
| 10 | write-provenance --apply | 0/42 changes |
| 11 | 31 산업 연속 0 ABSENCE | |
| 12 | Plan + Report + SPEC | AIF-PLAN-110 + §6 Sprint 312 |

## BL 정의 (6종)

| BL | 영역 | Detector | 함수 |
|----|------|----------|------|
| FT-001 | class capacity — 클래스 정원 한도 | Threshold | `bookClassSlot()` |
| FT-002 | membership tier — 패키지 사용 한도 비교 | Threshold (var-vs-var, F445 Path B `ptSessionLimit` keyword) | `usePtSession()` |
| FT-003 | personal training atomic — 예약 + 트레이너 + 결제 | Atomic | `bookPersonalTraining()` |
| FT-004 | progress status transition — initial → in_progress → assessment → completed | Status | `transitionProgressStatus()` |
| FT-005 | no-show fee batch — 노쇼 일괄 처리 | Status (CC-005 31번째 재사용) | `markNoShowBatch()` |
| FT-006 | equipment reserve atomic — 예약 + hold + 사용 통계 | Atomic | `reserveEquipment()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 (32번째 정착)

## Implementation

Sprint 311 (F477) 동일 패턴 복제

## 메타

- withRuleId 40 Sprint 연속 정점 (round number 마일스톤)
- 31번째 신규 산업 — 운동 서비스 클러스터 (WL + SP + FT)
- 누적 50 Sprint 마일스톤 (S262 시작 대비 +49)
