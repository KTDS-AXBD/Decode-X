---
id: AIF-PLAN-096
title: Sprint 377 Plan — F549 OB Observatory 81번째 도메인
type: plan
status: active
created: "2026-05-19"
updated: "2026-05-19"
author: autopilot
sprint: 377
feature: F549
---

# Sprint 377 Plan — F549 OB Observatory 81번째 도메인

**Sprint**: 377  
**F-item**: F549  
**Domain**: OB Observatory (천문대 산업, 70번째 신규 산업)  
**Session**: 세션 307 후속7  
**Date**: 2026-05-19  

---

## 목표

오프라인 엔터테인먼트 12-클러스터 확장 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+**OB**).  
🔭 **단일 클러스터 12 도메인 첫 사례 마일스톤** + **8 Sprint 연속 첫 사례 마일스톤 달성 경로** (S370 5→S371 6→...→S376 11→S377 12).  
withRuleId 82 Sprint 정점 도전 (신규 detector 0개, 거울 변환 34회차).  
**DoD 5축 강화**: DOMAIN_MAP entry 명시 신규 추가 (S376 false claim 패턴 차단).

---

## 도메인 비즈니스 룰 (OB-001 ~ OB-006)

천문대 도메인 차별성: **시간 슬롯 운영 + 야간 관측 + 기상 의존** (MS 박물관과 유사하되 telescope 슬롯이 핵심).

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| OB-001 | `reserveObservation` | ThresholdCheck (Path A var-vs-UPPERCASE) | 천문대별 동시 active observation 한도 검증 |
| OB-002 | `applyTelescopeLimit` | ThresholdCheck (Path B var-vs-var, telescopeLimit keyword) | 회원 일일 telescope 한도 비교 |
| OB-003 | `processTelescopeObservation` | AtomicTransaction | telescope 관측 atomic — observatory_observations + telescope_schedules + observation_payments |
| OB-004 | `transitionObservationStatus` | StatusTransition | 관측 상태 전환 (reserved → observed → ended / closed / cancelled) |
| OB-005 | `expireClosedObservationBatch` | StatusTransition (batch) | closed observation 일괄 만료 처리 |
| OB-006 | `processObservationRefund` | AtomicTransaction | 관측 환불 atomic — cancelled_fee_records + observation_refunds |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/observatory.ts` (305+ lines)
- `.decode-x/spec-containers/observatory/provenance.yaml`
- `.decode-x/spec-containers/observatory/rules/observatory-rules.md`
- `.decode-x/spec-containers/observatory/tests/OB-001.yaml`

### 수정 파일
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 81번째 entry 추가 (DoD 5축 필수)
- `packages/utils/src/divergence/rules-parser.ts` — OB prefix 추가 (BL_ID_PATTERN, 77→78)
- `packages/utils/src/divergence/bl-detector.ts` — OB-001~006 registry 추가
- `packages/utils/test/bl-detector.test.ts` — utils test 보강 5축 (count/sorted keys/registered/PRESENCE/DOMAIN_MAP verify)

---

## DoD (13/13 계획)

1. observatory.ts 305+ lines + 6 함수 + ObservatoryError
2. spec-container 3 files
3. **DOMAIN_MAP 81번째 entry** (`scripts/divergence/domain-source-map.ts`) — autopilot 자체 검증 필수
4. parser OB prefix (77→78)
5. REGISTRY OB-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 보강 5축 (a~e)
7. `pnpm test --run` utils 666→673 PASS (+7)
8. `npx tsc --noEmit` PASS
9. detect-bl 482→488/488 = 100.0%
10. Match ≥ 95%
11. PR + CI 3/3 green
12. auto-merge
13. 자체 검증: `git show HEAD --stat | grep domain-source-map.ts`

---

## 사전 audit (S283 패턴 33회차)

OB prefix 충돌 0건 — rules-parser BL_ID_PATTERN 미등록 + DOMAIN_MAP 미등록 + observatory.ts 미존재 + .decode-x/spec-containers/observatory 미존재 4축 fs 실측 확정.
