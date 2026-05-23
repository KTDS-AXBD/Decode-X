---
id: AIF-PLAN-395
title: Sprint 395 F567 — VR Experience hall 98번째 도메인 / 87번째 신규 산업
status: planned
sprint: 395
f_items: [F567]
created: "2026-05-23"
---

# Sprint 395 Plan — F567 VR Experience hall

## 목표

VR Experience hall (VR 체험관) 신규 도메인 부트스트래핑.
🥽 오프라인 엔터 29-클러스터 확장 (AM+...+DJ+VR), 🏆 단일 클러스터 29 도메인 첫 사례 + 25 Sprint 연속 신기록 도전.

## 의존성

- Sprint 394 F566 DJ Academy MERGED ✅ (main `9a7a02b`)
- Baseline: 97 containers / 584 detectors / utils 798 PASS / BL_ID_PATTERN 94 prefixes

## 구현 범위 (fs 실측 확인)

### 신규 파일 (생성)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/vr-hall.ts` — 미존재 ✅
- `.decode-x/spec-containers/vr-hall/provenance.yaml` — 미존재 ✅
- `.decode-x/spec-containers/vr-hall/rules/vr-hall-rules.md` — 미존재 ✅
- `.decode-x/spec-containers/vr-hall/tests/VR-001.yaml` — 미존재 ✅

### 기존 파일 수정
- `scripts/divergence/domain-source-map.ts` — 98번째 entry 추가
- `packages/utils/src/divergence/bl-detector.ts` — VR-001~006 registry 추가
- `packages/utils/src/divergence/rules-parser.ts` — BL_ID_PATTERN VR prefix 추가
- `packages/utils/test/bl-detector.test.ts` — 테스트 보강 5축 (+7 tests)

## VR 산업 BL 설계

| Rule | Type | 설명 |
|------|------|------|
| VR-001 | ThresholdCheck (UPPERCASE) | 동시 active pod 한도 MAX_CONCURRENT_PODS_PER_HALL |
| VR-002 | ThresholdCheck (var-vs-var) | 회원 일일 session 한도 sessionLimit keyword |
| VR-003 | AtomicTransaction | pod 예약 — vr_sessions+pod_schedules+session_payments+headset_assignment |
| VR-004 | StatusTransition | reserved → started → playing → ended/discomfort_exit/cancelled |
| VR-005 | StatusTransition (batch) | ended session batch expire |
| VR-006 | AtomicTransaction | session 환불 — motion sickness 30s + content 미공급 환불 |

VR 차별성: AC(Arcade token+machine fault) + ES(Escape room 그룹+GM 운영) + KP(콘서트 좌석) 인접하되
pod-based 시간제 30-60분 + 헤드셋 위생 + content library 라이센스 + 그룹 동시 multiplayer + motion sickness 환불 + content rating.

## DoD 13/13 체크리스트

1. [ ] vr-hall.ts ~305 lines + 6 함수 + VrHallError
2. [ ] spec-container 3 files (provenance + rules markdown table + VR-001.yaml tests)
3. [ ] DOMAIN_MAP 98번째 entry (자체 검증: git show HEAD --stat | grep domain-source-map.ts)
4. [ ] BL_ID_PATTERN VR prefix 추가 (94 → 95)
5. [ ] REGISTRY VR-001~006 (withRuleId 재사용)
6. [ ] utils test 5축: (a)458 count (b)sorted keys VR-001~006 (c)registered (d)PRESENCE 6 tests (e)findDomainMapping
7. [ ] pnpm test --run utils 798 → 805 PASS (+7)
8. [ ] npx tsc --noEmit PASS (cache 우회)
9. [ ] detect-bl 584 → 590/590 = 100% (98 containers)
10. [ ] Match ≥ 95%
11. [ ] PR + CI 4/4 green = 6축 (f) 16회차
12. [ ] auto-merge
13. [ ] 자체 검증: git show + runtime detect-bl --domain vr-hall | grep VR- 6 BLs

## 위험 대응

- VR prefix 충돌 없음 확인 ✅ (BL_ID_PATTERN 94 prefixes 전수 검사)
- rules.md는 반드시 markdown table 형식 (S381 false claim 차단 가이드 준수)
- sorted keys에서 VR-001~006은 VD-006과 VT-001 사이 삽입
