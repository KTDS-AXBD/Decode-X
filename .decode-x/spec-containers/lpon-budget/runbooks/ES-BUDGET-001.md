# ES-BUDGET-001: 예산 한도 초과 — 운영 가이드

**Empty Slot ID**: ES-BUDGET-001
**대상**: 운영팀 / 백엔드 개발자

---

## 예산 한도 초과 민원 발생 시 조치

### 감지 조건
- 회사 담당자로부터 "직원이 충전 불가" 문의
- 모니터링 `BUDGET_LIMIT_EXCEEDED` 에러 급증

### 조치 절차

1. 현재 예산 잔액 확인
   ```sql
   SELECT company_id, total_amount, used_amount,
          (total_amount - used_amount) AS remaining,
          period_start, period_end, rollover_yn
   FROM budget_allocations
   WHERE company_id = '<회사ID>' AND status = 'ACTIVE';
   ```

2. 임시 한도 증액이 필요한 경우 (운영 긴급 처리)
   ```sql
   UPDATE budget_allocations
   SET total_amount = total_amount + :additionalAmount,
       updated_at = datetime('now')
   WHERE company_id = '<회사ID>' AND status = 'ACTIVE';
   ```

3. 증액 이력 기록 (필수)
   ```
   budget_adjustment_log INSERT:
   company_id, adjusted_amount, reason, operator_id, created_at
   ```

### SLA
- 한도 초과 민원 접수 후 조치: 2시간 이내
- 증액 처리 후 확인: 즉시
