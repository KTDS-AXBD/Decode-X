---
id: AIF-PLAN-100
sprint: 302
feature: F468
title: Maritime 32번째 도메인 신규 (해운 산업, 21번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-091, AIF-PLAN-092, AIF-PLAN-093, AIF-PLAN-094, AIF-PLAN-095, AIF-PLAN-096, AIF-PLAN-097, AIF-PLAN-098, AIF-PLAN-099]
req: AIF-REQ-035
---

# F468 Plan — AIF-PLAN-100 (Plan 100번째 마일스톤)

## 목표

32번째 도메인 해운(Maritime/Shipping) 신규 — **21번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR). 30 Sprint 연속 정점 + 21 산업 연속 0 ABSENCE 도전. 국제물류 + customs clearance 특화 (Logistics와 보완).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | maritime.ts source | ~280 lines, 6 함수 + MaritimeError (code-in-message 표준) |
| 2 | spec-container/maritime 15 sub-files | provenance + maritime-rules + MR-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 32번째 entry | container='maritime' |
| 4 | parser regex `MR` prefix | longer match first 누적 입증 (S301 CN 동일 패턴) |
| 5 | REGISTRY MR-001~MR-006 | withRuleId 30 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 171→177 | expected list +MR × 6 |
| 7 | utils 272 PASS (회귀 0) | vitest, 266+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 32 containers | maritime 6 BLs, 0 ABSENCE. coverage ≥ 91.4% (91.0% +0.4%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/32 changes (PRESENCE 자동 입증) |
| 11 | 21 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR |
| 12 | Plan + Report + SPEC | AIF-PLAN-100 + AIF-RPRT-100 + §6 Sprint 302 + F468 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| MR-001 | cargo capacity — vessel 적재 한도 검증 | Threshold × 1 | `loadCargo()` |
| MR-002 | freight rate tier — 운임 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `freightRateLimit` keyword) | `computeFreightRate()` |
| MR-003 | customs clearance atomic — 신고 + 관세 + 통관 트랜잭션 | Atomic × 1 | `processCustoms()` |
| MR-004 | shipment status transition — booked → loaded → at_sea → arrived → delivered | Status transition × 1 | `transitionShipmentStatus()` |
| MR-005 | port handling batch — 항구 처리 일괄 갱신 | Status transition × 1 (CC-005 batch 21번째 재사용) | `markPortHandled()` |
| MR-006 | damage claim atomic — 손상 신고 + 검증 + 보상 트랜잭션 | Atomic × 1 | `processDamageClaim()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (22번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 22개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD/PH/AG/CN+MR) | longer match first 누적 입증 (S275~S301 21 Sprint) |
| R2 | MR-005 batch 21번째 재사용 | 20 Sprint 연속 모든 도메인 입증 |
| R3 | MR-002 var-vs-var | F445 Path B `quotedRate > freightRateLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 301 (F467) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-100 (**Plan 100번째 마일스톤**)
- Report: AIF-RPRT-100
- Code: maritime.ts + spec-container/maritime/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 302 + F468 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 91.4%
- 21 산업 연속 0 ABSENCE
- 32번째 도메인 활성

## 메타

- **🎯 AIF-PLAN-100 마일스톤** — Plan 100번째 산출물
- **withRuleId 재사용 30 Sprint 연속 정점** (S264~S278+S283~S302)
- **21번째 신규 산업** — CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+**MR**
- **21 산업 연속 0 ABSENCE** — 국제물류 추가 (LG + MR = 물류 클러스터)
- **CC-005 batch StatusTransition 21번째 재사용**
- **F445 Path B var-vs-var keyword 21번째 활용**
- **6 BLs 균형 패턴 22번째 정착**
- **누적 40 Sprint** (S262~S302): coverage 13.2% → 91.4%+ 도전, 5 → 32 도메인 (6.4배)
