# ES-REFUND-003: 환불계좌 오류 재처리 — 운영 가이드

**Empty Slot ID**: ES-REFUND-003
**대상**: 운영팀 / CS팀

---

## 환불 입금 실패 재처리 절차

### 감지 조건
- `refund_transactions.status = 'DEPOSIT_ACCOUNT_ERROR'` 건수 일간 집계

### 사용자 재등록 후 자동 재처리 모니터링

```sql
-- 7일 초과 미처리 건 확인
SELECT rt.id, rt.userId, rt.amount, rt.depositAccountError, rt.createdAt
FROM refund_transactions rt
WHERE rt.status = 'DEPOSIT_ACCOUNT_ERROR'
  AND rt.createdAt < now() - INTERVAL '7 days';
```

### EXPIRED_ACCOUNT_ERROR CS 수기 처리

1. 대상 사용자에게 연락 (등록된 전화번호)
2. 새 계좌 정보 수집
3. 수동 입금 처리:
   ```bash
   curl -X POST https://deposit.api/v1/manual-deposit \
     -H "Authorization: Bearer <DEPOSIT_API_TOKEN>" \
     -d '{"refundId": "<refundId>", "accountId": "<newAccountId>", "amount": <amount>}'
   ```
4. 성공 시 DB 업데이트:
   ```sql
   UPDATE refund_transactions
   SET status = 'COMPLETED', completedAt = now(), manualProcessedBy = '<담당자>'
   WHERE id = '<refundId>';
   ```
