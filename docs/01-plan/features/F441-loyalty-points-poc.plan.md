---
id: AIF-PLAN-073
sprint: 275
feature: F441
title: Loyalty Points 10번째 도메인 source PoC — withRuleId 재사용 8 Sprint 연속
status: active
estimated_hours: 1.5
created: 2026-05-08
---

# F441 Plan — AIF-PLAN-073

## 목표

Loyalty Points 10번째 도메인 신규 — withRuleId 재사용 8 Sprint 연속 (S264~S269+S274+S275). VoucherError code-in-message 패턴 표준 적용 + 2글자 prefix `LP` 첫 도입.

## DoD

| # | 항목 | 기준 |
|---|------|------|
| 1 | Plan (AIF-PLAN-073) | 이 파일 |
| 2 | source.ts | 6 함수 (earn/use/redeem/expire/promoteGrade/clawback) + LoyaltyError(code-in-message) |
| 3 | tests | 18+ cases PASS |
| 4 | spec-container 14 sub-files | provenance + loyalty-rules + LP-001~LP-006 rules/runbooks/tests + contract |
| 5 | DOMAIN_MAP entry 10번째 | sourceCodeStatus="present" |
| 6 | REGISTRY 6 entries | LP-001~LP-006 (Threshold × 4 + Atomic × 1 + Status × 2 — Sprint 274 V와 동일 분포 + 1) |
| 7 | parser regex 2글자 prefix | `(?:BL\|BB\|BP\|BG\|BS\|LP\|P\|V)-[A-Z]?\d{1,3}` |
| 8 | detect-bl 10 containers | 6 BL LP-001~LP-006 PRESENCE 자동 입증 |
| 9 | provenance apply 0 changes | PRESENCE 자연 결과 |
| 10 | utils 170/170 PASS | 회귀 0 (test expected 44 → 50) |
| 11 | Match ≥ 90% |  |
| 12 | Report (AIF-RPRT-073) | reports/sprint-275-loyalty-points-poc-2026-05-08.{md,json} |

## 비즈니스 룰 (LP-001~LP-006)

| ID | 룰 | Detector |
|----|------|:--:|
| LP-001 | 적립 일일 한도 ≤ 10,000P | ThresholdCheck |
| LP-002 | 사용 시 잔액 검증 | ThresholdCheck |
| LP-003 | 사용 차감 atomic | AtomicTransaction |
| LP-004 | 만료 자동 소멸 (1년) | StatusTransition |
| LP-005 | 등급 승급 (누적 임계) | StatusTransition |
| LP-006 | 환불 시 회수 (30일 이내) | ThresholdCheck |

## 4-Step

| Step | 시간 | 작업 |
|------|------|------|
| 1 | 0.4h | loyalty.ts (6 함수 + LoyaltyError code-in-message) + tests 18 cases |
| 2 | 0.4h | spec-container 14 sub-files |
| 3 | 0.2h | DOMAIN_MAP + REGISTRY + parser regex 2글자 prefix |
| 4 | 0.5h | 검증 + Report + SPEC + commit + push |

## 참조

- Sprint 274 F440 generic-voucher 9번째 패턴 직접 재사용
- VoucherError code-in-message 패턴 (S274 메타 학습 M3) 표준 적용
- 2글자 prefix `LP` 첫 도입 — parser regex `(?:BL|BB|BP|BG|BS|LP|P|V)` 우선순위 (longer match first)
