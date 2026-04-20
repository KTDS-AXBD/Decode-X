# ES-BUDGET-001: 예산 배정 한도 초과 처리 (Budget Limit Enforcement)

**Empty Slot ID**: ES-BUDGET-001
**유형**: E1 (Limit / Boundary)
**우선순위**: High
**Sprint**: 214a (Fill 완성)
**선행 시드**: `반제품-스펙/pilot-lpon-cancel/01-business-logic.md §BL-006`

---

## 빈 슬롯 설명

BL-006("회사가 충전을 요청하는 경우 — 회사별 충전 한도 → 충전 원장 처리")은
충전 단계의 한도를 정의하지만, **예산 배정 단계의 한도**는 정의되지 않았다.

회사가 예산을 배정할 때 어떤 기준으로 한도를 적용하는지,
동시 배정 요청이 들어올 때 Race Condition을 어떻게 처리하는지가 누락되어 있다.

**위험**: 동시 배정 요청 → 예산 잔액 음수 → 충전 한도 초과 허용.

---

## 규칙 정의

### condition (When)
회사가 예산 배정 또는 직원 충전 요청을 제출하는 경우.

### criteria (If)
`budget_allocations` 테이블에서 해당 회사의 현재 기간 예산 잔액을 조회했을 때
`잔액 ≥ 요청 금액`.

### outcome (Then)
예산 잔액에서 요청 금액을 차감하고 처리를 허용한다.
차감은 DB 트랜잭션 내에서 원자적으로 처리한다.

### exception (Else)
`잔액 < 요청 금액`이면:
- HTTP 422 + 에러코드 `BUDGET_LIMIT_EXCEEDED` 반환
- `requested_amount`, `available_amount` 필드를 응답에 포함하여 차이를 명시
- 충전 프로세스 진입 금지

---

## 구현 힌트

```sql
-- 예산 잔액 원자적 차감 (낙관적 잠금)
UPDATE budget_allocations
SET
  used_amount = used_amount + :requestedAmount,
  updated_at = datetime('now')
WHERE
  company_id = :companyId
  AND period_id = :currentPeriodId
  AND (total_amount - used_amount) >= :requestedAmount;
-- affected rows = 0 이면 BUDGET_LIMIT_EXCEEDED
```

- D1(SQLite) 환경: WAL 모드에서 단일 노드 — `UPDATE WHERE` 원자성 보장
- 분산 환경: Durable Objects 활용하여 단일 DO로 직렬화
- `budget_allocations.used_amount` 컬럼에 CHECK(`used_amount ≤ total_amount`) 제약 추가 권장
