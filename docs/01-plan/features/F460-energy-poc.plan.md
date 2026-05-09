---
id: AIF-PLAN-092
sprint: 294
feature: F460
title: Energy 24번째 도메인 신규 (에너지/유틸리티 산업, 13번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-083, AIF-PLAN-084, AIF-PLAN-085, AIF-PLAN-086, AIF-PLAN-087, AIF-PLAN-088, AIF-PLAN-089, AIF-PLAN-090, AIF-PLAN-091]
req: AIF-REQ-035
---

# F460 Plan — AIF-PLAN-092

## 목표

24번째 도메인 에너지/유틸리티(Energy) 신규 — **13번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN). 22 Sprint 연속 정점 + 13 산업 연속 0 ABSENCE 도전 (규제 산업).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | energy.ts source | ~280 lines, 6 함수 + EnergyError (code-in-message 표준) |
| 2 | spec-container/energy 15 sub-files | provenance + energy-rules + EN-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 24번째 entry | container='energy' |
| 4 | parser regex `EN` prefix | longer match first 누적 입증 (S293 RT 동일 패턴) |
| 5 | REGISTRY EN-001~EN-006 | withRuleId 22 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 123→129 | expected list +EN × 6 |
| 7 | utils 224 PASS (회귀 0) | vitest, 218+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 24 containers | energy 6 BLs, 0 ABSENCE. coverage ≥ 88% (87.9% +0.5%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/24 changes (PRESENCE 자동 입증) |
| 11 | 13 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN |
| 12 | Plan + Report + SPEC | AIF-PLAN-092 + AIF-RPRT-092 + §6 Sprint 294 + F460 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| EN-001 | meter reading — 사용량 한도 검증 (peak limit) | Threshold × 1 | `recordMeterReading()` |
| EN-002 | billing tier — 누진 구간 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `tierUsageLimit` keyword) | `computeBillingTier()` |
| EN-003 | usage threshold alert — 사용량 + alert 발송 트랜잭션 | Atomic × 1 | `triggerUsageAlert()` |
| EN-004 | meter status transition — active → reading_due → billed → paid | Status transition × 1 | `transitionMeterStatus()` |
| EN-005 | outage notification batch — 정전 일괄 통지 갱신 | Status transition × 1 (CC-005 batch 13번째 재사용) | `markOutageNotified()` |
| EN-006 | payment overdue suspend — 연체 + suspend + 미터 lockout 트랜잭션 | Atomic × 1 | `processOverdueSuspension()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (14번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 14개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT+EN) | longer match first 누적 입증 (S275~S293 13 Sprint) |
| R2 | EN-005 batch 13번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT-005 입증 — 12 Sprint 연속 |
| R3 | EN-002 var-vs-var | F445 Path B `usage > tierUsageLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 293 (F459) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-092
- Report: AIF-RPRT-092
- Code: energy.ts + spec-container/energy/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 294 + F460 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 88%
- 13 산업 연속 0 ABSENCE
- 24번째 도메인 활성

## 메타

- **withRuleId 재사용 22 Sprint 연속 정점** (S264~S278+S283~S294)
- **13번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + **EN**
- **13 산업 연속 0 ABSENCE** — 규제 산업 (utility) 추가
- **CC-005 batch StatusTransition 13번째 재사용**
- **F445 Path B var-vs-var keyword 13번째 활용**
- **6 BLs 균형 패턴 14번째 정착**
- **누적 32 Sprint** (S262~S294): coverage 13.2% → 88%+ 도전, 5 → 24 도메인 (4.8배)
