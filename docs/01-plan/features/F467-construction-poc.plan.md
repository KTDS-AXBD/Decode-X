---
id: AIF-PLAN-099
sprint: 301
feature: F467
title: Construction 31번째 도메인 신규 (건설 산업, 20번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-090, AIF-PLAN-091, AIF-PLAN-092, AIF-PLAN-093, AIF-PLAN-094, AIF-PLAN-095, AIF-PLAN-096, AIF-PLAN-097, AIF-PLAN-098]
req: AIF-REQ-035
---

# F467 Plan — AIF-PLAN-099

## 목표

31번째 도메인 건설(Construction) 신규 — **20번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN). 29 Sprint 연속 정점 + 20 산업 연속 0 ABSENCE 도전 (round number 산업). project management + payment retention 특화.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | construction.ts source | ~280 lines, 6 함수 + ConstructionError (code-in-message 표준) |
| 2 | spec-container/construction 15 sub-files | provenance + construction-rules + CN-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 31번째 entry | container='construction' |
| 4 | parser regex `CN` prefix | longer match first 누적 입증 (S300 AG 동일 패턴) |
| 5 | REGISTRY CN-001~CN-006 | withRuleId 29 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 165→171 | expected list +CN × 6 |
| 7 | utils 266 PASS (회귀 0) | vitest, 260+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 31 containers | construction 6 BLs, 0 ABSENCE. coverage ≥ 91% (90.7% +0.4%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/31 changes (PRESENCE 자동 입증) |
| 11 | 20 산업 연속 0 ABSENCE | CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN |
| 12 | Plan + Report + SPEC | AIF-PLAN-099 + AIF-RPRT-099 + §6 Sprint 301 + F467 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| CN-001 | project bidding — 입찰 금액 한도 검증 | Threshold × 1 | `submitBid()` |
| CN-002 | payment retention — 보유금 비율 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `retentionRateLimit` keyword) | `computePaymentRetention()` |
| CN-003 | change order atomic — 변경 청구 + 단가 재계산 + 승인 트랜잭션 | Atomic × 1 | `processChangeOrder()` |
| CN-004 | project status transition — bidding → awarded → in_progress → completed → closed | Status transition × 1 | `transitionProjectStatus()` |
| CN-005 | progress milestone batch — 마일스톤 일괄 갱신 | Status transition × 1 (CC-005 batch 20번째 재사용) | `markMilestoneCompletion()` |
| CN-006 | safety inspection atomic — 안전 검사 + 시정 명령 + 통과 처리 | Atomic × 1 | `processSafetyInspection()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (21번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 21개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK/MD/PH/AG+CN) | longer match first 누적 입증 (S275~S300 20 Sprint) |
| R2 | CN-005 batch 20번째 재사용 | 19 Sprint 연속 모든 도메인 입증 |
| R3 | CN-002 var-vs-var | F445 Path B `retentionRate > retentionRateLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 300 (F466) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-099
- Report: AIF-RPRT-099
- Code: construction.ts + spec-container/construction/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 301 + F467 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 91%
- 20 산업 연속 0 ABSENCE (round number)
- 31번째 도메인 활성

## 메타

- **withRuleId 재사용 29 Sprint 연속 정점** (S264~S278+S283~S301)
- **20번째 신규 산업** — 20 산업 연속 0 ABSENCE round number (B2C + B2B + 규제 + 1차 + 인프라 골고루)
- **CC-005 batch StatusTransition 20번째 재사용**
- **F445 Path B var-vs-var keyword 20번째 활용**
- **6 BLs 균형 패턴 21번째 정착**
- **누적 39 Sprint** (S262~S301): coverage 13.2% → 91%+ 도전, 5 → 31 도메인 (6.2배)
- **차기 Sprint 302 후속** — 잔여 17건 미감지 BL 분석 또는 신규 산업
