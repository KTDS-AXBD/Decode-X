# ES-PAYMENT-003: MIXED 결제 부분 실패 — 운영 가이드

**Empty Slot ID**: ES-PAYMENT-003
**대상**: 운영팀 / 백엔드 개발자

---

## CARD_DANGLING 에스컬레이션 처리

### 감지 조건
- `incident_type = 'MIXED_PAYMENT_CARD_DANGLING'` 티켓 생성 알림 수신

### 위험
카드사에 승인은 됐으나 상품권 잔액 차감이 되지 않은 상태.
카드사에서 고객 계좌에서 청구가 발생할 수 있음.

### 조치 절차 (P1, 1시간 SLA)

1. `payments`에서 대상 건 확인
   ```sql
   SELECT paymentId, amount, approvalId, status, createdAt
   FROM payments
   WHERE status = 'MIXED_PARTIAL_FAILED'
     AND approvalId IS NOT NULL
     AND createdAt >= now() - INTERVAL '2 hours';
   ```

2. 카드사 API로 취소 재시도
   - `CardApi.cancelAuthorization(approvalId)`
   - 성공 시: `payments.status = 'ROLLBACK_COMPLETED'`

3. 취소도 실패 시:
   - 카드사 고객센터에 전화 취소 요청
   - `payments.status = 'MANUAL_CANCEL_REQUIRED'`

4. 인시던트 종료 기록
