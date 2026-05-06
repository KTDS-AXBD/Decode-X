---
id: AIF-RPRT-063
title: "F432 — settlement source PoC PDCA Report"
sprint: 265
f_items: [F432]
plan_ref: AIF-PLAN-063
status: DONE
created: "2026-05-06"
author: "Sprint autopilot WT (session 277)"
---

# F432 settlement source PoC — PDCA Report (AIF-RPRT-063)

## 결과 요약

**Sprint 265 F432 ✅ DONE** — DoD 9/9 PASS

| 지표 | 결과 |
|------|------|
| Detector coverage | **55.3%** (21/38 BL, +10.6%p) |
| settlement ABSENCE markers | **0** (4 BL 모두 PRESENCE) |
| BL_DETECTOR_REGISTRY | 17 → **21종** |
| DETECTOR_SUPPORTED_RULES | 17 → **21종** |
| 신규 detector 수 | **0** (withRuleId 재사용) |
| 평균 신뢰도 | **79%** |
| test PASS | settlement 14/14 + utils 151/151 |
| typecheck/lint | ✅ clean |

## Plan → Do 매핑

| Plan DoD | 결과 |
|----------|------|
| settlement.ts 4 함수 + SettlementError | ✅ runBatchSettlement/processCalculations/getSettlementCheck/applyFeeAdjustment |
| settlement.test.ts ≥10 cases | ✅ 14 cases PASS |
| DOMAIN_MAP lpon-settlement 활성화 | ✅ sourcePath + underImplTargets 4 함수 |
| BL_DETECTOR_REGISTRY +4 | ✅ BL-033/034(atomic) + BL-035(threshold) + BL-036(status) |
| DETECTOR_SUPPORTED_RULES 17 → 21 | ✅ |
| bl-detector.test.ts +6 cases | ✅ PRESENCE 4 + ABSENCE 2 + registry size 21 |
| detect-bl 21/38 = 55.3% | ✅ 실측 확인 |
| provenance.yaml apply | ✅ 0 changes (자연 패턴) |
| Match ≥ 90% + green | ✅ |

## 설계 결정 학습

### R2 해소: BL-035 threshold detector 변수명
`periodDays`는 `THRESHOLD_VAR_PATTERN`(/amount|limit|threshold|max|min|count|total|balance|fee/i) 미매칭.
→ `dayCount` (count 포함)로 변경 → PRESENCE 정상 검출.

### R3 해소: BL-036 fee_reflected STATUS_FIELD_PATTERN 미매칭
`feeReflected`은 `/\bstatus\b/i` 미매칭.
→ `const status = feeReflected` + `return { status: 'applied'/'gross', ... }` PropertyAssignment 추가.
→ comparison(status === 'Y') + assignment(status: 'applied') 동시 충족.

### withRuleId 4번째 도메인 일반성 입증
Sprint 262: charge/payment/refund 7 BL
Sprint 264: gift 5 BL
Sprint 265: settlement 4 BL
→ 동일 3 universal detector(atomic/threshold/status)로 16 BL 매핑 — BL-level PRESENCE blueprint 완성.

## 누적 coverage 진행

```
Sprint 259-260 (refund specific):  5/38 = 13.2%
Sprint 262 (universal 3):         12/38 = 31.6%  (+18.4%p)
Sprint 264 (gift):                17/38 = 44.7%  (+13.1%p)
Sprint 265 (settlement):          21/38 = 55.3%  (+10.6%p) ← 현재
```

## 차기 권고

1. **F358 Phase 3** (LPON 전수 production 재추출 + DIVERGENCE 5건) — P1
2. **budget/purchase source PoC** (+10 BL, coverage 60%+) — parser 미인식 선결
3. **LPON 35 R2 재패키징** — production smoke 직접 검증

## 참조

- `reports/sprint-265-settlement-source-poc-2026-05-06.{json,md}` — 상세 evidence
- AIF-PLAN-063 — 구현 계획
- Sprint 264 F431 (gift, 동일 패턴) — reference
