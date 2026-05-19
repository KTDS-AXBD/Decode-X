---
id: AIF-PLAN-231
title: Sprint 380 Plan — F552 CV Convention 83번째 도메인
type: plan
status: active
created: "2026-05-19"
updated: "2026-05-19"
author: master
sprint: 380
feature: F552
related:
  - AIF-PLAN-096 (Sprint 377 OB Observatory 5축 정착 선례)
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
---

# Sprint 380 Plan — F552 CV Convention 83번째 도메인

**Sprint**: 380
**F-item**: F552
**Domain**: CV Convention (회의/전시장 산업, 72번째 신규 산업)
**Session**: 세션 309
**Date**: 2026-05-19

---

## 목표

오프라인 엔터테인먼트 14-클러스터 확장 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+**CV**).
✏️ **단일 클러스터 14 도메인 첫 사례 마일스톤 신기록** + **10 Sprint 연속 첫 사례 마일스톤 신기록** (S370 5→S371 6→...→S378 13→S380 14).
withRuleId 84 Sprint 정점 도전 (신규 detector 0개, 거울 변환 36회차).
**6축 (f) CI Guard 실감증**: S379에서 신설한 `domain-sprint-guard.yml`이 본 Sprint PR에서 자동 작동 — DOMAIN_MAP 누락 시 CI fail 결정적 차단 입증.

---

## 도메인 비즈니스 룰 (CV-001 ~ CV-006)

컨벤션 산업 차별성: **다중 트랙 세션 + 부스 임대 + 등록자 관리 + B2B 단기 이벤트** (MS 박물관 정적 전시 + EX 단기 박람회 인접하되 회의/컨벤션 세션 + 부스 배정 + 등록자 운영이 핵심).

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| CV-001 | `reserveSession` | ThresholdCheck (Path A var-vs-UPPERCASE, MAX_CONCURRENT_SESSIONS_PER_CONVENTION) | 컨벤션별 동시 active session 한도 검증 |
| CV-002 | `applyBoothLimit` | ThresholdCheck (Path B var-vs-var, boothLimit keyword) | 회원 일일 booth 한도 비교 |
| CV-003 | `processBoothBooking` | AtomicTransaction | booth 등록 atomic — `convention_sessions` + `booth_schedules` + `session_payments` |
| CV-004 | `transitionSessionStatus` | StatusTransition | session 상태 전환 (reserved → ongoing → ended / closed / cancelled) |
| CV-005 | `expireClosedSessionBatch` | StatusTransition (batch) | closed session 일괄 만료 처리 |
| CV-006 | `processSessionRefund` | AtomicTransaction | session 환불 atomic — `cancelled_fee_records` + `session_refunds` |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/convention.ts` (305+ lines)
- `.decode-x/spec-containers/convention/provenance.yaml`
- `.decode-x/spec-containers/convention/rules/convention-rules.md`
- `.decode-x/spec-containers/convention/tests/CV-001.yaml`

### 수정 파일
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 83번째 entry 추가 (**DoD 5축 (e) + 6축 (f) CI Guard 양축 강제**)
- `packages/utils/src/divergence/rules-parser.ts` — CV prefix 추가 (BL_ID_PATTERN, 79→80)
- `packages/utils/src/divergence/bl-detector.ts` — CV-001~006 registry 추가 (withRuleId × 6)
- `packages/utils/test/bl-detector.test.ts` — utils test 보강 5축 (count/sorted keys/registered/PRESENCE/DOMAIN_MAP verify)

---

## DoD 13/13 (계획)

1. convention.ts 305+ lines + 6 함수 + ConventionError code-in-message
2. spec-container 3 files (provenance + convention-rules + CV-001.yaml)
3. **DOMAIN_MAP 83번째 entry** — autopilot 자체 검증 + **6축 (f) CI Guard 외부 검증 이중**
4. parser CV prefix (BL_ID_PATTERN 79 → 80)
5. REGISTRY CV-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 보강 5축 (a~e):
   - (a) `exposes 362 detectors` → `exposes 368 detectors` count + memo
   - (b) sorted keys array에 CV-001~006 6 entry alphabetical 위치 삽입
   - (c) CV-001~006 registered describe block
   - (d) convention domain PRESENCE describe block (6 tests, planetarium 패턴 복제)
   - (e) `findDomainMapping("convention")` 자체 호출 검증
7. `pnpm test --run` utils 681 → 688 PASS (+7)
8. `npx tsc --noEmit` (S337 cache 우회) PASS
9. detect-bl 494 → 500/500 = 100.0% (83 containers, 72 신규 산업 0 ABSENCE)
10. Match ≥ 95%
11. PR + CI 3/3 green + **domain-sprint-guard PASS** = 6축 (f) 실감증
12. auto-merge
13. **자체 검증**: `git show HEAD --stat | grep domain-source-map.ts` 확인

---

## 사전 audit (S283 패턴 36회차)

CV prefix 충돌 0건 — rules-parser BL_ID_PATTERN 미등록 + DOMAIN_MAP 미등록 + convention.ts 미존재 + .decode-x/spec-containers/convention 미존재 4축 fs 실측 확정 (현 baseline 82 containers / 494 detector / 79 prefixes 확인).

---

## 메타 — 6축 (f) CI Guard 실감증

본 Sprint는 **S379 직후 차기 Sprint**라서 자연스럽게 6축 (f) 워크플로우 실 작동 검증 케이스:
- PR title `feat: Sprint 380 F552 CV Convention 83번째 도메인` → workflow regex 매칭 ✅
- autopilot이 DOMAIN_MAP entry 추가 시 → CI green
- autopilot이 누락 시 → CI fail (S378 같은 false claim 패턴이 본 Sprint에서 발생하면 즉시 차단)

S378까지는 Master가 post-merge git diff로 발견 + fix-forward 했지만, 본 Sprint는 CI가 PR 단계에서 결정적 차단. **메커니즘 전환 첫 실 사례**.
