---
id: AIF-PLAN-089
sprint: 291
feature: F457
title: Travel 21번째 도메인 신규 (여행 산업, 10번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-082, AIF-PLAN-083, AIF-PLAN-084, AIF-PLAN-085, AIF-PLAN-086, AIF-PLAN-087, AIF-PLAN-088]
req: AIF-REQ-035
---

# F457 Plan — AIF-PLAN-089

## 목표

21번째 도메인 여행(Travel) 신규 — **10번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR). 19 Sprint 연속 정점 + 10 산업 연속 0 ABSENCE 도전.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | travel.ts source | ~280 lines, 6 함수 + TravelError (code-in-message 표준) |
| 2 | spec-container/travel 15 sub-files | provenance + travel-rules + TR-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 21번째 entry | container='travel' |
| 4 | parser regex `TR` prefix | longer match first 누적 입증 (S290 HO 동일 패턴) |
| 5 | REGISTRY TR-001~TR-006 | withRuleId 19 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 105→111 | expected list +TR × 6 |
| 7 | utils 206 PASS (회귀 0) | vitest, 200+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 21 containers | travel 6 BLs, 0 ABSENCE. coverage ≥ 86.5% (86%+ +0.8%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/21 changes (PRESENCE 자동 입증) |
| 11 | 10 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR |
| 12 | Plan + Report + SPEC | AIF-PLAN-089 + AIF-RPRT-089 + §6 Sprint 291 + F457 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| TR-001 | flight reservation — 좌석 가용성 + 운임 한도 | Threshold × 1 | `bookFlight()` |
| TR-002 | fare class upgrade — 마일리지 차감 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `requiredMilesLimit` `limit` keyword) | `upgradeFareClass()` |
| TR-003 | itinerary booking atomic — 예약 + 결제 + PNR 발급 | Atomic × 1 | `confirmItinerary()` |
| TR-004 | trip status transition — pending → confirmed → checked_in → completed | Status transition × 1 | `transitionTripStatus()` |
| TR-005 | disruption rebooking batch — 대량 재예약 일괄 갱신 | Status transition × 1 (CC-005 batch 10번째 재사용) | `markDisruptedTrips()` |
| TR-006 | cancellation refund — 취소 + 환불 + 마일리지 복구 트랜잭션 | Atomic × 1 | `processCancellationRefund()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (S290 HO 동일 11번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 11개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO+TR) | longer match first 누적 입증 (S275~S290 10 Sprint) |
| R2 | TR-005 batch 10번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO-005 입증 — 9 Sprint 연속 |
| R3 | TR-002 var-vs-var | F445 Path B `requiredMiles > availableMilesLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 290 (F456) 동일 패턴 복제
- Step 1: travel.ts (6 함수 + TravelError code-in-message)
- Step 2: spec-container/travel 15 sub-files
- Step 3: DOMAIN_MAP entry (sourceCodeStatus="present")
- Step 4: parser regex `TR` prefix 추가
- Step 5: REGISTRY TR-001~006 (withRuleId 매핑)
- Step 6: utils unit test expected list +6
- Step 7~9: typecheck + lint + vitest (--force)
- Step 10: detect-bl --all-domains 실측 (20→21 containers, coverage % 측정)
- Step 11: write-provenance --apply --resolved-by
- Step 12: AIF-RPRT-089 + reports/sprint-291-travel-poc-2026-05-09.{md,json}
- Step 13: SPEC §6 Sprint 291 블록 갱신 (사후 commit)

## 산출물

- Plan: AIF-PLAN-089
- Report: AIF-RPRT-089
- Code: travel.ts + spec-container/travel/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 291 + F457 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 86.5%
- 10 산업 연속 0 ABSENCE
- 21번째 도메인 활성

## 메타

- **withRuleId 재사용 19 Sprint 연속 정점** (S264~S278+S283~S291)
- **10번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + **TR**
- **10 산업 연속 0 ABSENCE 마일스톤** — detector cascade 두 자릿수 산업 정점
- **CC-005 batch StatusTransition 10번째 재사용**
- **F445 Path B var-vs-var keyword 10번째 활용**
- **6 BLs 균형 패턴 11번째 정착**
- **누적 29 Sprint** (S262~S291): coverage 13.2% → 86.5%+ 도전, 5 → 21 도메인 (4.2배)
