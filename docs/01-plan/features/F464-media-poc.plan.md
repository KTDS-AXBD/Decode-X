---
id: AIF-PLAN-096
sprint: 298
feature: F464
title: Media 28번째 도메인 신규 (미디어 산업, 17번째 신규 산업, 90% coverage 돌파 예상)
status: active
estimated_hours: 1.5
created: 2026-05-10
related: [AIF-PLAN-087, AIF-PLAN-088, AIF-PLAN-089, AIF-PLAN-090, AIF-PLAN-091, AIF-PLAN-092, AIF-PLAN-093, AIF-PLAN-094, AIF-PLAN-095]
req: AIF-REQ-035
---

# F464 Plan — AIF-PLAN-096

## 목표

28번째 도메인 미디어(Media) 신규 — **17번째 신규 산업** (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK + MD). 26 Sprint 연속 정점 + 17 산업 연속 0 ABSENCE 도전 + **🎯 90% coverage 돌파 예상** (S297 89.6% +0.4%pp = 정확 90.0% 도달).

## DoD (12건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | media.ts source | ~280 lines, 6 함수 + MediaError (code-in-message 표준) |
| 2 | spec-container/media 15 sub-files | provenance + media-rules + MD-001~006 (12) + test (1) |
| 3 | DOMAIN_MAP 28번째 entry | container='media' |
| 4 | parser regex `MD` prefix | longer match first 누적 입증 (S297 BK 동일 패턴) |
| 5 | REGISTRY MD-001~MD-006 | withRuleId 26 Sprint 연속 정점 (신규 detector 0) |
| 6 | utils unit test count 147→153 | expected list +MD × 6 |
| 7 | utils 248 PASS (회귀 0) | vitest, 242+6 |
| 8 | typecheck PASS | turbo 우회 (--force) |
| 9 | detect-bl 28 containers | media 6 BLs, 0 ABSENCE. **coverage ≥ 90%** 🎯 (89.6% +0.4%pp 추정) |
| 10 | write-provenance --apply | --resolved-by, 0/28 changes (PRESENCE 자동 입증) |
| 11 | 17 산업 연속 0 ABSENCE | CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK + MD |
| 12 | Plan + Report + SPEC | AIF-PLAN-096 + AIF-RPRT-096 + §6 Sprint 298 + F464 |

## BL 정의 (6종)

| BL | 영역 | Detector 매핑 | 함수 |
|----|------|---------------|------|
| MD-001 | subscription tier — 동시 시청 한도 검증 | Threshold × 1 | `activateMediaSubscription()` |
| MD-002 | view threshold — 무료 시청 한도 비교 | Threshold × 1 (var-vs-var, F445 Path B `viewQuotaLimit` keyword) | `checkViewQuota()` |
| MD-003 | content licensing atomic — 권리 검증 + 라이선스 차감 + 시청 허용 | Atomic × 1 | `processLicensing()` |
| MD-004 | content status transition — draft → reviewing → published → archived | Status transition × 1 | `transitionContentStatus()` |
| MD-005 | content expiry batch — 만료 콘텐츠 일괄 처리 | Status transition × 1 (CC-005 batch 17번째 재사용) | `markExpiringContent()` |
| MD-006 | takedown atomic — 신고 + 검토 + 비공개 + 환불 트랜잭션 | Atomic × 1 | `processTakedown()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (18번째 정착)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | parser regex 18개 2글자 prefix (LP/CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK+MD) | longer match first 누적 입증 (S275~S297 17 Sprint) |
| R2 | MD-005 batch 17번째 재사용 | CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT/EN/GV/TC/BK-005 입증 — 16 Sprint 연속 |
| R3 | MD-002 var-vs-var | F445 Path B `viewedCount > viewQuotaLimit` (`limit` keyword 매칭) |

## Implementation Steps

1~13: Sprint 297 (F463) 동일 패턴 복제

## 산출물

- Plan: AIF-PLAN-096
- Report: AIF-RPRT-096
- Code: media.ts + spec-container/media/ + DOMAIN_MAP + parser regex + REGISTRY + utils test
- SPEC: §6 Sprint 298 + F464 entry

## Success Criteria

- DoD 12/12 PASS
- **🎯 coverage ≥ 90% (마일스톤 돌파)**
- 17 산업 연속 0 ABSENCE
- 28번째 도메인 활성

## 메타

- **withRuleId 재사용 26 Sprint 연속 정점** (S264~S278+S283~S298)
- **17번째 신규 산업** — CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK + **MD**
- **17 산업 연속 0 ABSENCE** — 콘텐츠 산업 추가
- **🏆 90% coverage 마일스톤 돌파** (S262 13.2% → S298 90%+, **6.8배** 증가)
- **CC-005 batch StatusTransition 17번째 재사용**
- **F445 Path B var-vs-var keyword 17번째 활용**
- **6 BLs 균형 패턴 18번째 정착**
- **누적 36 Sprint** (S262~S298): coverage 13.2% → 90%+, 5 → 28 도메인 (5.6배)
