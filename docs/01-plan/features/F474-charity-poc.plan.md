---
id: AIF-PLAN-106
sprint: 308
feature: F474
title: Charity 38번째 도메인 신규 (비영리 산업, 27번째 신규 산업)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-097, AIF-PLAN-098, AIF-PLAN-099, AIF-PLAN-100, AIF-PLAN-101, AIF-PLAN-102, AIF-PLAN-103, AIF-PLAN-104, AIF-PLAN-105]
req: AIF-REQ-035
---

# F474 Plan — AIF-PLAN-106

## 목표

38번째 도메인 비영리(Charity/NPO) 신규 — **27번째 신규 산업** (..+CH). 36 Sprint 연속 정점 + 27 산업 연속 0 ABSENCE 도전. donation + grant 운용 (compliance 인접).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | charity.ts source | ~280 lines, 6 함수 + CharityError |
| 2 | spec-container/charity 15 sub-files | provenance + charity-rules + CH-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 38번째 entry | container='charity' |
| 4 | parser regex `CH` prefix | longer match first |
| 5 | REGISTRY CH-001~CH-006 | withRuleId 36 Sprint 연속 정점 |
| 6 | utils unit test count 207→213 | +CH × 6 |
| 7 | utils 311 PASS (회귀 0) | 305+6 |
| 8 | typecheck PASS | turbo --force |
| 9 | detect-bl 38 containers | charity 6 BLs, 0 ABSENCE. coverage ≥ 92.7% |
| 10 | write-provenance --apply | 0/38 changes |
| 11 | 27 산업 연속 0 ABSENCE | |
| 12 | Plan + Report + SPEC | AIF-PLAN-106 + AIF-RPRT-106 + §6 Sprint 308 + F474 |

## BL 정의 (6종)

| BL | 영역 | Detector | 함수 |
|----|------|----------|------|
| CH-001 | donation receipt — 영수증 발급 한도 검증 | Threshold | `recordDonation()` |
| CH-002 | grant tier — 보조금 한도 비교 | Threshold (var-vs-var, F445 Path B `grantTierLimit` keyword) | `applyGrant()` |
| CH-003 | fund disbursement atomic — 승인 + 출금 + 영수 트랜잭션 | Atomic | `disburseFund()` |
| CH-004 | campaign status transition — draft → active → closed → reported → audited | Status | `transitionCampaignStatus()` |
| CH-005 | volunteer schedule batch — 자원봉사 일괄 갱신 | Status (CC-005 27번째 재사용) | `markVolunteerSchedule()` |
| CH-006 | tax certificate atomic — 검증 + 발급 + 신고 트랜잭션 | Atomic | `issueTaxCertificate()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 (28번째 정착)

## Implementation

Sprint 307 (F473) 동일 패턴 복제

## Success Criteria

- DoD 12/12 PASS
- coverage ≥ 92.7%
- 27 산업 연속 0 ABSENCE
- 38번째 도메인 활성

## 메타

- withRuleId 36 Sprint 연속 정점 (S264~S278+S283~S308)
- 27번째 신규 산업 — nonprofit 추가
- 6 BLs 균형 패턴 28번째 정착
- 누적 46 Sprint, coverage 13.2% → 92.7%+, 5 → 38 도메인 (7.6배)
