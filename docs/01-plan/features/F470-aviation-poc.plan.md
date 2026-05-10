---
id: AIF-PLAN-102
sprint: 304
feature: F470
title: Aviation 34번째 도메인 신규 (항공 산업, 23번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-093, AIF-PLAN-094, AIF-PLAN-095, AIF-PLAN-096, AIF-PLAN-097, AIF-PLAN-098, AIF-PLAN-099, AIF-PLAN-100, AIF-PLAN-101]
req: AIF-REQ-035
---

# F470 Plan — AIF-PLAN-102

## 목표

34번째 도메인 항공(Aviation) 신규 — **23번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV). 32 Sprint 연속 정점 + 23 산업 연속 0 ABSENCE 도전. 항공 운용 (Travel B2C와 보완 — 운항 백엔드 관점).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | aviation.ts source | ~280 lines, 6 함수 + AviationError (code-in-message 표준) |
| 2 | spec-container/aviation 15 sub-files | provenance + aviation-rules + AV-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 34번째 entry | container='aviation' |
| 4 | parser regex `AV` prefix | longer match first 누적 입증 (S303 TS 동일 패턴) |
| 5 | REGISTRY AV-001~AV-006 | withRuleId 32 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 183→189 | expected list +AV × 6 |
| 7 | utils 284 PASS (회귀 0) | vitest, 278+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 34 containers | aviation 6 BLs, 0 ABSENCE. coverage ≥ 91.8% (91.5% +0.3%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/34 changes (PRESENCE 자동 입증) |
| 11 | 23 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV |
| 12 | Plan + Report + SPEC | AIF-PLAN-102 + AIF-RPRT-102 + §6 Sprint 304 + F470 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| AV-001 | passenger capacity — 좌석 가용 한도 검증 | Threshold × 1 | `boardPassenger()` |
| AV-002 | fuel quota — 연료 할당 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `fuelQuotaLimit` keyword) | `allocateFuel()` |
| AV-003 | flight dispatch atomic — schedule + crew + fuel + clearance 트랜잭션 | Atomic × 1 | `dispatchFlight()` |
| AV-004 | flight status transition — scheduled → boarding → departed → in_flight → landed → completed | Status transition × 1 | `transitionFlightStatus()` |
| AV-005 | crew rotation batch — 승무원 일괄 교대 갱신 | Status transition × 1 (CC-005 batch 23번째 재사용) | `rotateCrewSchedule()` |
| AV-006 | baggage claim atomic — 수하물 매칭 + 손상 검증 + 보상 트랜잭션 | Atomic × 1 | `processBaggageClaim()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (24번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 24개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD/PH/AG/CN/MR/TS+AV) | longer match first 누적 입증 (S275~S303 23 Sprint) |
| R2 | AV-005 batch 23번째 재사용 | 22 Sprint 연속 모든 도메인 입증 |
| R3 | AV-002 var-vs-var | F445 Path B `requiredFuel > fuelQuotaLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 303 (F469) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-102
- Report: AIF-RPRT-102
- Code: aviation.ts + spec-container/aviation/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 304 + F470 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 91.8%
- 23 산업 연속 0 ABSENCE
- 34번째 도메인 활성

## 메타

- **withRuleId 재사용 32 Sprint 연속 정점** (S264~S278+S283~S304)
- **23번째 신규 산업** — CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+**AV**
- **23 산업 연속 0 ABSENCE** — 항공 운용 추가 (TR consumer + AV ops = 항공 클러스터)
- **CC-005 batch StatusTransition 23번째 재사용**
- **F445 Path B var-vs-var keyword 23번째 활용**
- **6 BLs 균형 패턴 24번째 정착**
- **누적 42 Sprint** (S262~S304): coverage 13.2% → 91.8%+ 도전, 5 → 34 도메인 (6.8배)
