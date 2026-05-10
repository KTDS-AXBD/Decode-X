# Spec Container — PROPERTY-001 (임대관리 합성 도메인)

**Skill ID**: PROPERTY-001
**Domain**: Property Mgmt (임대관리 산업 — 공과금한도/유지보수한도/갱신atomic/임대상태전환/점검배치/명도atomic)
**Source**: SYNTHETIC — Sprint 311 F477, withRuleId 재사용 41번째 도메인 PoC (Pet 다음 산업, 30번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PR-001 ~ PR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PR-001 | 공과금 청구 요청 시 | `totalAmount < MAX_UTILITY_BILL_AMOUNT` (UPPERCASE constant) | 청구 허용 + utility_bills INSERT | `E422-UTILITY-BILL-EXCEEDED` (한도 초과) |
| PR-002 | 유지보수 승인 요청 시 | `requestedAmount <= maintenanceBudgetLimit` (var-vs-var, `limit` keyword 매칭) | 승인 + maintenance_requests UPDATE | `E422-MAINTENANCE-BUDGET-EXCEEDED` (예산 초과) |
| PR-003 | 임대 계약 갱신 요청 시 | `leases.status = 'active'` | atomic: leases UPDATE + lease_renewals INSERT + deposits INSERT | `E404-LEASE` |
| PR-004 | 임대 상태 전환 (pending → active → renewed → terminated → archived) | 허용 매트릭스 충족 | `leases.status` UPDATE | `E404-LEASE`, `E409-LEASE-STATUS` |
| PR-005 | 정기 점검 일괄 처리 | `property_inspections.scheduled_date <= scheduledBefore` AND `status = 'scheduled'` | `status='inspected'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| PR-006 | 명도 처리 요청 시 | 임대 계약 존재 + 미보관 확인 | atomic: evictions INSERT + legal_proceedings INSERT + eviction_notifications INSERT + lease_closures INSERT + leases UPDATE | `E404-LEASE`, `E409-LEASE-ARCHIVED` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `utility_bills` | INSERT (PR-001) | computeUtilityBill |
| `maintenance_requests` | status UPDATE (PR-002) | approveMaintenance |
| `leases` | status/date UPDATE (PR-003, PR-004, PR-006) | renewLease, transitionLeaseStatus, processEviction |
| `lease_renewals` | INSERT (PR-003) | renewLease |
| `deposits` | INSERT (PR-003) | renewLease |
| `property_inspections` | status UPDATE (PR-005) | markInspectionBatch |
| `evictions` | INSERT (PR-006) | processEviction |
| `legal_proceedings` | INSERT (PR-006) | processEviction |
| `eviction_notifications` | INSERT (PR-006) | processEviction |
| `lease_closures` | INSERT (PR-006) | processEviction |

---

## 상태 머신 (PR-004)

```
pending → active → renewed → terminated → archived
               ↘ terminated
```

## BL 균형

Threshold × 2 + Atomic × 2 + Status × 2 (31번째 정착)

## 마일스톤

🏆 30 산업 연속 0 ABSENCE round number 마일스톤
RE 부동산 + PR 임대관리 클러스터 형성
