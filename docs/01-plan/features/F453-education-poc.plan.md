---
id: AIF-PLAN-085
sprint: 287
feature: F453
title: Education 17번째 도메인 신규 (교육 산업, 6번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-081, AIF-PLAN-082, AIF-PLAN-083, AIF-PLAN-084]
req: AIF-REQ-035
---

# F453 Plan — AIF-PLAN-085

## 목표

17번째 도메인 교육(Education) 신규 — **6번째 신규 산업** (CC + DV + SB + IN + HC + ED). 15 Sprint 연속 정점 + 6 산업 연속 0 ABSENCE 목표.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | education.ts source | ~265 lines, 6 함수 + EducationError |
| 2 | spec-container 15 sub-files | provenance + education-rules + ED-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 17번째 entry | container='education' |
| 4 | parser regex ED prefix | longer match first |
| 5 | REGISTRY ED-001~ED-006 | withRuleId 15 Sprint 연속 |
| 6 | utils unit test count 81→87 | expected list +ED × 6 (DV-006과 HC-001 사이) |
| 7 | utils 188 PASS (회귀 0) | vitest |
| 8 | typecheck PASS | turbo 우회 |
| 9 | detect-bl 17 containers | education 6 BLs, 0 ABSENCE. coverage ≥ 83% |
| 10 | write-provenance --apply | --resolved-by, 0/17 changes |
| 11 | 6 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED |
| 12 | Plan + Report + SPEC | AIF-PLAN-085 + AIF-RPRT-085 |

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 7개 2글자 prefix (CC/LP/DV/SB/IN/HC/ED) | longer match first 위치 입증 누적 |
| R2 | ED-005 batch 6번째 재사용 | CC/DV/SB/IN/HC-005 입증 패턴 |
| R3 | ED-002 var-vs-var | F445 Path B `creditsLimit < requestedCredits` (`limit` keyword) |

## Implementation Steps

1~13: Sprint 286 동일 패턴

## 산출물

- Plan: AIF-PLAN-085 (본 문서)
- Report: AIF-RPRT-085
- Code: education.ts + spec-container/education/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 287 + F453

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 83%
- 6 산업 연속 0 ABSENCE
- 17번째 도메인 활성

## 메타

- **withRuleId 재사용 15 Sprint 연속 정점** (S264~S278+S283~S287)
- **6번째 신규 산업** — CC + DV + SB + IN + HC + ED
- **6 산업 연속 0 ABSENCE** — detector cascade 안정 입증
- **CC-005 batch 6번째 재사용**
