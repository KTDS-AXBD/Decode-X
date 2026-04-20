# ES-BUDGET-002: 예산 차감 후 충전 실패 시 복구 (Budget Rollback on Charge Failure)

**Empty Slot ID**: ES-BUDGET-002
**유형**: E4 (Exception Handling / Saga Compensation)
**우선순위**: Critical
**Sprint**: 214a (Fill 완성)
**선행 시드**: `반제품-스펙/pilot-lpon-cancel/01-business-logic.md §BL-003, BL-037`

---

## 빈 슬롯 설명

lpon-charge의 BL-003("출금이 실패한 경우 → 에러를 반환하고 충전 프로세스를 중단")은
충전 레벨의 실패 처리를 정의하지만, **예산 차감 후 충전이 실패했을 때 예산을 복구**하는
보상 트랜잭션(Saga Compensation)이 정의되어 있지 않다.

**위험**: 예산 차감 → 충전 실패 → 예산 미복구 → 회사 잔액 음수 누적.

---

## 규칙 정의

### condition (When)
`BB-002`에 의해 예산 차감이 완료된 후,
lpon-charge 프로세스(출금 API 호출 포함)에서 실패가 발생한 경우.

### criteria (If)
`charge_transactions.status IN ('FAILED', 'TIMEOUT_UNRESOLVED')` 이고
해당 건의 `budget_allocation_id`가 연결되어 있을 때.

### outcome (Then)
1. 예산 차감 금액을 즉시 원복: `budget_allocations.used_amount -= chargeAmount`
2. `budget_restoration_log`에 복구 기록 INSERT
3. 이벤트 발행: `BudgetRestored { companyId, amount, reason: 'CHARGE_FAILED' }`
4. 담당자에게 복구 알림 (LMS, optional)

### exception (Else)
복구 자체가 실패한 경우(DB 장애 등):
- `budget_restoration_log.status = 'FAILED'`로 기록
- 관리자에게 수기처리 알림 (이메일 + 대시보드 플래그)
- SLA: 수기처리 완료 2시간 이내

---

## 구현 힌트

```sql
-- 예산 복구 원자적 처리
UPDATE budget_allocations
SET
  used_amount = used_amount - :chargeAmount,
  updated_at = datetime('now')
WHERE
  company_id = :companyId
  AND period_id = :periodId
  AND used_amount >= :chargeAmount;  -- 음수 방지 가드

INSERT INTO budget_restoration_log (
  company_id, charge_transaction_id, restored_amount,
  reason, status, created_at
) VALUES (:companyId, :chargeTxId, :chargeAmount, 'CHARGE_FAILED', 'COMPLETED', datetime('now'));
```

- 보상 트랜잭션은 Saga 패턴 적용 (Cloudflare DO가 오케스트레이터)
- `charge_transactions` 생성 시 `budget_allocation_id` 필드 필수 연결
- 타임아웃 케이스(BL-004): 5분 후 상태조회에서 최종 실패 확정 시 복구 트리거
