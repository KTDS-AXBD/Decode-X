---
id: AIF-PLAN-082
sprint: 284
feature: F450
title: Subscription 14번째 도메인 신규 (SaaS 구독 산업 다양성, 3번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-081]
req: AIF-REQ-035
related_features: [F444, F449, F445, F446, F447, F448]
---

# F450 Plan — AIF-PLAN-082

## 목표

14번째 도메인 SaaS 구독(Subscription) 신규 — **3번째 신규 산업 도메인** (Credit Card S278 + Delivery S283 + Subscription S284). detector 신뢰도 5 Sprint cascade(S278~S282) + Delivery 입증 패턴(S283) 완전 활용. SB-001~SB-006 6 BL 균형 분포 (Threshold × 2 + Atomic × 2 + Status × 2). withRuleId 재사용 12 Sprint 연속 정점.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | subscription.ts source 신규 | ~280 lines, 6 함수 + SubscriptionError code-in-message |
| 2 | spec-container/subscription/ 15 sub-files | provenance + subscription-rules + SB-001~006 rules/runbooks (12) + test (1) |
| 3 | DOMAIN_MAP 14번째 entry | container='subscription', sourcePath=subscription.ts |
| 4 | parser regex SB prefix | `(?:BL\|BB\|BP\|BG\|BS\|LP\|CC\|DV\|SB\|P\|V)` (longer match first) |
| 5 | BL_DETECTOR_REGISTRY SB-001~SB-006 매핑 | withRuleId 재사용 12 Sprint 연속 정점 |
| 6 | utils unit test count 63→69 | expected list +SB × 6 (P-007과 V-001 사이 정렬) |
| 7 | utils 188 unit test PASS (회귀 0) | `pnpm exec vitest run` |
| 8 | typecheck PASS | `pnpm exec tsc --noEmit -p packages/utils` |
| 9 | detect-bl 14 containers | subscription 6 BLs, **0 ABSENCE**. total coverage ≥ 80% |
| 10 | write-provenance --apply | --resolved-by 옵션, 0/14 changes (subscription PRESENCE 자연 결과) |
| 11 | 5 Sprint cascade 효과 3 도메인 연속 입증 | CC(S278) + DV(S283) + SB(S284) 모두 0 ABSENCE — Path A/B 안정성 검증 |
| 12 | Plan + Report + SPEC §6 Sprint 284 + F450 등록 | AIF-PLAN-082 + AIF-RPRT-082 |

## Scope

### In Scope
- subscription.ts 합성 source (~280 lines)
- spec-container/subscription/ 15 sub-files
- DOMAIN_MAP entry 14번째
- parser regex SB prefix 확장
- BL_DETECTOR_REGISTRY 6 entries (withRuleId 재사용)
- utils unit test count + expected list
- detect-bl + write-provenance 검증
- Plan + Report

### Out of Scope
- subscription.test.ts (PoC 단계, 후속)
- 구독 plan 변경 (SB-007+ — upgrade/downgrade 별도)
- 구독 추천/할인 코드 (외부 시스템)
- 결제 외부 PG 연동 (mock 패턴)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 2글자 alternation (CC/LP/DV/SB) | longer match first 위치, Sprint 275 LP / S278 CC / S283 DV 패턴 입증 |
| R2 | SB-005 batch StatusTransition 한계 | CC-005/DV-005 동일 입증된 패턴 (SQL UPDATE status='expired') |
| R3 | SB-002 var-vs-var 검증 | F445 Path B `auto_charge_limit < price_krw` (`limit` keyword 매칭) — DV-002 입증된 동일 형태 |
| R4 | rules.md 표 컬럼 (S277 fix) | 5컬럼 standard 적용 |

## Implementation Steps

1. subscription.ts source 작성 (~280 lines)
2. spec-container/subscription/{rules,runbooks,tests}/ 15 sub-files
3. parser regex 확장 (`SB` 추가)
4. DOMAIN_MAP 14번째 entry
5. BL_DETECTOR_REGISTRY 6 entries
6. utils unit test count 63→69 + expected list +SB × 6
7. `pnpm exec vitest run` (188/188 PASS 검증)
8. `pnpm exec tsc --noEmit -p packages/utils` (PASS)
9. `npx tsx scripts/divergence/detect-bl.ts --all-domains` (subscription 0 ABSENCE 검증)
10. `npx tsx scripts/divergence/write-provenance.ts --all-domains --apply --resolved-by "..."` (자동 동작 검증)
11. SPEC §6 Sprint 284 + F450 등록
12. Plan + Report 작성
13. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F450-subscription-poc.plan.md` (AIF-PLAN-082, 본 문서)
- Report: `docs/04-report/features/sprint-284-F450.report.md` (AIF-RPRT-082)
- Code:
  - `반제품-스펙/.../src/domain/subscription.ts` (~280 lines 신규)
  - `.decode-x/spec-containers/subscription/` (15 files 신규)
  - `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP entry +1)
  - `packages/utils/src/divergence/rules-parser.ts` (SB prefix)
  - `packages/utils/src/divergence/bl-detector.ts` (REGISTRY +6 entries)
  - `packages/utils/test/bl-detector.test.ts` (count 63→69 + expected list)
- SPEC: §6 Sprint 284 블록 + F450 체크박스

## Success Criteria

- DoD 12/12 PASS
- detect-bl coverage ≥ 80% (78.8% → +1.4%pp)
- utils 188 unit test PASS (회귀 0)
- typecheck PASS
- subscription 0 ABSENCE
- 14번째 도메인 활성

## 메타

- **withRuleId 재사용 12 Sprint 연속 정점** (S264~S278+S283+S284)
- **3번째 신규 산업 도메인** (CC + DV + SB) — 산업 다양성 시리즈 누적
- **3 산업 도메인 연속 0 ABSENCE** — detector 신뢰도 5 Sprint cascade 완전 안정 정착
- **detector coverage 80% 돌파** (S262 13.2% → S284 80%+ 상승, 22 Sprint 누적 효과)
