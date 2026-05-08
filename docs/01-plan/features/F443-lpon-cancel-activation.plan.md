---
id: AIF-PLAN-075
sprint: 277
feature: F443
title: lpon-cancel 11번째 도메인 활성화 — withRuleId 재사용 + BL-042 신규
status: active
estimated_hours: 1
created: 2026-05-08
related: [AIF-PLAN-073, AIF-PLAN-072]
req: AIF-REQ-035
related_features: [F441, F440, F429]
---

# F443 Plan — AIF-PLAN-075

## 목표

11번째 도메인 lpon-cancel 활성화. `cancel.ts` source는 이미 존재 (반제품-스펙/.../src/domain/cancel.ts 179 lines, FN-004 결제 취소) — spec-container/lpon-cancel/만 신규 작성. 부트스트래핑 효율 최고.

**신규성 제한 명시**: cancel.ts에 명시된 BL-014/016/017은 **lpon-payment에 이미 정의됨** (ID 중복 회피를 위해 본 도메인 표에서 제외, reference 섹션으로 분리). **신규 BL은 BL-042 (network cancel) 1건**.

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | spec-container/lpon-cancel/ 5 sub-files | provenance.yaml + rules/cancel-rules.md + rules/BL-042.md + runbooks/BL-042.md + tests/BL-042.yaml |
| 2 | DOMAIN_MAP 11번째 entry | container='lpon-cancel', sourcePath=cancel.ts, sourceCodeStatus='present', underImplTargets=[processCancel, processNetworkCancel] |
| 3 | BL_DETECTOR_REGISTRY BL-042 매핑 | `withRuleId(detectAtomicTransaction, "BL-042")` (신규 detector 0개, withRuleId 9 Sprint 연속 재사용) |
| 4 | utils unit test 회귀 0 | `pnpm exec vitest run` (BL_DETECTOR_REGISTRY count test 50→51 갱신 + expected list +"BL-042") |
| 5 | detect-bl --all-domains 실행 결과 | lpon-cancel 1 BL, 1 detector applicable, 0 ABSENCE markers. Total coverage 74.6% → ≥ 75.0% (+0.4%pp 이상) |
| 6 | write-provenance --apply | 0 changes (manual ABSENCE markers 부재 자연 결과 — Sprint 263 패턴 동일) |
| 7 | SPEC §6 Sprint 277 + F443 등록 | Plan reference + DoD + 결과 |
| 8 | Plan + Report 산출 | AIF-PLAN-075 + AIF-RPRT-075 + reports/sprint-277-* (선택) |

## Scope

### In Scope
- spec-container/lpon-cancel/ 5 sub-files
- DOMAIN_MAP entry 추가 (1 entry)
- BL_DETECTOR_REGISTRY BL-042 매핑 (1 entry)
- utils unit test count 갱신 + expected list 갱신
- detect-bl 실행 + write-provenance --apply
- Plan + Report

### Out of Scope
- cancel.ts source 작성 (이미 존재)
- BL-014/016/017 본 도메인 정의 (lpon-payment reference 유지)
- cancel.test.ts 작성 (PoC 단계, 테스트는 후속)
- parser regex 변경 (BL-042는 BL prefix 그대로 매칭)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | rules.md 표 컬럼 수 mismatch (parser fail) | 표는 5 컬럼 standard 형식만, 출처/reference 정보는 별도 섹션으로 분리. detect-bl 실행으로 사전 검증 |
| R2 | BL-014/016/017 중복 카운트 (lpon-payment + lpon-cancel 양쪽) | 본 도메인 표에서 제외, reference 섹션으로만 명시 |
| R3 | detector coverage 변화 미미 (+0.4%pp) | 11번째 도메인 명목 + BL-042 신규 PRESENCE 입증이 가치 (정량 vs 정성) |

## Implementation Steps

1. spec-container/lpon-cancel/{rules,runbooks,tests}/ 디렉토리 + 5 sub-files 작성
2. DOMAIN_MAP 11번째 entry 추가 (`scripts/divergence/domain-source-map.ts`)
3. BL_DETECTOR_REGISTRY: `BL-042` 신규 매핑 (`packages/utils/src/divergence/bl-detector.ts`)
4. utils unit test count 갱신 + expected list +"BL-042" (`packages/utils/test/bl-detector.test.ts`)
5. `pnpm exec vitest run` (회귀 0)
6. `npx tsx scripts/divergence/detect-bl.ts --all-domains` (coverage 갱신 검증)
7. `npx tsx scripts/divergence/write-provenance.ts --all-domains --apply`
8. SPEC §6 Sprint 277 + F443 등록
9. Plan/Report 작성
10. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F443-lpon-cancel-activation.plan.md` (AIF-PLAN-075, 본 문서)
- Report: `docs/04-report/features/sprint-277-F443.report.md` (AIF-RPRT-075, 후속)
- Code:
  - `.decode-x/spec-containers/lpon-cancel/` (5 files 신규)
  - `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP entry 11번째)
  - `packages/utils/src/divergence/bl-detector.ts` (BL-042 매핑)
  - `packages/utils/test/bl-detector.test.ts` (count 50→51 + expected list)
- SPEC: §6 Sprint 277 블록 + F443 체크박스

## Success Criteria

- DoD 8/8 PASS
- detect-bl coverage ≥ 75.0% (74.6% → +0.4%pp)
- utils 170+ unit test PASS (회귀 0)
- write-provenance 0 changes 자연 결과 확인
- 11번째 도메인 활성 (DOMAIN_MAP entry 11)

## 메타

- **withRuleId 재사용 9 Sprint 연속 정점** (S264~S277, 단 lpon-cancel은 BL-042 1건만이라 부트스트래핑 효율 최대)
- **신규 BL이 1건뿐** — 기존 LPON 도메인 분리 활성화의 한계 명시 (산업 다양성 가치 ≠ 도메인 명목 가치). 11번째 신규 산업 도메인(Credit Card / Delivery 등)은 후속 별도 Sprint
- **반제품-스펙 source 11/11 활성화 완료** — 신규 source 작성 없이 합성 도메인 PoC 시리즈 cap (S264~S277)
