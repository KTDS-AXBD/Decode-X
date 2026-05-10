---
id: AIF-RPRT-106
sprint: 308
feature: F474
title: Charity 38번째 도메인 신규 — Sprint 308 완료 보고서
status: done
created: 2026-05-10
plan: AIF-PLAN-106
---

# F474 Report — AIF-RPRT-106

## 실행 결과 요약

| 항목 | 결과 |
|------|------|
| Sprint | 308 |
| Feature | F474 |
| 도메인 | Charity (비영리 산업, 27번째 신규 산업) |
| 도메인 번호 | 38번째 |
| Match Rate | **100%** |
| Coverage | **92.6%** (92.0% → 92.6%, +0.6%pp) |
| ABSENCE | **0** (27 산업 연속 0 ABSENCE) 🏆 |
| tests | **312 PASS** (회귀 0) |
| typecheck | **PASS** |
| DoD | **12/12** |

## DoD 검증

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | charity.ts source | ✅ | ~290 lines, 6 함수 + CharityError |
| 2 | spec-container/charity 15 sub-files | ✅ | provenance + charity-rules + CH-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 38번째 entry | ✅ | container='charity' |
| 4 | parser regex `CH` prefix | ✅ | CC\|CH 순서 (longer match first) |
| 5 | REGISTRY CH-001~CH-006 | ✅ | withRuleId 36 Sprint 연속 정점 |
| 6 | utils unit test count 207→213 | ✅ | REGISTRY 213개 확인 |
| 7 | utils 312 PASS (회귀 0) | ✅ | 306+6=312 (Plan 추정 311+1) |
| 8 | typecheck PASS | ✅ | turbo 14 tasks all pass |
| 9 | detect-bl 38 containers | ✅ | charity 6 BLs, 0 ABSENCE. coverage 92.6% |
| 10 | write-provenance --apply | ✅ | 0/38 changes (수동 마커 부재) |
| 11 | 27 산업 연속 0 ABSENCE | ✅ | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH |
| 12 | Plan + Report + SPEC | ✅ | AIF-PLAN-106 + AIF-RPRT-106 + §6 Sprint 308 |

## Coverage

```
= Multi-Domain BL Detector — 38 containers ===
charity [source: .../charity.ts]: 6 BLs, 6 applicable detectors, 0 ABSENCE markers

Summary: 230 total BLs, 213 detector applications across 38 containers
Detector coverage: 213/230 = 92.6%
```

**DoD Note**: Plan 추정 92.7%, 실측 92.6% (0.1% 미차). 양수 방향(+0.6%pp) 이동 확인.

## BL 현황

| BL | Detector | 결과 |
|----|----------|------|
| CH-001 | ThresholdCheck (Path A, MAX_RECEIPT_AMOUNT) | ✅ PRESENCE |
| CH-002 | ThresholdCheck (Path B, grantTierLimit keyword) | ✅ PRESENCE |
| CH-003 | AtomicTransaction (disburseFund) | ✅ PRESENCE |
| CH-004 | StatusTransition (draft→active→closed→reported→audited) | ✅ PRESENCE |
| CH-005 | StatusTransition (batch markVolunteerSchedule) | ✅ PRESENCE |
| CH-006 | AtomicTransaction (issueTaxCertificate) | ✅ PRESENCE |

## 누적 지표 (S262~S308, 46 Sprint)

| 지표 | 값 |
|------|-----|
| coverage | 13.2% → **92.6%** (+79.4%pp) |
| 도메인 | 5 → **38** (7.6배) |
| BL 총수 | 38 → **230** |
| detector | 5 → **213** |
| withRuleId 연속 정점 | 36 Sprint |
| 신규 산업 연속 0 ABSENCE | **27** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH) |
