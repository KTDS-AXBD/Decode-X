# ES-REFUND-004: 강제환불 처리 — 운영 가이드

**Empty Slot ID**: ES-REFUND-004
**대상**: 운영팀 (강제환불 권한 보유자만)

---

## 강제환불 처리 절차

### 사전 확인 (ADMIN 필수)

1. 권한 확인: `forcedRefundApproval = true` 보유 여부
2. 만료일 확인: 만료일로부터 1년 이내 여부
   ```sql
   SELECT id, expiredAt, balance, DATEDIFF(now(), expiredAt) as daysExpired
   FROM vouchers WHERE id = '<voucherId>';
   ```
3. 연간 강제환불 한도 확인 (사용자 기준 3건):
   ```sql
   SELECT COUNT(*) FROM refund_transactions
   WHERE user_id = '<userId>'
     AND force_refund = true
     AND YEAR(created_at) = YEAR(now());
   ```

### 강제환불 처리

```
POST /api/v1/admin/refunds/force
{
  "voucherId": "<id>",
  "reason": "STRONG_COMPLAINT | SYSTEM_ERROR | SPECIAL_EXCEPTION",
  "reasonDetail": "<상세 사유>",
  "approvedBy": "<adminId>"
}
```

### 사후 처리

1. 감사 로그 자동 생성 확인 (`force_refund_audit_logs` 테이블)
2. 월간 강제환불 보고서에 자동 포함됨
3. 팀장 또는 본부장에게 결재 완료 알림

### 강제환불 금지 케이스 (절대 처리 불가)
- 만료 1년 초과
- 동일 사용자 연간 3건 초과
- `voucher.type = 'CASHBACK'` (캐시백 → 포인트 전환 안내)
