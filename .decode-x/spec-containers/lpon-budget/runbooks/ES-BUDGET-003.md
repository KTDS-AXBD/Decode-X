# ES-BUDGET-003: 기간 말 배치 처리 — 운영 가이드

**Empty Slot ID**: ES-BUDGET-003
**대상**: 운영팀 / DBA

---

## 월말 예산 이월/소멸 배치 처리

### 배치 스케줄
- **자동 실행**: 매월 말일 23:59 (Cloudflare Cron: `59 23 L * *`)
- **수동 실행**: 운영 API `POST /admin/budget/period-close`

### 사전 점검 (배치 실행 전)

```sql
-- 처리 대상 확인
SELECT company_id, total_amount, used_amount,
       (total_amount - used_amount) AS remaining,
       rollover_yn, period_end
FROM budget_allocations
WHERE period_end = date('now') AND status = 'ACTIVE';
```

### 배치 실패 시 복구

1. 이미 EXPIRED 처리된 경우 이월 필요 시
   ```sql
   UPDATE budget_allocations SET status = 'ACTIVE' WHERE id = '<ID>';
   -- 이후 수동으로 이월 레코드 INSERT
   ```

2. 중복 실행 방지
   - `budget_rollover_log`에서 같은 `from_period_id` 중복 체크
   - `INSERT OR IGNORE`로 멱등성 보장

### SLA
- 배치 완료: 자정(00:00) 전
- 배치 실패 감지 후 수동 보정: 당일 업무 시작 전(09:00)
