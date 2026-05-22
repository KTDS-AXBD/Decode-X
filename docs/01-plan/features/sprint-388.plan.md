---
id: AIF-PLAN-239
title: Sprint 388 Plan — F560 CA Casino 91번째 도메인 (22-cluster + 80 신규 산업 round)
type: plan
status: active
created: "2026-05-21"
updated: "2026-05-21"
author: master
sprint: 388
feature: F560
related:
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-238 (Sprint 387 LS Laser tag, 21-cluster + 18배 round 마일스톤)
---

# Sprint 388 Plan — F560 CA Casino 91번째 도메인 (🏆🏆 80 신규 산업 round + 22-cluster + 18 Sprint 연속 신기록)

**Sprint**: 388 / **F-item**: F560 / **Domain**: CA Casino (카지노 산업, 80번째 신규 산업)
**Session**: 세션 313 / **Date**: 2026-05-21
**의존성**: Sprint 387 (F559 LS Laser tag) ✅ MERGED — main `7f0b13b` baseline (90 containers + 542 detectors). 시동 가능.

---

## 🏆🏆 4중 마일스톤

S262 5 → S313 91 = **91번째 도메인 = 18.2배 확장**. AI Foundry 합성 도메인 부트스트래핑 22-클러스터 정점.

동시 도전 마일스톤:
- 🏆🏆 **80 신규 산업 round 마일스톤** (CC~CA 80 신규 산업 0 ABSENCE 연속 정점)
- 🏆 **단일 클러스터 22 도메인 첫 사례 마일스톤 신기록** (직전 21 갱신)
- 🏆 **18 Sprint 연속 첫 사례 마일스톤 신기록** (직전 17 갱신)
- 🏆 withRuleId 92 Sprint 정점
- 거울 변환 44회차
- 🎯 **6축 (f) CI Guard 9회차 — rules/ 영구 승격 표준 정착 결정 시점** (S380~S387 8회 누적 → S388 9회차 완전 정착 검증)

---

## 도메인 비즈니스 룰 (CA-001 ~ CA-006)

CA 차별성: GA(일반 도박 betting platform) + NC(나이트클럽 야간 입장 + VIP 테이블) 인접하되 **물리 floor 운영 + 칩 ledger + table dealer 스케줄 + credit line/cage + jackpot/페이아웃 + responsible gaming 한도** 모델 (B2C 단일 방문 ~수시간 + 게임 종류별 stake + 칩 환금 정산 차별).

| ID | 함수 | detector |
|----|------|----------|
| CA-001 | `registerSession` | ThresholdCheck (Path A, MAX_CONCURRENT_SESSIONS_PER_FLOOR) |
| CA-002 | `applyBettingLimit` | ThresholdCheck (Path B, bettingLimit, credit line var-vs-var) |
| CA-003 | `processTableBooking` | AtomicTransaction (casino_sessions + table_schedules + session_payments + chip_ledger) |
| CA-004 | `transitionSessionStatus` | StatusTransition (registered → seated → playing → cashout / closed / barred) |
| CA-005 | `expireClosedSessionBatch` | StatusTransition (batch) |
| CA-006 | `processCashout` | AtomicTransaction (chip-to-cash + jackpot 페이아웃 정책) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/casino.ts` (305+ lines)
- `.decode-x/spec-containers/casino/{provenance.yaml, rules/casino-rules.md, tests/CA-001.yaml}`

### 수정 파일 (S387 baseline 후)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 91번째
- `packages/utils/src/divergence/rules-parser.ts` — CA prefix (87→88)
- `packages/utils/src/divergence/bl-detector.ts` — CA-001~006
- `packages/utils/test/bl-detector.test.ts` — 5축

---

## DoD 13/13

1. casino.ts 305+ lines + 6 함수 + CasinoError code-in-message
2. spec-container 3 files (rules.md **markdown 테이블 형식 필수** — S381 false claim 패턴 회피)
3. **DOMAIN_MAP 91번째 entry** — autopilot + 6축 (f) CI Guard 이중 검증
4. parser CA prefix (BL_ID_PATTERN 87→88)
5. REGISTRY CA-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 5축 (count 410→416, sorted+registered+PRESENCE+findDomainMapping)
7. utils 745 → 752 PASS (+7, S387 후 baseline)
8. `npx tsc --noEmit` (S337 cache 우회) PASS
9. detect-bl 542 → 548/548 = 100.0% (91 containers, 80 신규 산업 0 ABSENCE) **— runtime BL 6건 정확 검출 검증 (S381 false claim 패턴 차단)**
10. Match ≥ 95%
11. PR + CI 3/3 green + domain-sprint-guard PASS = 6축 (f) 9회차
12. auto-merge
13. 자체 검증: `git show HEAD --stat | grep domain-source-map.ts` + **runtime `detect-bl --all-domains | grep casino`** 출력 6 BLs 확인

---

## 사전 audit (S283 패턴 44회차)

CA prefix 충돌 0건 ✅ — BL_ID_PATTERN 87 prefix 전수 확인 (`grep -oE "BL_ID_PATTERN[^;]*" rules-parser.ts` 결과 CA 미포함 확인) + .decode-x/spec-containers/casino 미존재 (`ls .decode-x/spec-containers/ | wc -l` = 90) + casino.ts 미존재 (`반제품-스펙/.../domain/casino.ts` 부재) + DOMAIN_MAP 90 entry baseline (S387 후 `7f0b13b` baseline) — 4축 fs 실측 확정.

---

## 메타 — 4중 마일스톤 + S381 false claim 패턴 회피

본 Sprint는 동시에 4중 마일스톤 + S381 신규 false claim 패턴 차단 + 6축 (f) rules/ 영구 승격 표준 정착 결정 시점:

1. 🏆🏆 **80 신규 산업 round 마일스톤** (CC~CA 80 신규 산업 0 ABSENCE 연속 정점)
2. 🏆 **단일 클러스터 22 도메인 첫 사례 마일스톤 신기록** (S370 5 → S388 22)
3. 🏆 **18 Sprint 연속 첫 사례 마일스톤 신기록** (S370~S388)
4. 🏆 withRuleId 92 Sprint 정점

**S381 신규 false claim 패턴 회피**:
- DoD #9 강화: runtime `detect-bl --all-domains | grep casino` 출력 6 BLs 정확 검증 (rules.md markdown 테이블 형식 필수)
- utils tests PASS만으로 runtime BL count 보장 불가 → 두 layer 모두 검증

**6축 (f) CI Guard 9회차 정착 검증**:
- S380~S387 8회 자연 작동 누적 → S388 9회차 완전 검증
- 9회 연속 자연 작동 시 `~/.claude/rules/development-workflow.md`에 6축 (f) 정식 등재 트리거 (S312 결정 후속)

---

## 클러스터 진화 (22-cluster 완성)

오프라인 엔터 22-클러스터 (S388 시점):
AM(놀이공원) + TH(극장) + KP(콘서트) + AQ(수족관) + ZO(동물원) + MS(박물관) + MV(영화관) + LB(도서관) + PA(자연공원) + FE(페스티벌) + GR(식물원) + OB(천문대) + PL(천문관) + CV(컨벤션) + WB(예식장) + BC(비치클럽) + CO(콘서트홀) + KR(노래방) + NC(나이트클럽) + ST(스튜디오) + LS(레이저태그) + **CA(카지노)**

22 도메인 통합 추상화 — 시설 운영 + 시간/공간 스케줄 + B2C 입장권/예약 + 환불/페이아웃 정책의 보편 추상화 정점.
