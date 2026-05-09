---
id: AIF-DSGN-095
sprint: 297
feature: F463
title: Banking 27번째 도메인 신규 — 16번째 신규 산업
status: active
created: 2026-05-10
plan: AIF-PLAN-095
---

# F463 Design — AIF-DSGN-095

## §1 목표

Banking(은행) 합성 도메인 신규 — 27번째 도메인, 16번째 신규 산업.
BK-001~BK-006 (Threshold × 2 + Atomic × 2 + Status × 2) — withRuleId 재사용 25 Sprint 연속 정점.

## §2 BL 설계

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| BK-001 | `processWithdrawal()` | ThresholdCheck | Path A (var >= MAX_WITHDRAWAL_AMOUNT) |
| BK-002 | `computeTransferFee()` | ThresholdCheck | Path B (amount > transferFeeLimit, `limit` keyword) |
| BK-003 | `processAccountTransfer()` | AtomicTransaction | debit + credit + transaction log |
| BK-004 | `transitionAccountStatus()` | StatusTransition | pending_kyc → active → frozen → dormant |
| BK-005 | `markDormantAccounts()` | StatusTransition | batch dormant freeze (CC-005 16번째 재사용) |
| BK-006 | `verifyKyc()` | AtomicTransaction | KYC + AML + activation |

## §3 파일 목록

### 신규 생성

| 파일 | 설명 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/banking.ts` | 도메인 소스 (~280 lines) |
| `.decode-x/spec-containers/banking/provenance.yaml` | 출처 메타 |
| `.decode-x/spec-containers/banking/rules/banking-rules.md` | BL 규칙 문서 |
| `.decode-x/spec-containers/banking/rules/BK-001.md` ~ `BK-006.md` | 개별 BL 상세 |
| `.decode-x/spec-containers/banking/runbooks/BK-001.md` ~ `BK-006.md` | 운영 런북 |
| `.decode-x/spec-containers/banking/tests/BK-001.yaml` | 대표 테스트 시나리오 |

### 수정

| 파일 | 변경 |
|------|------|
| `packages/utils/src/divergence/bl-detector.ts` | BK-001~BK-006 REGISTRY 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | BK prefix BL_ID_PATTERN 추가 |
| `scripts/divergence/domain-source-map.ts` | banking DOMAIN_MAP 27번째 추가 |
| `packages/utils/test/bl-detector.test.ts` | 141→147 카운트 + BK expectedKeys + banking 테스트 |

## §4 구현 패턴

- Sprint 296 (F462 Telecom) 동일 패턴 복제
- `BankingError` code-in-message 표준 (S275)
- `MAX_WITHDRAWAL_AMOUNT` UPPERCASE 상수 (BK-001 Path A)
- `transferFeeLimit` 변수명 (BK-002 Path B, F445 `limit` keyword)
- `db.transaction()` wrapper (BK-003, BK-006 atomic)
- batch `for` loop + status 전환 (BK-005)

## §5 인수 기준 (DoD)

DoD 12건 — Plan AIF-PLAN-095 §DoD 동일.
