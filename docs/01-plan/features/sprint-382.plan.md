---
id: AIF-PLAN-233
title: Sprint 382 Plan — F554 BC Beach club 85번째 도메인
type: plan
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 382
feature: F554
related:
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-231 (Sprint 380 CV Convention 14-cluster)
  - AIF-PLAN-232 (Sprint 381 WB Wedding hall 15-cluster)
---

# Sprint 382 Plan — F554 BC Beach club 85번째 도메인

**Sprint**: 382
**F-item**: F554
**Domain**: BC Beach club (비치클럽 산업, 74번째 신규 산업)
**Session**: 세션 309
**Date**: 2026-05-20
**의존성**: Sprint 381 (F553 WB Wedding hall) MERGE 선행 — S380 → S381 → S382 순차 Pipeline

---

## 목표

오프라인 엔터테인먼트 16-클러스터 확장 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+**BC**).
🏖️ **단일 클러스터 16 도메인 첫 사례 마일스톤 신기록** + **12 Sprint 연속 첫 사례 마일스톤 신기록** (S370 5→...→S380 14→S381 15→S382 16).
🏆 **85번째 도메인 = 17배 round 마일스톤** (S262 5 → S382 85).
withRuleId 86 Sprint 정점 도전 (신규 detector 0개, 거울 변환 38회차).
**6축 (f) CI Guard 실감증 3회차 정착 검증 완료 트리거**: S380 1회 → S381 2회차 → S382 3회차 (S377 5축 1회 → S378 2회차 정착 패턴 재현 + 3회차 정착 완료 입증).

---

## 도메인 비즈니스 룰 (BC-001 ~ BC-006)

비치클럽 산업 차별성: **풀 + 사교 + DJ 공연 + 시즌제 + VIP 프라이빗 + 종일권/시즌권 통합** (WB 예식장 단일 1회성 + KP 콘서트 좌석 등급 인접하되 B2C 시즌제 + 프리미엄 등급제 + 카바나 임대 + 음료/식음 옵션 차별).

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| BC-001 | `reserveDayPass` | ThresholdCheck (Path A var-vs-UPPERCASE, MAX_CONCURRENT_VISITORS_PER_BEACH_CLUB) | 비치클럽별 동시 active visitor 한도 검증 |
| BC-002 | `applyCabanaLimit` | ThresholdCheck (Path B var-vs-var, cabanaLimit keyword) | 회원 일일 cabana 한도 비교 |
| BC-003 | `processCabanaBooking` | AtomicTransaction | cabana 예약 atomic — `beach_club_visits` + `cabana_schedules` + `visit_payments` |
| BC-004 | `transitionVisitStatus` | StatusTransition | visit 상태 전환 (reserved → entered → exited → ended / closed / cancelled) |
| BC-005 | `expireClosedVisitBatch` | StatusTransition (batch) | closed visit 일괄 만료 처리 |
| BC-006 | `processVisitRefund` | AtomicTransaction | visit 환불 atomic — `cancelled_fee_records` + `visit_refunds` (VIP 환불 정책 포함) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/beach-club.ts` (305+ lines)
- `.decode-x/spec-containers/beach-club/provenance.yaml`
- `.decode-x/spec-containers/beach-club/rules/beach-club-rules.md`
- `.decode-x/spec-containers/beach-club/tests/BC-001.yaml`

### 수정 파일 (Sprint 381 baseline 후)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 85번째 entry 추가 (**DoD 5축 (e) + 6축 (f) CI Guard 양축 강제**)
- `packages/utils/src/divergence/rules-parser.ts` — BC prefix 추가 (BL_ID_PATTERN, 81→82)
- `packages/utils/src/divergence/bl-detector.ts` — BC-001~006 registry 추가 (withRuleId × 6)
- `packages/utils/test/bl-detector.test.ts` — utils test 보강 5축

---

## DoD 13/13 (계획)

1. beach-club.ts 305+ lines + 6 함수 + BeachClubError code-in-message
2. spec-container 3 files
3. **DOMAIN_MAP 85번째 entry** — autopilot 자체 검증 + **6축 (f) CI Guard 외부 검증 이중**
4. parser BC prefix (BL_ID_PATTERN 81 → 82, S381 후 baseline)
5. REGISTRY BC-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 보강 5축 (a~e):
   - (a) `exposes 374 detectors` → `exposes 380 detectors` count + memo (S381 후 baseline)
   - (b) sorted keys array에 BC-001~006 6 entry alphabetical 위치 삽입 (BB-006 다음, BG-001 앞 또는 적절 위치)
   - (c) BC-001~006 registered describe block
   - (d) beach-club domain PRESENCE describe block (6 tests, wedding-hall/convention 패턴 복제)
   - (e) `findDomainMapping("beach-club")` 자체 호출 검증
7. `pnpm test --run` utils 695 → 702 PASS (+7, S381 후 baseline)
8. `npx tsc --noEmit` (S337 cache 우회) PASS
9. detect-bl 506 → 512/512 = 100.0% (85 containers, 74 신규 산업 0 ABSENCE)
10. Match ≥ 95%
11. PR + CI 3/3 green + **domain-sprint-guard PASS** = 6축 (f) 실감증 3회차
12. auto-merge
13. **자체 검증**: `git show HEAD --stat | grep domain-source-map.ts` 확인

---

## 사전 audit (S283 패턴 38회차)

BC prefix 충돌 0건 — BL_ID_PATTERN 81 prefix 전수 확인 (S381 후 가정) + DOMAIN_MAP 84 entry 전수 확인 (S381 후 가정) + beach-club.ts 미존재 + .decode-x/spec-containers/beach-club 미존재 4축 fs 실측 확정.

---

## 의존성 처리 — Sprint Pipeline 순차

S380 → S381 → S382 순차 Pipeline:
- 양 Sprint 모두 동일 shared file 편집 (domain-source-map.ts / rules-parser.ts / bl-detector.ts / bl-detector.test.ts)
- 381 MERGE 후 baseline 갱신 → S382 WT 시동 시 충돌 0건
- 표준 절차: bash sprint 382 → S351 표준 보정 → ccs --model sonnet → /ax:sprint-autopilot → Monitor

---

## 메타 — 6축 (f) CI Guard 3회차 정착 완료 트리거

본 Sprint는 6축 (f) CI Guard 도입(S379) 후 3번째 신규 도메인 Sprint. S377 5축 정착 검증 패턴 (1회 입증 → 2회차 정착) 재현 + 3회차 정착 완료로 거버넌스 표준 확정 트리거.

- S380 1회 입증 (CV Convention) — 첫 PR에서 workflow 자동 작동 확인
- S381 2회차 정착 (WB Wedding hall) — 연속 적용
- S382 3회차 정착 완료 (BC Beach club) — 거버넌스 표준 확정

차기 모니터링:
- DOMAIN_MAP false claim 3회차 재발 시 (S376+S378+?) lifecycle 승격 트리거
- 6축 (f) 3회 누적 정착 시 rules/ 본문에 표준 절차로 승격 검토
- 16 도메인 단일 클러스터 달성 시 메타 카테고리 체계 재정의 검토
