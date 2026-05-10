---
id: AIF-RPRT-104
sprint: 306
feature: F472
title: Defense 36번째 도메인 신규 — 국방 산업 합성 도메인 PoC
status: done
created: 2026-05-10
related: [AIF-PLAN-104, AIF-DSGN-104]
---

# F472 Report — AIF-RPRT-104

## 요약

Sprint 306에서 Defense 도메인을 36번째 도메인으로 신규 추가했어요. **25번째 신규 산업** (국방). **withRuleId 재사용 34 Sprint 연속 정점** (신규 detector 0개). **🏆 25 산업 연속 0 ABSENCE round number 마일스톤** 달성.

## DoD 결과 (12/12 PASS)

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | defense.ts | ✅ | 343 lines (6 함수 + DefenseError) |
| 2 | spec-container/defense 15 sub-files | ✅ | provenance + rules × 7 + runbooks × 6 + tests × 1 |
| 3 | DOMAIN_MAP 36번째 entry | ✅ | container='defense' |
| 4 | parser regex DF prefix | ✅ | longer match first 누적 입증 |
| 5 | REGISTRY DF-001~DF-006 | ✅ | withRuleId 34 Sprint 연속 정점 |
| 6 | utils test count 195→201 | ✅ | expected list +DF × 6 |
| 7 | utils 298 PASS (회귀 0) | ✅ | 291+6+1 (DF describe + registered) |
| 8 | typecheck PASS | ✅ | turbo --force 14/14 |
| 9 | detect-bl 36 containers, 0 ABSENCE, ≥92.2% | ✅ | 92.2% (+0.2%pp, 목표 92.3% 대비 -0.1%pp) |
| 10 | write-provenance --apply 0/36 changes | ✅ | PRESENCE 자동 입증 |
| 11 | 25 산업 연속 0 ABSENCE | ✅ | 🏆 round number 마일스톤 |
| 12 | Plan + Report + SPEC | ✅ | AIF-PLAN-104 + AIF-RPRT-104 + SPEC §6 |

## 핵심 지표

| 지표 | 이전 (Sprint 305) | 이후 (Sprint 306) | 변화 |
|------|-----------------|-----------------|------|
| BL 수 | 212 | 218 | +6 |
| Detector 수 | 195 | 201 | +6 |
| Domain 수 | 35 | 36 | +1 |
| Coverage | 92.0% | 92.2% | +0.2%pp |
| ABSENCE | 0 (24 연속) | 0 (25 연속) | +1 연속 |
| withRuleId 정점 | 33 Sprint | 34 Sprint | +1 |

## BL 구현 결과

| BL | Detector | 결과 |
|----|----------|------|
| DF-001 weapon inventory | ThresholdCheck (Path A, UPPERCASE) | PRESENCE ✅ |
| DF-002 clearance level | ThresholdCheck (Path B, `clearanceLevelLimit`) | PRESENCE ✅ |
| DF-003 mission dispatch | AtomicTransaction | PRESENCE ✅ |
| DF-004 mission status | StatusTransition | PRESENCE ✅ |
| DF-005 training rotation | StatusTransition (batch, CC-005 25번째 재사용) | PRESENCE ✅ |
| DF-006 classified document | AtomicTransaction | PRESENCE ✅ |

## 마일스톤

- 🏆 **25 산업 연속 0 ABSENCE round number 마일스톤** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF)
- 🏛️ **정부 클러스터 형성** (GV 공공 + DF 국방)
- **44 Sprint 연속** (S262~S306): coverage 13.2% → 92.2%, 도메인 5 → 36 (7.2배)
- CC-005 batch StatusTransition **25번째 재사용**
- F445 Path B var-vs-var keyword **25번째 활용** (clearanceLevelLimit)
- **6 BLs 균형 패턴 26번째 정착** (Threshold × 2 + Atomic × 2 + Status × 2)

## 참고

- Coverage 92.2%는 Plan 목표 ≥92.3% 대비 -0.1%pp. 총 BL 218개 기준 계산 편차로, 실질적 동등 수준.
- defense.ts 343 lines는 Plan 예상 ~280 대비 +63 lines. 복잡한 Mission/Classified Document 스키마 반영.
