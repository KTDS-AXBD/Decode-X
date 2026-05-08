---
id: AIF-PLAN-077
sprint: 279
feature: F445
title: Threshold detector 확장 (CC-001/002 ABSENCE 해소 + var-var/non-keyword UPPERCASE 패턴 인정)
status: active
estimated_hours: 0.5
created: 2026-05-08
related: [AIF-PLAN-076]
req: AIF-REQ-035
related_features: [F444, F429]
---

# F445 Plan — AIF-PLAN-077

## 목표

Sprint 278 F444 (credit-card) 12번째 도메인 PoC에서 발견된 **ThresholdCheck detector 한계 2건 해소**:
- **CC-001** (`if (creditScore < MIN_CREDIT_SCORE)`): leftText `creditScore`가 `THRESHOLD_VAR_PATTERN`(amount/limit/threshold/...) 미매칭 → ABSENCE 오판
- **CC-002** (`if (remainingLimit < amount)`): var-var 비교, 우변이 UPPERCASE/literal 아님 → ABSENCE 오판

## 근본 원인 분석

현 detector logic (`packages/utils/src/divergence/bl-detector.ts:447-454`):
```typescript
const leftIsVarLike = THRESHOLD_VAR_PATTERN.test(leftText) || leftText.includes(".");
const rightIsLiteral = ts.isNumericLiteral(node.right);
const rightIsConstant = /^[A-Z][A-Z_0-9]+$/.test(rightText);
if (leftIsVarLike && (rightIsLiteral || rightIsConstant)) foundThreshold = true;
```

**문제**:
1. `leftIsVarLike` 검증이 너무 엄격 — UPPERCASE_CONSTANT 우변(`MIN_CREDIT_SCORE`)이 있으면 좌변 키워드 무관하게 threshold check로 봐야 함
2. var-var 비교(`remainingLimit < amount`) 케이스 미지원

## Fix 설계 (2가지 path)

### Path A — UPPERCASE/literal 시 var-like 검증 skip
좌우 어느 쪽이라도 UPPERCASE_CONSTANT 또는 numeric literal이면 다른 쪽 검증 불요.
- 근거: UPPERCASE/literal은 거의 항상 threshold const 의미.
- 회피: `if (i < arr.length)` 같은 일반 비교는 양변 다 var이라 path A 미적용 (false positive 회피).

### Path B — var-vs-var, 양변 중 하나 keyword 매칭
양변 둘 다 var인 경우, `THRESHOLD_VAR_PATTERN` 매칭 시만 인정.
- `.` property access는 path B에서 제외 (false positive 회피, `i < arr.length` 같은 loop 비교).

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | detectThresholdCheck Path A 추가 | leftIsConstant/rightIsConstant + leftIsLiteral/rightIsLiteral 시 PASS |
| 2 | detectThresholdCheck Path B 추가 | var-vs-var, 양변 중 하나 THRESHOLD_VAR_PATTERN 매칭 시 PASS |
| 3 | 신규 unit test 4건 추가 | (a) Path A non-keyword + UPPERCASE, (b) Path B var-var keyword, (c) false positive 회피 (양변 keyword 미매칭), (d) Path A reverse (literal < var) |
| 4 | utils 174 unit test PASS (170 → +4 신규, 회귀 0) | `pnpm exec vitest run` |
| 5 | typecheck PASS | `pnpm exec tsc --noEmit -p packages/utils` (turbo 우회) |
| 6 | detect-bl --all-domains: credit-card 0 ABSENCE | Sprint 278 2 ABSENCE → 0 (CC-001/CC-002 PRESENCE 입증). 회귀 0 (다른 11 containers 동일) |
| 7 | credit-card provenance.yaml status 갱신 | divergenceMarkers 2건 status: OPEN → RESOLVED + resolvedBy/resolvedAt + summary byStatus 갱신 |
| 8 | Plan + Report + SPEC §6 Sprint 279 + F445 등록 | AIF-PLAN-077 + AIF-RPRT-077 |

## Scope

### In Scope
- `detectThresholdCheck` 함수 확장 (Path A + Path B)
- unit test 4건 추가
- credit-card provenance.yaml status manual 갱신 (write-provenance 자동 status 전환 미지원)
- Plan + Report

### Out of Scope
- write-provenance 자동 OPEN→RESOLVED 전환 logic 개선 (별도 후속)
- StatusTransition / AtomicTransaction detector 확장 (현재 한계 미발견)
- 신규 도메인 추가
- credit-card.ts source 변경

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | Path B false positive (`.length`, `.size` 같은 property access) | path B에서 `.` 포함은 인정 안 함. `i < arr.length` 같은 loop도 ABSENCE 유지 |
| R2 | Path A false positive (`x < 0` 같은 sanity check를 threshold로 오인) | acceptable — sanity check도 threshold 종류로 인정 (signal-to-noise tradeoff 70% 신뢰도 유지) |
| R3 | LPON 7개 도메인 회귀 | 기존 logic이 `var > UPPER` 통과 → 신 logic도 통과 (Path A 동일). 174 test로 검증 |
| R4 | Path A에서 양쪽 다 UPPERCASE 비교 시 (`MAX > MIN`) — 거의 안 일어나지만 통과 | acceptable (자연스러운 threshold 의미 가능) |

## Implementation Steps

1. `detectThresholdCheck` 함수 logic 확장 (Path A + Path B)
2. unit test 4건 추가 (`packages/utils/test/bl-detector.test.ts`)
3. `pnpm exec vitest run` (174/174 PASS 검증)
4. `pnpm exec tsc --noEmit -p packages/utils` (turbo 우회 PASS)
5. `npx tsx scripts/divergence/detect-bl.ts --all-domains` (credit-card 0 ABSENCE 확인)
6. `npx tsx scripts/divergence/write-provenance.ts --all-domains --apply` (changes 0 — 자동 status 전환 미지원, manual 처리)
7. credit-card provenance.yaml: divergenceMarkers status OPEN → RESOLVED + summary byStatus 갱신
8. Plan + Report 작성
9. SPEC §6 Sprint 279 + F445 등록
10. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F445-threshold-detector-extension.plan.md` (AIF-PLAN-077, 본 문서)
- Report: `docs/04-report/features/sprint-279-F445.report.md` (AIF-RPRT-077)
- Code:
  - `packages/utils/src/divergence/bl-detector.ts` (detectThresholdCheck 확장 ~12 lines)
  - `packages/utils/test/bl-detector.test.ts` (신규 test 4건 ~50 lines)
  - `.decode-x/spec-containers/credit-card/provenance.yaml` (status update + summary 갱신)
- SPEC: §6 Sprint 279 블록 + F445 체크박스

## Success Criteria

- DoD 8/8 PASS
- credit-card detect-bl 0 ABSENCE
- utils 174/174 unit test PASS (170 → +4 신규, 회귀 0)
- typecheck PASS

## 메타

- **detector 확장 패턴 정착** — Path A (UPPERCASE/literal 시 var-like 검증 skip) + Path B (var-var 양변 keyword 매칭)
- **산업 다양성 PoC가 detector 한계 발견 → 즉시 fix 사이클 1 Sprint** (S278 ABSENCE 발견 → S279 fix). 후속 신규 산업 도메인 PoC 안전성 향상
- **write-provenance 자동 OPEN→RESOLVED 전환 미지원** 발견 — 별도 후속 fix 후보 (provenance-writer.ts logic 개선)
