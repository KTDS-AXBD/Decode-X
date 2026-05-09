---
id: AIF-PLAN-087
sprint: 289
feature: F455
title: Logistics 19번째 도메인 신규 (물류 산업, 8번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-081, AIF-PLAN-082, AIF-PLAN-083, AIF-PLAN-084, AIF-PLAN-085, AIF-PLAN-086]
req: AIF-REQ-035
---

# F455 Plan — AIF-PLAN-087

## 목표

19번째 도메인 물류(Logistics) 신규 — **8번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG). 17 Sprint 연속 정점 + 8 산업 연속 0 ABSENCE 목표.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | logistics.ts source | ~280 lines, 6 함수 + LogisticsError (code-in-message 표준 — F440~F454 정점) |
| 2 | spec-container/logistics 15 sub-files | provenance + logistics-rules + LG-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 19번째 entry | container='logistics' |
| 4 | parser regex `LG` prefix | longer match first 누적 입증 (S288 RE 동일 패턴) |
| 5 | REGISTRY LG-001~LG-006 | withRuleId 17 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 93→99 | expected list +LG × 6 (RE-006과 SB-001 사이 또는 알파벳 정렬) |
| 7 | utils 194 PASS (회귀 0) | vitest, 188+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 19 containers | logistics 6 BLs, 0 ABSENCE. coverage ≥ 85% (84.5% +0.8%pp) |
| 10 | write-provenance --apply | --resolved-by, 0/19 changes (PRESENCE 자동 입증) |
| 11 | 8 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG |
| 12 | Plan + Report + SPEC | AIF-PLAN-087 + AIF-RPRT-087 + §6 Sprint 289 + F455 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| LG-001 | shipment dispatch — 무게/부피 한도 검증 | Threshold × 1 | `checkShipmentLimits()` |
| LG-002 | route optimization — distance/time 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B keyword `limit`) | `optimizeRoute()` |
| LG-003 | customs clearance — 신고 + 세관 승인 트랜잭션 | Atomic × 1 | `clearCustoms()` |
| LG-004 | delivery tracking — pending → in_transit → delivered | Status transition × 1 | `transitionDeliveryStatus()` |
| LG-005 | warehouse stock — batch 재고 동기화 | Status transition × 1 (CC-005 batch 8번째 재사용) | `markStaleInventory()` |
| LG-006 | failure return — RMA + 재고 복구 트랜잭션 | Atomic × 1 | `processReturnRma()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (S288 RE 동일 9번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 9개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE+LG) | longer match first 누적 입증 (S275~S288 8 Sprint) |
| R2 | LG-005 batch 8번째 재사용 | CC/DV/SB/IN/HC/ED/RE-005 입증 — 7 Sprint 연속 |
| R3 | LG-002 var-vs-var | F445 Path B `routeDistanceKm > maxRouteLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 288 (F454) 동일 패턴 복제
- Step 1: logistics.ts (6 함수 + LogisticsError code-in-message)
- Step 2: spec-container/logistics 15 sub-files
- Step 3: DOMAIN_MAP entry (sourceCodeStatus="present")
- Step 4: parser regex `LG` prefix 추가
- Step 5: REGISTRY LG-001~006 (withRuleId 매핑)
- Step 6: utils unit test expected list +6
- Step 7~9: typecheck + lint + vitest (--force)
- Step 10: detect-bl --all-domains 실측 (18→19 containers, coverage % 측정)
- Step 11: write-provenance --apply --resolved-by
- Step 12: AIF-RPRT-087 + reports/sprint-289-logistics-poc-2026-05-09.{md,json}
- Step 13: SPEC §6 Sprint 289 블록 갱신 (사후 commit)

## 산출물

- Plan: AIF-PLAN-087
- Report: AIF-RPRT-087
- Code: logistics.ts + spec-container/logistics/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 289 + F455 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 85%
- 8 산업 연속 0 ABSENCE
- 19번째 도메인 활성

## 메타

- **withRuleId 재사용 17 Sprint 연속 정점** (S264~S278+S283~S289)
- **8번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG
- **8 산업 연속 0 ABSENCE** — detector cascade 안정 입증
- **CC-005 batch StatusTransition 8번째 재사용**
- **F445 Path B var-vs-var keyword 8번째 활용**
- **6 BLs 균형 패턴 9번째 정착**
- **누적 27 Sprint** (S262~S289): coverage 13.2% → 85%+ 도전, 5 → 19 도메인 (3.8배)
