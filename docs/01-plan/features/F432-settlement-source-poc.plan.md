---
id: AIF-PLAN-063
title: "F432 — settlement source PoC (4 BL BL-033/034/035/036 PRESENCE 입증, detector coverage 44.7→55.3%)"
sprint: 265
f_items: [F432]
req: AIF-REQ-035
related_features: [F428, F429, F430, F431]
status: PLANNED
created: "2026-05-06"
author: "Master + autopilot WT (session 277, Sprint 265)"
related: [AIF-PLAN-062, AIF-PLAN-061, AIF-PLAN-060]
---

# F432 — settlement source PoC

## Background

Sprint 264(F431)에서 lpon-gift 5 BL PRESENCE 자동 입증으로 detector coverage 31.6% → 44.7% 도달. 잔여 spec-only 도메인 중 settlement(BL-031~036)가 detector 매칭 가능성 높은 다음 후보 — **핵심 4건(BL-033/034/035/036)**에 atomic transaction + threshold + status transition 패턴 일관 적용 가능.

**현 상태 진단** (Sprint 264 종결 시점):
- detector REGISTRY: **17종** (5 specific + 3 universal × N withRuleId).
- coverage: **44.7%** (17/38 BL, refund 6 + charge 4 + payment 2 + gift 5).
- spec-only 잔여: settlement 6(BL-031~036) + budget 0(parser 미인식) + purchase 0(parser 미인식).
- settlement 4 BL ROI: BL-033(BATCH atomic)/BL-034(반복 atomic)/BL-035(기간 검증 threshold)/BL-036(fee_flag Y/N status transition) — **신규 detector 0개, withRuleId 재사용**.

## Objective

DoD:
- (a) `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/settlement.ts` 신규 (~150~200 lines, 4 함수: runBatchSettlement/processCalculations/getSettlementCheck/applyFeeAdjustment + SettlementError).
- (b) `반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/settlement.test.ts` 신규 (vitest in-memory better-sqlite3, ≥10 cases).
- (c) `scripts/divergence/domain-source-map.ts` lpon-settlement entry sourcePath null → 실 경로, sourceCodeStatus "spec-only" → "present", underImplTargets 4 함수.
- (d) `packages/utils/src/divergence/bl-detector.ts` BL_DETECTOR_REGISTRY 4 신규 매핑:
  - BL-033 → withRuleId(detectAtomicTransaction, ...) — BATCH 트랜잭션
  - BL-034 → withRuleId(detectAtomicTransaction, ...) — 반복 처리 atomic
  - BL-035 → withRuleId(detectThresholdCheck, ...) — 기간 파라미터 검증
  - BL-036 → withRuleId(detectStatusTransition, ...) — fee_reflected Y/N
- (e) `packages/utils/src/divergence/provenance-cross-check.ts` DETECTOR_SUPPORTED_RULES 17 → 21.
- (f) `packages/utils/test/bl-detector.test.ts` settlement fixture +6 cases (PRESENCE 4 + ABSENCE 2).
- (g) `npx tsx scripts/divergence/detect-bl.ts --all-domains` 실측 → settlement 4 BL PRESENCE + coverage **21/38 = 55.3%** (+10.6%p) 검증.
- (h) `reports/sprint-265-settlement-source-poc-2026-05-06.{json,md}` 실파일.
- (i) `npx tsx scripts/divergence/write-provenance.ts --container lpon-settlement --apply` 실행 — manual markers 부재 시 0 changes (Sprint 263/264 자연 패턴 일관).
- (j) Match Rate ≥ 90% + working-version vitest + utils pnpm test + typecheck/lint 전부 PASS.

## Scope

### In Scope
- settlement.ts source code (4 함수, BL-033~036 비즈니스 룰 매핑).
- settlement.test.ts (in-memory sqlite, 합성 schema CREATE TABLE: calculations, calculation_transactions, settlement_summaries).
- DOMAIN_MAP + bl-detector REGISTRY 매핑 + 단위 테스트.
- detect-bl 실측 + reports.
- provenance.yaml apply (lpon-settlement).
- SPEC.md §5/§6 갱신.

### Out of Scope
- BL-031/032 매핑 — 사용자 결정(핵심 4건만). "거래 0건 시 집계 생략" + upsert 패턴은 detector 모호.
- 실 schema migration (PoC scope 외).
- BATCH 스케줄러/cron 구현 (단위 함수만 PoC).

## Implementation Plan

### Step 1: Plan + SPEC §6 등록 (0.5h)
SPEC.md §6 Sprint 265 블록 + §1/§5 갱신 + F432 PLANNED.

### Step 2: settlement.ts source 작성 (2h)
4 함수:
- `runBatchSettlement(db, periodStart, periodEnd)` — BL-033: db.transaction()으로 calculations/calculation_transactions 조회 + settlement_summaries 갱신 (atomic).
- `processCalculations(db, calculationIds)` — BL-034: 반복 처리, 각 row를 db.transaction() 내에서 갱신 (atomic).
- `getSettlementCheck(db, fromDate, toDate)` — BL-035: 기간 파라미터 검증(`from`/`to` 비교 + 60일 한도 threshold).
- `applyFeeAdjustment(db, summaryId, feeReflected)` — BL-036: `fee_reflected === 'Y'` vs `=== 'N'` status transition + INVALID_FEE_FLAG 에러.

### Step 3: settlement.test.ts 작성 (1h)
in-memory better-sqlite3 + 합성 schema CREATE (3 tables). ≥10 cases:
1. runBatchSettlement PASS — calculations 3건 → settlement_summaries 1행 생성
2. runBatchSettlement empty — 거래 0건 시 BatchSkipped 이벤트
3. processCalculations atomic — 4 rows 반복, 각 update commit
4. processCalculations rollback — 3rd row 실패 시 전체 롤백
5. getSettlementCheck valid — from < to + 60일 이내 → 정상 반환
6. getSettlementCheck invalid range — to < from → HTTP 400
7. getSettlementCheck threshold — 60일 초과 → HTTP 422
8. applyFeeAdjustment Y → 수수료 차감
9. applyFeeAdjustment N → 전액 정산
10. applyFeeAdjustment NULL → INVALID_FEE_FLAG 에러
11. applyFeeAdjustment 'X' → INVALID_FEE_FLAG 에러

### Step 4: DOMAIN_MAP + REGISTRY + 단위 테스트 갱신 (0.5h)
- domain-source-map.ts lpon-settlement entry 활성화 + underImplTargets 4 함수.
- bl-detector.ts REGISTRY +4 entries (BL-033/034 atomic, BL-035 threshold, BL-036 status).
- DETECTOR_SUPPORTED_RULES 17 → 21.
- bl-detector.test.ts settlement fixture +6 cases (PRESENCE 4 + ABSENCE 2).
- REGISTRY size assertion 17 → 21 갱신.

### Step 5: detect-bl 실측 + provenance.yaml apply (0.5h)
- working-version vitest run settlement.test.ts (≥10 PASS).
- packages/utils pnpm test (145 → 151 PASS).
- typecheck/lint clean.
- detect-bl --all-domains → 21/38 = 55.3% 도달 + settlement 4 BL 0 ABSENCE.
- write-provenance.ts --container lpon-settlement --apply → manual markers 부재 시 0 changes (자연 결과).
- reports JSON+MD 생성.

### Step 6: Analysis + Report + commit (0.5h)
AIF-RPRT-063 + SPEC §6 [x] 마킹 + MEMORY.md 갱신 + Conventional commit + push.

## DoD

- ✅ settlement.ts (4 함수, ~150-200 lines) + SettlementError
- ✅ settlement.test.ts (≥10 cases PASS)
- ✅ DOMAIN_MAP lpon-settlement entry 활성화
- ✅ BL_DETECTOR_REGISTRY 4 신규 (BL-033/034 atomic, BL-035 threshold, BL-036 status)
- ✅ DETECTOR_SUPPORTED_RULES 17 → 21
- ✅ bl-detector.test.ts settlement fixture +6 cases
- ✅ detect-bl --all-domains → 21/38 = 55.3% (+10.6%p) 검증
- ✅ provenance.yaml apply 실행 (manual markers 부재 시 0 changes 자연 패턴)
- ✅ Match Rate ≥ 90% + typecheck/lint/test green

## Risk

- **R1**: BL-033/034 모두 atomic transaction → 같은 detector 결과. file-level PRESENCE 판정이라 file 1개에 db.transaction() 1회만 있어도 둘 다 PASS. 의도된 동작 (Sprint 264 BL-G002~G005 동일 패턴).
- **R2**: BL-035 threshold detector가 일반 비교문(`from < to`) 매칭 실패 — 60일 한도 같은 명시적 literal/UPPERCASE_CONSTANT 비교가 detector pattern. `MAX_PERIOD_DAYS = 60` 같은 const 사용으로 매칭 보장.
- **R3**: BL-036 fee_reflected가 string 'Y'/'N'이라 Sprint 262 detectStatusTransition 패턴(`status === 'X'` + `status: 'Y'`) 매칭 가능. STATUS_FIELD_PATTERN regex 확인 필요 — `fee_reflected` 또는 `feeReflected` 변수명이 매칭 범위인지 사전 점검.
- **R4**: autopilot Production Smoke Test 14회차 변종 위험 (S243+ 누적 패턴) — autopilot이 reports에 evidence 미첨부 가능. Master pull 후 ps + grep + reports/ 디렉토리 ls 실측 필수.

## References

- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/gift.ts` (Sprint 264 F431 5 함수 패턴 reference)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/charging.ts` (db.transaction + threshold check 패턴)
- `.decode-x/spec-containers/lpon-settlement/rules/settlement-rules.md` (6 BL 정의)
- `packages/utils/src/divergence/bl-detector.ts` (17 detector REGISTRY)
- AIF-PLAN-059~062 (Sprint 261~264, multi-domain detector 시리즈)
