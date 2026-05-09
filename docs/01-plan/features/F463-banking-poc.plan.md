---
id: AIF-PLAN-095
sprint: 297
feature: F463
title: Banking 27번째 도메인 신규 (은행 산업, 16번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-086, AIF-PLAN-087, AIF-PLAN-088, AIF-PLAN-089, AIF-PLAN-090, AIF-PLAN-091, AIF-PLAN-092, AIF-PLAN-093, AIF-PLAN-094]
req: AIF-REQ-035
---

# F463 Plan — AIF-PLAN-095

## 목표

27번째 도메인 은행(Banking) 신규 — **16번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK). 25 Sprint 연속 정점 + 16 산업 연속 0 ABSENCE 도전 (financial regulation 산업).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | banking.ts source | ~280 lines, 6 함수 + BankingError (code-in-message 표준) |
| 2 | spec-container/banking 15 sub-files | provenance + banking-rules + BK-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 27번째 entry | container='banking' |
| 4 | parser regex `BK` prefix | longer match first 누적 입증 (S296 TC 동일 패턴) |
| 5 | REGISTRY BK-001~BK-006 | withRuleId 25 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 141→147 | expected list +BK × 6 |
| 7 | utils 242 PASS (회귀 0) | vitest, 236+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 27 containers | banking 6 BLs, 0 ABSENCE. coverage ≥ 89.5% (89.2% +0.3%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/27 changes (PRESENCE 자동 입증) |
| 11 | 16 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK |
| 12 | Plan + Report + SPEC | AIF-PLAN-095 + AIF-RPRT-095 + §6 Sprint 297 + F463 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| BK-001 | withdrawal limit — 일일 출금 한도 검증 | Threshold × 1 | `processWithdrawal()` |
| BK-002 | transfer fee tier — 송금 수수료 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `transferFeeLimit` keyword) | `computeTransferFee()` |
| BK-003 | account transfer atomic — debit + credit + 거래 기록 트랜잭션 | Atomic × 1 | `processAccountTransfer()` |
| BK-004 | account status transition — pending_kyc → active → frozen → dormant | Status transition × 1 | `transitionAccountStatus()` |
| BK-005 | dormant account batch — 휴면 일괄 동결 처리 | Status transition × 1 (CC-005 batch 16번째 재사용) | `markDormantAccounts()` |
| BK-006 | KYC verification atomic — 본인확인 + AML 체크 + 활성화 | Atomic × 1 | `verifyKyc()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (17번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 17개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC+BK) | longer match first 누적 입증 (S275~S296 16 Sprint) |
| R2 | BK-005 batch 16번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC-005 입증 — 15 Sprint 연속 |
| R3 | BK-002 var-vs-var | F445 Path B `feeAmount > transferFeeLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 296 (F462) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-095
- Report: AIF-RPRT-095
- Code: banking.ts + spec-container/banking/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 297 + F463 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 89.5%
- 16 산업 연속 0 ABSENCE
- 27번째 도메인 활성

## 메타

- **withRuleId 재사용 25 Sprint 연속 정점** (S264~S278+S283~S297)
- **16번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + **BK**
- **16 산업 연속 0 ABSENCE** — financial regulation 산업 추가
- **CC-005 batch StatusTransition 16번째 재사용**
- **F445 Path B var-vs-var keyword 16번째 활용**
- **6 BLs 균형 패턴 17번째 정착**
- **누적 35 Sprint** (S262~S297): coverage 13.2% → 89.5%+ 도전, 5 → 27 도메인 (5.4배)
- **90% coverage 임계값 근접** — 잔여 2 Sprint 내 90% 돌파 가능 (S298 BK + S299 차기 산업)
