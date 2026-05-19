---
id: AIF-PLAN-234
title: Sprint 383 Plan — F555 CO Concert hall 86번째 도메인
type: plan
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 383
feature: F555
related:
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-231 (Sprint 380 CV Convention 14-cluster ✅ MERGED)
  - AIF-PLAN-232 (Sprint 381 WB Wedding hall 15-cluster IN_PROGRESS)
  - AIF-PLAN-233 (Sprint 382 BC Beach club 16-cluster PLANNED)
---

# Sprint 383 Plan — F555 CO Concert hall 86번째 도메인

**Sprint**: 383
**F-item**: F555
**Domain**: CO Concert hall (클래식 콘서트홀 산업, 75번째 신규 산업)
**Session**: 세션 309
**Date**: 2026-05-20
**의존성**: Sprint 382 (F554 BC Beach club) MERGE 선행 — S380 ✅ → S381 → S382 → S383 순차 Pipeline

---

## 목표

오프라인 엔터테인먼트 17-클러스터 확장 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+**CO**).
🎻 **단일 클러스터 17 도메인 첫 사례 마일스톤 신기록** + **13 Sprint 연속 첫 사례 마일스톤 신기록** (S370 5→...→S381 15→S382 16→S383 17).
withRuleId 87 Sprint 정점 도전 (신규 detector 0개, 거울 변환 39회차).
**6축 (f) CI Guard 실감증 4회차 정착 표준 확정**: S380 1회 + S381 2회차 + S382 3회차 + S383 4회차 누적 → rules/ 영구 승격 후보 진입.

---

## 도메인 비즈니스 룰 (CO-001 ~ CO-006)

클래식 콘서트홀 산업 차별성: **시즌 구독 + 정기 프로그램 + 좌석 등급(VIP/A/B/C) + 손님드(맏좌석 sleeve) + 조율 공연 + 음악감독별 시리즈** (KP K-pop 단일 콘서트 1회성 이벤트 인접하되 클래식/오케스트라/실내악 정기 공연장 시즌권 운영 차별).

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| CO-001 | `reserveTicket` | ThresholdCheck (Path A var-vs-UPPERCASE, MAX_CONCURRENT_TICKETS_PER_CONCERT) | 콘서트홀별 동시 active ticket 한도 검증 |
| CO-002 | `applySeasonLimit` | ThresholdCheck (Path B var-vs-var, seasonLimit keyword) | 회원 시즌권 한도 비교 |
| CO-003 | `processTicketBooking` | AtomicTransaction | ticket 예매 atomic — `concert_tickets` + `season_schedules` + `ticket_payments` |
| CO-004 | `transitionTicketStatus` | StatusTransition | ticket 상태 전환 (reserved → attended → ended / closed / cancelled) |
| CO-005 | `expireClosedTicketBatch` | StatusTransition (batch) | closed ticket 일괄 만료 처리 |
| CO-006 | `processTicketRefund` | AtomicTransaction | ticket 환불 atomic — `cancelled_fee_records` + `ticket_refunds` (시즌권 환불 정책 포함) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/concert-hall.ts` (305+ lines)
- `.decode-x/spec-containers/concert-hall/provenance.yaml`
- `.decode-x/spec-containers/concert-hall/rules/concert-hall-rules.md`
- `.decode-x/spec-containers/concert-hall/tests/CO-001.yaml`

### 수정 파일 (Sprint 382 baseline 후)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 86번째 entry 추가 (**DoD 5축 (e) + 6축 (f) CI Guard 양축 강제**)
- `packages/utils/src/divergence/rules-parser.ts` — CO prefix 추가 (BL_ID_PATTERN, 82→83)
- `packages/utils/src/divergence/bl-detector.ts` — CO-001~006 registry 추가 (withRuleId × 6)
- `packages/utils/test/bl-detector.test.ts` — utils test 보강 5축

---

## DoD 13/13 (계획)

1. concert-hall.ts 305+ lines + 6 함수 + ConcertHallError code-in-message
2. spec-container 3 files
3. **DOMAIN_MAP 86번째 entry** — autopilot 자체 검증 + **6축 (f) CI Guard 외부 검증 이중**
4. parser CO prefix (BL_ID_PATTERN 82 → 83, S382 후 baseline)
5. REGISTRY CO-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 보강 5축 (a~e):
   - (a) `exposes 380 detectors` → `exposes 386 detectors` count + memo (S382 후 baseline)
   - (b) sorted keys array에 CO-001~006 6 entry alphabetical 위치 삽입 (CN-006 다음, CS-001 앞 또는 적절 위치)
   - (c) CO-001~006 registered describe block
   - (d) concert-hall domain PRESENCE describe block (6 tests, beach-club/wedding-hall 패턴 복제)
   - (e) `findDomainMapping("concert-hall")` 자체 호출 검증
7. `pnpm test --run` utils 702 → 709 PASS (+7, S382 후 baseline)
8. `npx tsc --noEmit` (S337 cache 우회) PASS
9. detect-bl 512 → 518/518 = 100.0% (86 containers, 75 신규 산업 0 ABSENCE)
10. Match ≥ 95%
11. PR + CI 3/3 green + **domain-sprint-guard PASS** = 6축 (f) 실감증 4회차
12. auto-merge
13. **자체 검증**: `git show HEAD --stat | grep domain-source-map.ts` 확인

---

## 사전 audit (S283 패턴 39회차)

CO prefix 충돌 0건 — BL_ID_PATTERN 82 prefix 전수 확인 (S382 후 가정) + DOMAIN_MAP 85 entry 전수 확인 (S382 후 가정) + concert-hall.ts 미존재 + .decode-x/spec-containers/concert-hall 미존재 4축 fs 실측 확정.

---

## 의존성 처리 — Sprint Pipeline 순차

S380 ✅ MERGED → S381 IN_PROGRESS → S382 PLANNED → S383 PLANNED 순차 Pipeline:
- 모든 Sprint 동일 shared file 편집 (domain-source-map.ts / rules-parser.ts / bl-detector.ts / bl-detector.test.ts)
- 382 MERGE 후 baseline 갱신 → S383 WT 시동 시 충돌 0건
- 표준 절차: bash sprint 383 → S351 표준 보정 → ccs --model sonnet → /ax:sprint-autopilot → Monitor

---

## 메타 — 6축 (f) CI Guard 4회차 정착 표준 확정

본 Sprint는 6축 (f) CI Guard 도입(S379) 후 4번째 신규 도메인 Sprint. **rules/ 영구 승격 후보 진입**:

- S380 1회 입증 (CV Convention) — workflow 자연 작동
- S381 2회차 정착 (WB Wedding hall) — 연속 적용
- S382 3회차 정착 (BC Beach club) — 거버넌스 표준 확정
- S383 4회차 정착 (CO Concert hall) — **rules/ 영구 승격 트리거 도달**

차기 거버넌스 결정:
- 6축 (f) 4회 누적 정착 시 `~/.claude/rules/development-workflow.md`에 "DoD 6축 (f) CI Guard 표준 절차"로 정식 승격 검토
- DOMAIN_MAP false claim 3회차 재발 모니터링 (S376+S378+? lifecycle 승격 트리거)
- 17 도메인 단일 클러스터 달성 시 메타 카테고리 체계 재정의 검토 (오프라인 엔터 17-cluster는 사실상 "전 오프라인 엔터 산업 추상화 완성")
