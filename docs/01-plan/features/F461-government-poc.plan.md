---
id: AIF-PLAN-093
sprint: 295
feature: F461
title: Government 25번째 도메인 신규 (공공 산업, 14번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-084, AIF-PLAN-085, AIF-PLAN-086, AIF-PLAN-087, AIF-PLAN-088, AIF-PLAN-089, AIF-PLAN-090, AIF-PLAN-091, AIF-PLAN-092]
req: AIF-REQ-035
---

# F461 Plan — AIF-PLAN-093

## 목표

25번째 도메인 공공(Government) 신규 — **14번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV). 23 Sprint 연속 정점 + 14 산업 연속 0 ABSENCE 도전 (compliance 산업).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | government.ts source | ~280 lines, 6 함수 + GovernmentError (code-in-message 표준) |
| 2 | spec-container/government 15 sub-files | provenance + government-rules + GV-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 25번째 entry | container='government' |
| 4 | parser regex `GV` prefix | longer match first 누적 입증 (S294 EN 동일 패턴) |
| 5 | REGISTRY GV-001~GV-006 | withRuleId 23 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 129→135 | expected list +GV × 6 |
| 7 | utils 230 PASS (회귀 0) | vitest, 224+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 25 containers | government 6 BLs, 0 ABSENCE. coverage ≥ 88.5% (88.4% +0.5%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/25 changes (PRESENCE 자동 입증) |
| 11 | 14 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV |
| 12 | Plan + Report + SPEC | AIF-PLAN-093 + AIF-RPRT-093 + §6 Sprint 295 + F461 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| GV-001 | permit application — 신청 한도 검증 (해당 회계연도 한도) | Threshold × 1 | `submitPermitApplication()` |
| GV-002 | fee tier — 누진 수수료 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `feeTierLimit` keyword) | `computeFeeTier()` |
| GV-003 | approval workflow atomic — 결재 + 승인 + 발급 트랜잭션 | Atomic × 1 | `processApproval()` |
| GV-004 | application status transition — submitted → reviewing → approved → issued | Status transition × 1 | `transitionApplicationStatus()` |
| GV-005 | overdue penalty batch — 연체 일괄 가산 처리 | Status transition × 1 (CC-005 batch 14번째 재사용) | `applyOverduePenalty()` |
| GV-006 | document validation atomic — 문서 검증 + 인증 + 발급 트랜잭션 | Atomic × 1 | `validateDocument()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (15번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 15개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN+GV) | longer match first 누적 입증 (S275~S294 14 Sprint) |
| R2 | GV-005 batch 14번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN-005 입증 — 13 Sprint 연속 |
| R3 | GV-002 var-vs-var | F445 Path B `feeAmount > feeTierLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 294 (F460) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-093
- Report: AIF-RPRT-093
- Code: government.ts + spec-container/government/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 295 + F461 entry

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 88.5%
- 14 산업 연속 0 ABSENCE
- 25번째 도메인 활성

## 메타

- **withRuleId 재사용 23 Sprint 연속 정점** (S264~S278+S283~S295)
- **14번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + **GV**
- **14 산업 연속 0 ABSENCE** — compliance 산업 (public sector) 추가
- **CC-005 batch StatusTransition 14번째 재사용**
- **F445 Path B var-vs-var keyword 14번째 활용**
- **6 BLs 균형 패턴 15번째 정착**
- **누적 33 Sprint** (S262~S295): coverage 13.2% → 88.5%+ 도전, 5 → 25 도메인 (5배 마일스톤)
- **25번째 도메인 마일스톤** — 5배 도메인 확장
