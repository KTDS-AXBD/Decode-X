# ES-PAYMENT-002: CARD 승인 실패 — 운영 가이드

**Empty Slot ID**: ES-PAYMENT-002
**대상**: 운영팀 / 백엔드 개발자

---

## 카드사 승인 실패 다발 시 대응

### 감지 조건
- `payments.status = 'CARD_AUTH_FAILED'` 건수가 5분 내 10건 이상
- 카드사 연동 오류율 > 5%

### 조치 절차

1. 카드사 상태 페이지 확인
2. 장애 판정 시: 결제 수단 CARD 일시 비활성화
   ```sql
   -- Feature flag 또는 Admin UI에서 처리
   UPDATE feature_flags SET enabled = false WHERE name = 'payment_method_card';
   ```
3. 고객 안내: "카드 결제가 일시적으로 이용 불가합니다. QR/현금으로 이용 부탁드립니다."
4. 장애 해소 후 재활성화 + 영향 건수 집계

### 영향 건 재처리
```sql
SELECT paymentId, userId, amount, createdAt
FROM payments
WHERE status = 'CARD_AUTH_FAILED'
  AND createdAt >= '<장애 시작 시각>';
```
- 고객에게 개별 재결제 안내 문자 발송
- 이미 잔액이 차감된 건 없으므로 재결제만 안내
