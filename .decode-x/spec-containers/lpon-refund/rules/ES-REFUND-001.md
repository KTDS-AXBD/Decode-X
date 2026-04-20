# ES-REFUND-001: 환불가능여부(rfndPsbltyYn) 자동 판정 기준

**Empty Slot ID**: ES-REFUND-001
**유형**: E1 (Core Business Logic Gap)
**우선순위**: High
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-020("rfndPsbltyYn = 'Y'이면 환불 처리")은 DB 필드를 참조하지만,
이 필드가 언제 'Y'/'N'으로 설정되는지, 자동 판정 공식이 정의되어 있지 않다.

**위험**: rfndPsbltyYn을 수기로 관리 → 불일치 → 환불 가능/불가 오판정.

---

## 규칙 정의

### condition (When)
환불 신청 수신 시 `rfndPsbltyYn` 자동 판정이 필요한 경우.

### criteria (If)
아래 규칙을 순서대로 평가하여 최초 `'N'` 판정 조건 충족 시 즉시 `'N'`:

| 우선순위 | 조건 | 결과 |
|---------|------|------|
| 1 | `voucher.status = 'CANCELED'` (이미 취소/환불됨) | N |
| 2 | `refund_transactions` 에 동일 `voucherId`로 `status NOT IN ('FAILED')` 건 존재 | N (중복 환불 방지) |
| 3 | `voucher.type = 'CASHBACK'` 또는 `voucher.type = 'DISCOUNT'` | N (BL-026) |
| 4 | `voucher.expiredAt < now()` AND `forcedRefundAllowed = false` | N (BL-029) |
| 5 | `payment.status = 'PAID'` (결제 완료 상태, 아직 취소 미완료) | N (결제 취소 선행 필요) |
| 위 모두 해당 없음 | — | Y |

### outcome (Then)
`rfndPsbltyYn = 'Y'`: 환불 신청 접수 (`refund_transactions` INSERT)
`rfndPsbltyYn = 'N'`: HTTP 422 + 판정 사유 코드 반환

### exception (Else)
ADMIN이 수동으로 `rfndPsbltyYn`을 오버라이드할 수 있음 (강제환불 BL-029 경로).

---

## 판정 사유 코드

| 코드 | 설명 |
|------|------|
| `ALREADY_CANCELED` | 이미 취소/환불됨 |
| `DUPLICATE_REFUND` | 중복 환불 신청 |
| `CASHBACK_NOT_REFUNDABLE` | 캐시백/할인보전 환불불가 |
| `EXPIRED_NOT_REFUNDABLE` | 유효기간 만료 환불불가 |
| `PAYMENT_NOT_CANCELED` | 결제 취소 선행 필요 |
