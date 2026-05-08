---
id: AIF-PLAN-083
sprint: 285
feature: F451
title: Insurance 15번째 도메인 신규 (보험 산업, 4번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-081, AIF-PLAN-082]
req: AIF-REQ-035
related_features: [F444, F449, F450, F445, F446, F447, F448]
---

# F451 Plan — AIF-PLAN-083

## 목표

15번째 도메인 보험(Insurance) 신규 — **4번째 신규 산업 도메인** (Credit Card S278 + Delivery S283 + Subscription S284 + Insurance S285). detector 신뢰도 5 Sprint cascade(S278~S282) + 3 산업 연속 입증 패턴(S278+S283+S284) 활용. IN-001~IN-006 6 BL 균형 분포 (Threshold × 2 + Atomic × 2 + Status × 2). withRuleId 재사용 13 Sprint 연속 정점.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | insurance.ts source 신규 | ~265 lines, 6 함수 + InsuranceError code-in-message |
| 2 | spec-container/insurance/ 15 sub-files | provenance + insurance-rules + IN-001~006 rules/runbooks (12) + test (1) |
| 3 | DOMAIN_MAP 15번째 entry | container='insurance', sourcePath=insurance.ts |
| 4 | parser regex IN prefix | `(?:BL\|BB\|BP\|BG\|BS\|LP\|CC\|DV\|SB\|IN\|P\|V)` |
| 5 | BL_DETECTOR_REGISTRY IN-001~IN-006 매핑 | withRuleId 재사용 13 Sprint 연속 정점 |
| 6 | utils unit test count 69→75 | expected list +IN × 6 (DV-006와 LP-001 사이 정렬) |
| 7 | utils 188 unit test PASS (회귀 0) | `pnpm exec vitest run` |
| 8 | typecheck PASS | `pnpm exec tsc --noEmit -p packages/utils` |
| 9 | detect-bl 15 containers | insurance 6 BLs, **0 ABSENCE**. total coverage ≥ 81% |
| 10 | write-provenance --apply | --resolved-by 옵션, 0/15 changes |
| 11 | 4 산업 연속 0 ABSENCE 정착 검증 | CC(S278) + DV(S283) + SB(S284) + IN(S285) 모두 0 ABSENCE |
| 12 | Plan + Report + SPEC §6 Sprint 285 + F451 등록 | AIF-PLAN-083 + AIF-RPRT-083 |

## Scope

### In Scope
- insurance.ts 합성 source (~265 lines)
- spec-container/insurance/ 15 sub-files
- DOMAIN_MAP entry 15번째
- parser regex IN prefix 확장
- BL_DETECTOR_REGISTRY 6 entries
- utils unit test count + expected list
- detect-bl + write-provenance 검증
- Plan + Report

### Out of Scope
- insurance.test.ts (PoC 단계, 후속)
- 보험금 지급 lifecycle (IN-007+ — payout / reinsurance)
- 보험 추천/심사 알고리즘 (외부 시스템)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 2글자 alternation 복잡도 (CC/LP/DV/SB/IN 5개) | longer match first 위치 + 입증된 순서, S275/S278/S283/S284 패턴 누적 |
| R2 | IN-005 batch StatusTransition 한계 | CC-005/DV-005/SB-005 동일 패턴 (4번째 재사용) |
| R3 | IN-002 var-vs-var 검증 | F445 Path B `remainingCoverage < claimAmount` (`amount` keyword 매칭) |
| R4 | rules.md 표 컬럼 | 5컬럼 standard 적용 |

## Implementation Steps

1. insurance.ts source 작성
2. spec-container/insurance/ 15 sub-files
3. parser regex IN prefix
4. DOMAIN_MAP 15번째
5. REGISTRY 6 entries
6. utils unit test count + expected list
7. vitest run (188/188 PASS 검증)
8. typecheck PASS
9. detect-bl --all-domains (insurance 0 ABSENCE 검증)
10. write-provenance --apply --resolved-by
11. SPEC §6 Sprint 285 + F451 등록
12. Plan + Report 작성
13. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F451-insurance-poc.plan.md` (AIF-PLAN-083, 본 문서)
- Report: `docs/04-report/features/sprint-285-F451.report.md` (AIF-RPRT-083)
- Code:
  - `반제품-스펙/.../src/domain/insurance.ts` (~265 lines 신규)
  - `.decode-x/spec-containers/insurance/` (15 files 신규)
  - `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP entry +1)
  - `packages/utils/src/divergence/rules-parser.ts` (IN prefix)
  - `packages/utils/src/divergence/bl-detector.ts` (REGISTRY +6 entries)
  - `packages/utils/test/bl-detector.test.ts` (count 69→75 + expected list)
- SPEC: §6 Sprint 285 블록 + F451 체크박스

## Success Criteria

- DoD 12/12 PASS
- detect-bl coverage ≥ 81% (80.2% → +1.3%pp)
- utils 188 unit test PASS (회귀 0)
- typecheck PASS
- insurance 0 ABSENCE
- 15번째 도메인 활성

## 메타

- **withRuleId 재사용 13 Sprint 연속 정점** (S264~S278+S283~S285)
- **4번째 신규 산업 도메인** (CC + DV + SB + IN) — 산업 다양성 시리즈 누적 4종
- **4 산업 도메인 연속 0 ABSENCE** — detector 신뢰도 5 Sprint cascade 완전 안정 정착
- **15 도메인 활성화 + 6 BLs 균형 패턴 정착** — 7개 도메인이 동일 6 BL Threshold/Atomic/Status 균형
