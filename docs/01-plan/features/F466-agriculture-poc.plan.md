---
id: AIF-PLAN-098
sprint: 300
feature: F466
title: Agriculture 30번째 도메인 신규 (농업 산업, 19번째 신규 산업) — 🎯 Sprint 300 마일스톤
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-089, AIF-PLAN-090, AIF-PLAN-091, AIF-PLAN-092, AIF-PLAN-093, AIF-PLAN-094, AIF-PLAN-095, AIF-PLAN-096, AIF-PLAN-097]
req: AIF-REQ-035
---

# F466 Plan — AIF-PLAN-098

## 목표 — 🎯 Sprint 300 마일스톤

30번째 도메인 농업(Agriculture) 신규 — **19번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG). 28 Sprint 연속 정점 + 19 산업 연속 0 ABSENCE 도전 + **🎯 Sprint 300 마일스톤 (30 Sprint 누적 + 30번째 도메인 동시 도달)**. 농공품 원자재 산업.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | agriculture.ts source | ~280 lines, 6 함수 + AgricultureError (code-in-message 표준) |
| 2 | spec-container/agriculture 15 sub-files | provenance + agriculture-rules + AG-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 30번째 entry | container='agriculture' |
| 4 | parser regex `AG` prefix | longer match first 누적 입증 (S299 PH 동일 패턴) |
| 5 | REGISTRY AG-001~AG-006 | withRuleId 28 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 159→165 | expected list +AG × 6 |
| 7 | utils 260 PASS (회귀 0) | vitest, 254+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 30 containers | agriculture 6 BLs, 0 ABSENCE. coverage ≥ 90.7% (90.3% +0.4%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/30 changes (PRESENCE 자동 입증) |
| 11 | 19 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG |
| 12 | Plan + Report + SPEC | AIF-PLAN-098 + AIF-RPRT-098 + §6 Sprint 300 + F466 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| AG-001 | crop yield threshold — 단위 면적당 수확량 한도 검증 | Threshold × 1 | `recordCropYield()` |
| AG-002 | pesticide quota — 살포 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `pesticideQuotaLimit` keyword) | `applyPesticide()` |
| AG-003 | harvest atomic — 수확 + 등급 검사 + 출하 트랜잭션 | Atomic × 1 | `processHarvest()` |
| AG-004 | crop status transition — planted → growing → mature → harvested → sold | Status transition × 1 | `transitionCropStatus()` |
| AG-005 | batch grading sync — 등급 일괄 갱신 | Status transition × 1 (CC-005 batch 19번째 재사용) | `markBatchGrading()` |
| AG-006 | certification atomic — 인증 검증 + 서류 발급 + 라벨링 | Atomic × 1 | `issueCertification()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (20번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 20개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD/PH+AG) | longer match first 누적 입증 (S275~S299 19 Sprint) |
| R2 | AG-005 batch 19번째 재사용 | 18 Sprint 연속 모든 도메인 입증 |
| R3 | AG-002 var-vs-var | F445 Path B `applied > pesticideQuotaLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 299 (F465) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-098
- Report: AIF-RPRT-098
- Code: agriculture.ts + spec-container/agriculture/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 300 + F466 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 90.7%
- 19 산업 연속 0 ABSENCE
- **🏆 Sprint 300 마일스톤 + 30번째 도메인 동시 도달**

## 메타 — 🎯 Sprint 300 마일스톤

- **withRuleId 재사용 28 Sprint 연속 정점** (S264~S278+S283~S300)
- **19번째 신규 산업** — CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+**AG**
- **19 산업 연속 0 ABSENCE** — 1차 산업 (원자재) 추가
- **🏆 Sprint 300 + 30번째 도메인 동시 마일스톤**
- **CC-005 batch StatusTransition 19번째 재사용**
- **F445 Path B var-vs-var keyword 19번째 활용**
- **6 BLs 균형 패턴 20번째 정착** (round number)
- **누적 38 Sprint** (S262~S300): coverage 13.2% → 90.7%+ 도전, 5 → 30 도메인 (6배 마일스톤)
- **S262 단일 도메인 시점 대비 6.9배 coverage 증가**
