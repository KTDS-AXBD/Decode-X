---
id: AIF-PLAN-232
title: Sprint 381 Plan — F553 WB Wedding hall 84번째 도메인
type: plan
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 381
feature: F553
related:
  - AIF-PLAN-096 (Sprint 377 OB Observatory 5축 정착)
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-231 (Sprint 380 CV Convention 14-cluster 첫 사례)
---

# Sprint 381 Plan — F553 WB Wedding hall 84번째 도메인

**Sprint**: 381
**F-item**: F553
**Domain**: WB Wedding hall (예식장 산업, 73번째 신규 산업)
**Session**: 세션 309
**Date**: 2026-05-20
**의존성**: Sprint 380 (F552 CV Convention) MERGE 선행

---

## 목표

오프라인 엔터테인먼트 15-클러스터 확장 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+**WB**).
💒 **단일 클러스터 15 도메인 첫 사례 마일스톤 신기록** + **11 Sprint 연속 첫 사례 마일스톤 신기록** (S370 5→S371 6→...→S378 13→S380 14→S381 15).
withRuleId 85 Sprint 정점 도전 (신규 detector 0개, 거울 변환 37회차).
**6축 (f) CI Guard 실감증 2회차 정착**: S380 1회 입증 → S381 2회차 (S377 5축 1회 → S378 2회차 정착 패턴 재현).

---

## 도메인 비즈니스 룰 (WB-001 ~ WB-006)

예식장 산업 차별성: **단일 예식 + 시간대 슬롯 + 가족/하객 좌석 + 계약금/위약금 + 케이터링 옵션 통합** (CV 컨벤션 다중 트랙 + KP 콘서트 좌석 등급 인접하되 단일 1회성 B2C 이벤트 + 강한 계약금/위약금 패턴 차별).

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| WB-001 | `reserveCeremony` | ThresholdCheck (Path A var-vs-UPPERCASE, MAX_CONCURRENT_CEREMONIES_PER_HALL) | 예식장별 동시 active ceremony 한도 검증 |
| WB-002 | `applyHallLimit` | ThresholdCheck (Path B var-vs-var, hallLimit keyword) | 회원 일일 hall 한도 비교 |
| WB-003 | `processCeremonyBooking` | AtomicTransaction | hall 예약 atomic — `wedding_ceremonies` + `hall_schedules` + `ceremony_payments` |
| WB-004 | `transitionCeremonyStatus` | StatusTransition | ceremony 상태 전환 (reserved → ongoing → ended / closed / cancelled) |
| WB-005 | `expireClosedCeremonyBatch` | StatusTransition (batch) | closed ceremony 일괄 만료 처리 |
| WB-006 | `processCeremonyRefund` | AtomicTransaction | ceremony 환불 atomic — `cancelled_fee_records` + `ceremony_refunds` (강한 계약금/위약금 모델) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/wedding-hall.ts` (305+ lines)
- `.decode-x/spec-containers/wedding-hall/provenance.yaml`
- `.decode-x/spec-containers/wedding-hall/rules/wedding-hall-rules.md`
- `.decode-x/spec-containers/wedding-hall/tests/WB-001.yaml`

### 수정 파일
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 84번째 entry 추가 (**DoD 5축 (e) + 6축 (f) CI Guard 양축 강제 — S380 baseline 후**)
- `packages/utils/src/divergence/rules-parser.ts` — WB prefix 추가 (BL_ID_PATTERN, 80→81 — S380 후 baseline 가정)
- `packages/utils/src/divergence/bl-detector.ts` — WB-001~006 registry 추가 (withRuleId × 6)
- `packages/utils/test/bl-detector.test.ts` — utils test 보강 5축 (count/sorted/registered/PRESENCE/findDomainMapping)

---

## DoD 13/13 (계획)

1. wedding-hall.ts 305+ lines + 6 함수 + WeddingHallError code-in-message
2. spec-container 3 files (provenance + wedding-hall-rules + WB-001.yaml)
3. **DOMAIN_MAP 84번째 entry** — autopilot 자체 검증 + **6축 (f) CI Guard 외부 검증 이중**
4. parser WB prefix (BL_ID_PATTERN 80 → 81, S380 후 baseline)
5. REGISTRY WB-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 보강 5축 (a~e):
   - (a) `exposes 368 detectors` → `exposes 374 detectors` count + memo (S380 후 baseline)
   - (b) sorted keys array에 WB-001~006 6 entry alphabetical 위치 삽입 (VT-006 다음, WL-001 앞)
   - (c) WB-001~006 registered describe block
   - (d) wedding-hall domain PRESENCE describe block (6 tests, convention/planetarium 패턴 복제)
   - (e) `findDomainMapping("wedding-hall")` 자체 호출 검증
7. `pnpm test --run` utils 688 → 695 PASS (+7, S380 후 baseline)
8. `npx tsc --noEmit` (S337 cache 우회) PASS
9. detect-bl 500 → 506/506 = 100.0% (84 containers, 73 신규 산업 0 ABSENCE)
10. Match ≥ 95%
11. PR + CI 3/3 green + **domain-sprint-guard PASS** = 6축 (f) 실감증 2회차
12. auto-merge
13. **자체 검증**: `git show HEAD --stat | grep domain-source-map.ts` 확인

---

## 사전 audit (S283 패턴 37회차)

WB prefix 충돌 0건 — BL_ID_PATTERN 80 prefix 전수 확인 (S380 후 가정) + DOMAIN_MAP 83 entry 전수 확인 (S380 후 가정) + wedding-hall.ts 미존재 + .decode-x/spec-containers/wedding-hall 미존재 4축 fs 실측 확정.

**현 baseline 실측 시점 (Sprint 380 사전 등록 직후 + Sprint 381 사전 등록 시)**:
- 82 containers / 494 detector / 79 prefixes
- Sprint 380 MERGE 후 baseline: 83 containers / 500 detector / 80 prefixes (예상)
- Sprint 381 시동 시 audit 재실측 필요

---

## 의존성 처리

Sprint 380 MERGE 후 WT 시동:
- shared file 충돌 회피 (domain-source-map.ts / rules-parser.ts / bl-detector.ts / bl-detector.test.ts)
- Sprint 380 baseline 갱신된 main에서 WT 시동
- bash sprint 381 → S351 표준 보정 (signal F_ITEMS + .sprint-context) → ccs --model sonnet → /ax:sprint-autopilot → Monitor

---

## 메타 — 11 Sprint 연속 첫 사례 신기록 + 6축 (f) 실감증 2회차

본 Sprint는 11 Sprint 연속 첫 사례 마일스톤 신기록 (직전 10 Sprint S380 갱신)에 도달하며, S379에서 도입한 6축 (f) CI Guard가 S380 1회차 → S381 2회차로 정착 검증되는 사례. S377 5축 1회 입증 → S378 2회차 정착 패턴이 6축 (f)에서 재현되는지 관찰.

차기 모니터링:
- DOMAIN_MAP false claim 3회차 재발 시 lifecycle 승격 트리거
- 6축 (f) 효과 2회차 입증 시 거버넌스 표준 정착
