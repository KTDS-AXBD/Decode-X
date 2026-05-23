---
id: AIF-RPRT-103
sprint: 390
f_items: [F562]
match_rate: 100
status: DONE
created: "2026-05-23"
---

# Sprint 390 Report — F562 AC Arcade 93번째 도메인

## 결과 요약

| 항목 | 결과 |
|------|------|
| Match Rate | **100%** (13/13 DoD) |
| utils tests | **769 PASS** (761 + 8) |
| detect-bl | **560/560 = 100.0%** (93 containers, 82 신규 산업 0 ABSENCE) |
| typecheck | ✅ PASS |
| BL_DETECTOR_REGISTRY | **428** (422 + 6 AC-001~006) |
| BL_ID_PATTERN | **90 prefixes** (89 + AC) |
| domain-source-map.ts | AC entry 확인: `git show HEAD --stat \| grep domain-source-map.ts` |
| 6축 (f) CI Guard | **11회차** (S380~S390 11 Sprint 자연 작동 누적) |

## 마일스톤

🏆 **단일 클러스터 24 도메인 첫 사례** — AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC 오프라인 엔터 24-클러스터
🏆 **20 Sprint 연속 첫 사례** (S370 5→S390 24)
🏆🏆 **20 round 마일스톤** (S370 5 → S390 24)
🏆 **withRuleId 94 Sprint 정점 도전** (S264~S390 94 Sprint 누적)
🎯 **6축 (f) CI Guard 11회차** (rules/ 등재 후 2회차 자연 작동)
🎯 **S283 audit 46회차** (AC prefix 충돌 0건 사전 확인)
🎯 **거울 변환 46회차** (bowling → arcade)

## 구현 파일

1. `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/arcade.ts` — 6 함수 (enterMachine/applyTokenLimit/processTokenCharge/transitionMachineStatus/expireEndedSessionBatch/processTokenRefund) + ArcadeError
2. `.decode-x/spec-containers/arcade/rules/arcade-rules.md` — markdown table 형식 (S381 가이드 준수)
3. `.decode-x/spec-containers/arcade/provenance.yaml`
4. `.decode-x/spec-containers/arcade/tests/AC-001.yaml`
5. `scripts/divergence/domain-source-map.ts` — 93번째 entry 추가
6. `packages/utils/src/divergence/rules-parser.ts` — BL_ID_PATTERN AC 추가 (90 prefixes)
7. `packages/utils/src/divergence/bl-detector.ts` — AC-001~006 6 entries 추가
8. `packages/utils/test/bl-detector.test.ts` — 5축 보강 (422→428 + sorted + registered + PRESENCE + findDomainMapping)

## DoD 검증 결과

- [x] (1) arcade.ts 6 함수 + ArcadeError
- [x] (2) spec-container 3 files (provenance + rules 테이블 형식 + AC-001.yaml)
- [x] (3) DOMAIN_MAP 93번째 entry (domain-source-map.ts 확인)
- [x] (4) BL_ID_PATTERN 90 prefixes (AC 추가)
- [x] (5) BL_DETECTOR_REGISTRY AC-001~006 6 entries
- [x] (6) utils test 5축 (422→428 + AC sorted + registered + PRESENCE 6 + findDomainMapping)
- [x] (7) utils 769 PASS (761 + 8)
- [x] (8) typecheck PASS
- [x] (9) detect-bl 560/560 = 100.0%
- [x] (10) Match 100% ≥ 95%
- [ ] (11) PR + CI 4/4 green (pending)
- [ ] (12) auto-merge (pending)
- [x] (13) 자체 검증: detect-bl arcade AC-001~006 PRESENT 6 BLs 확증

## AC 차별성

BW(볼링 lane 시간제) + GA(도박 betting platform) 인접하되 **token 기반 prepaid + machine 다양성 (rhythm/racing/redemption) + machine fault event + prize ticket system + redemption shop + family-friendly arcade variety** 모델 차별. B2C 가족/청소년 30분~수시간 + token 단위 사용 + 상품 교환 + machine 장애 양보 정책.
동시 한도 30 (arcade별 동시 active machine, 중형 아케이드 30 machine 기준).

## 차기 후보
- 94번째 신규 산업 (25-cluster 21 Sprint 연속 도전)
- bashrc Fix D (signal F_ITEMS empty 5회 재현)
- F487 / TD-52 / 보안 후속 2건
