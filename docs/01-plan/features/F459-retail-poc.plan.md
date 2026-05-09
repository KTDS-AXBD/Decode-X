---
id: AIF-PLAN-091
sprint: 293
feature: F459
title: Retail 23번째 도메인 신규 (소매 산업, 12번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-082, AIF-PLAN-083, AIF-PLAN-084, AIF-PLAN-085, AIF-PLAN-086, AIF-PLAN-087, AIF-PLAN-088, AIF-PLAN-089, AIF-PLAN-090]
req: AIF-REQ-035
---

# F459 Plan — AIF-PLAN-091

## 목표

23번째 도메인 소매(Retail) 신규 — **12번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT). 21 Sprint 연속 정점 + 12 산업 연속 0 ABSENCE 도전.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | retail.ts source | ~280 lines, 6 함수 + RetailError (code-in-message 표준) |
| 2 | spec-container/retail 15 sub-files | provenance + retail-rules + RT-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 23번째 entry | container='retail' |
| 4 | parser regex `RT` prefix | longer match first 누적 입증 (S292 MF 동일 패턴) |
| 5 | REGISTRY RT-001~RT-006 | withRuleId 21 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 117→123 | expected list +RT × 6 |
| 7 | utils 218 PASS (회귀 0) | vitest, 212+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 23 containers | retail 6 BLs, 0 ABSENCE. coverage ≥ 87.5% (87.3% +0.5%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/23 changes (PRESENCE 자동 입증) |
| 11 | 12 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT |
| 12 | Plan + Report + SPEC | AIF-PLAN-091 + AIF-RPRT-091 + §6 Sprint 293 + F459 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| RT-001 | SKU listing — 가격 티어 한도 검증 | Threshold × 1 | `listSku()` |
| RT-002 | promotion eligibility — 최소 주문액 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `minOrderLimit` keyword) | `applyPromotion()` |
| RT-003 | order checkout atomic — cart + inventory hold + payment + audit | Atomic × 1 | `processCheckout()` |
| RT-004 | order status transition — placed → confirmed → shipped → delivered → completed | Status transition × 1 | `transitionOrderStatus()` |
| RT-005 | inventory sync batch — 재고 일괄 동기화 | Status transition × 1 (CC-005 batch 12번째 재사용) | `markInventorySync()` |
| RT-006 | return-refund atomic — return + restock + refund | Atomic × 1 | `processReturnRefund()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (13번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 13개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF+RT) | longer match first 누적 입증 (S275~S292 12 Sprint) |
| R2 | RT-005 batch 12번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF-005 입증 — 11 Sprint 연속 |
| R3 | RT-002 var-vs-var | F445 Path B `cartTotal > minOrderLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 292 (F458) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-091
- Report: AIF-RPRT-091
- Code: retail.ts + spec-container/retail/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 293 + F459 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 87.5%
- 12 산업 연속 0 ABSENCE
- 23번째 도메인 활성

## 메타

- **withRuleId 재사용 21 Sprint 연속 정점** (S264~S278+S283~S293)
- **12번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + **RT**
- **12 산업 연속 0 ABSENCE** — e-commerce 산업 추가
- **CC-005 batch StatusTransition 12번째 재사용**
- **F445 Path B var-vs-var keyword 12번째 활용**
- **6 BLs 균형 패턴 13번째 정착**
- **누적 31 Sprint** (S262~S293): coverage 13.2% → 87.5%+ 도전, 5 → 23 도메인 (4.6배)
