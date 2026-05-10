---
id: AIF-PLAN-101
sprint: 303
feature: F469
title: Public Transport 33번째 도메인 신규 (대중교통 산업, 22번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-092, AIF-PLAN-093, AIF-PLAN-094, AIF-PLAN-095, AIF-PLAN-096, AIF-PLAN-097, AIF-PLAN-098, AIF-PLAN-099, AIF-PLAN-100]
req: AIF-REQ-035
---

# F469 Plan — AIF-PLAN-101

## 목표

33번째 도메인 대중교통(Public Transport) 신규 — **22번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS). 31 Sprint 연속 정점 + 22 산업 연속 0 ABSENCE 도전. 공공서비스 + transit 인프라.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | transit.ts source | ~280 lines, 6 함수 + TransitError (code-in-message 표준) |
| 2 | spec-container/transit 15 sub-files | provenance + transit-rules + TS-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 33번째 entry | container='transit' |
| 4 | parser regex `TS` prefix | longer match first 누적 입증 (S302 MR 동일 패턴) |
| 5 | REGISTRY TS-001~TS-006 | withRuleId 31 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 177→183 | expected list +TS × 6 |
| 7 | utils 278 PASS (회귀 0) | vitest, 272+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 33 containers | transit 6 BLs, 0 ABSENCE. coverage ≥ 91.6% (91.2% +0.4%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/33 changes (PRESENCE 자동 입증) |
| 11 | 22 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS |
| 12 | Plan + Report + SPEC | AIF-PLAN-101 + AIF-RPRT-101 + §6 Sprint 303 + F469 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| TS-001 | route capacity — 노선 정원 한도 검증 | Threshold × 1 | `checkRouteCapacity()` |
| TS-002 | fare zone tier — 요금 구간 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `fareZoneLimit` keyword) | `computeFare()` |
| TS-003 | transfer atomic — 환승 + 잔액 차감 + 통합권 발급 | Atomic × 1 | `processTransfer()` |
| TS-004 | trip status transition — boarded → in_transit → transferred → completed | Status transition × 1 | `transitionTripStatus()` |
| TS-005 | season pass batch — 정기권 일괄 갱신 | Status transition × 1 (CC-005 batch 22번째 재사용) | `markSeasonPassRenewal()` |
| TS-006 | suspension refund atomic — 운행 중단 + 환불 + 보상 트랜잭션 | Atomic × 1 | `processSuspensionRefund()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (23번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 23개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD/PH/AG/CN/MR+TS) | longer match first 누적 입증 (S275~S302 22 Sprint) |
| R2 | TS-005 batch 22번째 재사용 | 21 Sprint 연속 모든 도메인 입증 |
| R3 | TS-002 var-vs-var | F445 Path B `zoneFare > fareZoneLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 302 (F468) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-101
- Report: AIF-RPRT-101
- Code: transit.ts + spec-container/transit/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 303 + F469 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 91.6%
- 22 산업 연속 0 ABSENCE
- 33번째 도메인 활성

## 메타

- **withRuleId 재사용 31 Sprint 연속 정점** (S264~S278+S283~S303)
- **22번째 신규 산업** — CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+**TS**
- **22 산업 연속 0 ABSENCE** — 공공서비스 transit 인프라 추가
- **CC-005 batch StatusTransition 22번째 재사용**
- **F445 Path B var-vs-var keyword 22번째 활용**
- **6 BLs 균형 패턴 23번째 정착**
- **누적 41 Sprint** (S262~S303): coverage 13.2% → 91.6%+ 도전, 5 → 33 도메인 (6.6배)
