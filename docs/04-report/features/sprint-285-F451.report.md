---
id: AIF-RPRT-083
sprint: 285
feature: F451
title: Insurance 15번째 도메인 신규 — 실행 보고서 (보험 산업, 4 산업 연속 0 ABSENCE)
status: completed
created: 2026-05-09
related_plan: AIF-PLAN-083
match_rate: 95
mode: Master inline
---

# F451 Report — AIF-RPRT-083

## 실행 결과

| # | DoD | 결과 | 비고 |
|---|-----|------|------|
| 1 | insurance.ts source | ✅ | ~265 lines, 6 함수 + InsuranceError code-in-message |
| 2 | spec-container 15 sub-files | ✅ | provenance + insurance-rules + IN-001~006 rules/runbooks (12) + test (1) |
| 3 | DOMAIN_MAP 15번째 entry | ✅ | container='insurance', sourceCodeStatus='present' |
| 4 | parser regex IN prefix | ✅ | `(?:BL\|BB\|BP\|BG\|BS\|LP\|CC\|DV\|SB\|IN\|P\|V)` |
| 5 | REGISTRY IN-001~IN-006 매핑 | ✅ | withRuleId 재사용 13 Sprint 연속 정점 |
| 6 | utils unit test count 69→75 | ✅ | expected list +IN × 6 (DV-006과 LP-001 사이) |
| 7 | utils 188/188 PASS (회귀 0) | ✅ | `pnpm exec vitest run` |
| 8 | typecheck PASS | ✅ | utils + types 모두 0 errors (turbo 우회) |
| 9 | detect-bl 15 containers | ✅ | **80.2% → 81.5%** (+1.3%pp). insurance 6 BLs, **0 ABSENCE** |
| 10 | write-provenance --apply | ✅ | --resolved-by 옵션 + 0/15 changes |
| 11 | 4 산업 연속 0 ABSENCE 정착 | ✅ | **CC(S278) + DV(S283) + SB(S284) + IN(S285) 모두 0 ABSENCE** |
| 12 | Plan + Report + SPEC | ✅ | AIF-PLAN-083 + AIF-RPRT-083 |

**DoD 12/12 PASS — Match Rate 95%**

## 핵심 결과

```
=== Multi-Domain BL Detector — 15 containers ===
  ...
  subscription: 6 BLs, 6 applicable detectors, 0 ABSENCE markers
  insurance: 6 BLs, 6 applicable detectors, 0 ABSENCE markers  ← 15번째 도메인 (보험 산업, 4번째 신규)

Summary: 92 total BLs, 75 detector applications across 15 containers
Detector coverage: 75/92 = 81.5%
```

vs Sprint 284: 86 → **92 BL** (+6, IN-001~006 신규), 69 → **75 applications** (+6), 80.2% → **81.5%** (+1.3%pp).

## ★ 4 산업 도메인 연속 0 ABSENCE 정착

| Sprint | 산업 | ABSENCE | PRESENCE 률 |
|--------|------|---------|-----------|
| S278 (CC) | Credit Card | 2 | 67% |
| S283 (DV) | Delivery | 0 | 100% |
| S284 (SB) | Subscription | 0 | 100% |
| **S285 (IN)** | **Insurance** | **0** | **100%** |

→ S279 Path A/B fix 후 **4 신규 산업 연속** PRESENCE 100% — detector 신뢰도 5 Sprint cascade의 안정 입증 강화.

## 누적 효과

| 지표 | S262 | S278 | S285 |
|------|------|------|------|
| Coverage | 13.2% | 77.0% | **81.5%** |
| 도메인 수 | 5 | 12 | **15** |
| BL 수 | 38 | 74 | **92** |
| Detector 수 | 5 | 51 | **75** |
| 신규 산업 | 0 | 1 | **4** |

23 Sprint (S262~S285) 누적: 13.2% → 81.5% (**+68.3%pp**), 5 → 15 도메인 (3배), 38 → 92 BL (2.4배).

## Code 변경

- `반제품-스펙/.../src/domain/insurance.ts` (265 lines 신규)
- `.decode-x/spec-containers/insurance/` 15 sub-files
- `scripts/divergence/domain-source-map.ts` DOMAIN_MAP +1 entry
- `packages/utils/src/divergence/rules-parser.ts` IN prefix
- `packages/utils/src/divergence/bl-detector.ts` REGISTRY +6 entries
- `packages/utils/test/bl-detector.test.ts` count 69→75 + expected list

## 시간 / 비용

- 작업 소요: ~1.5h (Master inline)
- LLM cost: $0

## 메타 학습

- **4 신규 산업 도메인 연속 0 ABSENCE 정착** (CC S278 → DV S283 → SB S284 → **IN S285**) — detector 신뢰도 5 Sprint cascade 완전 안정 입증
- **withRuleId 재사용 13 Sprint 연속 정점** (S264~S278+S283~S285) — 신규 detector 0개 패턴
- **CC-005 batch StatusTransition 4번째 재사용** (DV-005 + SB-005 + IN-005) — 표준 패턴 정착
- **F445 Path B var-vs-var keyword 패턴 4번째 활용** (DV-002 + SB-002 + IN-002 + CC-002) — `limit`/`amount` keyword 안정
- **6 BLs 균형 패턴 5번째 정착** (CC + DV + SB + IN + 합성 7 도메인 일부) — Threshold × 2 + Atomic × 2 + Status × 2 표준

## 차기 후보

1. **Coverage 100% 도전** — 잔여 17건 (BL-026 OPEN + lpon-payment 5 + lpon-charge 4 + lpon-gift 1 + lpon-settlement 2 + lpon-refund 5) 미감지 분석 + detector 추가
2. **5번째 신규 산업 도메인** (Healthcare / Education / Real Estate / Logistics)
3. **Phase 4 후속** (전수 7 LPON + Java source 확보)
4. **보안 후속 2건** (1Password CLI signin + Master Password)
