# Spec Container — POL-LPON-BUDGET-001 (온누리상품권 예산 관리)

**Skill ID**: POL-LPON-BUDGET-001
**Domain**: LPON 예산 관리 (Corporate Budget Management)
**Source**: AI Foundry 역공학 추출 — pilot-lpon-cancel BL-006, BL-031~032 + 추론
**Version**: 1.0.0
**Status**: draft

---

## 도메인 설명

회사(기업)가 직원 복지용 온누리상품권 충전을 위한 예산을 배정하고 관리하는 프로세스.
BL-006 "회사가 충전을 요청하는 경우"의 전제가 되는 예산 원장 관리 규칙을 정의한다.

---

## 비즈니스 룰 (BB-001 ~ BB-005)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BB-001 | 회사가 예산을 배정 요청하는 경우 | 배정 금액 > 0 AND 배정 금액 ≤ 회사 최대 한도 | 예산 원장(`budget_ledger`)에 배정 기록 생성, 예산 잔액 갱신 | 한도 초과 또는 음수 금액 시 거부, E422 반환 |
| BB-002 | 직원이 상품권 충전 요청 시 예산 차감 | 해당 직원의 예산 잔액 ≥ 충전 요청 금액 | 예산 잔액 차감 후 lpon-charge 충전 프로세스 진행 | 예산 부족 시 충전 거부 (E422 BUDGET_INSUFFICIENT) |
| BB-003 | 예산 잔액이 임계치 이하로 감소할 때 | 예산 잔액 ≤ 배정 금액의 10% | 담당자(company admin)에게 소진 임박 알림(LMS) 발송 | 알림 설정 비활성 시 미발송 |
| BB-004 | 예산 배정 기간이 종료되는 경우 | 이월 정책(`rollover_yn`)이 'Y'로 설정됨 | 미사용 잔액을 다음 기간으로 이월 처리 | `rollover_yn = 'N'` 시 잔액 소멸(status=EXPIRED) |
| BB-005 | 예산 차감 후 충전 프로세스가 실패한 경우 | 외부 출금 API 오류 또는 충전 확정 실패 확인 | 차감된 예산을 즉시 원복(복구), 잔액 롤백 | 복구 실패 시 수기처리 에스컬레이션 (ES-BUDGET-002) |

---

## 데이터 영향

- **관련 테이블**: `budget_ledger` (신규), `budget_allocations` (신규), `charge_transactions.company_id` (기존)
- **이벤트 발행**: `BudgetAllocated`, `BudgetDepleted`, `BudgetWarningIssued`, `BudgetExpired`, `BudgetRolledOver`, `BudgetRestored`

## 엣지 케이스

- 동시 충전 요청으로 예산 잔액이 음수가 될 수 있음 → `SELECT FOR UPDATE` 또는 optimistic locking 필요 (ES-BUDGET-001)
- 배정 기간 중 회사 한도 정책 변경 시 소급 적용 여부 미정의 → 변경 시점 이후 건에만 적용 권장
- 이월과 소멸이 동일 날짜에 발생 시 배치 순서 보장 필요

## API 연동

- 예산 배정: `POST /api/v1/companies/{companyId}/budget`
- 예산 조회: `GET /api/v1/companies/{companyId}/budget/current`
- 예산 이력: `GET /api/v1/companies/{companyId}/budget/history`
