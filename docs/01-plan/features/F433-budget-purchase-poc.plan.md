---
id: AIF-PLAN-064
title: "F433 — budget·purchase parser 보강 + source PoC (10 BL PRESENCE 입증, coverage 55.3→64.6%)"
sprint: 266
f_items: [F433]
req: AIF-REQ-035
related_features: [F428, F429, F430, F431, F432]
status: PLANNED
created: "2026-05-06"
author: "Master inline (session 278, Sprint 266)"
related: [AIF-PLAN-063, AIF-PLAN-062, AIF-PLAN-059]
---

# F433 — budget·purchase parser 보강 + source PoC

## Background

Sprint 261(F428)에서 multi-domain parser 도입 시 38 BL 매칭 — refund 11 + charge 8 + payment 7 + gift 6 + settlement 6. budget(BB-001~005)/purchase(BP-001~005)는 BL prefix가 `BL-` 외이라 parser 미인식 (parser regex `/^BL-[A-Z]?\d{1,3}$/`).

본 Sprint는 (1) parser regex 확장으로 BB/BP/BG/BS prefix 매칭 + (2) budget/purchase source PoC로 10 BL PRESENCE 자동 입증.

**현 상태 진단** (Sprint 265 종결 시점):
- detector REGISTRY: **21종** (5 specific + 3 universal × N withRuleId).
- coverage: **55.3%** (21/38 BL, refund 6 + charge 4 + payment 2 + gift 5 + settlement 4).
- parser 미인식: budget 5 + purchase 5 = **10 BL** (BB/BP prefix).
- 10 BL ROI: 모두 Threshold + Status transition + Atomic transaction 패턴 적합 — **신규 detector 0개, withRuleId 재사용**.

## Objective

DoD:
- (a) `packages/utils/src/divergence/rules-parser.ts` `BL_ID_PATTERN` regex 확장 — `/^(BL|BB|BP|BG|BS)-[A-Z]?\d{1,3}$/`. 회귀 0 (BL/BL-G prefix 매칭 유지).
- (b) `packages/utils/test/rules-parser.test.ts` +2 cases (BB/BP prefix 매칭 검증).
- (c) `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/budget.ts` 신규 (~150~200 lines, 5 함수: allocateBudget BB-001 / deductForCharge BB-002 / checkLowBalanceAlert BB-003 / rolloverBudget BB-004 / refundDeductedBudget BB-005 + BudgetError).
- (d) `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/purchase.ts` 신규 (~150~200 lines, 5 함수: requestPurchase BP-001 / completePurchase BP-002 / checkMonthlyLimit BP-003 / handleIdempotentPurchase BP-004 / refundUnusedPurchase BP-005 + PurchaseError).
- (e) `budget.test.ts` + `purchase.test.ts` 각 ≥10 cases (in-memory better-sqlite3, 합성 schema budget_ledger / purchase_transactions / vouchers).
- (f) `scripts/divergence/domain-source-map.ts` lpon-budget + lpon-purchase entry 활성화 (sourcePath/underImplTargets).
- (g) `packages/utils/src/divergence/bl-detector.ts` BL_DETECTOR_REGISTRY +10 entries:
  - BB-001 → withRuleId(detectThresholdCheck) — 한도 검증
  - BB-002 → withRuleId(detectThresholdCheck) — 잔액 ≥ 충전 금액
  - BB-003 → withRuleId(detectThresholdCheck) — 10% 임계치
  - BB-004 → withRuleId(detectStatusTransition) — rollover_yn Y/N + status=EXPIRED
  - BB-005 → withRuleId(detectAtomicTransaction) — 차감 + 롤백
  - BP-001 → withRuleId(detectThresholdCheck) — 1회 구매 한도
  - BP-002 → withRuleId(detectStatusTransition) — payment 완료/실패
  - BP-003 → withRuleId(detectThresholdCheck) — 월 한도
  - BP-004 → withRuleId(detectStatusTransition) — completed/processing
  - BP-005 → withRuleId(detectThresholdCheck) — 7일 이내 + 잔액=액면가
- (h) `packages/utils/src/divergence/provenance-cross-check.ts` DETECTOR_SUPPORTED_RULES 21 → 31.
- (i) `packages/utils/test/bl-detector.test.ts` budget/purchase fixture +10 cases (PRESENCE).
- (j) `npx tsx scripts/divergence/detect-bl.ts --all-domains` 실측 → 31/48 = **64.6%** (+9.3%p) 검증. (38 → 48 BL: budget/purchase parser 인식으로 +10).
- (k) `reports/sprint-266-budget-purchase-poc-2026-05-06.{json,md}` 실파일.
- (l) `npx tsx scripts/divergence/write-provenance.ts --container lpon-budget --apply` + `--container lpon-purchase --apply` 실행 (manual markers 부재 시 0 changes 자연 패턴).
- (m) Match Rate ≥ 90% + working-version vitest + utils pnpm test (151 → 173 PASS) + typecheck/lint clean.

## Scope

### In Scope
- parser regex 확장 (BB/BP/BG/BS prefix).
- budget.ts + purchase.ts source code (각 5 함수).
- budget.test.ts + purchase.test.ts.
- DOMAIN_MAP + REGISTRY 매핑 + 단위 테스트.
- detect-bl 실측 + reports.
- provenance.yaml apply (양 도메인).
- SPEC.md §5/§6 갱신.

### Out of Scope
- 실 schema migration (PoC scope 외).
- BB/BP 외 prefix 추가 (BG/BS는 향후 도메인용 placeholder).
- budget_allocations / purchase_history table 구현 (PoC scope 외).

## Implementation Plan

### Step 1: Plan + SPEC §6 등록 (0.5h)
SPEC.md §6 Sprint 266 블록 + §1/§5 Last Updated + F433 PLANNED.

### Step 2: parser regex 확장 (0.5h)
- BL_ID_PATTERN: `/^(BL|BB|BP|BG|BS)-[A-Z]?\d{1,3}$/`.
- rules-parser.test.ts +2 cases (BB-001 + BP-001 매칭 검증).
- 기존 38 BL 회귀 0 검증.

### Step 3: budget.ts source 작성 (1.5h)
5 함수:
- `allocateBudget(db, companyId, amount, maxLimit)` — BB-001: amount > 0 AND amount ≤ maxLimit threshold + budget_ledger INSERT.
- `deductForCharge(db, employeeId, amount)` — BB-002: balance ≥ amount threshold + balance 차감.
- `checkLowBalanceAlert(db, companyId)` — BB-003: balance ≤ allocated × 0.1 threshold + 알림.
- `rolloverBudget(db, ledgerId)` — BB-004: rollover_yn === 'Y' status check + status='EXPIRED' transition.
- `refundDeductedBudget(db, ledgerId, amount)` — BB-005: db.transaction() atomic 복구 + rollback.

### Step 4: purchase.ts source 작성 (1.5h)
5 함수:
- `requestPurchase(db, userId, amount, perPurchaseLimit)` — BP-001: amount > 0 AND amount ≤ perPurchaseLimit threshold.
- `completePurchase(db, purchaseId)` — BP-002: status === 'pending' check + status='completed' + vouchers INSERT.
- `checkMonthlyLimit(db, userId, amount, monthlyLimit)` — BP-003: monthly sum + amount ≤ monthlyLimit threshold.
- `handleIdempotentPurchase(db, requestId)` — BP-004: status === 'completed' check + 기존 voucher_id 반환 / status='processing' 시 HTTP 409.
- `refundUnusedPurchase(db, voucherId)` — BP-005: daysSincePurchased ≤ 7 threshold + balance === face_amount check.

### Step 5: tests 작성 (1h)
- budget.test.ts: ≥10 cases (in-memory sqlite, 합성 schema budget_ledger).
- purchase.test.ts: ≥10 cases (합성 schema purchase_transactions/vouchers).

### Step 6: DOMAIN_MAP + REGISTRY + 단위 테스트 갱신 (0.5h)
- domain-source-map.ts lpon-budget + lpon-purchase entries 활성화.
- bl-detector.ts REGISTRY +10 entries.
- DETECTOR_SUPPORTED_RULES 21 → 31.
- bl-detector.test.ts budget/purchase fixture +10 cases.
- REGISTRY size assertion 21 → 31 갱신.

### Step 7: detect-bl 실측 + provenance apply + reports (0.5h)
- working-version vitest run (≥20 PASS, budget 10 + purchase 10).
- packages/utils pnpm test (151 → 173 PASS, +22).
- typecheck/lint clean.
- detect-bl --all-domains → 31/48 = 64.6% 도달 + budget/purchase 10 BL 0 ABSENCE.
- write-provenance.ts --container lpon-budget --apply + --container lpon-purchase --apply (자연 0 changes).
- reports JSON+MD 생성.

### Step 8: Analysis + Report + commit + push (0.5h)
- AIF-RPRT-064 + SPEC §6 [x] + §1/§5 갱신.
- CHANGELOG 세션 278 entry.
- Conventional commit + push.

## DoD

- ✅ parser regex `/^(BL|BB|BP|BG|BS)-[A-Z]?\d{1,3}$/` + 회귀 0
- ✅ budget.ts + purchase.ts 각 ~150-200 lines, 5 함수 + Error class
- ✅ budget.test.ts + purchase.test.ts ≥20 cases PASS
- ✅ DOMAIN_MAP 양 도메인 활성화 + underImplTargets 5 함수씩
- ✅ BL_DETECTOR_REGISTRY 21 → 31 (+10) + DETECTOR_SUPPORTED_RULES 21 → 31
- ✅ bl-detector.test.ts +10 cases (PRESENCE) + REGISTRY size 31 검증
- ✅ detect-bl --all-domains → 31/48 = 64.6% (+9.3%p)
- ✅ provenance apply 실행 (자연 0 changes 패턴 일관)
- ✅ Match Rate ≥ 90% + typecheck/lint/test green

## Risk

- **R1**: parser regex 확장이 기존 BL/BL-G prefix 매칭 회귀 — boundary tests로 사전 차단.
- **R2**: BB-003 (balance ≤ allocated × 0.1) Threshold detector matching — `>` 비교문 + UPPERCASE_CONSTANT 매칭 패턴이라 `0.1` literal로는 false negative 가능. 명시적 const 사용.
- **R3**: BP-004 idempotent check이 status string 비교 + voucher_id 반환만 → atomic transaction 부재 → BL-G004와 달리 detectStatusTransition 매칭만으로 충분.
- **R4**: BB-005 atomic rollback이 db.transaction() callback에서 rollback인지 외부 catch에서 인지 — Sprint 264/265 패턴 일관 (db.transaction() 내부에서 throw → 자동 롤백).

## References

- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/gift.ts` (Sprint 264 F431 패턴 reference)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/settlement.ts` (Sprint 265 F432 패턴 reference)
- `.decode-x/spec-containers/lpon-budget/rules/budget-rules.md` (BB-001~005)
- `.decode-x/spec-containers/lpon-purchase/rules/purchase-rules.md` (BP-001~005)
- `packages/utils/src/divergence/rules-parser.ts` BL_ID_PATTERN (line 18)
- `packages/utils/src/divergence/bl-detector.ts` (21 detector REGISTRY)
- AIF-PLAN-059~063 (Sprint 261~265 detector + source PoC 시리즈)
