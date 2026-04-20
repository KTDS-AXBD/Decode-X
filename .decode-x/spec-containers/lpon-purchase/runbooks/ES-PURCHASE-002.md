# ES-PURCHASE-002: 월 한도 오류 — 운영 가이드

**Empty Slot ID**: ES-PURCHASE-002
**대상**: 운영팀

---

## 월 한도 설정 변경 및 특예 처리

### 한도 설정 확인
```sql
SELECT config_key, config_value
FROM system_config
WHERE config_key = 'MONTHLY_PURCHASE_LIMIT';
```

### 특정 사용자 월 구매 현황 확인
```sql
SELECT SUM(face_amount) AS monthly_used
FROM purchase_transactions
WHERE user_id = '<userId>'
  AND status = 'completed'
  AND strftime('%Y-%m', purchased_at) = '2026-04';
```

### 긴급 한도 증액 (개인 예외 처리)
```sql
-- 예외 테이블에 사용자별 특례 등록
INSERT INTO purchase_limit_exceptions (user_id, extra_limit, reason, valid_until, operator_id)
VALUES ('<userId>', 500000, '복지 특별 지원', '2026-04-30', '<operatorId>');
```

### SLA
- 한도 관련 민원 처리: 2시간 이내
