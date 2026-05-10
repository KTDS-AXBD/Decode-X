---
id: AIF-PLAN-103
sprint: 305
feature: F471
title: Mining 35번째 도메인 신규 (광업 산업, 24번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-094, AIF-PLAN-095, AIF-PLAN-096, AIF-PLAN-097, AIF-PLAN-098, AIF-PLAN-099, AIF-PLAN-100, AIF-PLAN-101, AIF-PLAN-102]
req: AIF-REQ-035
---

# F471 Plan — AIF-PLAN-103

## 목표

35번째 도메인 광업(Mining) 신규 — **24번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN). 33 Sprint 연속 정점 + 24 산업 연속 0 ABSENCE 도전. 원자재 채광업 (AG 농업과 함께 1차 산업 클러스터 형성).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | mining.ts source | ~280 lines, 6 함수 + MiningError (code-in-message 표준) |
| 2 | spec-container/mining 15 sub-files | provenance + mining-rules + MN-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 35번째 entry | container='mining' |
| 4 | parser regex `MN` prefix | longer match first 누적 입증 (S304 AV 동일 패턴) |
| 5 | REGISTRY MN-001~MN-006 | withRuleId 33 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 189→195 | expected list +MN × 6 |
| 7 | utils 290 PASS (회귀 0) | vitest, 284+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 35 containers | mining 6 BLs, 0 ABSENCE. coverage ≥ 92% (91.7% +0.3%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/35 changes (PRESENCE 자동 입증) |
| 11 | 24 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN |
| 12 | Plan + Report + SPEC | AIF-PLAN-103 + AIF-RPRT-103 + §6 Sprint 305 + F471 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| MN-001 | extraction quota — 채광량 한도 검증 | Threshold × 1 | `recordExtraction()` |
| MN-002 | royalty payment tier — 로열티 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `royaltyTierLimit` keyword) | `computeRoyalty()` |
| MN-003 | blast operation atomic — 발파 검증 + 안전 + 작업 트랜잭션 | Atomic × 1 | `processBlastOperation()` |
| MN-004 | ore status transition — extracted → graded → processed → shipped | Status transition × 1 | `transitionOreStatus()` |
| MN-005 | environmental compliance batch — 환경 일괄 점검 | Status transition × 1 (CC-005 batch 24번째 재사용) | `runComplianceBatch()` |
| MN-006 | safety incident atomic — 사고 신고 + 조사 + 시정 트랜잭션 | Atomic × 1 | `processSafetyIncident()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (25번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 25개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD/PH/AG/CN/MR/TS/AV+MN) | longer match first 누적 입증 (S275~S304 24 Sprint) |
| R2 | MN-005 batch 24번째 재사용 | 23 Sprint 연속 모든 도메인 입증 |
| R3 | MN-002 var-vs-var | F445 Path B `royaltyAmount > royaltyTierLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 304 (F470) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-103
- Report: AIF-RPRT-103
- Code: mining.ts + spec-container/mining/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 305 + F471 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 92% (90%+ 안정화 정점)
- 24 산업 연속 0 ABSENCE
- 35번째 도메인 활성

## 메타

- **withRuleId 재사용 33 Sprint 연속 정점** (S264~S278+S283~S305)
- **24번째 신규 산업** — 1차 산업 클러스터 형성 (AG + MN)
- **CC-005 batch StatusTransition 24번째 재사용**
- **F445 Path B var-vs-var keyword 24번째 활용**
- **6 BLs 균형 패턴 25번째 정착** (round number 마일스톤)
- **누적 43 Sprint** (S262~S305): coverage 13.2% → 92%+ 도전, 5 → 35 도메인 (7배)
