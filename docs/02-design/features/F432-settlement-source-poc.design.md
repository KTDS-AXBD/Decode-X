---
id: AIF-DSGN-063
title: "F432 — settlement source PoC Design (4 BL BL-033/034/035/036)"
sprint: 265
f_items: [F432]
plan_ref: AIF-PLAN-063
status: APPROVED
created: "2026-05-06"
author: "Master + autopilot WT (session 277, Sprint 265)"
---

# F432 — settlement source PoC Design

## §1 목표

Sprint 264(F431 gift) 패턴을 settlement 도메인에 동일 적용한다.
신규 detector 0개, `withRuleId` 재사용으로 BL-033/034/035/036 PRESENCE 자동 입증.
coverage 44.7% (17/38) → **55.3% (21/38)** (+10.6%p).

## §2 파일 변경 목록

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/settlement.ts` | 신규 | 4 함수 + SettlementError |
| `반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/settlement.test.ts` | 신규 | ≥10 cases, in-memory better-sqlite3 |
| `scripts/divergence/domain-source-map.ts` | 수정 | lpon-settlement sourcePath + underImplTargets |
| `packages/utils/src/divergence/bl-detector.ts` | 수정 | REGISTRY +4 (BL-033/034/035/036) |
| `packages/utils/src/divergence/provenance-cross-check.ts` | 수정 | DETECTOR_SUPPORTED_RULES +4 |
| `packages/utils/test/bl-detector.test.ts` | 수정 | settlement fixture +6 cases, size 17→21 |
| `reports/sprint-265-settlement-source-poc-2026-05-06.json` | 신규 | evidence JSON |
| `reports/sprint-265-settlement-source-poc-2026-05-06.md` | 신규 | evidence MD |

## §3 settlement.ts 함수 설계

### BL-033: runBatchSettlement (atomic transaction)
```typescript
function runBatchSettlement(db: Database, periodStart: string, periodEnd: string): SettlementResult
```
- `db.transaction()` 내에서 calculations/calculation_transactions 조회
- settlement_summaries upsert (charge_count/amount + refund_count/amount)
- 거래 0건: `BatchSkipped` 이벤트 반환
- BL-033 detector: `detectAtomicTransaction` 매칭 ← db.transaction() 사용

### BL-034: processCalculations (반복 atomic)
```typescript
function processCalculations(db: Database, calculationIds: string[]): ProcessResult
```
- 각 row별 `db.transaction()` 내 갱신 (calculations + calculation_transactions)
- 실패 시 해당 row rollback, 나머지 계속
- BL-034 detector: `detectAtomicTransaction` 매칭 ← db.transaction() 사용

### BL-035: getSettlementCheck (threshold)
```typescript
function getSettlementCheck(db: Database, fromDate: string, toDate: string): SettlementCheckResult
```
- `MAX_PERIOD_DAYS = 60` 상수 정의 (detector 매칭용 literal)
- from < to 검증 → 위반 시 HTTP 400 (`SettlementError('E400-RANGE', ...)`)
- 60일 한도 검증 → 위반 시 HTTP 422 (`SettlementError('E422-THRESHOLD', ...)`)
- BL-035 detector: `detectThresholdCheck` 매칭 ← `MAX_PERIOD_DAYS` 비교 패턴

### BL-036: applyFeeAdjustment (status transition)
```typescript
function applyFeeAdjustment(db: Database, summaryId: string, feeReflected: string): AdjustResult
```
- `feeReflected === 'Y'`: 수수료 차감 후 정산
- `feeReflected === 'N'`: 전액 정산
- NULL/기타: `INVALID_FEE_FLAG` 에러 → HTTP 422
- BL-036 detector: `detectStatusTransition` 매칭 ← `feeReflected === 'Y'` / `=== 'N'`

### SettlementError
```typescript
class SettlementError extends Error {
  constructor(code: string, message: string, httpStatus: number)
}
```

## §4 settlement.test.ts 테스트 계획 (TDD Red Target)

합성 스키마 3 tables: `calculations`, `calculation_transactions`, `settlement_summaries`

| # | 테스트 케이스 | 결과 |
|---|-------------|------|
| 1 | runBatchSettlement PASS — calculations 3건 → settlement_summaries 1행 생성 | PASS |
| 2 | runBatchSettlement empty — 거래 0건 시 BatchSkipped | PASS |
| 3 | processCalculations atomic — 4 rows 반복, 각 update commit | PASS |
| 4 | processCalculations rollback — 3rd row 실패 시 전체 롤백 | PASS |
| 5 | getSettlementCheck valid — from < to + 60일 이내 | PASS |
| 6 | getSettlementCheck invalid range — to < from → 400 | PASS |
| 7 | getSettlementCheck threshold — 61일 → 422 | PASS |
| 8 | applyFeeAdjustment Y → 수수료 차감 | PASS |
| 9 | applyFeeAdjustment N → 전액 정산 | PASS |
| 10 | applyFeeAdjustment NULL → INVALID_FEE_FLAG | PASS |
| 11 | applyFeeAdjustment 'X' → INVALID_FEE_FLAG | PASS |

## §5 REGISTRY 매핑 (BL-033~036)

```typescript
// Sprint 265 (F432) — settlement domain (atomic × 2, threshold × 1, status × 1)
"BL-033": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-033"),
"BL-034": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-034"),
"BL-035": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-035"),
"BL-036": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-036"),
```

DETECTOR_SUPPORTED_RULES: 17 → 21 (BL-033/034/035/036 추가)

## §6 detect-bl 예상 결과

```
settlement (lpon-settlement):
  BL-031: ABSENCE  (spec-only, BL-031/032 skip)
  BL-032: ABSENCE  (spec-only, BL-031/032 skip)
  BL-033: PRESENCE ← detectAtomicTransaction
  BL-034: PRESENCE ← detectAtomicTransaction
  BL-035: PRESENCE ← detectThresholdCheck (MAX_PERIOD_DAYS)
  BL-036: PRESENCE ← detectStatusTransition (fee_reflected Y/N)

coverage: 21/38 = 55.3% (+10.6%p from 17/38 = 44.7%)
```

## §7 Design → Implementation Gap 체크포인트

| DoD 항목 | 검증 방법 |
|---------|----------|
| settlement.ts 4 함수 | vitest settlement.test.ts ≥10 PASS |
| REGISTRY 21종 | `Object.keys(BL_DETECTOR_REGISTRY).length === 21` assert |
| coverage 55.3% | `detect-bl --all-domains` 실측 출력 |
| reports 실파일 2건 | `ls reports/sprint-265-*.{json,md}` |
| typecheck/lint | `pnpm typecheck && pnpm lint` |
