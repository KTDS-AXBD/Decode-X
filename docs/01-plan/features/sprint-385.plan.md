---
id: AIF-PLAN-236
title: Sprint 385 Plan — F557 NC Night club 88번째 도메인
type: plan
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 385
feature: F557
related:
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-235 (Sprint 384 KR Karaoke PLANNED, rules 승격 트리거)
---

# Sprint 385 Plan — F557 NC Night club 88번째 도메인

**Sprint**: 385 / **F-item**: F557 / **Domain**: NC Night club (나이트클럽 산업, 77번째 신규 산업)
**Session**: 세션 309 / **Date**: 2026-05-20
**의존성**: Sprint 384 MERGE 선행 — S380 ✅ → S381 → S382 → S383 → S384 → S385 순차 Pipeline

---

## 목표

오프라인 엔터 19-클러스터 확장 (...KR+**NC**).
🌃 **단일 클러스터 19 도메인 첫 사례 마일스톤 신기록** + **15 Sprint 연속 첫 사례 마일스톤 신기록**.
withRuleId 89 Sprint 정점 + 거울 변환 41회차.
**6축 (f) CI Guard 6회차 rules/ 영구 승격 정착 검증** (S384 5회차 트리거 후 S385 6회차 누적).

---

## 도메인 비즈니스 룰 (NC-001 ~ NC-006)

NC 차별성: KR(노래방 프라이빗 룸) + BC(비치클럽 시즌제 VIP) 인접하되 **공용 도구 + DJ 바 + 드레스코드 + 종일권 없는 입장권제 + 시즌제 이벤트** (B2C 야간 4-6시간 + 입장료 + VIP 테이블 옵션 차별).

| ID | 함수 | detector |
|----|------|----------|
| NC-001 | `reserveEntry` | ThresholdCheck (Path A, MAX_CONCURRENT_GUESTS_PER_CLUB) |
| NC-002 | `applyVipTableLimit` | ThresholdCheck (Path B, vipTableLimit) |
| NC-003 | `processVipBooking` | AtomicTransaction (club_visits + vip_table_schedules + visit_payments) |
| NC-004 | `transitionVisitStatus` | StatusTransition (reserved → entered → exited → ended/closed/cancelled) |
| NC-005 | `expireClosedVisitBatch` | StatusTransition (batch) |
| NC-006 | `processVisitRefund` | AtomicTransaction (cancelled_fee_records + visit_refunds, VIP 환불 정책) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/night-club.ts` (305+ lines)
- `.decode-x/spec-containers/night-club/{provenance.yaml, rules/night-club-rules.md, tests/NC-001.yaml}`

### 수정 파일 (S384 baseline 후)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 88번째
- `packages/utils/src/divergence/rules-parser.ts` — NC prefix (84→85)
- `packages/utils/src/divergence/bl-detector.ts` — NC-001~006
- `packages/utils/test/bl-detector.test.ts` — 5축

---

## DoD 13/13

1. night-club.ts 305+ + 6 함수 + NightClubError
2. spec-container 3 files
3. **DOMAIN_MAP 88번째 entry** — autopilot 자체 + 6축 (f) CI Guard 외부 이중
4. parser NC prefix (84→85)
5. REGISTRY NC-001~006 (withRuleId × 6)
6. utils test 5축 (count 392→398, sorted+registered+PRESENCE+findDomainMapping)
7. utils 716 → 723 PASS (+7)
8. `npx tsc --noEmit` PASS
9. detect-bl 524 → 530/530 = 100.0%
10. Match ≥ 95%
11. PR + CI 3/3 green + domain-sprint-guard PASS = 6축 (f) 6회차
12. auto-merge
13. 자체 검증: `git show HEAD --stat`

---

## 사전 audit (S283 41회차)

NC prefix 충돌 0건 — BL_ID_PATTERN 84 prefix 전수 + DOMAIN_MAP 87 entry 전수 (S384 후 가정) + night-club.ts 미존재 + spec-containers/night-club 미존재 4축 확정.

---

## 의존성 처리

S380 ✅ → S381 → S382 → S383 → S384 → S385 순차 Pipeline. S384 MERGE 후 baseline 갱신 → S385 WT 시동 충돌 0건.
표준: bash sprint 385 → S351 보정 → ccs --model sonnet → /ax:sprint-autopilot → Monitor.

---

## 메타 — 6축 (f) 6회차 rules/ 영구 승격 정착 검증

S380 1회 → S381 2회차 → S382 3회차 → S383 4회차 → S384 5회차 (rules/ 승격 트리거) → S385 6회차 (정착 검증).

거버넌스 트리거:
- 6축 (f) 6회 누적 정착 시 `~/.claude/rules/development-workflow.md`에 "DoD 6축 (f) CI Guard 표준 절차" 정식 승격 (S380 5회차 트리거 + S385 6회차 정착 검증 = 표준 확정)
- DOMAIN_MAP false claim 3회차 재발 모니터링 (S376+S378+? 누적)
