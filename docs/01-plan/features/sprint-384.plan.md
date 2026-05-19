---
id: AIF-PLAN-235
title: Sprint 384 Plan — F556 KR Karaoke 87번째 도메인
type: plan
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 384
feature: F556
related:
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-231 (Sprint 380 CV Convention ✅ MERGED)
  - AIF-PLAN-232 (Sprint 381 WB Wedding hall IN_PROGRESS)
  - AIF-PLAN-233 (Sprint 382 BC Beach club PLANNED)
  - AIF-PLAN-234 (Sprint 383 CO Concert hall PLANNED)
---

# Sprint 384 Plan — F556 KR Karaoke 87번째 도메인

**Sprint**: 384
**F-item**: F556
**Domain**: KR Karaoke (노래방 산업, 76번째 신규 산업)
**Session**: 세션 309
**Date**: 2026-05-20
**의존성**: Sprint 383 (F555 CO Concert hall) MERGE 선행 — S380 ✅ → S381 IN_PROGRESS → S382 → S383 → S384 순차 Pipeline

---

## 목표

오프라인 엔터테인먼트 18-클러스터 확장 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+**KR**).
🎤 **단일 클러스터 18 도메인 첫 사례 마일스톤 신기록** + **14 Sprint 연속 첫 사례 마일스톤 신기록** (S370 5→...→S382 16→S383 17→S384 18).
🏆 **거울 변환 40회차 round 마일스톤** (S336~S384 40회 누적 mirror-transform 패턴 정립 정점).
🏆 **S283 audit 40회차 round 마일스톤** (S268~S309 40회 누적 사전 fs 실측 패턴 정립 정점).
withRuleId 88 Sprint 정점 도전 (신규 detector 0개).
**6축 (f) CI Guard 실감증 5회차 rules/ 영구 승격 트리거**: S380 1회 + S381 2회차 + S382 3회차 + S383 4회차 + S384 5회차 누적 → `~/.claude/rules/development-workflow.md` "DoD 6축 (f) CI Guard 표준 절차" 정식 승격 검토.

---

## 도메인 비즈니스 룰 (KR-001 ~ KR-006)

노래방 산업 차별성: **프라이빗 룸 + 시간제 + drinks/menu + 그룹 예약 + 점주별 운영** (CO 클래식 콘서트홀 시즌권 + 정기 공연 + KP K-pop 단일 콘서트 1회성 인접하되 B2C 짧은 1-3시간 룸 단위 + 음식료 옵션 + 시간 연장 차별).

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| KR-001 | `reserveRoom` | ThresholdCheck (Path A var-vs-UPPERCASE, MAX_CONCURRENT_ROOMS_PER_KARAOKE) | 노래방별 동시 active room 한도 검증 |
| KR-002 | `applyMembershipLimit` | ThresholdCheck (Path B var-vs-var, membershipLimit keyword) | 회원 일일 membership 한도 비교 |
| KR-003 | `processRoomBooking` | AtomicTransaction | room 예약 atomic — `karaoke_sessions` + `room_schedules` + `session_payments` |
| KR-004 | `transitionSessionStatus` | StatusTransition | session 상태 전환 (reserved → ongoing → ended / closed / cancelled) |
| KR-005 | `expireClosedSessionBatch` | StatusTransition (batch) | closed session 일괄 만료 처리 |
| KR-006 | `processSessionRefund` | AtomicTransaction | session 환불 atomic — `cancelled_fee_records` + `session_refunds` (drinks/menu 환불 정책 포함) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/karaoke.ts` (305+ lines)
- `.decode-x/spec-containers/karaoke/provenance.yaml`
- `.decode-x/spec-containers/karaoke/rules/karaoke-rules.md`
- `.decode-x/spec-containers/karaoke/tests/KR-001.yaml`

### 수정 파일 (Sprint 383 baseline 후)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 87번째 entry 추가
- `packages/utils/src/divergence/rules-parser.ts` — KR prefix 추가 (BL_ID_PATTERN, 83→84)
- `packages/utils/src/divergence/bl-detector.ts` — KR-001~006 registry 추가 (withRuleId × 6)
- `packages/utils/test/bl-detector.test.ts` — utils test 보강 5축

---

## DoD 13/13 (계획)

1. karaoke.ts 305+ lines + 6 함수 + KaraokeError code-in-message
2. spec-container 3 files
3. **DOMAIN_MAP 87번째 entry** — autopilot 자체 검증 + **6축 (f) CI Guard 외부 검증 이중**
4. parser KR prefix (BL_ID_PATTERN 83 → 84, S383 후 baseline)
5. REGISTRY KR-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 보강 5축 (a~e):
   - (a) `exposes 386 detectors` → `exposes 392 detectors` count + memo (S383 후 baseline)
   - (b) sorted keys array에 KR-001~006 6 entry alphabetical 위치 삽입 (KP-006 다음, LB-001 앞)
   - (c) KR-001~006 registered describe block
   - (d) karaoke domain PRESENCE describe block (6 tests, concert-hall/beach-club 패턴 복제)
   - (e) `findDomainMapping("karaoke")` 자체 호출 검증
7. `pnpm test --run` utils 709 → 716 PASS (+7, S383 후 baseline)
8. `npx tsc --noEmit` (S337 cache 우회) PASS
9. detect-bl 518 → 524/524 = 100.0% (87 containers, 76 신규 산업 0 ABSENCE)
10. Match ≥ 95%
11. PR + CI 3/3 green + **domain-sprint-guard PASS** = 6축 (f) 실감증 5회차
12. auto-merge
13. **자체 검증**: `git show HEAD --stat | grep domain-source-map.ts` 확인

---

## 사전 audit (S283 패턴 40회차 round 마일스톤)

KR prefix 충돌 0건 — BL_ID_PATTERN 83 prefix 전수 확인 (S383 후 가정) + DOMAIN_MAP 86 entry 전수 확인 (S383 후 가정) + karaoke.ts 미존재 + .decode-x/spec-containers/karaoke 미존재 4축 fs 실측 확정.

🏆 **S283 audit 40회차 round 마일스톤 달성** (S268~S309 40회 누적 사전 fs 실측 패턴 정립 정점).

---

## 의존성 처리 — Sprint Pipeline 순차

S380 ✅ MERGED → S381 IN_PROGRESS → S382 PLANNED → S383 PLANNED → S384 PLANNED 순차 Pipeline:
- 모든 Sprint 동일 shared file 편집 (domain-source-map.ts / rules-parser.ts / bl-detector.ts / bl-detector.test.ts)
- 383 MERGE 후 baseline 갱신 → S384 WT 시동 시 충돌 0건
- 표준 절차: bash sprint 384 → S351 표준 보정 → ccs --model sonnet → /ax:sprint-autopilot → Monitor

---

## 메타 — 6축 (f) CI Guard 5회차 rules/ 영구 승격 트리거

본 Sprint는 6축 (f) CI Guard 도입(S379) 후 5번째 신규 도메인 Sprint. **rules/ 영구 승격 트리거 도달**:

- S380 1회 입증 (CV Convention) — workflow 자연 작동
- S381 2회차 정착 (WB Wedding hall)
- S382 3회차 정착 (BC Beach club)
- S383 4회차 정착 (CO Concert hall)
- S384 5회차 정착 (KR Karaoke) — **rules/ 영구 승격 트리거 도달**

거버넌스 결정:
- 6축 (f) 5회 누적 정착 시 `~/.claude/rules/development-workflow.md`에 "DoD 6축 (f) CI Guard 표준 절차" 정식 승격
- 거울 변환 40회차 + S283 40회차 + 6축 5회차 = 트리플 정점 = 메타 거버넌스 검토 시점

---

## 메타 — 트리플 40회차 + 18-클러스터 신기록

본 Sprint는 동시에 3개 round 마일스톤 + 1개 신기록 마일스톤 도전:

1. 🏆 **거울 변환 40회차** (S336 첫 사례 → S384 40회차)
2. 🏆 **S283 audit 40회차** (S268 도입 → S309 40회차 적용)
3. 🏆 **6축 (f) 5회차** (S379 도입 → S384 rules/ 승격 트리거)
4. 🏆 **18 도메인 single-cluster 신기록** (직전 17 갱신)
5. 🏆 **14 Sprint 연속 첫 사례 신기록** (직전 13 갱신)

5중 마일스톤 동시 도전.
