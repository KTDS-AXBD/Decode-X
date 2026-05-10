---
id: AIF-PLAN-104
sprint: 306
feature: F472
title: Defense 36번째 도메인 신규 (국방 산업, 25번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-095, AIF-PLAN-096, AIF-PLAN-097, AIF-PLAN-098, AIF-PLAN-099, AIF-PLAN-100, AIF-PLAN-101, AIF-PLAN-102, AIF-PLAN-103]
req: AIF-REQ-035
---

# F472 Plan — AIF-PLAN-104

## 목표

36번째 도메인 국방(Defense) 신규 — **25번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF). 34 Sprint 연속 정점 + **25 산업 연속 0 ABSENCE round number 마일스톤** 도전. compliance + clearance level 특화 (GV 공공 + DF 국방 = 정부 클러스터).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | defense.ts source | ~280 lines, 6 함수 + DefenseError (code-in-message 표준) |
| 2 | spec-container/defense 15 sub-files | provenance + defense-rules + DF-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 36번째 entry | container='defense' |
| 4 | parser regex `DF` prefix | longer match first 누적 입증 (S305 MN 동일 패턴) |
| 5 | REGISTRY DF-001~DF-006 | withRuleId 34 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 195→201 | expected list +DF × 6 |
| 7 | utils 297 PASS (회귀 0) | vitest, 291+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 36 containers | defense 6 BLs, 0 ABSENCE. coverage ≥ 92.3% (92.0% +0.3%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/36 changes (PRESENCE 자동 입증) |
| 11 | 25 산업 연속 0 ABSENCE | round number 마일스톤 |
| 12 | Plan + Report + SPEC | AIF-PLAN-104 + AIF-RPRT-104 + §6 Sprint 306 + F472 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| DF-001 | weapon inventory — 무기 보유 한도 검증 | Threshold × 1 | `recordWeaponInventory()` |
| DF-002 | clearance level tier — 보안 레벨 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `clearanceLevelLimit` keyword) | `checkClearanceLevel()` |
| DF-003 | mission dispatch atomic — 임무 + 인원 + 장비 + 통신 트랜잭션 | Atomic × 1 | `dispatchMission()` |
| DF-004 | mission status transition — planned → briefed → executing → completed → debriefed | Status transition × 1 | `transitionMissionStatus()` |
| DF-005 | training rotation batch — 훈련 일괄 갱신 | Status transition × 1 (CC-005 batch 25번째 재사용) | `markTrainingRotation()` |
| DF-006 | classified document atomic — 분류 + 검증 + 발급 + 감사 트랜잭션 | Atomic × 1 | `processClassifiedDocument()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (26번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 26개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD/PH/AG/CN/MR/TS/AV/MN+DF) | longer match first 누적 입증 (S275~S305 25 Sprint) |
| R2 | DF-005 batch 25번째 재사용 | 24 Sprint 연속 모든 도메인 입증 |
| R3 | DF-002 var-vs-var | F445 Path B `userClearance > clearanceLevelLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 305 (F471) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-104
- Report: AIF-RPRT-104
- Code: defense.ts + spec-container/defense/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 306 + F472 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 92.3%
- **🏆 25 산업 연속 0 ABSENCE round number 마일스톤**
- 36번째 도메인 활성

## 메타

- **🏆 25 산업 연속 0 ABSENCE round number 마일스톤** (regulator 5종: BK + GV + EN + DF + IN)
- **withRuleId 재사용 34 Sprint 연속 정점** (S264~S278+S283~S306)
- **25번째 신규 산업** — 정부 클러스터 형성 (GV + DF)
- **CC-005 batch StatusTransition 25번째 재사용**
- **F445 Path B var-vs-var keyword 25번째 활용**
- **6 BLs 균형 패턴 26번째 정착**
- **누적 44 Sprint** (S262~S306): coverage 13.2% → 92.3%+ 도전, 5 → 36 도메인 (7.2배)
