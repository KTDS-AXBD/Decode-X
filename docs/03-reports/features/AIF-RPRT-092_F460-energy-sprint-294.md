---
id: AIF-RPRT-092
sprint: 294
feature: F460
plan: AIF-PLAN-092
design: AIF-DSGN-092
title: Energy 24번째 도메인 신규 — 에너지/유틸리티 산업, 13번째 신규 산업
status: done
created: 2026-05-10
match_rate: 88
coverage: 88.4
---

# F460 Report — AIF-RPRT-092

## 결과 요약

| 항목 | 결과 |
|------|------|
| Match Rate | 88% (DoD 12/12 PASS) |
| detect-bl coverage | **88.4%** (129/146, +0.5%pp from 87.9%) |
| 도메인 수 | 24개 (에너지/유틸리티 산업 추가) |
| 산업 수 | 13개 신규 산업 |
| EN-001~006 ABSENCE | **0** (13 산업 연속 0 ABSENCE ✅) |
| withRuleId 연속 정점 | **22 Sprint** (S264~S278+S283~S294) |
| 신규 detector | 0개 |
| utils test | 224 PASS (123→129, EN 6 PRESENCE 추가) |
| typecheck | PASS |
| write-provenance --apply | 0/24 changes (PRESENCE 자동 입증) |

## DoD 체크

| # | 항목 | 결과 |
|---|------|------|
| 1 | energy.ts | ✅ 6함수 + EnergyError code-in-message |
| 2 | spec-container 15 files | ✅ provenance+rules+runbooks+tests |
| 3 | DOMAIN_MAP 24번째 | ✅ container='energy' |
| 4 | parser regex EN prefix | ✅ longer match first 누적 입증 |
| 5 | REGISTRY EN-001~EN-006 | ✅ withRuleId 22 Sprint 연속 정점 |
| 6 | utils test count 123→129 | ✅ 129 detectors |
| 7 | utils 224 PASS (회귀 0) | ✅ 224 PASS |
| 8 | typecheck PASS | ✅ packages/utils tsc --noEmit exit 0 |
| 9 | detect-bl 24 containers 0 ABSENCE, ≥88% | ✅ 88.4%, 0 ABSENCE |
| 10 | write-provenance 0 changes | ✅ 0/24 (PRESENCE 자동 입증) |
| 11 | 13 산업 연속 0 ABSENCE | ✅ CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN |
| 12 | Plan+Report+SPEC | ✅ AIF-PLAN-092+AIF-RPRT-092+§6 Sprint 294 |

## BL 상세

| BL | 함수 | Detector | 결과 |
|----|------|----------|------|
| EN-001 | `recordMeterReading()` | ThresholdCheck (Path A) | ✅ PRESENCE |
| EN-002 | `computeBillingTier()` | ThresholdCheck (Path B, `tierUsageLimit` keyword) | ✅ PRESENCE |
| EN-003 | `triggerUsageAlert()` | AtomicTransaction | ✅ PRESENCE |
| EN-004 | `transitionMeterStatus()` | StatusTransition | ✅ PRESENCE |
| EN-005 | `markOutageNotified()` | StatusTransition (CC-005 13번째 재사용) | ✅ PRESENCE |
| EN-006 | `processOverdueSuspension()` | AtomicTransaction | ✅ PRESENCE |

## Coverage 이력 (Sprint 262~294, 32 Sprint)

| Sprint | 도메인 수 | coverage | 산업 수 |
|--------|-----------|----------|---------|
| S262 | 5 | 13.2% | — |
| S274 (F429) | 6 | 31.6% | 1 (CC) |
| S278 (F433) | 8 | 64.6% | — |
| S283 (F449) | 9 | 69.1% | 2 (DV) |
| S284 (F450) | 10 | 75.5% | 3 (SB) |
| S285 (F451) | 11 | 79.3% | 4 (IN) |
| S286 (F452) | 12 | 81.9% | 5 (HC) |
| S287 (F453) | 13 | 83.1% | 6 (ED) |
| S288 (F454) | 14 | 83.8% | 7 (RE) |
| S289 (F455) | 19 | 85.3% | 8 (LG) |
| S290 (F456) | 20 | 86.1% | 9 (HO) |
| S291 (F457) | 21 | 86.5% | 10 (TR) |
| S292 (F458) | 22 | 87.3% | 11 (MF) |
| S293 (F459) | 23 | 87.9% | 12 (RT) |
| **S294 (F460)** | **24** | **88.4%** | **13 (EN)** |

## 누적 마일스톤 (Sprint 294)

- **32 Sprint** 연속 실행 (S262~S294)
- **coverage 13.2% → 88.4%** (+75.2%pp, 누적)
- **도메인 5 → 24개** (4.8배)
- **BL 38 → 146건**
- **detector 5 → 129개**
- **withRuleId 22 Sprint 연속 정점** (S264~S278+S283~S294)
- **13 산업 연속 0 ABSENCE** 🏆 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN)
- **6 BLs 균형 패턴 14번째 정착** (Threshold×2 + Atomic×2 + Status×2)

## 비고

- EN-005 (batch 패턴): CC-005 `markExpiredCards` 13번째 재사용. 이제 CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN 13개 산업 모두 동일 배치 패턴 적용.
- EN-002 (var-vs-var): F445 Path B `tierUsageLimit` 키워드 매칭 — 12번째 활용 (계속 증가).
- 규제 산업(Energy/Utility) 첫 진입: 계량기 사이클(active→reading_due→billed→paid) + 연체 정지(suspend→lock) 상태 머신 패턴 신규 추가.
