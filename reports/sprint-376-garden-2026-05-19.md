# Sprint 376 — F548 GR Garden PDCA Report

**Date**: 2026-05-19
**Sprint**: 376
**F-item**: F548
**Domain**: GR Garden (식물원/수목원)
**Match Rate**: 100%
**Test Result**: PASS (666/666)

---

## 🌷 마일스톤 달성

| 마일스톤 | 내용 |
|---------|------|
| 🌷 **80번째 도메인** | S262 5 → S376 80, **16.0배 확장 round 마일스톤** |
| 🌷 **단일 클러스터 11 도메인 첫 사례** | AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR 오프라인 엔터 11-클러스터 |
| 🌷 **7 Sprint 연속 첫 사례 마일스톤** | S370 5 → S371 6 → S372 7 → S373 8 → S374 9 → S375 10 → S376 11 |
| 🏆 **withRuleId 81 Sprint 정점 도전** | 신규 detector 0개 패턴 81 Sprint 연속 |
| 🔄 **거울 변환 33회차** | carsharing → ... → festival → garden |
| 🤖 **Sprint WT autopilot 7회차** | 분리 작업 패턴 7번째 |
| 🎯 **S283 audit 32회차** | 사전 fs 실측 적중 |
| 🎯 **69번째 신규 산업** | 식물원/수목원 (Botanical Garden/Arboretum) |

---

## 구현 결과

### 신규 파일 (4건)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/garden.ts` — 307 lines, 6 함수 + GardenError
- `.decode-x/spec-containers/garden/rules/garden-rules.md` — GR-001~GR-006 비즈니스 룰
- `.decode-x/spec-containers/garden/tests/GR-001.yaml` — 9 test scenarios
- `.decode-x/spec-containers/garden/provenance.yaml` — detection 기록

### 수정 파일 (3건)
- `packages/utils/src/divergence/rules-parser.ts` — GR prefix BL_ID_PATTERN 추가
- `packages/utils/src/divergence/bl-detector.ts` — GR-001~006 REGISTRY 추가 (+9 lines)
- `packages/utils/test/bl-detector.test.ts` — 344→350 detector count + GR 테스트 (+80 lines)

---

## 비즈니스 룰 (GR-001 ~ GR-006)

| ID | 함수 | detector | 결과 |
|----|------|----------|------|
| GR-001 | `reserveVisit` | ThresholdCheck (Path A, UPPERCASE MAX_CONCURRENT_GARDEN_VISITS=3000) | ✅ PRESENCE |
| GR-002 | `applyZoneLimit` | ThresholdCheck (Path B, var-vs-var, `limit` keyword) | ✅ PRESENCE |
| GR-003 | `processGardenEntry` | AtomicTransaction (zone_sessions+garden_visits+visit_payments) | ✅ PRESENCE |
| GR-004 | `transitionVisitStatus` | StatusTransition (6-state matrix) | ✅ PRESENCE |
| GR-005 | `expireClosedVisitBatch` | StatusTransition (batch, 69번째 재사용) | ✅ PRESENCE |
| GR-006 | `processVisitRefund` | AtomicTransaction (cancelled_fee_records+visit_refunds) | ✅ PRESENCE |

---

## GR 차별성 (PA/MS/FE 분리)

| 항목 | PA (공원) | MS (박물관) | FE (페스티벌) | GR (식물원) |
|------|----------|------------|-------------|------------|
| 핵심 활동 | 트레일/캠핑 | 전시물 관람 | 멀티 stage | 구역별 식물 관찰 |
| 입장 단위 | 전체 | 전시 구역 | stage 별 | zone 분리 |
| 멤버십 | 시즌 패스 | 연간 패스 | festival pass | 계절권 (seasonal) |
| 동시 한도 | 2000 | 1500 | 5000 | 3000 |

---

## Coverage

| 지표 | Sprint 375 | Sprint 376 | 변화 |
|-----|-----------|-----------|------|
| domains | 79 | **80** | +1 |
| new industries | 68 | **69** | +1 |
| detectors | 344 | **350** | +6 |
| detect-bl coverage | 446/446 | **452/452** | +6 |
| tests | 660 | **666** | +6 |
| cluster size (offline ent.) | 10 | **11** | +1 (first case) |

---

## 실행 요약

- **방식**: Sprint WT autopilot (Tier 3 — bkit/ax 없음, 직접 구현)
- **소요 시간**: ~15분 (FE 패턴 거울 변환, test 수정 1회 반복)
- **오류**: test expectation 방향 오류 1건 (`.some(ruleId)` → `toHaveLength(0)`) 즉시 수정
- **typecheck**: PASS (pnpm typecheck turbo — 14 tasks)
- **test**: PASS (666/666)
