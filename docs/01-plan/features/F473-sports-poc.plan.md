---
id: AIF-PLAN-105
sprint: 307
feature: F473
title: Sports 37번째 도메인 신규 (스포츠 산업, 26번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-096, AIF-PLAN-097, AIF-PLAN-098, AIF-PLAN-099, AIF-PLAN-100, AIF-PLAN-101, AIF-PLAN-102, AIF-PLAN-103, AIF-PLAN-104]
req: AIF-REQ-035
---

# F473 Plan — AIF-PLAN-105

## 목표

37번째 도메인 스포츠(Sports) 신규 — **26번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP). 35 Sprint 연속 정점 + 26 산업 연속 0 ABSENCE 도전. event mgmt + venue 운영.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | sports.ts source | ~280 lines, 6 함수 + SportsError (code-in-message 표준) |
| 2 | spec-container/sports 15 sub-files | provenance + sports-rules + SP-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 37번째 entry | container='sports' |
| 4 | parser regex `SP` prefix | longer match first 누적 입증 (S306 DF 동일 패턴) |
| 5 | REGISTRY SP-001~SP-006 | withRuleId 35 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 201→207 | expected list +SP × 6 |
| 7 | utils 304 PASS (회귀 0) | vitest, 298+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 37 containers | sports 6 BLs, 0 ABSENCE. coverage ≥ 92.5% (92.2% +0.3%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/37 changes (PRESENCE 자동 입증) |
| 11 | 26 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP |
| 12 | Plan + Report + SPEC | AIF-PLAN-105 + AIF-RPRT-105 + §6 Sprint 307 + F473 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| SP-001 | venue capacity — 경기장 좌석 한도 검증 | Threshold × 1 | `bookVenueSeat()` |
| SP-002 | season ticket tier — 시즌권 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `seasonTicketLimit` keyword) | `applySeasonTicketTier()` |
| SP-003 | event ticket atomic — 결제 + 좌석 hold + 발권 트랜잭션 | Atomic × 1 | `processTicketSale()` |
| SP-004 | event status transition — scheduled → ticketing → live → completed → archived | Status transition × 1 | `transitionEventStatus()` |
| SP-005 | merchandise sync batch — 상품 일괄 처리 | Status transition × 1 (CC-005 batch 26번째 재사용) | `markMerchandiseSync()` |
| SP-006 | refund-rebook atomic — 취소 + 환불 + 재예약 트랜잭션 | Atomic × 1 | `processRefundRebook()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (27번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 27개 2글자 prefix (..+SP) | longer match first 누적 입증 (S275~S306 26 Sprint) |
| R2 | SP-005 batch 26번째 재사용 | 25 Sprint 연속 모든 도메인 입증 |
| R3 | SP-002 var-vs-var | F445 Path B `requested > seasonTicketLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 306 (F472) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-105
- Report: AIF-RPRT-105
- Code: sports.ts + spec-container/sports/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 307 + F473 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 92.5%
- 26 산업 연속 0 ABSENCE
- 37번째 도메인 활성

## 메타

- **withRuleId 재사용 35 Sprint 연속 정점** (S264~S278+S283~S307)
- **26번째 신규 산업** — event mgmt 산업 추가
- **CC-005 batch StatusTransition 26번째 재사용**
- **F445 Path B var-vs-var keyword 26번째 활용**
- **6 BLs 균형 패턴 27번째 정착**
- **누적 45 Sprint** (S262~S307): coverage 13.2% → 92.5%+ 도전, 5 → 37 도메인 (7.4배)
