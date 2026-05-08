---
id: AIF-PLAN-086
sprint: 288
feature: F454
title: Real Estate 18번째 도메인 신규 (부동산 산업, 7번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-081, AIF-PLAN-082, AIF-PLAN-083, AIF-PLAN-084, AIF-PLAN-085]
req: AIF-REQ-035
---

# F454 Plan — AIF-PLAN-086

## 목표

18번째 도메인 부동산(Real Estate) 신규 — **7번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE). 16 Sprint 연속 정점 + 7 산업 연속 0 ABSENCE 목표.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | realestate.ts source | ~280 lines, 6 함수 + RealEstateError |
| 2 | spec-container 15 sub-files | provenance + realestate-rules + RE-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 18번째 entry | container='realestate' |
| 4 | parser regex RE prefix | longer match first |
| 5 | REGISTRY RE-001~RE-006 | withRuleId 16 Sprint 연속 |
| 6 | utils unit test count 87→93 | expected list +RE × 6 (P-007과 SB-001 사이) |
| 7 | utils 188 PASS (회귀 0) | vitest |
| 8 | typecheck PASS | turbo 우회 |
| 9 | detect-bl 18 containers | realestate 6 BLs, 0 ABSENCE. coverage ≥ 84% |
| 10 | write-provenance --apply | --resolved-by, 0/18 changes |
| 11 | 7 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE |
| 12 | Plan + Report + SPEC | AIF-PLAN-086 + AIF-RPRT-086 |

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 8개 2글자 prefix | longer match first 누적 입증 |
| R2 | RE-005 batch 7번째 재사용 | CC/DV/SB/IN/HC/ED-005 입증 |
| R3 | RE-002 var-vs-var | F445 Path B `rentLimit < monthlyRentKrw` (`limit` keyword) |

## Implementation Steps

1~13: Sprint 287 동일 패턴

## 산출물

- Plan: AIF-PLAN-086
- Report: AIF-RPRT-086
- Code: realestate.ts + spec-container/realestate/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 288 + F454

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 84%
- 7 산업 연속 0 ABSENCE
- 18번째 도메인 활성

## 메타

- **withRuleId 재사용 16 Sprint 연속 정점** (S264~S278+S283~S288)
- **7번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE
- **7 산업 연속 0 ABSENCE** — detector cascade 안정 입증
- **CC-005 batch 7번째 재사용**
