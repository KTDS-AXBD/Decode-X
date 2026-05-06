---
id: AIF-RPRT-064
title: "Sprint 266 Report — F433 budget·purchase parser 보강 + source PoC"
sprint: 266
f_items: [F433]
status: DONE
match_rate: 95
created: "2026-05-06"
author: "Master inline (Sprint 266, session 278)"
related: [AIF-PLAN-064, AIF-PLAN-063, AIF-PLAN-062]
---

# Sprint 266 Report — F433 budget·purchase parser 보강 + source PoC

## Summary

**DONE Match 95%** — parser regex 확장(`/^(?:BL|BB|BP|BG|BS)-[A-Z]?\d{1,3}$/`)으로 BB/BP prefix 매칭 + budget/purchase 합성 source PoC. detector REGISTRY 21 → **31종** (**신규 detector 0개** — withRuleId 재사용 5번째/6번째 도메인). parser 인식 BL 38 → **48** (+10), 매핑 적용 detector 21 → **31** (+10), coverage **55.3% → 64.6%** (+9.3%p).

## Decisions (세션 278 사용자 인터뷰)

| 결정 | 선택 |
|------|------|
| BL Coverage | 10 BL 전체 (BB × 5 + BP × 5) |
| 모드 | Master inline |

## Deliverables

| 산출물 | 위치 | 규모 |
|--------|------|------|
| Parser regex | `packages/utils/src/divergence/rules-parser.ts` BL_ID_PATTERN | (BL\|BB\|BP\|BG\|BS) prefix 확장 |
| budget Source | `반제품-스펙/.../src/domain/budget.ts` | 200 lines, 5 함수 + BudgetError |
| purchase Source | `반제품-스펙/.../src/domain/purchase.ts` | 220 lines, 5 함수 + PurchaseError |
| budget Tests | `반제품-스펙/.../src/__tests__/budget.test.ts` | 13 cases PASS |
| purchase Tests | `반제품-스펙/.../src/__tests__/purchase.test.ts` | 13 cases PASS |
| DOMAIN_MAP | `scripts/divergence/domain-source-map.ts` | lpon-budget + lpon-purchase 활성화 |
| REGISTRY | `packages/utils/src/divergence/bl-detector.ts` | 21 → **31** entries (BB×5 + BP×5 withRuleId) |
| SUPPORTED_RULES | `packages/utils/src/divergence/provenance-cross-check.ts` | 21 → 31 |
| utils Tests | `packages/utils/test/{rules-parser,bl-detector}.test.ts` | +2 (parser BB/BP) + +6 (budget/purchase fixture) = 151 → **159 PASS** |
| Plan | `docs/01-plan/features/F433-budget-purchase-poc.plan.md` | AIF-PLAN-064 |

## Detect-bl Result (--all-domains)

```
=== Multi-Domain BL Detector — 7 containers ===
  lpon-refund     [source]: 11 BLs, 6 applicable, 1 ABSENCE (BL-026 ALT branch)
  lpon-charge     [source]:  8 BLs, 4 applicable, 0 ABSENCE
  lpon-payment    [source]:  7 BLs, 2 applicable, 0 ABSENCE
  lpon-gift       [source]:  6 BLs, 5 applicable, 0 ABSENCE
  lpon-settlement [source]:  6 BLs, 4 applicable, 0 ABSENCE
  lpon-budget     [source]:  5 BLs, 5 applicable, 0 ABSENCE   ← Sprint 266 신규 (parser+source)
  lpon-purchase   [source]:  5 BLs, 5 applicable, 0 ABSENCE   ← Sprint 266 신규 (parser+source)

Summary: 48 total BLs, 31 detector applications
Detector coverage: 31/48 = 64.6%
```

## Coverage Progression (Sprint 261 → 266)

| Sprint | F-item | 도메인 | Coverage | Detectors | 신규 detector |
|--------|--------|--------|----------|-----------|--------------|
| 261 | F428 | refund only | 13.2% (5/38) | 5 (refund specific) | 5 |
| 262 | F429 | charge/payment 추가 | 31.6% (12/38) | 12 (+ 3 universal) | 3 |
| 263 | F430 | provenance writer | 31.6% (idempotency) | 12 | 0 |
| 264 | F431 | gift 추가 | 44.7% (17/38) | 17 (+ 5 withRuleId) | 0 |
| 265 | F432 | settlement 추가 | 55.3% (21/38) | 21 (+ 4 withRuleId) | 0 |
| **266** | **F433** | **budget+purchase 추가** | **64.6% (31/48)** | **31 (+ 10 withRuleId)** | **0** |

## BL 매핑 (10 BL)

### Budget (BB-001~005)

| BL | Detector | 패턴 | 신뢰도 |
|----|----------|------|--------|
| BB-001 | detectThresholdCheck | amount > 0 AND amount ≤ MAX_LIMIT | 70% |
| BB-002 | detectThresholdCheck | balance ≥ amount | 70% |
| BB-003 | detectThresholdCheck | balance ≤ allocated × LOW_BALANCE_THRESHOLD_RATIO | 70% |
| BB-004 | detectStatusTransition | rollover_yn Y/N + status='rolled_over'/'EXPIRED' | 75% |
| BB-005 | detectAtomicTransaction | db.transaction(() => {...}) restore | 85% |

### Purchase (BP-001~005)

| BL | Detector | 패턴 | 신뢰도 |
|----|----------|------|--------|
| BP-001 | detectThresholdCheck | amount > 0 AND amount ≤ PER_PURCHASE_LIMIT | 70% |
| BP-002 | detectStatusTransition | status pending → completed + vouchers INSERT | 75% |
| BP-003 | detectThresholdCheck | monthly sum + amount ≤ MONTHLY_PURCHASE_LIMIT | 70% |
| BP-004 | detectStatusTransition | status === 'completed' / 'processing' | 75% |
| BP-005 | detectThresholdCheck | daysSincePurchased ≤ REFUND_PERIOD_DAYS | 70% |

평균 신뢰도: **74%** (Threshold 70% × 6 + Status 75% × 3 + Atomic 85% × 1).

## Validation

- working-version `pnpm exec vitest run budget.test.ts purchase.test.ts` → **26/26 PASS**
- packages/utils `pnpm test` → **159/159 PASS** (151 → 159, +8)
- typecheck/lint clean
- detect-bl --all-domains → 31/48 = 64.6% 정확 도달 + budget/purchase 0 ABSENCE markers
- write-provenance --apply (lpon-budget + lpon-purchase) → manual markers 부재 자연 결과 (Sprint 263~265 패턴 일관)

## Master inline 13회 연속 회피 패턴 유지 (S253~278)

Sprint 261(150 lines) → 262(+3 detector) → 263(430 lines) → 264(0 detector + gift 480 lines) → 265(0 detector + settlement 340 lines) → **266(parser regex 1 line + budget 200 + purchase 220 + tests 530)** — 6 Sprint 연속 인프라 누적 재활용 패턴 유지.

## Risks & Mitigations

| Risk | 실측 결과 | 대응 |
|------|---------|------|
| R1: parser regex 회귀 | 기존 38 BL 매칭 유지 | rules-parser.test.ts boundary tests 통과 |
| R2: BB-003 0.1 literal 매칭 | LOW_BALANCE_THRESHOLD_RATIO const 사용 | UPPERCASE_CONSTANT 매칭 통과 |
| R3: BP-004 atomic 부재 | detectStatusTransition으로 충분 | status === 'completed' check + status: 'processing' 매칭 |
| R4: BB-005 atomic rollback | db.transaction() throw → 자동 롤백 | atomicTransactionDetector 매칭 통과 |

## Next Steps

1. F358 Phase 3 (LPON 전수 production 재추출 + DIVERGENCE 5건 + F356-A 통합) ~1 Sprint
2. **잔여 spec-only 0건** — 7 containers 전부 source 활성화 완료. 신규 도메인 추가 시 동일 패턴 재사용 가능.
3. 보안 후속 (1Password 갱신, op signin 정상화)

## References

- Plan: `docs/01-plan/features/F433-budget-purchase-poc.plan.md`
- Source: budget.ts / purchase.ts
- Tests: budget.test.ts (13 cases) + purchase.test.ts (13 cases)
- Spec rules: lpon-budget/rules/budget-rules.md + lpon-purchase/rules/purchase-rules.md
- Multi-domain detect: scripts/divergence/detect-bl.ts (Sprint 261 F428)
- Universal detectors: packages/utils/src/divergence/bl-detector.ts (Sprint 262 F429)
- Provenance writer: scripts/divergence/write-provenance.ts (Sprint 263 F430)
