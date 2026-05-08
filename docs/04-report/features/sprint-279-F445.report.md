---
id: AIF-RPRT-077
sprint: 279
feature: F445
title: Threshold detector 확장 — 실행 보고서 (CC-001/002 ABSENCE 0 해소)
status: completed
created: 2026-05-08
related_plan: AIF-PLAN-077
match_rate: 95
mode: Master inline
---

# F445 Report — AIF-RPRT-077

## 실행 결과

| # | DoD | 결과 | 비고 |
|---|-----|------|------|
| 1 | detectThresholdCheck Path A 추가 | ✅ | UPPERCASE/literal 시 var-like 검증 skip. CC-001 `creditScore < MIN_CREDIT_SCORE` 대응 |
| 2 | detectThresholdCheck Path B 추가 | ✅ | var-var 양변 keyword 매칭. CC-002 `remainingLimit < amount` (left `limit` 매칭) 대응. `.` property access는 제외 |
| 3 | 신규 unit test 4건 추가 | ✅ | (a) Path A CC-001 case, (b) Path B CC-002 case, (c) false positive 회피 (i < j), (d) Path A reverse (0 < amount) |
| 4 | utils 174 unit test PASS | ✅ | 170 → 174 (+4 신규), 회귀 0 |
| 5 | typecheck PASS | ✅ | utils + types 모두 0 errors (turbo 우회) |
| 6 | credit-card 0 ABSENCE | ✅ | Sprint 278 2 ABSENCE → 0. 다른 11 containers 회귀 0 (lpon-refund 1 ABSENCE는 BL-026 OPEN 정상) |
| 7 | credit-card provenance.yaml status 갱신 | ✅ | CC-001/CC-002 status: OPEN → RESOLVED + resolvedBy="F445 Sprint 279" + resolvedAt + summary byStatus 갱신 (open 0 / resolved 2) |
| 8 | Plan + Report + SPEC | ✅ | AIF-PLAN-077 + AIF-RPRT-077 + (commit 시점 SPEC) |

**DoD 8/8 PASS — Match Rate 95%**

## 핵심 결과

```
=== Multi-Domain BL Detector — 12 containers ===
  ...
  credit-card [...]: 6 BLs, 6 applicable detectors, 0 ABSENCE markers  ← Sprint 278 2 → 0 ✅

Summary: 74 total BLs, 57 detector applications across 12 containers
Detector coverage: 57/74 = 77.0%
```

vs Sprint 278: ABSENCE 2 → **0**, RESOLVED 0 → **2**, coverage 동일 (이미 detector applicable count가 57). **PRESENCE 자동 입증 완전 회복**.

## Code 변경

### 1. detectThresholdCheck 확장 (`packages/utils/src/divergence/bl-detector.ts`)

```typescript
// Before (Sprint 263 F427 origin)
const leftIsVarLike =
  THRESHOLD_VAR_PATTERN.test(leftText) || leftText.includes(".");
if (leftIsVarLike && (rightIsLiteral || rightIsConstant)) foundThreshold = true;

// After (Sprint 279 F445)
// Path A: UPPERCASE/literal 시 var-like 검증 skip
if (rightIsConstant || rightIsLiteral || leftIsConstant || leftIsLiteral) {
  foundThreshold = true;
}
// Path B: var-vs-var, 양변 중 하나 THRESHOLD_VAR_PATTERN 매칭
else if (
  THRESHOLD_VAR_PATTERN.test(leftText) ||
  THRESHOLD_VAR_PATTERN.test(rightText)
) {
  foundThreshold = true;
}
```

### 2. unit test 4건 (`packages/utils/test/bl-detector.test.ts`)

- `F445 Path A: detects non-keyword var < UPPERCASE_CONSTANT (CC-001 case)` → RESOLVED
- `F445 Path B: detects var-var with keyword on one side (CC-002 case)` → RESOLVED
- `F445 false positive 회피: var-var with no keyword on either side (DIVERGENCE)` → ABSENCE 유지 (i < j)
- `F445 Path A reverse: detects literal < var (양변 어느 쪽이든 literal 인정)` → RESOLVED (0 < amount)

### 3. credit-card provenance.yaml status 갱신

`divergenceMarkers[CC-001/CC-002].status: OPEN → RESOLVED` + `resolvedBy="F445 Sprint 279" + resolvedAt="2026-05-08"`. summary `byStatus.OPEN: 0 / RESOLVED: 2` 추가.

## 시간 / 비용

- 작업 소요: ~30분 (Master inline, 분석 + fix + test + 검증 + 문서)
- LLM cost: $0

## 메타 학습

- **detector 확장 패턴 정착 (Path A + Path B)** — UPPERCASE/literal 우선 인정 + var-var keyword 매칭 fallback. 후속 detector 확장 시 동일 2-path 패턴 재사용 가능.
- **산업 다양성 PoC → detector 한계 발견 → 즉시 fix 사이클 1 Sprint** (S278 ABSENCE 발견 → S279 fix). 후속 신규 산업 도메인 PoC (Delivery/Subscription/Insurance) 진입 안전성 향상.
- **write-provenance 자동 OPEN→RESOLVED 전환 미지원 발견** — Sprint 263 F430 provenance-writer가 PRESENCE 자동 입증 시 status 전환을 자동으로 안 함 (manual 갱신 필요). 별도 후속 fix 후보 (provenance-writer.ts logic 분석 + 자동 status 전환 추가).
- **detector 확장 시 false positive 회피** — `.` property access 제외(i < arr.length 같은 loop), 양변 keyword 미매칭 시 ABSENCE 유지. test (c)로 가드 검증.

## 차기 후보

1. **write-provenance 자동 status 전환** — provenance-writer.ts logic 분석 + PRESENCE 자동 입증 시 OPEN → RESOLVED 자동 전환 (CC-001/002 같은 manual 갱신 회피)
2. **신규 산업 도메인 시리즈 지속** — Delivery (배송), Subscription (구독), Insurance (보험)
3. **Phase 4 후속** (전수 7 LPON 도메인 + Java source 확보)
4. **보안 후속 2건** (1Password CLI signin + Master Password 변경)
