# Spec Container — BANKING-001 (은행 산업 합성 도메인)

**Skill ID**: BANKING-001
**Domain**: Banking (은행 산업 — 출금한도/송금수수료/계좌이체atomic/계좌상태전환/휴면계좌배치/KYC atomic)
**Source**: SYNTHETIC — Sprint 297 F463, withRuleId 재사용 27번째 도메인 PoC (Telecom 다음 산업, 16번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (BK-001 ~ BK-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BK-001 | 출금 요청 시 | `amount < MAX_WITHDRAWAL_AMOUNT` (UPPERCASE 상수) AND 잔액 충분 | `transactions` INSERT + `accounts.balance` 차감 | `E422-WITHDRAWAL-LIMIT` (1회 출금 한도 초과) |
| BK-002 | 송금 처리 시 | `feeAmount <= transferFeeLimit` (var-vs-var, `limit` keyword 매칭) | 수수료 계산 완료 + 송금 허용 | `E422-TRANSFER-FEE` (수수료 한도 초과) |
| BK-003 | 계좌 이체 요청 시 | `fromAccount.status = 'active'` AND `toAccount.status = 'active'` AND 잔액 충분 | atomic: `accounts.balance` 양쪽 UPDATE + `transactions` INSERT | `E404-ACCOUNT`, `E409-ACCOUNT`, `E422-INSUFFICIENT-FUNDS` |
| BK-004 | 계좌 상태 전환 (pending_kyc → active → frozen → dormant → closed) | 허용 매트릭스 충족 | `accounts.status` UPDATE + 타임스탬프 기록 | `E404-ACCOUNT`, `E409-ACCOUNT` |
| BK-005 | 휴면 계좌 일괄 처리 (배치) | `accounts.status = 'active'` AND 최근 거래 < inactiveCutoffDate | `accounts.status='dormant'` 일괄 UPDATE + `dormant_at` 기록 | 대상 없으면 markedCount=0 |
| BK-006 | KYC 본인확인 처리 시 | `account.status = 'pending_kyc'` | atomic: `kyc_records` INSERT + `aml_checks` INSERT + `accounts.status='active'` | `E404-ACCOUNT`, `E409-ACCOUNT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `accounts` | balance 차감 (BK-001/BK-003) / status 전환 (BK-004/BK-005/BK-006) | processWithdrawal / processAccountTransfer / transitionAccountStatus / markDormantAccounts / verifyKyc |
| `transactions` | INSERT (BK-001/BK-003) | processWithdrawal / processAccountTransfer |
| `kyc_records` | INSERT (BK-006) | verifyKyc |
| `aml_checks` | INSERT (BK-006) | verifyKyc |

---

## 임계값 / 상수

- `MAX_WITHDRAWAL_AMOUNT = 10_000_000` (BK-001 1회 출금 한도 1천만원)
- `transferFeeLimit = 50_000` (BK-002 최대 수수료 한도 5만원)

---

## 상태 머신

```
accounts: [opened] → pending_kyc (초기 상태)
accounts: pending_kyc → active (BK-006 KYC atomic)
accounts: active → frozen (BK-004 transition)
accounts: active → dormant (BK-004 / BK-005 batch)
accounts: frozen → active (BK-004 transition)
accounts: frozen → closed (BK-004 transition)
accounts: dormant → active (BK-004 transition)
accounts: dormant → closed (BK-004 transition)

transactions: [created] → completed (BK-001/BK-003 atomic)
transactions: [created] → failed (오류 시)

kyc_records: [created] → verified (BK-006 atomic)
aml_checks: [created] → cleared (BK-006 atomic)
```

---

## 권한

- **processWithdrawal**: 고객 / 출금 SYSTEM
- **computeTransferFee**: 수수료 SYSTEM
- **processAccountTransfer**: 고객 / 이체 SYSTEM
- **transitionAccountStatus**: 상태관리 SYSTEM
- **markDormantAccounts**: 휴면관리 SYSTEM (배치)
- **verifyKyc**: KYC/AML SYSTEM

---

## 관련 문서

- `rules/BK-001.md` ~ `rules/BK-006.md` — 개별 BL detail
- `runbooks/BK-001.md` ~ `runbooks/BK-006.md` — operational runbooks
- `tests/BK-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/banking.ts` — 합성 source
