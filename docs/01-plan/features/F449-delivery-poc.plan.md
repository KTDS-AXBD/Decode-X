---
id: AIF-PLAN-081
sprint: 283
feature: F449
title: Delivery 13번째 도메인 신규 (배송 산업 다양성, detector 5 Sprint cascade 완전 활용)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-080]
req: AIF-REQ-035
related_features: [F444, F445, F446, F447, F448]
---

# F449 Plan — AIF-PLAN-081

## 목표

13번째 도메인 배송(Delivery) 신규 — **Credit Card 다음 산업 다양성 확장** + detector 신뢰도 5 Sprint cascade(S278~S282) **완전 활용 검증**. DV-001~DV-006 6 BL 균형 분포 (Threshold × 2 + Atomic × 2 + Status × 2). withRuleId 재사용 11 Sprint 연속 정점.

## 5 Sprint cascade 활용 검증 항목

| Sprint cascade 단계 | DV 도메인 활용 |
|---------------------|---------------|
| S278 ABSENCE 발견 | DV-001/002 ThresholdCheck (이전 CC-001/002 같은 ABSENCE 발생 위험) |
| S279 Path A/B fix | DV-001 `weightKg < MIN_WEIGHT_KG` (Path A) + DV-002 `regionLimit < weight_kg` (Path B `limit` keyword) |
| S280 SUPPORTED auto-sync | DV-001~006 등록 즉시 SUPPORTED (manual whitelist 갱신 불필요) |
| S281 resolvedBy/At | write-provenance --resolved-by "F449 Sprint 283..." 자동 audit trail |
| S282 byStatus auto-summary | DV ABSENCE 발생 시 자동 marker append + byStatus 자동 갱신 |

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | delivery.ts source 신규 | ~225 lines, 6 함수 (requestDelivery/checkRegionLimit/startShipping/transitionDeliveryStatus/markDelayedDeliveries/cancelAndReturn) + DeliveryError code-in-message |
| 2 | spec-container/delivery/ 15 sub-files | provenance + delivery-rules + DV-001~006 rules (6) + runbooks (6) + test (1) = 15 |
| 3 | DOMAIN_MAP 13번째 entry | container='delivery', sourcePath=delivery.ts, sourceCodeStatus='present' |
| 4 | parser regex DV prefix | `(?:BL\|BB\|BP\|BG\|BS\|LP\|CC\|DV\|P\|V)` (longer match first) |
| 5 | BL_DETECTOR_REGISTRY DV-001~DV-006 매핑 | withRuleId 재사용, 신규 detector 0개 |
| 6 | utils unit test count 57→63 | expected list +DV × 6 (CC-006와 LP-001 사이 정렬) |
| 7 | utils 188 unit test PASS (회귀 0) | `pnpm exec vitest run` |
| 8 | typecheck PASS | `pnpm exec tsc --noEmit -p packages/utils` |
| 9 | detect-bl --all-domains 13 containers | delivery 6 BLs, **0 ABSENCE** (S279 Path A/B fix 효과 검증). total coverage ≥ 78% |
| 10 | write-provenance --apply | --resolved-by "F449 Sprint 283 ..." 옵션 검증, delivery 0 changes (PRESENCE 자연 결과) |
| 11 | F445 Path A/B 효과 정량 검증 | DV-001 (Path A) + DV-002 (Path B) 모두 PRESENCE 입증, S278 CC-001/002 같은 ABSENCE 재발 0 |
| 12 | Plan + Report + SPEC §6 Sprint 283 + F449 등록 | AIF-PLAN-081 + AIF-RPRT-081 |

## Scope

### In Scope
- delivery.ts 합성 source (~225 lines)
- spec-container/delivery/ 15 sub-files
- DOMAIN_MAP entry 13번째
- parser regex DV prefix 확장
- BL_DETECTOR_REGISTRY 6 entries (withRuleId 재사용)
- utils unit test count + expected list
- detect-bl + write-provenance 검증
- Plan + Report

### Out of Scope
- delivery.test.ts (PoC 단계, 후속)
- 배송 추적 실시간 이벤트 (DV-007+ 미정의)
- 외부 배송사 API 연동 (mock 패턴 적용)
- 환불 외부 결제 시스템 연동 (refund_amount 계산만)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 2글자 alternation (CC, LP, DV) | longer match first 위치 (CC/LP/DV가 P/V보다 먼저) — Sprint 275 LP + Sprint 278 CC 패턴 입증 |
| R2 | DV-005 markDelayedDeliveries batch UPDATE — Status detector 한계 | CC-005 동일 패턴(SHIPPED → DELAYED 일괄 UPDATE) — Sprint 278 CC-005 PRESENCE 입증된 형태 |
| R3 | S279 Path A/B fix가 DV에 적용 안 됨 우려 (false negative 재발) | DV-001 var-vs-UPPERCASE (Path A) + DV-002 var-vs-var with `limit` (Path B) — 명시적 패턴 활용 |
| R4 | rules.md 표 컬럼 (S277 fix 패턴) | 5컬럼 standard 형식만 사용 (ID + condition/criteria/outcome/exception) |

## Implementation Steps

1. delivery.ts source 작성 (`반제품-스펙/.../src/domain/delivery.ts`, ~225 lines)
2. spec-container/delivery/{rules,runbooks,tests}/ 15 sub-files
3. parser regex 확장 (CC|DV 동시 가능성도 검토했으나 DV만 추가)
4. DOMAIN_MAP 13번째 entry
5. BL_DETECTOR_REGISTRY 6 entries
6. utils unit test count 57→63 + expected list +DV × 6
7. `pnpm exec vitest run` (188/188 PASS 검증)
8. `pnpm exec tsc --noEmit -p packages/utils` (PASS)
9. `npx tsx scripts/divergence/detect-bl.ts --all-domains` (delivery 0 ABSENCE 검증)
10. `npx tsx scripts/divergence/write-provenance.ts --all-domains --apply --resolved-by "..."` (자동 동작 검증)
11. SPEC §6 Sprint 283 + F449 등록
12. Plan + Report 작성
13. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F449-delivery-poc.plan.md` (AIF-PLAN-081, 본 문서)
- Report: `docs/04-report/features/sprint-283-F449.report.md` (AIF-RPRT-081)
- Code:
  - `반제품-스펙/.../src/domain/delivery.ts` (~225 lines 신규)
  - `.decode-x/spec-containers/delivery/` (15 files 신규)
  - `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP entry +1)
  - `packages/utils/src/divergence/rules-parser.ts` (DV prefix)
  - `packages/utils/src/divergence/bl-detector.ts` (REGISTRY +6 entries)
  - `packages/utils/test/bl-detector.test.ts` (count 57→63 + expected list)
- SPEC: §6 Sprint 283 블록 + F449 체크박스

## Success Criteria

- DoD 12/12 PASS
- detect-bl coverage ≥ 78% (77.0% → +1.8%pp)
- utils 188 unit test PASS (회귀 0)
- typecheck PASS
- delivery 0 ABSENCE (5 Sprint cascade 효과 입증)
- 13번째 도메인 활성

## 메타

- **withRuleId 재사용 11 Sprint 연속 정점** (S264~S278+S283)
- **detector 신뢰도 5 Sprint cascade 완전 활용** — Sprint 278 CC-001/002 ABSENCE 패턴이 Sprint 279 Path A/B fix로 재발 차단되는지 검증
- **2번째 신규 산업 도메인** (Credit Card S278 → Delivery S283) — 산업 다양성 시리즈 확장
