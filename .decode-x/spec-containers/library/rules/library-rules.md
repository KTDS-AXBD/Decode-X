# Spec Container — LIBRARY-001 (도서관 합성 도메인)

**Skill ID**: LIBRARY-001
**Domain**: Library (도서관 산업 — 동시대출한도/회원일일대출한도/도서대출atomic/대출상태전환/연체loan일괄만료/연체료환불atomic)
**Source**: SYNTHETIC — 세션 307 후속3 F545, withRuleId 재사용 77번째 도메인 PoC (Movie 다음 산업, 66번째 신규) 📚 단일 클러스터 8 도메인 첫 사례 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (LB-001 ~ LB-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| LB-001 | 신규 도서 대출 요청 시 | `library.active_loans < total_loan_capacity` (UPPERCASE fallback MAX_CONCURRENT_LOANS_PER_LIBRARY) | 대출 예약 허용 + library.active_loans 증가 | `E422-LIBRARY-LOAN-LIMIT-EXCEEDED` |
| LB-002 | 회원 도서 대출 요청 시 | `card.loan_used + loans < loanLimit` (var-vs-var, `limit` keyword) | 대출 적용 + loan_used 증가 | `E422-DAILY-LOAN-LIMIT-EXCEEDED` |
| LB-003 | 도서 대출 atomic 요청 시 | `loans.status = 'reserved'` | atomic: library_visits INSERT + loans UPDATE + loan_payments INSERT | `E404-LOAN` |
| LB-004 | 대출 상태 전환 (reserved → active → returned / overdue / cancelled) | 허용 매트릭스 충족 | `loans.status` UPDATE | `E404-LOAN`, `E409-LOAN` |
| LB-005 | 연체 loan 일괄 만료 처리 | `library_visits.status = 'overdue'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| LB-006 | 연체료 환불 atomic 요청 시 | `library_visits.status = 'overdue'` | atomic: overdue_fee_records INSERT + overdue_refunds INSERT + overdue_fee_records UPDATE | `E404-OVERDUE-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `libraries` | active_loans 증가 (LB-001) | borrowBook |
| `loans` | INSERT (LB-001), status 갱신 (LB-003/LB-004) | borrowBook / processBookEntry / transitionLoanStatus |
| `member_cards` | loan_used 증가 (LB-002) | applyMemberLimit |
| `library_visits` | INSERT (LB-003), batch expire (LB-005) | processBookEntry / expireOverdueLoanBatch |
| `loan_payments` | INSERT (LB-003) | processBookEntry |
| `overdue_fee_records` | INSERT + status='refunded' (LB-006) | processOverdueRefund |
| `overdue_refunds` | INSERT (LB-006) | processOverdueRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_LOANS_PER_LIBRARY = 500` (LB-001 도서관별 동시 active 대출 기본 한도, 공공도서관 500권 기준)
- `loanLimit = member_cards.loan_limit` (LB-002 회원 등급별 일일 대출 한도, 멤버십 정책 연계)

---

## 상태 머신

```
loans: reserved → active (LB-003 atomic)
loans: active → returned (LB-004 transition, 정상 반납)
loans: active → overdue (LB-004 transition, 연체)
loans: reserved|active → cancelled (LB-004 transition)

library_visits: active → returned (정상 반납)
library_visits: overdue → expired (LB-005 batch — 데이터 보관 기간 만료)
library_visits: active → overdue (연체, LB-006 연체료 환불 대상)

overdue_fee_records: pending → calculated → refunded (LB-006 atomic)
```

---

## 의존 함수 (library.ts)

| BL | 함수 | detector |
|----|------|----------|
| LB-001 | `borrowBook` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| LB-002 | `applyMemberLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| LB-003 | `processBookEntry` | AtomicTransaction (`db.transaction(...)`) |
| LB-004 | `transitionLoanStatus` | StatusTransition (matrix) |
| LB-005 | `expireOverdueLoanBatch` | StatusTransition (batch) |
| LB-006 | `processOverdueRefund` | AtomicTransaction (`db.transaction(...)`) |
