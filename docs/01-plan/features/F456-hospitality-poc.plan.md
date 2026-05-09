---
id: AIF-PLAN-088
sprint: 290
feature: F456
title: Hospitality 20번째 도메인 신규 (숙박 산업, 9번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-081, AIF-PLAN-082, AIF-PLAN-083, AIF-PLAN-084, AIF-PLAN-085, AIF-PLAN-086, AIF-PLAN-087]
req: AIF-REQ-035
---

# F456 Plan — AIF-PLAN-088

## 목표

20번째 도메인 숙박(Hospitality) 신규 — **9번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO). 18 Sprint 연속 정점 + 9 산업 연속 0 ABSENCE 도전.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | hospitality.ts source | ~280 lines, 6 함수 + HospitalityError (code-in-message 표준) |
| 2 | spec-container/hospitality 15 sub-files | provenance + hospitality-rules + HO-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 20번째 entry | container='hospitality' |
| 4 | parser regex `HO` prefix | longer match first 누적 입증 (S289 LG 동일 패턴) |
| 5 | REGISTRY HO-001~HO-006 | withRuleId 18 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 99→105 | expected list +HO × 6 |
| 7 | utils 200 PASS (회귀 0) | vitest, 194+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 20 containers | hospitality 6 BLs, 0 ABSENCE. coverage ≥ 86% (85.3% +0.8%pp) |
| 10 | write-provenance --apply | --resolved-by, 0/20 changes (PRESENCE 자동 입증) |
| 11 | 9 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO |
| 12 | Plan + Report + SPEC | AIF-PLAN-088 + AIF-RPRT-088 + §6 Sprint 290 + F456 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| HO-001 | room booking — 객실 가용성 한도 검증 | Threshold × 1 | `bookRoom()` |
| HO-002 | cancellation refund policy — cutoff 시간 비교 | Threshold × 1 (var-vs-var, F445 Path B `cancellationLimit` `limit` keyword) | `applyCancellationPolicy()` |
| HO-003 | check-in atomic — booking validation + room assignment | Atomic × 1 | `processCheckIn()` |
| HO-004 | booking status transition — pending → confirmed → checked_in → checked_out | Status transition × 1 | `transitionBookingStatus()` |
| HO-005 | housekeeping batch sync — 청소 완료 일괄 갱신 | Status transition × 1 (CC-005 batch 9번째 재사용) | `markHousekeepingComplete()` |
| HO-006 | overbooking handling — rollback + 보상 트랜잭션 | Atomic × 1 | `handleOverbookingCompensation()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (S289 LG 동일 10번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 10개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG+HO) | longer match first 누적 입증 (S275~S289 9 Sprint) |
| R2 | HO-005 batch 9번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG-005 입증 — 8 Sprint 연속 |
| R3 | HO-002 var-vs-var | F445 Path B `cancellationDeadlineHours < cancellationLimitHours` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 289 (F455) 동일 패턴 복제
- Step 1: hospitality.ts (6 함수 + HospitalityError code-in-message)
- Step 2: spec-container/hospitality 15 sub-files
- Step 3: DOMAIN_MAP entry (sourceCodeStatus="present")
- Step 4: parser regex `HO` prefix 추가
- Step 5: REGISTRY HO-001~006 (withRuleId 매핑)
- Step 6: utils unit test expected list +6
- Step 7~9: typecheck + lint + vitest (--force)
- Step 10: detect-bl --all-domains 실측 (19→20 containers, coverage % 측정)
- Step 11: write-provenance --apply --resolved-by
- Step 12: AIF-RPRT-088 + reports/sprint-290-hospitality-poc-2026-05-09.{md,json}
- Step 13: SPEC §6 Sprint 290 블록 갱신 (사후 commit)

## 산출물

- Plan: AIF-PLAN-088
- Report: AIF-RPRT-088
- Code: hospitality.ts + spec-container/hospitality/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 290 + F456 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 86%
- 9 산업 연속 0 ABSENCE
- 20번째 도메인 활성

## 메타

- **withRuleId 재사용 18 Sprint 연속 정점** (S264~S278+S283~S290)
- **9번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO
- **9 산업 연속 0 ABSENCE** — detector cascade 안정 입증
- **CC-005 batch StatusTransition 9번째 재사용**
- **F445 Path B var-vs-var keyword 9번째 활용**
- **6 BLs 균형 패턴 10번째 정착**
- **누적 28 Sprint** (S262~S290): coverage 13.2% → 86%+ 도전, 5 → 20 도메인 (4배 돌파)
- **20번째 도메인 마일스톤** — 첫 PoC(S262)에서 coverage 13.2%였던 단일 도메인 시점 대비 4배 도메인 + 6.5배 coverage
