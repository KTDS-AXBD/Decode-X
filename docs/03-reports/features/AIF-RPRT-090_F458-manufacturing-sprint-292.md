---
id: AIF-RPRT-090
sprint: 292
feature: F458
plan: AIF-PLAN-090
design: AIF-DSGN-090
title: Manufacturing 22번째 도메인 신규 — 제조 산업, 11번째 신규 산업
status: done
created: 2026-05-09
match_rate: 92
coverage: 87.3
---

# F458 Report — AIF-RPRT-090

## 결과 요약

| 항목 | 결과 |
|------|------|
| Match Rate | 92% |
| detect-bl coverage | **87.3%** (117/134, +0.6%pp from 86.7%) |
| 도메인 수 | 22개 (제조 산업 추가) |
| 산업 수 | 11개 신규 산업 |
| MF-001~006 ABSENCE | **0** (11 산업 연속 0 ABSENCE ✅) |
| withRuleId 연속 정점 | **20 Sprint** (S264~S278+S283~S292) |
| 신규 detector | 0개 |
| utils test | 92 PASS (MF 6 PRESENCE 추가) |
| typecheck | PASS |
| write-provenance --apply | 0/22 changes (PRESENCE 자동 입증) |

## DoD 체크

| # | 항목 | 결과 |
|---|------|------|
| 1 | manufacturing.ts | ✅ 6함수 + ManufacturingError |
| 2 | spec-container 15 files | ✅ provenance+rules+runbooks+tests |
| 3 | DOMAIN_MAP 22번째 | ✅ |
| 4 | parser regex MF prefix | ✅ |
| 5 | REGISTRY MF-001~006 | ✅ |
| 6 | utils test 111→117 | ✅ 117 |
| 7 | utils 92+ PASS | ✅ 92 PASS |
| 8 | typecheck PASS | ✅ |
| 9 | coverage ≥87%, 0 ABSENCE | ✅ 87.3%, 0 ABSENCE |
| 10 | write-provenance 0 changes | ✅ 0/22 |
| 11 | 11 산업 연속 0 ABSENCE | ✅ CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF |
| 12 | Plan+Report+SPEC | ✅ AIF-PLAN-090+AIF-RPRT-090 |

## BL 상세

| BL | 함수 | Detector | 결과 |
|----|------|----------|------|
| MF-001 | `explodeBom` | ThresholdCheck Path A (BOM_MAX_COMPONENTS) | PRESENCE |
| MF-002 | `placeProductionOrder` | ThresholdCheck Path B (capacityLimit) | PRESENCE |
| MF-003 | `confirmProductionOrder` | AtomicTransaction (db.transaction) | PRESENCE |
| MF-004 | `transitionProductionStatus` | StatusTransition (planned→in_progress→qc→released) | PRESENCE |
| MF-005 | `quarantineDefectiveLots` | StatusTransition batch (CC-005 11번째 재사용) | PRESENCE |
| MF-006 | `releaseForShipment` | AtomicTransaction (db.transaction) | PRESENCE |

## 누적 통계 (S262~S292, 30 Sprint)

| 지표 | S262 시작 | S292 결과 |
|------|-----------|-----------|
| detect-bl coverage | 13.2% | **87.3%** (+74.1%pp) |
| 도메인 수 | 5 | **22** (4.4배) |
| BL 총수 | 38 | **134** |
| detector 수 | 5 | **117** |
| 신규 산업 수 | 1 | **11** |
| withRuleId 연속 | 0 | **20 Sprint** |

## 메타 인사이트

- **Sprint 30 마일스톤**: S262~S292 30 Sprint 연속 coverage 성장 완성
- **B2B 산업 첫 추가**: Manufacturing은 Consumer 서비스(여행/숙박) 외 첫 B2B 제조 산업
- **BOM 도메인 패턴**: BOM explosion은 기존 inventory threshold 패턴과 동일하게 ThresholdCheck Path A로 매핑
- **CC-005 batch 11번째**: 불량 격리 배치 패턴이 credit-card 이후 모든 신규 산업에서 재사용됨
