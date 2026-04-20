# ES-PURCHASE-003: 상품권 유효기간 산정 (Voucher Validity Period)

**Empty Slot ID**: ES-PURCHASE-003
**유형**: E2 (Lifecycle / Time-based)
**우선순위**: Medium
**Sprint**: 214a (Fill 완성)
**선행 시드**: `반제품-스펙/pilot-lpon-cancel/02-data-model.md` (vouchers.expires_at)

---

## 빈 슬롯 설명

`vouchers` 테이블에 `expires_at` 필드가 정의되어 있으나,
구매 시점부터 유효기간을 **어떻게 산정**하는지가 명시되지 않았다.

법령상 온누리상품권 유효기간은 구매일로부터 5년이나,
시스템 정책에 따라 다를 수 있으므로 명확한 규칙 정의가 필요하다.

**위험**: 유효기간 산정 기준 미정의 → 다른 개발자가 임의 구현 → 정책 불일치.

---

## 규칙 정의

### condition (When)
구매 결제 완료 후 상품권(`vouchers`)을 발행하는 경우.

### criteria (If)
`VOUCHER_VALIDITY_MONTHS` 설정값 (기본값: 60개월 = 5년) 이 존재함.

### outcome (Then)
```
expires_at = purchased_at + VOUCHER_VALIDITY_MONTHS 개월
```
- 월말 처리: `purchased_at`이 1월 31일이면 `expires_at`는 7월 31일 (마지막 날로 정렬)
- 시각: 유효기간 만료일 23:59:59 KST (자정 직전)

### exception (Else)
`VOUCHER_VALIDITY_MONTHS` 설정이 없는 경우:
- 시스템 기본값 60개월 적용 (법령 기준)
- 관리자 알림: "유효기간 설정 미확인 — 기본값 60개월 적용"

---

## 구현 힌트

```typescript
function calculateExpiresAt(purchasedAt: Date, validityMonths: number = 60): Date {
  const expires = new Date(purchasedAt);
  expires.setMonth(expires.getMonth() + validityMonths);
  // 월말 보정: Date 객체가 자동으로 다음 달로 넘어가지 않도록
  // 예: 1월 31일 + 1개월 → 3월 3일(X) → 2월 28일(O)
  if (expires.getDate() !== purchasedAt.getDate()) {
    expires.setDate(0); // 이전 달 마지막 날로 후퇴
  }
  expires.setHours(23, 59, 59, 999);
  return expires;
}
```

- `VOUCHER_VALIDITY_MONTHS`는 KV 또는 D1 설정 테이블에서 로드
- 법령 변경 시 기존 발행 상품권에는 소급 미적용 (발행 시점 기준 고정)
- BL-029("유효기간 만료 상품권 환불 요청 시 → 원칙적으로 환불 불가")와 연동
