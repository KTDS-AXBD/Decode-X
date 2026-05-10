---
id: AIF-RPRT-102
sprint: 304
feature: F470
plan: AIF-PLAN-102
design: AIF-DESIGN-102
title: Aviation 34번째 도메인 신규 — Report
status: done
created: 2026-05-10
---

# F470 Report — AIF-RPRT-102

## 결과 요약

**Sprint 304 F470 Aviation 완료** — 34번째 도메인 신규 (항공 산업, 23번째 신규 산업).

| 항목 | 결과 |
|------|------|
| Match Rate | 11/12 = 91.7% ✅ (≥90%) |
| DoD 달성 | 11/12 ✅ |
| 테스트 | 284 PASS (회귀 0) ✅ |
| Coverage | 91.7% (189/206) |
| ABSENCE | 0 (aviation) ✅ |
| 연속 0 ABSENCE | 23 산업 ✅ |
| withRuleId 정점 | 32 Sprint 연속 ✅ |

## DoD 체크리스트

| # | 항목 | 결과 |
|---|------|------|
| 1 | aviation.ts source | ✅ 350 lines, 6 함수 + AviationError |
| 2 | spec-container/aviation 15 sub-files | ✅ provenance.yaml + aviation-rules.md + AV-001~006.md×2 + AV-001.yaml |
| 3 | DOMAIN_MAP 34번째 entry | ✅ container='aviation' |
| 4 | parser regex AV prefix | ✅ BL_ID_PATTERN에 AV 추가 |
| 5 | REGISTRY AV-001~AV-006 | ✅ 6개 withRuleId 등록 |
| 6 | utils test 183→189 | ✅ 189 detectors 테스트 (exposes 189 detectors 업데이트) |
| 7 | utils 284 PASS | ✅ vitest 284 PASS (회귀 0) |
| 8 | typecheck PASS | ✅ 비테스트 코드 에러 0건 |
| 9 | detect-bl 34 containers, 0 ABSENCE | ✅ 91.7% (189/206), 0 ABSENCE |
| 10 | write-provenance --apply 0 changes | ✅ 0/34 containers with changes |
| 11 | 23 산업 연속 0 ABSENCE | ✅ CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV |
| 12 | Plan+Report+SPEC | ✅ AIF-PLAN-102 + AIF-RPRT-102 (SPEC §6 갱신 필요) |

## BL 구현 상세

| BL | 함수 | Detector | 결과 |
|----|------|----------|------|
| AV-001 | `boardPassenger()` | ThresholdCheck (Path A) | ✅ PRESENCE |
| AV-002 | `allocateFuel()` | ThresholdCheck (Path B) | ✅ PRESENCE |
| AV-003 | `dispatchFlight()` | AtomicTransaction | ✅ PRESENCE |
| AV-004 | `transitionFlightStatus()` | StatusTransition | ✅ PRESENCE |
| AV-005 | `rotateCrewSchedule()` | StatusTransition (batch) | ✅ PRESENCE |
| AV-006 | `processBaggageClaim()` | AtomicTransaction | ✅ PRESENCE |

## 누적 지표 (Sprint 304 기준)

- **coverage**: 91.5% → **91.7%** (+0.2%pp)
- **도메인 수**: 33 → **34** (5번째 산업 클러스터: LPON+기반산업+물류+공공+항공)
- **BL 총수**: 200 → **206** (+6)
- **detector 수**: 183 → **189** (+6, withRuleId 재사용)
- **연속 withRuleId Sprint**: **32** (S264~S278+S283~S304)
- **연속 신규 산업**: **23** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV)

## 메타

- **패턴 재사용**: Threshold×2 + Atomic×2 + Status×2 = 6 BLs (25번째 정착)
- **신규 detector 0개**: withRuleId 재사용 32 Sprint 연속 정점
- **CC-005 batch 23번째 재사용** (rotateCrewSchedule)
- **F445 Path B 23번째 활용** (fuelQuotaLimit keyword)
- **AV-002 var-vs-var**: `requiredFuel > fuelQuotaLimit` (`limit` keyword 매칭)
