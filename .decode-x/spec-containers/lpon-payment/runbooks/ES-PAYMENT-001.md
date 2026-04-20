# ES-PAYMENT-001: 결제 멱등성 — 운영 가이드

**Empty Slot ID**: ES-PAYMENT-001
**대상**: 운영팀 / 백엔드 개발자

---

## 이중 결제 발생 시 수동 조치

### 감지 조건
- 고객센터 이중 결제 민원
- 모니터링: `PaymentCompleted` 이벤트가 동일 `paymentRequestId`로 2건 이상 감지

### 조치 절차

1. `payments`에서 동일 `paymentRequestId` 조회
   ```sql
   SELECT paymentId, status, amount, createdAt
   FROM payments
   WHERE paymentRequestId = '<민원_requestId>'
   ORDER BY createdAt;
   ```

2. 두 건 모두 `paid` 상태이면 → 후발 건 취소
   - `POST /api/v1/payments/{후발_paymentId}/cancel`
   - body: `{ "cancel_type": "FULL", "reason": "DUPLICATE_PAYMENT" }`

3. 상품권 잔액 확인
   ```sql
   SELECT balance FROM vouchers WHERE id = '<voucherId>';
   ```
   - 예상 잔액과 다르면 수기 조정 요청 (운영팀장 승인 필요)

4. 인시던트 로그
   ```
   incident_id: INC-PAYMENT-DUPLICATE-{YYYYMMDD}-{SEQ}
   paymentRequestId: <값>
   paymentIds: [<원본>, <중복>]
   resolution: <취소|조정|정상>
   ```
