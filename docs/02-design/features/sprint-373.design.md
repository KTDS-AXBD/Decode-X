# Sprint 373 Design — F545 LB Library 77번째 도메인

**Sprint**: 373  
**F-item**: F545  
**Date**: 2026-05-19  

---

## §1 도메인 개요

**Library** (도서관 산업) — 66번째 신규 산업.  
AM+TH+KP+AQ+ZO+MS+MV+LB 오프라인 엔터테인먼트 8-클러스터 확장.  
📚 **단일 클러스터 8 도메인 첫 사례 마일스톤**.

**핵심 차별성**: 반납(return) + 연체료(overdue fee) 개념. movie/museum의 "환불(refund)" 대신 "연체료 환불"로 변형.

---

## §2 데이터 스키마

```sql
-- libraries: 도서관 메타
libraries (id, name, total_loan_capacity, active_loans, status)
-- status: active | suspended | retired

-- member_cards: 회원 대출 카드
member_cards (id, member_id, library_id, tier_code, loan_limit, loan_used, status, expires_at)
-- tier_code: free | basic | premium | vip
-- status: active | paused | expired | cancelled

-- loans: 대출 기록
loans (id, library_id, card_id, visit_id, payment_id, status, scheduled_at)
-- status: reserved | active | returned | overdue | cancelled

-- library_visits: 방문/대출 기록
library_visits (id, library_id, loan_id, visit_no, status, started_at)
-- status: active | returned | overdue | cancelled | expired

-- loan_payments: 대출 결제
loan_payments (id, loan_id, visit_id, amount, status, paid_at)

-- overdue_fee_records: 연체료 기록
overdue_fee_records (id, member_id, visit_id, loan_cost, overdue_rate, overdue_amount, status)
-- status: pending | calculated | refunded

-- overdue_refunds: 연체료 환불
overdue_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
```

---

## §3 비즈니스 룰 매핑

| BL ID | 함수 | detector | 로직 |
|-------|------|----------|------|
| LB-001 | `borrowBook` | ThresholdCheck Path A | `library.active_loans >= MAX_CONCURRENT_LOANS_PER_LIBRARY` (UPPERCASE fallback) |
| LB-002 | `applyMemberLimit` | ThresholdCheck Path B | `card.loan_used + loans >= loanLimit` (var-vs-var, `limit` keyword) |
| LB-003 | `processBookEntry` | AtomicTransaction | db.transaction: library_visits INSERT + loans UPDATE + loan_payments INSERT |
| LB-004 | `transitionLoanStatus` | StatusTransition | reserved→active, active→returned/overdue/cancelled |
| LB-005 | `expireOverdueLoanBatch` | StatusTransition (batch) | overdue loans → expired, batch |
| LB-006 | `processOverdueRefund` | AtomicTransaction | db.transaction: overdue_fee_records + overdue_refunds atomic |

---

## §4 상태 머신

```
loans: reserved → active (LB-003 대출 atomic)
loans: active → returned (LB-004, 정상 반납)
loans: active → overdue (LB-004, 연체)
loans: reserved | active → cancelled (LB-004)

library_visits: active → returned (정상 반납)
library_visits: overdue → expired (LB-005 batch)
library_visits: active → overdue (LB-004, LB-006 연체료 환불 대상)

overdue_fee_records: pending → calculated → refunded (LB-006 atomic)
```

---

## §5 구현 파일 매핑

| 파일 | 유형 | 내용 |
|------|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/library.ts` | 신규 | LB-001~006 구현 |
| `.decode-x/spec-containers/library/rules/library-rules.md` | 신규 | 룰 명세 (영문 테이블) |
| `.decode-x/spec-containers/library/tests/LB-001.yaml` | 신규 | 시나리오 YAML |
| `.decode-x/spec-containers/library/provenance.yaml` | 신규 | provenance 메타 |
| `scripts/divergence/domain-source-map.ts` | 수정 | DOMAIN_MAP 말미에 library 항목 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | 수정 | BL_DETECTOR_REGISTRY 말미에 LB-001~006 추가 |
| `packages/utils/test/bl-detector.test.ts` | 수정 | LB-001~006 describe 블록 추가 |

---

## §6 임계값 / 상수

- `MAX_CONCURRENT_LOANS_PER_LIBRARY = 500` (LB-001: 대규모 공공도서관 동시 대출 기준)
- `loanLimit = member_cards.loan_limit` (LB-002: 회원 등급별 일일 대출 한도)
