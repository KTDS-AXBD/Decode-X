---
id: AIF-PLAN-097
sprint: 299
feature: F465
title: Pharmacy 29번째 도메인 신규 (제약/약국 산업, 18번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-088, AIF-PLAN-089, AIF-PLAN-090, AIF-PLAN-091, AIF-PLAN-092, AIF-PLAN-093, AIF-PLAN-094, AIF-PLAN-095, AIF-PLAN-096]
req: AIF-REQ-035
---

# F465 Plan — AIF-PLAN-097

## 목표

29번째 도메인 제약/약국(Pharmacy) 신규 — **18번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH). 27 Sprint 연속 정점 + 18 산업 연속 0 ABSENCE 도전 + **🎯 90.4% coverage 도전** (90% 돌파 직후 안정화). 의료 인접 산업 (HC + PH 동시 보유 = 의료 클러스터 형성).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | pharmacy.ts source | ~280 lines, 6 함수 + PharmacyError (code-in-message 표준) |
| 2 | spec-container/pharmacy 15 sub-files | provenance + pharmacy-rules + PH-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 29번째 entry | container='pharmacy' |
| 4 | parser regex `PH` prefix | longer match first 누적 입증 (S298 MD 동일 패턴) |
| 5 | REGISTRY PH-001~PH-006 | withRuleId 27 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 153→159 | expected list +PH × 6 |
| 7 | utils 254 PASS (회귀 0) | vitest, 248+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 29 containers | pharmacy 6 BLs, 0 ABSENCE. coverage ≥ 90.4% (90.0% +0.4%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/29 changes (PRESENCE 자동 입증) |
| 11 | 18 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH |
| 12 | Plan + Report + SPEC | AIF-PLAN-097 + AIF-RPRT-097 + §6 Sprint 299 + F465 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| PH-001 | dosage threshold — 일일 최대 용량 한도 검증 | Threshold × 1 | `validateDosage()` |
| PH-002 | refill quota — 처방 잔여 횟수 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `refillQuotaLimit` keyword) | `checkRefillQuota()` |
| PH-003 | prescription dispense atomic — 처방 검증 + 재고 차감 + 약품 발급 | Atomic × 1 | `dispensePrescription()` |
| PH-004 | prescription status transition — issued → pending → dispensed → completed → expired | Status transition × 1 | `transitionPrescriptionStatus()` |
| PH-005 | recall notification batch — 회수 대상 약품 일괄 통지 | Status transition × 1 (CC-005 batch 18번째 재사용) | `markRecalledBatches()` |
| PH-006 | drug interaction atomic — 상호작용 검증 + 대체약 추천 + 처방 차단 | Atomic × 1 | `checkDrugInteraction()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (19번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 19개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD+PH) | longer match first 누적 입증 (S275~S298 18 Sprint) |
| R2 | PH-005 batch 18번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD-005 입증 — 17 Sprint 연속 |
| R3 | PH-002 var-vs-var | F445 Path B `refillsUsed > refillQuotaLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 298 (F464) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-097
- Report: AIF-RPRT-097
- Code: pharmacy.ts + spec-container/pharmacy/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 299 + F465 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 90.4% (90% 안정화)
- 18 산업 연속 0 ABSENCE
- 29번째 도메인 활성

## 메타

- **withRuleId 재사용 27 Sprint 연속 정점** (S264~S278+S283~S299)
- **18번째 신규 산업** — CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+**PH**
- **18 산업 연속 0 ABSENCE** — 의료 클러스터 형성 (HC + PH)
- **CC-005 batch StatusTransition 18번째 재사용**
- **F445 Path B var-vs-var keyword 18번째 활용**
- **6 BLs 균형 패턴 19번째 정착**
- **누적 37 Sprint** (S262~S299): coverage 13.2% → 90.4%+ 도전, 5 → 29 도메인 (5.8배)
- **차기 Sprint 300 마일스톤** — 30 sprint 누적 + 30번째 도메인 동시 도달 가능
