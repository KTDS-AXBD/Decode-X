---
id: AIF-PLAN-084
sprint: 286
feature: F452
title: Healthcare 16번째 도메인 신규 (의료 산업, 5번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-09
related: [AIF-PLAN-076, AIF-PLAN-081, AIF-PLAN-082, AIF-PLAN-083]
req: AIF-REQ-035
related_features: [F444, F449, F450, F451, F445, F446, F447, F448]
---

# F452 Plan — AIF-PLAN-084

## 목표

16번째 도메인 의료(Healthcare) 신규 — **5번째 신규 산업 도메인** (CC + DV + SB + IN + HC). 14 Sprint 연속 정점 + 5 산업 연속 0 ABSENCE 목표.

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | healthcare.ts source | ~270 lines, 6 함수 + HealthcareError |
| 2 | spec-container 15 sub-files | provenance + healthcare-rules + HC-001~006 rules/runbooks (12) + test (1) |
| 3 | DOMAIN_MAP 16번째 entry | container='healthcare' |
| 4 | parser regex HC prefix | longer match first |
| 5 | REGISTRY HC-001~HC-006 매핑 | withRuleId 14 Sprint 연속 |
| 6 | utils unit test count 75→81 | expected list +HC × 6 (DV-006과 IN-001 사이) |
| 7 | utils 188 unit test PASS (회귀 0) | vitest |
| 8 | typecheck PASS | turbo 우회 |
| 9 | detect-bl 16 containers | healthcare 6 BLs, 0 ABSENCE. coverage ≥ 82% |
| 10 | write-provenance --apply | --resolved-by 옵션, 0/16 changes |
| 11 | 5 산업 연속 0 ABSENCE 정착 | CC + DV + SB + IN + HC |
| 12 | Plan + Report + SPEC | AIF-PLAN-084 + AIF-RPRT-084 |

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 6개 2글자 prefix (CC/LP/DV/SB/IN/HC) | longer match first 위치 입증 누적 |
| R2 | HC-005 batch 5번째 재사용 | CC/DV/SB/IN-005 입증 패턴 |
| R3 | HC-002 var-vs-var | F445 Path B `dosageLimit < requestedDosageMg` (`limit` keyword) |

## Implementation Steps

1~13: Sprint 285 동일 패턴 (Master inline ~1.5h)

## 산출물

- Plan: AIF-PLAN-084 (본 문서)
- Report: AIF-RPRT-084
- Code: healthcare.ts + spec-container/healthcare/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 286 + F452

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 82%
- 5 산업 연속 0 ABSENCE
- 16번째 도메인 활성

## 메타

- **withRuleId 재사용 14 Sprint 연속 정점** (S264~S278+S283~S286)
- **5번째 신규 산업** — CC + DV + SB + IN + HC
- **5 산업 연속 0 ABSENCE** — detector cascade 안정 입증
- **CC-005 batch 5번째 재사용**
