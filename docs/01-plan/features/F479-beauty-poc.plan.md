---
id: AIF-PLAN-111
sprint: 313
feature: F479
title: Beauty Salon 43번째 도메인 신규 (미용실 산업, 32번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-110]
req: AIF-REQ-035
---

# F479 Plan — AIF-PLAN-111

## 목표

43번째 도메인 미용실(Beauty Salon) 신규 — **32번째 신규 산업**. 41 Sprint 연속 정점. WL+SP+FT+BT 서비스 4-클러스터 완성.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | beauty.ts source | ~280 lines, 6 함수 + BeautyError |
| 2 | spec-container/beauty 15 sub-files | provenance + beauty-rules + BT-001~006 + test |
| 3 | DOMAIN_MAP 43번째 entry | container='beauty' |
| 4 | parser regex `BT` prefix | longer match first |
| 5 | REGISTRY BT-001~006 | withRuleId 41 Sprint 연속 정점 |
| 6 | utils test count 237→243 | +BT × 6 |
| 7 | utils 343 PASS (회귀 0) | 337+6 |
| 8 | typecheck PASS | turbo --force |
| 9 | detect-bl 43 containers | beauty 6 BLs, 0 ABSENCE. coverage ≥ 93.6% |
| 10 | write-provenance --apply | 0/43 changes |
| 11 | 32 산업 연속 0 ABSENCE | |
| 12 | Plan + Report + SPEC | AIF-PLAN-111 + §6 Sprint 313 |

## BL 정의 (6종)

| BL | 영역 | Detector | 함수 |
|----|------|----------|------|
| BT-001 | seat capacity — 좌석 정원 한도 | Threshold | `bookSeat()` |
| BT-002 | loyalty tier — 멤버십 사용 한도 비교 | Threshold (var-vs-var, F445 Path B `loyaltyTierLimit` keyword) | `applyLoyaltyDiscount()` |
| BT-003 | appointment atomic — 예약 + 스타일리스트 + 결제 | Atomic | `confirmAppointment()` |
| BT-004 | appointment status transition — booked → confirmed → in_service → completed → reviewed | Status | `transitionAppointmentStatus()` |
| BT-005 | inventory restock batch — 자재 재고 일괄 갱신 | Status (CC-005 32번째 재사용) | `markInventoryRestockBatch()` |
| BT-006 | commission atomic — 매출 + 수수료 분배 + 정산 | Atomic | `processCommission()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 (33번째 정착)

## Implementation

Sprint 312 (F478) 동일 패턴 복제

## 메타

- withRuleId 41 Sprint 연속 정점 (S264~S278+S283~S313)
- 32번째 신규 산업 — 서비스 4-클러스터 완성 (WL+SP+FT+BT)
- 누적 51 Sprint, coverage 13.2% → 93.6%+
- **분야 다양성 정점**: 금융 + 의료 + 교육 + 공공 + 제조 + 1차 + 운송 + 서비스 + 비영리 = 9 대분류 모두 커버
