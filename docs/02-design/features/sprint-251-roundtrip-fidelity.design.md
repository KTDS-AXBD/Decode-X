---
id: AIF-DSGN-048
title: Sprint 251 F359 상세 설계
type: design
plan: AIF-PLAN-048
sprint: 251
created: 2026-05-04
---

# AIF-DSGN-048: round-trip 신뢰도 회복 상세 설계

## §1 Migration 설계 (BL-028)

### 0002_cashback.sql
```sql
ALTER TABLE vouchers ADD COLUMN cashback_amount INTEGER NOT NULL DEFAULT 0;
```
- `vouchers` 테이블에 `cashback_amount` 컬럼 추가 (기본값 0)
- 기존 데이터 무영향 (DEFAULT 0)

## §2 domain/refund.ts 변경

### RefundInput 확장 (TD-23)
```ts
interface RefundInput {
  // 기존 필드 유지
  refundType?: string;  // "UNUSED_FULL" | "USED_BALANCE" 등
}
```

### RefundResult 확장 (TD-23)
```ts
interface RefundResult {
  // 기존 필드 유지
  rfndPsbltyYn: string;  // "Y" | "N"
}
```

### processRefundRequest 신규 로직 (BL-020 확장)

```
1. payment 조회 (기존)
2. payment 상태 확인 (기존)
3. 권한 확인 (기존)
4. 금액 확인 (기존)
5. 중복 환불 확인 (기존)
6. [NEW] voucher 조회 (face_amount, balance, purchased_at, expires_at, cashback_amount)
7. [NEW] BL-029: expires_at < now() → throw PERIOD_EXPIRED
8. [NEW] BL-024: refundType="UNUSED_FULL" && days > 7 → throw PERIOD_EXPIRED
9. [NEW] BL-025: refundType="USED_BALANCE" && usageRate < 0.6 → throw INSUFFICIENT_USAGE
10. [NEW] BL-028: exclusionAmount = Math.round(voucher.cashback_amount * 1.1)
11. INSERT refund (기존, exclusionAmount 적용)
12. [NEW] return { ..., rfndPsbltyYn: "Y" }
```

### 에러 코드 매핑
| 규칙 | 에러 코드 | normaliseErrorCode 결과 |
|---|---|---|
| BL-024 | `PERIOD_EXPIRED` | `FULL_REFUND_PERIOD_EXPIRED` → `PERIOD_EXPIRED` |
| BL-025 | `INSUFFICIENT_USAGE` | 그대로 (`INSUFFICIENT_USAGE`) |
| BL-029 | `PERIOD_EXPIRED` | 동일 |

## §3 fixtures.ts 변경

### applyMigrations — 전체 마이그레이션 자동 적용
```ts
function applyMigrations(db) {
  // MIGRATIONS_DIR 내 *.sql 파일을 sort() 순서로 전체 적용
  // 0001_init.sql, 0002_cashback.sql, ...
}
```

### voucher 픽스처 — `remainingBalance` alias
```ts
const voucherBalance = given["voucherBalance"] ?? given["remainingBalance"] ?? 100_000;
```
- TC-REFUND-003 `remainingBalance: 35000` → `balance=35000` (BL-025 65% ≥ 60% 통과)

### voucher 픽스처 — `cashbackUsed` 반영
```ts
const cashbackAmount = given["cashbackUsed"] ?? 0;
// INSERT vouchers: ..., cashback_amount = cashbackAmount
```

### cashbackUsed 시나리오 — REQUESTED 환불 사전 생성 (TC-REFUND-006)
```ts
if (cashbackUsed != null && requestedAmount != null) {
  const exclusionAmount = Math.round(cashbackUsed * 1.1);  // 5500
  const depositAmount = requestedAmount - exclusionAmount;  // 44500
  // INSERT refund_transactions (REQUESTED, exclusion=5500, deposit=44500)
  // INSERT refund_accounts (approveRefund FK 필요)
}
```

## §4 runner.ts 변경

### runRefundRequest — rfndPsbltyYn 하드코딩 제거 (TD-23)
```ts
// Before: return { ok: true, result: { ...result, rfndPsbltyYn: "Y" } }
// After:  return { ok: true, result };  // domain이 rfndPsbltyYn 반환
// + refundType 전달: processRefundRequest(db, { ..., refundType })
```

### runRefundApprove — deposit_amount / exclusion_amount DB 읽기
```ts
const row = db.prepare("SELECT status, deposit_amount, exclusion_amount FROM refund_transactions WHERE id = ?").get(ids.refundId);
return { ok: true, result: { ...result, status: row?.status, deposit_requested: true,
  deposit_amount: row?.deposit_amount, exclusion_amount: row?.exclusion_amount } };
```

### runRefundReject — reject_reason_recorded DB 검증
```ts
const row = db.prepare("SELECT error_message FROM refund_transactions WHERE id = ?").get(ids.refundId);
return { ok: true, result: { ...result, reject_reason_recorded: (row?.error_message ?? "") !== "" } };
```

## §5 comparator.ts 변경

### 3 real keys → 실 검증
| key | 변경 전 | 변경 후 |
|---|---|---|
| `reject_reason_recorded` | null (silent PASS) | `actual.result["reject_reason_recorded"] === true` 확인 |
| `deposit_amount` | null (silent PASS) | `actual.result["deposit_amount"] === expected` 비교 |
| `exclusion_amount` | null (silent PASS) | `actual.result["exclusion_amount"] === expected` 비교 |

### 5 stub keys → STUB_PENDING 명시화
```ts
case "newBalanceDeducted":
case "newPaymentIdGenerated":
case "responseIdempotent":
case "responseStatus":
case "responsePaymentId":
  // STUB_PENDING: ES-PAYMENT-001+ contract 추가 시 actual.result 비교로 교체
  return null;
```

### rfndPsbltyYn — fallback 데드코드 정리
```ts
// Before: actual.result["rfndPsbltyYn"] ?? (actual.ok ? "Y" : "N")
// After:  actual.result["rfndPsbltyYn"] as string | undefined
```

## §6 types.ts 변경

```ts
export type FailReason =
  | "WRONG_OUTCOME"
  | "WRONG_VALUE"
  | "UNEXPECTED_ERROR"
  | "EXPECTED_ERROR_MISSING"
  | "UNSUPPORTED_WHEN"
  | "STUB_PENDING";  // [NEW] Edge Spec contract 미추가 상태의 stub key
```

## §7 시나리오별 예상 결과

| TC | 변경 전 | 변경 후 | 원인 |
|---|---|---|---|
| TC-REFUND-001 | PASS | PASS | BL-024 3일 < 7일 ✓ |
| **TC-REFUND-002** | **FAIL** | **PASS** | BL-024 10일 > 7일 → PERIOD_EXPIRED |
| TC-REFUND-003 | PASS | PASS | BL-025 65% ≥ 60% ✓ (balance=35000 픽스처 수정) |
| TC-REFUND-004 | PASS | PASS | 변경 없음 |
| TC-REFUND-005 | PASS | PASS (실 검증) | reject_reason_recorded DB 실 확인 |
| TC-REFUND-006 | silent PASS | PASS (실 검증) | deposit/exclusion DB 실 확인 |

**목표**: 12/12 = **100%** implementedRate
