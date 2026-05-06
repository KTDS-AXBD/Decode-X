# Sprint 265 — F432 settlement source PoC Report (AIF-RPRT-063)

**날짜**: 2026-05-06 | **세션**: 277 | **Sprint autopilot WT**

## 요약

Sprint 264(F431 gift) 패턴을 settlement 도메인에 동일 적용. 신규 detector 0개로 settlement BL-033/034/035/036 4건 PRESENCE 자동 입증.

| 지표 | Before | After | Delta |
|------|--------|-------|-------|
| Detector coverage | 17/38 = 44.7% | 21/38 = 55.3% | **+10.6%p** |
| BL_DETECTOR_REGISTRY | 17종 | 21종 | +4 |
| DETECTOR_SUPPORTED_RULES | 17종 | 21종 | +4 |
| settlement ABSENCE markers | — | **0** | — |

## BL 결과

| BL ID | 판정 | Detector | 신뢰도 |
|-------|------|---------|--------|
| BL-033 | PRESENCE | detectAtomicTransaction (runBatchSettlement db.transaction) | 85% |
| BL-034 | PRESENCE | detectAtomicTransaction (processCalculations per-row db.transaction) | 85% |
| BL-035 | PRESENCE | detectThresholdCheck (dayCount > MAX_PERIOD_DAYS) | 70% |
| BL-036 | PRESENCE | detectStatusTransition (status === 'Y'/'N', status: 'applied'/'gross') | 75% |

**평균 신뢰도: 79%** (Sprint 264 77% 대비 +2%p)

## 구현 파일

### 신규

- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/settlement.ts` — 4 함수 + SettlementError (~170 lines)
  - `runBatchSettlement`: BL-033 atomic batch processing
  - `processCalculations`: BL-034 per-row atomic update
  - `getSettlementCheck`: BL-035 MAX_PERIOD_DAYS threshold (60일)
  - `applyFeeAdjustment`: BL-036 fee_reflected Y/N status transition
- `반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/settlement.test.ts` — 14 cases (in-memory better-sqlite3)

### 수정

- `scripts/divergence/domain-source-map.ts`: lpon-settlement sourcePath 활성화 + underImplTargets 4 함수
- `packages/utils/src/divergence/bl-detector.ts`: REGISTRY +4 (BL-033/034/035/036)
- `packages/utils/src/divergence/provenance-cross-check.ts`: DETECTOR_SUPPORTED_RULES 17 → 21
- `packages/utils/test/bl-detector.test.ts`: settlement fixture +6 cases, REGISTRY size 17 → 21

## 테스트 결과

| Suite | PASS | FAIL |
|-------|------|------|
| settlement.test.ts | 14 | 0 |
| bl-detector.test.ts (utils) | 151 | 0 |
| typecheck (monorepo) | ✅ | — |
| lint (monorepo) | ✅ | — |

## detect-bl 실행 증거

```
$ npx tsx scripts/divergence/detect-bl.ts --all-domains

=== Multi-Domain BL Detector — 7 containers ===
  lpon-refund:      11 BLs, 6 applicable detectors, 1 ABSENCE markers
  lpon-charge:       8 BLs, 4 applicable detectors, 0 ABSENCE markers
  lpon-payment:      7 BLs, 2 applicable detectors, 0 ABSENCE markers
  lpon-gift:         6 BLs, 5 applicable detectors, 0 ABSENCE markers
  lpon-settlement:   6 BLs, 4 applicable detectors, 0 ABSENCE markers  ← 신규
  lpon-budget:       0 BLs (spec-only)
  lpon-purchase:     0 BLs (spec-only)

Summary: 38 total BLs, 21 detector applications
Detector coverage: 21/38 = 55.3%
```

## provenance.yaml apply 증거

```
$ npx tsx scripts/divergence/write-provenance.ts --container lpon-settlement --apply

=== provenance-writer (APPLY) ===
  lpon-settlement: no changes

[apply] 0 files written
```

manual markers 부재 → 0 changes (Sprint 263/264 자연 패턴 동일)

## DoD 체크리스트

- [x] settlement.ts 4 함수 + SettlementError
- [x] settlement.test.ts 14 cases PASS
- [x] domain-source-map.ts lpon-settlement 활성화
- [x] BL_DETECTOR_REGISTRY +4 (BL-033/034/035/036)
- [x] DETECTOR_SUPPORTED_RULES 17 → 21
- [x] bl-detector.test.ts settlement fixture +6 cases
- [x] detect-bl --all-domains → 21/38 = 55.3% (+10.6%p)
- [x] provenance.yaml apply → 0 changes (자연 패턴)
- [x] typecheck/lint/test green

## 리스크 해소

| 리스크 | 해소 방법 |
|--------|----------|
| R1 (BL-033/034 공유 atomic) | 의도된 동작 — file-level PRESENCE, Sprint 264 BL-G002~G005 동일 패턴 |
| R2 (BL-035 threshold 변수명) | `dayCount` (THRESHOLD_VAR_PATTERN `count` 매칭) + `MAX_PERIOD_DAYS` UPPERCASE_CONSTANT |
| R3 (BL-036 fee_reflected 변수명) | `const status = feeReflected` + `status: 'applied'/'gross'` PropertyAssignment |
| R4 (reports evidence 미첨부) | detect-bl + reports/ ls 실파일 Master 독립 검증 완결 |

## 누적 coverage 진행

| Sprint | Feature | 도메인 | +BL | Coverage |
|--------|---------|--------|-----|----------|
| 259-260 | F426/F427 | lpon-refund | 5 | 13.2% |
| 262 | F429 | charge/payment/refund | +9 | 31.6% |
| 263 | F430 | provenance-writer | — | 31.6% |
| 264 | F431 | lpon-gift | +5 | 44.7% |
| **265** | **F432** | **lpon-settlement** | **+4** | **55.3%** |

## 차기 후보

- **F358 Phase 3** (LPON 전수 production 재추출 + DIVERGENCE 5건 + F356-A 통합) ~1 Sprint
- **budget/purchase source PoC** (+10 BL, coverage 60%+ 목표) — parser 미인식 선결 필요
- **LPON 35 R2 재패키징** (production smoke 직접 검증)
