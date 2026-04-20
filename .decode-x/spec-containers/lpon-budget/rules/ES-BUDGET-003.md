# ES-BUDGET-003: 기간 말 미사용 예산 이월/소멸 처리 (Budget Rollover / Expiry)

**Empty Slot ID**: ES-BUDGET-003
**유형**: E2 (Lifecycle / Time-based)
**우선순위**: Medium
**Sprint**: 214a (Fill 완성)
**선행 시드**: `반제품-스펙/pilot-lpon-cancel/01-business-logic.md §BL-031` (집계 배치 패턴)

---

## 빈 슬롯 설명

BL-031("충전 또는 환불 거래가 발생할 때 → 충전 및 환불 내역을 집계")은
기간 내 집계를 정의하지만, **기간 종료 시 미사용 예산의 처리 정책**이 누락되어 있다.

기업 예산 관리에서 기간 말 잔액의 이월(Rollover) 또는 소멸(Expiry) 정책은
재무 처리와 직결되므로 명시적 정의가 필요하다.

**위험**: 정책 미정의로 기간 전환 배치 실행 시 잔액 처리 오류 또는 누락.

---

## 규칙 정의

### condition (When)
배정 기간(`budget_allocations.period_end`)이 도래하여
기간 종료 배치(BATCH_BUDGET_CLOSE)가 실행되는 경우.

### criteria (If)
`budget_allocations.rollover_yn = 'Y'` AND `remaining_amount > 0`.

### outcome (Then)
1. 다음 기간의 `budget_allocations` 레코드를 생성하거나 기존 레코드에 이월 금액 가산
2. 이월 이력 `budget_rollover_log` INSERT
3. 이벤트 발행: `BudgetRolledOver { companyId, rolledAmount, fromPeriod, toPeriod }`

### exception (Else)
`rollover_yn = 'N'` 또는 `remaining_amount = 0`인 경우:
- `budget_allocations.status = 'EXPIRED'` 업데이트
- 이벤트 발행: `BudgetExpired { companyId, expiredAmount, period }`
- 담당자에게 소멸 안내 LMS 발송 (선택)

---

## 구현 힌트

```sql
-- 기간 종료 배치 처리 (이월)
BEGIN TRANSACTION;

-- 1. 현재 기간 만료 처리
UPDATE budget_allocations
SET status = 'CLOSED', updated_at = datetime('now')
WHERE period_end < date('now') AND status = 'ACTIVE';

-- 2. 이월 대상: rollover_yn = 'Y' AND remaining > 0
INSERT INTO budget_allocations (
  company_id, period_start, period_end,
  total_amount, used_amount, rollover_yn, status
)
SELECT
  company_id,
  date('now', 'start of month'),
  date('now', 'start of month', '+1 month', '-1 day'),
  (total_amount - used_amount),  -- 이월 금액
  0,
  rollover_yn,
  'ACTIVE'
FROM budget_allocations
WHERE status = 'CLOSED' AND rollover_yn = 'Y' AND (total_amount - used_amount) > 0;

COMMIT;
```

- 배치는 월 1회 말일 23:59 실행 권장
- 이월 금액에 상한선 설정 가능 (예: 전 기간 배정액의 20% 이내)
- Cloudflare Cron Triggers 활용 가능 (`0 23 L * *`)
