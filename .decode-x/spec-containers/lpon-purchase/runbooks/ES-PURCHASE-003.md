# ES-PURCHASE-003: 유효기간 오류 — 운영 가이드

**Empty Slot ID**: ES-PURCHASE-003
**대상**: 운영팀 / DBA

---

## 상품권 유효기간 오류 조치

### 유효기간 설정 확인
```sql
SELECT config_key, config_value
FROM system_config
WHERE config_key = 'VOUCHER_VALIDITY_MONTHS';
-- 없으면: 기본값 60개월 적용 중. 설정 추가 필요.
```

### 잘못 산정된 유효기간 수정 (소급 보정)
```sql
-- 영향 받은 상품권 조회
SELECT id, purchased_at, expires_at FROM vouchers
WHERE created_at BETWEEN '<시작일>' AND '<종료일>'
  AND status = 'ACTIVE';

-- 유효기간 재계산 후 업데이트 (예: purchased_at + 60개월)
UPDATE vouchers
SET expires_at = datetime(purchased_at, '+60 months', '-1 seconds')
WHERE id IN ('<voucherId1>', '<voucherId2>');
```

### 유효기간 설정 추가
```sql
INSERT INTO system_config (config_key, config_value, updated_by)
VALUES ('VOUCHER_VALIDITY_MONTHS', '60', '<operatorId>');
```

### SLA
- 유효기간 오류 발견 후 보정: 24시간 이내
- 고객 안내: 보정 완료 후 SMS 발송
