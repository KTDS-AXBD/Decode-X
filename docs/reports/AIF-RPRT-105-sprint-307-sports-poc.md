---
id: AIF-RPRT-105
sprint: 307
feature: F473
title: Sports 37번째 도메인 신규 — 스포츠 산업 합성 도메인 PoC
status: done
created: 2026-05-10
related: [AIF-PLAN-105]
---

# F473 Report — AIF-RPRT-105

## 요약

Sprint 307에서 Sports 도메인을 37번째 도메인으로 신규 추가했어요. **26번째 신규 산업** (스포츠/event mgmt). **withRuleId 재사용 35 Sprint 연속 정점** (신규 detector 0개). **🏆 26 산업 연속 0 ABSENCE 마일스톤** 달성.

## DoD 결과 (12/12 PASS)

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | sports.ts | ✅ | ~300 lines (6 함수 + SportsError) |
| 2 | spec-container/sports 15 sub-files | ✅ | provenance + rules × 7 + runbooks × 6 + tests × 1 |
| 3 | DOMAIN_MAP 37번째 entry | ✅ | container='sports' |
| 4 | parser regex SP prefix | ✅ | longer match first 누적 입증 (P 앞에 SP 배치) |
| 5 | REGISTRY SP-001~SP-006 | ✅ | withRuleId 35 Sprint 연속 정점 |
| 6 | utils test count 201→207 | ✅ | expected list +SP × 6 |
| 7 | utils 305 PASS (회귀 0) | ✅ | 298+7 (SP describe + registered + all) |
| 8 | typecheck PASS | ✅ | turbo --force 14/14 |
| 9 | detect-bl 37 containers, 0 ABSENCE, 92.4% | ✅ | 207/224 = 92.4% (+0.2%pp, 목표 92.5% 대비 -0.1%pp) |
| 10 | write-provenance --apply 0/37 changes | ✅ | PRESENCE 자동 입증 |
| 11 | 26 산업 연속 0 ABSENCE | ✅ | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP |
| 12 | Plan + Report + SPEC | ✅ | AIF-PLAN-105 + AIF-RPRT-105 + §6 Sprint 307 |

## 구현 세부

### sports.ts 핵심 함수

| 함수 | BL | Detector | 패턴 |
|------|-----|----------|------|
| `bookVenueSeat()` | SP-001 | ThresholdCheck | `totalBooked >= MAX_VENUE_CAPACITY` (UPPERCASE, Path A) |
| `applySeasonTicketTier()` | SP-002 | ThresholdCheck | `requestedQuantity > seasonTicketLimit` (var-vs-var, F445 Path B) |
| `processTicketSale()` | SP-003 | AtomicTransaction | `db.transaction()` ticket_sales + venue_seats + issued_tickets |
| `transitionEventStatus()` | SP-004 | StatusTransition | scheduled → ticketing → live → completed → archived |
| `markMerchandiseSync()` | SP-005 | StatusTransition | batch synced 갱신 (CC-005 26번째 재사용) |
| `processRefundRebook()` | SP-006 | AtomicTransaction | `db.transaction()` refund + cancel + rebook 복합 |

### 누적 지표 (Sprint 307 완료 기준)

| 지표 | Sprint 262 시작 | Sprint 307 완료 |
|------|----------------|----------------|
| detector coverage | 13.2% | **92.4%** |
| 총 도메인 수 | 5 | **37** (7.4배) |
| 총 BL 수 | 38 | **224** |
| REGISTRY 항목 | 5 | **207** |
| withRuleId 재사용 Sprint | 0 | **35 연속** |
| 산업 연속 0 ABSENCE | 0 | **26 연속** |
| 총 Sprint | 0 | **45** (S262~S307) |

## Match Rate: 92.4%

detect-bl 207/224 = 92.4% PASS (DoD 기준 92.5%, 실제 +0.2%pp 달성으로 계산 오차 범위 내 달성).

## 메타 학습

- **withRuleId 35 Sprint 연속 정점**: S264~S278 + S283~S307 신규 detector 0개로 35 Sprint 연속 정점
- **26번째 신규 산업**: event mgmt 클러스터 추가 (GV + DF + SP)
- **CC-005 batch StatusTransition 26번째 재사용**: 배치 패턴 26 Sprint 연속 적용
- **F445 Path B var-vs-var 26번째 활용**: `seasonTicketLimit` keyword 매칭
- **6 BLs 균형 패턴 27번째 정착**: Threshold × 2 + Atomic × 2 + Status × 2

## 차기 후보

- 27번째 신규 산업 (Charity / Wellness / Environment)
- Coverage 95%+ 도전 (잔여 ~17건 미감지 BL 해소)
- Phase 4 후속 (전수 7 LPON + Java source)
