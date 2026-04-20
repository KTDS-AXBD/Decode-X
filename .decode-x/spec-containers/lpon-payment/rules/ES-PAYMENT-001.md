# ES-PAYMENT-001: 결제 멱등성 — 중복 결제 방지

**Empty Slot ID**: ES-PAYMENT-001
**유형**: E4 (Exception Handling)
**우선순위**: High
**Sprint**: 214b (Fill 완성)
**선행 시드**: `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/payment.ts`

---

## 빈 슬롯 설명

BL-014("결제 완료 시 취소 가능")는 정상 결제 흐름만 정의하며,
네트워크 중복 전송 또는 클라이언트 재시도로 인한 동일 결제 요청이 중복 처리되는 규칙이 없다.

**위험**: 클라이언트 재시도 + 네트워크 중복 배달 → 이중 결제 + 이중 잔액 차감.

---

## 규칙 정의

### condition (When)
동일한 `paymentRequestId`로 결제 요청이 2회 이상 수신된 경우.

### criteria (If)
`payments` 테이블에 동일 `paymentRequestId`가 이미 존재하면서
`status IN ('processing', 'paid')`.

### outcome (Then)
기존 트랜잭션의 결과를 그대로 반환한다.
새 잔액 차감(`vouchers.balance -=`)을 발생시키지 않는다.
응답 HTTP 200 + 기존 `paymentId` 반환.
`idempotent: true` 필드 포함.

### exception (Else)
`paymentRequestId`가 없거나 `status = 'failed'`이면 신규 처리한다.
처리 중(`processing`)인 경우 HTTP 409 + `PAYMENT_IN_PROGRESS` 에러 반환,
10초 후 재시도 권고.

---

## 구현 힌트

```sql
SELECT paymentId, status, completedAt
FROM payments
WHERE paymentRequestId = :paymentRequestId
  AND status IN ('processing', 'paid')
LIMIT 1;
```

- `paymentRequestId`는 클라이언트가 생성하는 UUID (X-Idempotency-Key 헤더 또는 body field)
- DB 유니크 인덱스: `(paymentRequestId)` + 상태 필터
