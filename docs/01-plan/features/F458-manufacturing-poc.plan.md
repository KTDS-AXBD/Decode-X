---
id: AIF-PLAN-090
sprint: 292
feature: F458
title: Manufacturing 22번째 도메인 신규 (제조 산업, 11번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-082, AIF-PLAN-083, AIF-PLAN-084, AIF-PLAN-085, AIF-PLAN-086, AIF-PLAN-087, AIF-PLAN-088, AIF-PLAN-089]
req: AIF-REQ-035
---

# F458 Plan — AIF-PLAN-090

## 목표

22번째 도메인 제조(Manufacturing) 신규 — **11번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF). 20 Sprint 연속 정점 + 11 산업 연속 0 ABSENCE 도전 (B2B 산업 다양성 첨수).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | manufacturing.ts source | ~280 lines, 6 함수 + ManufacturingError (code-in-message 표준) |
| 2 | spec-container/manufacturing 15 sub-files | provenance + manufacturing-rules + MF-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 22번째 entry | container='manufacturing' |
| 4 | parser regex `MF` prefix | longer match first 누적 입증 (S291 TR 동일 패턴) |
| 5 | REGISTRY MF-001~MF-006 | withRuleId 20 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 111→117 | expected list +MF × 6 |
| 7 | utils 212 PASS (회귀 0) | vitest, 206+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 22 containers | manufacturing 6 BLs, 0 ABSENCE. coverage ≥ 87% (86.7% +0.5%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/22 changes (PRESENCE 자동 입증) |
| 11 | 11 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF |
| 12 | Plan + Report + SPEC | AIF-PLAN-090 + AIF-RPRT-090 + §6 Sprint 292 + F458 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| MF-001 | BOM explosion — component 수 한도 검증 | Threshold × 1 | `explodeBom()` |
| MF-002 | production order capacity — capacity 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `capacityLimit` keyword) | `placeProductionOrder()` |
| MF-003 | production order atomic — order + reserve materials + schedule | Atomic × 1 | `confirmProductionOrder()` |
| MF-004 | production status transition — planned → in_progress → qc → released | Status transition × 1 | `transitionProductionStatus()` |
| MF-005 | defect quarantine batch — 불량 일괄 격리 갱신 | Status transition × 1 (CC-005 batch 11번째 재사용) | `quarantineDefectiveLots()` |
| MF-006 | shipment release atomic — QC pass + inventory adjust + release | Atomic × 1 | `releaseForShipment()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (12번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 12개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR+MF) | longer match first 누적 입증 (S275~S291 11 Sprint) |
| R2 | MF-005 batch 11번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR-005 입증 — 10 Sprint 연속 |
| R3 | MF-002 var-vs-var | F445 Path B `requiredCapacity > capacityLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 291 (F457) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-090
- Report: AIF-RPRT-090
- Code: manufacturing.ts + spec-container/manufacturing/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 292 + F458 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 87%
- 11 산업 연속 0 ABSENCE
- 22번째 도메인 활성

## 메타

- **withRuleId 재사용 20 Sprint 연속 정점** (S264~S278+S283~S292)
- **11번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + **MF**
- **11 산업 연속 0 ABSENCE** — B2B 산업 첫 추가 (Travel consumer 외)
- **CC-005 batch StatusTransition 11번째 재사용**
- **F445 Path B var-vs-var keyword 11번째 활용**
- **6 BLs 균형 패턴 12번째 정착**
- **누적 30 Sprint** (S262~S292): coverage 13.2% → 87%+ 도전, 5 → 22 도메인 (4.4배), Sprint 30회 마일스톤
