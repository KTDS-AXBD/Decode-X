---
id: AIF-PLAN-238
title: Sprint 387 Plan — F559 LS Laser tag 90번째 도메인 (18배 round 마일스톤)
type: plan
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 387
feature: F559
related:
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-237 (Sprint 386 ST Studio, 20-cluster round)
---

# Sprint 387 Plan — F559 LS Laser tag 90번째 도메인 (🏆🏆🏆 18배 round 마일스톤)

**Sprint**: 387 / **F-item**: F559 / **Domain**: LS Laser tag (레이저태그 산업, 79번째 신규 산업)
**Session**: 세션 309 / **Date**: 2026-05-20
**의존성**: Sprint 386 MERGE 선행 — S380 ✅ → S381 ✅ → S382 IN_PROGRESS → S383 → S384 → S385 → S386 → S387 순차 Pipeline

---

## 🏆🏆🏆 18배 round 마일스톤

S262 5 → S309 90 = **90번째 도메인 = 18배 round 마일스톤**. AI Foundry 합성 도메인 부트스트래핑의 18배 확장 정점.

추가 동시 도전 마일스톤:
- 🏆 **단일 클러스터 21 도메인 첫 사례 마일스톤 신기록** (직전 20 갱신)
- 🏆 **17 Sprint 연속 첫 사례 마일스톤 신기록** (직전 16 갱신)
- 🏆 withRuleId 91 Sprint 정점
- 거울 변환 43회차
- 🎯 6축 (f) CI Guard 8회차 (rules/ 정식 승격 검토 확정 시점)

---

## 도메인 비즈니스 룰 (LS-001 ~ LS-006)

LS 차별성: ST(스튜디오 전문 제작용) + NC(나이트클럽 야간 입장권) 인접하되 **게임형 엔터 + 시간제 + 그룹 예약 + 점수 시스템 + 장비 임대 + 레벨별 맵 + 멤버십** (B2C 게임 30-60분 + 점수 경쟁 + 멀티 아레나 차별).

| ID | 함수 | detector |
|----|------|----------|
| LS-001 | `reserveSession` | ThresholdCheck (Path A, MAX_CONCURRENT_SESSIONS_PER_ARENA) |
| LS-002 | `applyEquipmentLimit` | ThresholdCheck (Path B, equipmentLimit) |
| LS-003 | `processSessionBooking` | AtomicTransaction (lasertag_sessions + equipment_schedules + session_payments) |
| LS-004 | `transitionSessionStatus` | StatusTransition (reserved → ongoing → ended/closed/cancelled) |
| LS-005 | `expireClosedSessionBatch` | StatusTransition (batch) |
| LS-006 | `processSessionRefund` | AtomicTransaction (cancelled_fee_records + session_refunds, 그룹 환불 정책) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/lasertag.ts` (305+ lines)
- `.decode-x/spec-containers/lasertag/{provenance.yaml, rules/lasertag-rules.md, tests/LS-001.yaml}`

### 수정 파일 (S386 baseline 후)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 90번째
- `packages/utils/src/divergence/rules-parser.ts` — LS prefix (86→87)
- `packages/utils/src/divergence/bl-detector.ts` — LS-001~006
- `packages/utils/test/bl-detector.test.ts` — 5축

---

## DoD 13/13

1. lasertag.ts 305+ + 6 함수 + LaserTagError
2. spec-container 3 files (rules.md **markdown 테이블 형식 필수** — S381 false claim 패턴 회피)
3. **DOMAIN_MAP 90번째 entry** — autopilot + 6축 (f) CI Guard 이중
4. parser LS prefix (86→87)
5. REGISTRY LS-001~006 (withRuleId × 6)
6. utils test 5축 (count 404→410, sorted+registered+PRESENCE+findDomainMapping)
7. utils 730 → 737 PASS (+7, S386 후 baseline)
8. `npx tsc --noEmit` PASS
9. detect-bl 536 → 542/542 = 100.0% (90 containers, 79 신규 산업 0 ABSENCE) **— runtime BL 6건 정확 검출 검증 (S381 false claim 패턴 차단)**
10. Match ≥ 95%
11. PR + CI 3/3 green + domain-sprint-guard PASS = 6축 (f) 8회차
12. auto-merge
13. 자체 검증: `git show HEAD --stat` + **runtime detect-bl --all-domains | grep lasertag** 출력 확인 (6 BLs 검증)

---

## 사전 audit (S283 패턴 43회차)

LS prefix 충돌 0건 — BL_ID_PATTERN 86 prefix 전수 + DOMAIN_MAP 89 entry 전수 (S386 후 가정) + lasertag.ts 미존재 + spec-containers/lasertag 미존재 4축 확정.

---

## 메타 — 4중 마일스톤 + S381 false claim 패턴 회피

본 Sprint는 동시에 4중 마일스톤 도전 + S381에서 식별된 신규 false claim 패턴 차단:

1. 🏆🏆🏆 **90번째 도메인 = 18배 round 마일스톤** (S262 5 → S387 90)
2. 🏆 **단일 클러스터 21 도메인 첫 사례 마일스톤 신기록** (직전 20 갱신)
3. 🏆 **17 Sprint 연속 첫 사례 마일스톤 신기록** (직전 16 갱신)
4. 🏆 withRuleId 91 Sprint 정점

**S381 신규 false claim 패턴 회피**:
- DoD #9 강화: runtime `detect-bl --all-domains | grep lasertag` 출력 6 BLs 정확 검증 (rules.md markdown 테이블 형식 필수)
- 13축 자체 검증 강화: runtime detect-bl 결과까지 확인
- wedding-hall-rules.md format mismatch 재현 차단

---

## ⚠️ Sprint 381 신규 false claim 패턴 식별 (별도 fix-forward 후보)

Sprint 381 MERGE 후 baseline 실측:
- DOMAIN_MAP entry: 84개 ✅ (CI guard PASS)
- detect-bl: 500 BLs / 84 containers (예상 506)
- wedding-hall: 0 BLs detected (rules.md paragraph prose format)

**근본 원인**: wedding-hall-rules.md가 markdown 테이블 형식이 아닌 paragraph prose 사용 → rules-parser가 BL-ID 추출 실패. utils tests는 registry 검증만 수행하여 PASS이나 runtime detect-bl은 0 BL 검출.

**Sprint 388 또는 fix-forward 후보**: wedding-hall-rules.md를 planetarium-rules.md 형식 (pipe table)으로 변환 + DoD 9축에 "runtime detect-bl 검증" 추가 표준화.
