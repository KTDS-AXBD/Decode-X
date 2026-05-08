# Sprint 269 — F436 Miraeasset 퇴직연금 도메인 PoC 결과

**날짜**: 2026-05-08  
**Sprint**: 269 | **Feature**: F436  
**도메인**: `miraeasset-pension` (8번째 spec-container)

---

## 결과 요약

| 지표 | 결과 |
|------|------|
| 신규 detector 함수 | **0개** (withRuleId 재사용) |
| BL 매핑 추가 | **7개** (P-001~P-007) |
| ABSENCE markers | **0건** (전부 PRESENCE 자동 입증) |
| provenance 변경 | **0건** (auto-detected = manual 일치) |
| utils 테스트 | **170/170 PASS** |
| domain 테스트 | **107/107 PASS** (pension 28건 포함) |
| 전체 detector coverage | **69.1%** (64.6% → +4.5%p) |

---

## detector 매핑

| BL ID | 함수 | detector 유형 | 패턴 |
|-------|------|--------------|------|
| P-001 | validateEnrollmentEligibility | Threshold | `minServiceAmount < MIN_ENROLLMENT_YEARS` (min* LEFT, UPPERCASE RIGHT) |
| P-002 | checkAnnualAccumulationLimit | Threshold | `accumulatedSoFar + amount > ANNUAL_LIMIT_KRW` (amount in expr ✓) |
| P-003 | requestEarlyWithdrawal | Status Transition | `account.status !== 'ACTIVE'` + `INSERT ... VALUES ('UNDER_REVIEW')` |
| P-004 | initiateReceiptPayout | Threshold | `minAge < MIN_RECEIPT_AGE` + `minYears < MIN_SUBSCRIPTION_YEARS` |
| P-005 | applyTaxBenefit | Threshold | `totalAmount > TAX_BENEFIT_LIMIT_KRW` (total* LEFT, UPPERCASE RIGHT) |
| P-006 | terminatePlan | Status Transition | `account.status === 'TERMINATED'` + `SET status = 'TERMINATED'` |
| P-007 | disbursePrincipalAndInterest | Atomic Transaction | `db.transaction(() => { ... })` |

---

## coverage 추이

| Sprint | containers | BLs | ABSENCE | coverage |
|--------|-----------|-----|---------|----------|
| 261 (F428) | 1 | 13 | 2 | 13.2% |
| 262 (F429) | 5 | 38 | 1 | 31.6% |
| 264 (F431) | 6 | 38 | 0 | 44.7% |
| 265 (F432) | 7 | 38 | 0 | 55.3% |
| 266 (F433) | 7 | 48 | 0 | 64.6% |
| **269 (F436)** | **8** | **55** | **0** | **69.1%** |

---

## 6-Sprint 인프라 누적 재활용 패턴

Sprint 261에서 시작된 BL detector 인프라가 6 Sprint 동안 신규 detector 추가 없이
`withRuleId` 재사용만으로 coverage를 13.2% → 69.1%로 확장했다.

| 도메인 | 신규 detector | 비고 |
|--------|:------------:|------|
| lpon-refund (F427) | 3개 | BL-024/026/029 + Hybrid NL parser |
| charge/payment/refund (F429) | 7개 | Threshold/Status/Atomic 원형 3종 |
| lpon-gift (F431) | **0** | withRuleId 재사용 |
| lpon-settlement (F432) | **0** | withRuleId 재사용 |
| lpon-budget/purchase (F433) | **0** | withRuleId 재사용 (parser 1줄) |
| miraeasset-pension (F436) | **0** | withRuleId 재사용 |

→ 신규 도메인 추가 비용이 "detector 코드 0줄 + rules.md + source PoC" 수준으로 수렴됨.
