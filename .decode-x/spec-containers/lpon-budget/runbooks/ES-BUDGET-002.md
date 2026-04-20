# ES-BUDGET-002: 예산 복구 실패 — 운영 가이드

**Empty Slot ID**: ES-BUDGET-002
**대상**: 운영팀 / 백엔드 개발자

---

## 예산 복구 실패 발생 시 수기처리

### 감지 조건
- `budget_restoration_log.status = 'FAILED'` 레코드 존재
- 대시보드 "예산 복구 실패" 플래그 활성화

### 수기처리 절차

1. 복구 실패 건 조회
   ```sql
   SELECT r.company_id, r.charge_transaction_id, r.restored_amount, r.created_at
   FROM budget_restoration_log r
   WHERE r.status = 'FAILED'
   ORDER BY r.created_at DESC;
   ```

2. 연관 충전 거래 확인
   ```sql
   SELECT id, status, amount, company_id
   FROM charge_transactions
   WHERE id = '<charge_transaction_id>';
   ```

3. 예산 수기 복구
   ```sql
   UPDATE budget_allocations
   SET used_amount = used_amount - :restoredAmount,
       updated_at = datetime('now')
   WHERE company_id = '<회사ID>' AND status = 'ACTIVE'
     AND used_amount >= :restoredAmount;

   UPDATE budget_restoration_log
   SET status = 'MANUAL_COMPLETED',
       operator_id = '<운영자ID>',
       updated_at = datetime('now')
   WHERE id = '<복구로그ID>';
   ```

4. 감사 로그 기록 필수
   ```
   incident_id: INC-{YYYYMMDD}-{SEQ}
   type: BUDGET_RESTORE_FAILURE
   company_id, charge_transaction_id, restored_amount, operator_id
   ```

### SLA
- 복구 실패 감지 후 수기처리 완료: 2시간 이내
