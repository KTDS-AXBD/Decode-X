# ES-PAYMENT-004: SMS 발송 실패 — 운영 가이드

**Empty Slot ID**: ES-PAYMENT-004
**대상**: 운영팀

---

## SMS 재발송 처리

### 감지 조건
- `payment_notifications.status = 'DELIVERY_FAILED'` 건수 일간 집계

### 조치 절차

1. 실패 건 조회
   ```sql
   SELECT pn.id, pn.paymentId, pn.userId, pn.amount, pn.failedAt
   FROM payment_notifications pn
   WHERE pn.status = 'DELIVERY_FAILED'
     AND pn.failedAt >= '<기간>'
   ORDER BY pn.failedAt;
   ```

2. SMS 벤더 장애 여부 확인
3. 장애 해소 시: 수동 재발송 배치 실행
   ```bash
   node scripts/resend-notifications.js --date <YYYY-MM-DD>
   ```
4. 재발송 성공 시: `payment_notifications.status = 'DELIVERED'` 업데이트

### 비즈니스 영향
SMS 실패는 결제 원장에 영향 없음. 단순 알림 누락이므로 P3 우선순위.
