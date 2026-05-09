---
id: AIF-PLAN-094
sprint: 296
feature: F462
title: Telecom 26번째 도메인 신규 (통신 산업, 15번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-085, AIF-PLAN-086, AIF-PLAN-087, AIF-PLAN-088, AIF-PLAN-089, AIF-PLAN-090, AIF-PLAN-091, AIF-PLAN-092, AIF-PLAN-093]
req: AIF-REQ-035
---

# F462 Plan — AIF-PLAN-094

## 목표

26번째 도메인 통신(Telecom) 신규 — **15번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC). 24 Sprint 연속 정점 + 15 산업 연속 0 ABSENCE 도전.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | telecom.ts source | ~280 lines, 6 함수 + TelecomError (code-in-message 표준) |
| 2 | spec-container/telecom 15 sub-files | provenance + telecom-rules + TC-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 26번째 entry | container='telecom' |
| 4 | parser regex `TC` prefix | longer match first 누적 입증 (S295 GV 동일 패턴) |
| 5 | REGISTRY TC-001~TC-006 | withRuleId 24 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 135→141 | expected list +TC × 6 |
| 7 | utils 236 PASS (회귀 0) | vitest, 230+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 26 containers | telecom 6 BLs, 0 ABSENCE. coverage ≥ 89% (88.8% +0.5%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/26 changes (PRESENCE 자동 입증) |
| 11 | 15 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC |
| 12 | Plan + Report + SPEC | AIF-PLAN-094 + AIF-RPRT-094 + §6 Sprint 296 + F462 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| TC-001 | subscription activation — 동시 가입 회선 한도 | Threshold × 1 | `activateSubscription()` |
| TC-002 | data quota — 사용량 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `dataQuotaLimit` keyword) | `checkDataUsage()` |
| TC-003 | plan upgrade atomic — plan 변경 + 요금 차감 + 회선 갱신 | Atomic × 1 | `upgradePlan()` |
| TC-004 | subscription status transition — pending → active → suspended → terminated | Status transition × 1 | `transitionSubscriptionStatus()` |
| TC-005 | billing cycle batch — 청구 주기 일괄 처리 | Status transition × 1 (CC-005 batch 15번째 재사용) | `runBillingCycle()` |
| TC-006 | port-out atomic — 번호이동 + carrier 정산 + termination | Atomic × 1 | `processPortOut()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (16번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 16개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV+TC) | longer match first 누적 입증 (S275~S295 15 Sprint) |
| R2 | TC-005 batch 15번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV-005 입증 — 14 Sprint 연속 |
| R3 | TC-002 var-vs-var | F445 Path B `usageBytes > dataQuotaLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 295 (F461) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-094
- Report: AIF-RPRT-094
- Code: telecom.ts + spec-container/telecom/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 296 + F462 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 89%
- 15 산업 연속 0 ABSENCE
- 26번째 도메인 활성

## 메타

- **withRuleId 재사용 24 Sprint 연속 정점** (S264~S278+S283~S296)
- **15번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + **TC**
- **15 산업 연속 0 ABSENCE** — telecommunications 산업 추가
- **CC-005 batch StatusTransition 15번째 재사용**
- **F445 Path B var-vs-var keyword 15번째 활용**
- **6 BLs 균형 패턴 16번째 정착**
- **누적 34 Sprint** (S262~S296): coverage 13.2% → 89%+ 도전, 5 → 26 도메인 (5.2배)
