---
id: AIF-PLAN-107
sprint: 309
feature: F475
title: Wellness 39번째 도메인 신규 (웰니스 산업, 28번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-098, AIF-PLAN-099, AIF-PLAN-100, AIF-PLAN-101, AIF-PLAN-102, AIF-PLAN-103, AIF-PLAN-104, AIF-PLAN-105, AIF-PLAN-106]
req: AIF-REQ-035
---

# F475 Plan — AIF-PLAN-107

## 목표

39번째 도메인 웰니스(Wellness/Spa) 신규 — **28번째 신규 산업** (..+WL). 37 Sprint 연속 정점 + 28 산업 연속 0 ABSENCE 도전. Hospitality 클러스터 (HO + WL).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | wellness.ts source | ~280 lines, 6 함수 + WellnessError |
| 2 | spec-container/wellness 15 sub-files | provenance + wellness-rules + WL-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 39번째 entry | container='wellness' |
| 4 | parser regex `WL` prefix | longer match first |
| 5 | REGISTRY WL-001~WL-006 | withRuleId 37 Sprint 연속 정점 |
| 6 | utils unit test count 213→219 | +WL × 6 |
| 7 | utils 318 PASS (회귀 0) | 312+6 |
| 8 | typecheck PASS | turbo --force |
| 9 | detect-bl 39 containers | wellness 6 BLs, 0 ABSENCE. coverage ≥ 92.8% |
| 10 | write-provenance --apply | 0/39 changes |
| 11 | 28 산업 연속 0 ABSENCE | |
| 12 | Plan + Report + SPEC | AIF-PLAN-107 + AIF-RPRT-107 + §6 Sprint 309 + F475 |

## BL 정의 (6종)

| BL | 영역 | Detector | 함수 |
|----|------|----------|------|
| WL-001 | session capacity — 세션 정원 한도 검증 | Threshold | `bookSession()` |
| WL-002 | membership tier — 패키지 사용 한도 비교 | Threshold (var-vs-var, F445 Path B `packageUsageLimit` keyword) | `usePackageSession()` |
| WL-003 | appointment atomic — 예약 + 결제 + 자원 hold 트랜잭션 | Atomic | `confirmAppointment()` |
| WL-004 | appointment status transition — booked → confirmed → in_session → completed → reviewed | Status | `transitionAppointmentStatus()` |
| WL-005 | no-show batch — 노쇼 일괄 처리 | Status (CC-005 28번째 재사용) | `markNoShowSessions()` |
| WL-006 | cancellation refund atomic — 취소 + 패널티 + 환불 트랜잭션 | Atomic | `processCancellationFee()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 (29번째 정착)

## Implementation

Sprint 308 (F474) 동일 패턴 복제

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 92.8%
- 28 산업 연속 0 ABSENCE
- 39번째 도메인 활성

## 메타

- withRuleId 37 Sprint 연속 정점 (S264~S278+S283~S309)
- 28번째 신규 산업 — wellness/spa 추가, **Hospitality 클러스터** (HO + WL) 형성
- 6 BLs 균형 패턴 29번째 정착
- 누적 47 Sprint, coverage 13.2% → 92.8%+, 5 → 39 도메인 (7.8배)
