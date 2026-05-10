---
id: AIF-PLAN-108
sprint: 310
feature: F476
title: Pet Services 40번째 도메인 신규 (반려동물 산업, 29번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-107]
req: AIF-REQ-035
---

# F476 Plan — AIF-PLAN-108

## 목표

40번째 도메인 반려동물(Pet Services) 신규 — **29번째 신규 산업** (..+PT). 38 Sprint 연속 정점. 동물병원+미용 (HC + WL 인접).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | pet.ts source | ~280 lines, 6 함수 + PetError |
| 2 | spec-container/pet 15 sub-files | provenance + pet-rules + PT-001~006 + test |
| 3 | DOMAIN_MAP 40번째 entry | container='pet' |
| 4 | parser regex `PT` prefix | longer match first |
| 5 | REGISTRY PT-001~006 | withRuleId 38 Sprint 연속 정점 |
| 6 | utils test count 219→225 | +PT × 6 |
| 7 | utils 325 PASS (회귀 0) | 319+6 |
| 8 | typecheck PASS | turbo --force |
| 9 | detect-bl 40 containers | pet 6 BLs, 0 ABSENCE. coverage ≥ 93% |
| 10 | write-provenance --apply | 0/40 changes |
| 11 | 29 산업 연속 0 ABSENCE | |
| 12 | Plan + Report + SPEC | AIF-PLAN-108 + §6 Sprint 310 |

## BL 정의 (6종)

| BL | 영역 | Detector | 함수 |
|----|------|----------|------|
| PT-001 | boarding capacity — 펫호텔 정원 한도 | Threshold | `bookBoarding()` |
| PT-002 | vaccination quota — 백신 한도 비교 | Threshold (var-vs-var, F445 Path B `vaccinationLimit` keyword) | `applyVaccination()` |
| PT-003 | grooming atomic — 예약 + 패키지 + 보호자 매칭 | Atomic | `processGrooming()` |
| PT-004 | care status transition — booked → checked_in → in_care → checked_out → reviewed | Status | `transitionCareStatus()` |
| PT-005 | health record batch — 건강 기록 일괄 | Status (CC-005 29번째 재사용) | `markHealthRecordBatch()` |
| PT-006 | emergency atomic — 응급 + 처치 + 보호자 통보 | Atomic | `processEmergency()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 (30번째 정착, round)

## Implementation

Sprint 309 (F475) 동일 패턴 복제

## 메타

- withRuleId 38 Sprint 연속 정점
- 29번째 신규 산업 — 동물병원+미용 (HC+WL 인접)
- 6 BLs 균형 패턴 30번째 정착 (round number 마일스톤)
- 40번째 도메인 마일스톤
- 누적 48 Sprint, coverage 13.2% → 93%+
