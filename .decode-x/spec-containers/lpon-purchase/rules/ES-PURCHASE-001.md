# ES-PURCHASE-001: 구매 멱등성 (Purchase Idempotency)

**Empty Slot ID**: ES-PURCHASE-001
**유형**: E4 (Exception Handling / Idempotency)
**우선순위**: High
**Sprint**: 214a (Fill 완성)
**선행 시드**: `.decode-x/spec-containers/lpon-charge/rules/ES-CHARGE-001.md` (충전 멱등성 참조)

---

## 빈 슬롯 설명

상품권 구매 API는 클라이언트 재시도 또는 네트워크 중복 배달 시
동일 요청이 2회 이상 도달할 수 있다.

결제 성공 후 `vouchers` INSERT 전 장애 발생 시,
재시도 시 결제가 중복 청구되거나 상품권이 이중 발행될 수 있다.

**위험**: 이중 결제 + 이중 상품권 발행 → 재무 손실 + 고객 혼란.

---

## 규칙 정의

### condition (When)
동일한 `purchaseRequestId`로 구매 요청이 2회 이상 수신된 경우.

### criteria (If)
`purchase_transactions` 테이블에 동일 `purchaseRequestId`가 이미 존재하면서
`status IN ('processing', 'completed')`.

### outcome (Then)
- `status = 'completed'`: 기존 `voucherId`를 HTTP 200으로 반환 (이중 발행 없음)
- `status = 'processing'`: HTTP 409 + `PURCHASE_IN_PROGRESS` + 재시도 권고 10초

### exception (Else)
`purchaseRequestId`가 없거나 `status = 'failed'`이면 신규 구매 처리.

---

## 구현 힌트

```sql
-- 멱등성 체크
SELECT voucher_id, status, completed_at
FROM purchase_transactions
WHERE purchase_request_id = :purchaseRequestId
  AND status IN ('processing', 'completed')
LIMIT 1;
```

- `purchase_transactions.purchase_request_id`에 UNIQUE INDEX 적용
- 결제 성공 → `purchase_transactions` INSERT (status=processing) → `vouchers` INSERT → status=completed 순서로 원자 처리
- `vouchers` INSERT 실패 시: 결제 취소 API 호출 → `purchase_transactions.status = 'failed'`
