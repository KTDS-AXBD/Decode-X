---
id: AIF-PLAN-076
sprint: 278
feature: F444
title: Credit Card 12번째 도메인 신규 (LPON 외 첫 산업 다양성)
status: active
estimated_hours: 2
created: 2026-05-08
related: [AIF-PLAN-073, AIF-PLAN-072, AIF-PLAN-075]
req: AIF-REQ-035
related_features: [F441, F440, F443, F429]
---

# F444 Plan — AIF-PLAN-076

## 목표

12번째 도메인 신용카드(Credit Card) 신규 작성 — **LPON 외 첫 산업 다양성 확장**. CC-001~CC-006 6 BL 균형 분포 (Threshold × 2 + Atomic × 2 + Status × 2). withRuleId 재사용 10 Sprint 연속 정점 (S264~S278).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | credit-card.ts source 신규 | ~225 lines, 6 함수 (issueCard/checkPaymentLimit/approvePayment/transitionCardStatus/markDelinquentCards/cancelTransaction) + CreditCardError code-in-message |
| 2 | spec-container/credit-card/ 15+ sub-files | provenance.yaml + credit-card-rules.md + CC-001~CC-006 rules (6) + CC-001~CC-006 runbooks (6) + CC-001 test (1) = 15 |
| 3 | DOMAIN_MAP 12번째 entry | container='credit-card', sourcePath=credit-card.ts, sourceCodeStatus='present' |
| 4 | parser regex CC prefix | `(?:BL\|BB\|BP\|BG\|BS\|LP\|CC\|P\|V)` (LP/CC 같은 2글자 longer match first) |
| 5 | BL_DETECTOR_REGISTRY CC-001~CC-006 매핑 | withRuleId 재사용, 신규 detector 0개 |
| 6 | utils unit test count 51→57 | expected list +CC-001~CC-006 (BP-005와 LP-001 사이 정렬) |
| 7 | utils 170+ unit test PASS (회귀 0) | `pnpm exec vitest run` |
| 8 | typecheck PASS | `pnpm exec tsc --noEmit -p packages/utils + types` (turbo cache 우회) |
| 9 | detect-bl --all-domains 12 containers | credit-card 6 BLs detect, total coverage ≥ 76.0% (75.0% → +1.0%pp 이상) |
| 10 | write-provenance --apply | credit-card ABSENCE/PRESENCE 자동 기록 (자연 결과 — manual marker 부재) |
| 11 | SPEC §6 Sprint 278 + F444 등록 | Plan reference + DoD + 결과 |
| 12 | Plan + Report | AIF-PLAN-076 + AIF-RPRT-076 |

## Scope

### In Scope
- credit-card.ts 합성 source (~225 lines)
- spec-container/credit-card/ 15 sub-files
- DOMAIN_MAP entry 12번째
- parser regex CC prefix 확장
- BL_DETECTOR_REGISTRY 6 entries (withRuleId 재사용)
- utils unit test count + expected list
- detect-bl + write-provenance 검증
- Plan + Report

### Out of Scope
- credit-card.test.ts (PoC 단계, 후속)
- 신용카드 배치/청구/이자/할부 (CC-007+ 미정의)
- 카드 ledger 패턴 (간단화)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 2글자 alternation 우선순위 (CC, LP) | LP/CC 같이 longer match first 위치 (`(?:BL\|BB\|BP\|BG\|BS\|LP\|CC\|P\|V)`) — Sprint 275 LP 패턴 입증 |
| R2 | CC-005 markDelinquentCards 단일 함수 내 batch UPDATE — Status detector fail 가능성 | StatusTransition detector는 SELECT-status + UPDATE-status 패턴 expect. fail 시 ABSENCE marker 자동 기록(자연 결과) |
| R3 | 합성 source 첫 ABSENCE 발생 가능 (LPON 7개는 100% PRESENCE) | ABSENCE는 자동 기록 + 분석 가치 (detector 한계 발견 = 산업 다양성 PoC 정성 가치) |
| R4 | rules.md 표 컬럼 mismatch (S277 fail 패턴 재현) | 5컬럼 standard 형식만 사용 (ID + 4 fields), 출처 정보는 별도 섹션 |

## Implementation Steps

1. credit-card.ts source 작성 (`반제품-스펙/.../src/domain/credit-card.ts`, ~225 lines)
2. spec-container/credit-card/{rules,runbooks,tests}/ 디렉토리 + 15 sub-files
3. parser regex 확장 (`packages/utils/src/divergence/rules-parser.ts`)
4. DOMAIN_MAP 12번째 entry (`scripts/divergence/domain-source-map.ts`)
5. BL_DETECTOR_REGISTRY 6 entries (`packages/utils/src/divergence/bl-detector.ts`)
6. utils unit test count 51→57 + expected list +CC × 6 (`packages/utils/test/bl-detector.test.ts`)
7. `pnpm exec vitest run` (회귀 0)
8. `pnpm exec tsc --noEmit -p packages/utils + types` (turbo 우회)
9. `npx tsx scripts/divergence/detect-bl.ts --all-domains` (coverage 검증)
10. `npx tsx scripts/divergence/write-provenance.ts --all-domains --apply` (ABSENCE/PRESENCE 자동 기록)
11. SPEC §6 Sprint 278 + F444 등록
12. Plan/Report 작성
13. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F444-credit-card-poc.plan.md` (AIF-PLAN-076, 본 문서)
- Report: `docs/04-report/features/sprint-278-F444.report.md` (AIF-RPRT-076)
- Code:
  - `반제품-스펙/.../src/domain/credit-card.ts` (~225 lines 신규)
  - `.decode-x/spec-containers/credit-card/` (15 files 신규)
  - `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP entry +1)
  - `packages/utils/src/divergence/rules-parser.ts` (CC prefix)
  - `packages/utils/src/divergence/bl-detector.ts` (REGISTRY 6 entries)
  - `packages/utils/test/bl-detector.test.ts` (count 51→57 + expected list)
- SPEC: §6 Sprint 278 블록 + F444 체크박스

## Success Criteria

- DoD 12/12 PASS
- detect-bl coverage ≥ 76% (75.0% → +1.0%pp 이상)
- utils 170+ unit test PASS (회귀 0)
- typecheck PASS
- 12번째 도메인 활성 (DOMAIN_MAP entry 12) — LPON 외 첫 산업

## 메타

- **withRuleId 재사용 10 Sprint 연속 정점** (S264~S278)
- **LPON cap 후 첫 신규 산업** — 신용카드 / 이후 Delivery / Subscription / Insurance 등 산업 다양성 확장 시리즈 시작
- **ABSENCE 발생 가능성** — 합성 도메인 7개에서 100% PRESENCE였으나 신규 산업 도메인에서 detector 한계 발견 가능. 이는 정성적 가치 (detector 개선 필요성 입증)
