---
name: AIF-ANLS-122 — TD-60 passThreshold retrospective + F356-A 통합 회고
description: F417 baseline + 세션 260 0.6 인하 효과 + F356-A 91.7% 도달 메타 분석 (Sprint 336 F508)
category: analysis
project: Decode-X
sprint: 336
fItem: F508
techDebt: TD-60
created: 2026-05-12
updated: 2026-05-12
author: Sinclair Seo
status: DONE
---

# TD-60 passThreshold 재조정 retrospective + F356-A 통합 회고

> **중요 정정 (S300 세션 작업 중 발견)**: Sprint 336 사전 등록 시 본 분석 scope를 "TD-60 재조정 후보 docs 분석"으로 적었으나, fs 실측 결과 **TD-60는 이미 ✅ RESOLVED** (세션 260, 2026-05-04, F417 후속 Master inline). 본 docs는 **retrospective 회고** + **F356-A Phase 2 GO 도달과의 통합 메타 분석**으로 reframe함.

## 1. 배경 — TD-60 등록 경위 (역사)

**Sprint 248 F417 PoC (2026-05-03)** — LPON skill source data 고도화 PoC:
- 43건 LLM augmentation 완주 (LPON 35 + lpon 8)
- 6 criteria PASS threshold = **0.75** (svc-skill `passThreshold` 스키마 default)
- 결과: avg_score 0.511 → 0.584 (+14%) but PASS threshold 미진입
  - io_structure: 0/43 (0%), exception_handling: 2/43 (4.7%), testability: 0/43 (0%)

→ TD-60 등록: passThreshold 0.75 재조정 검토 필요 (P2 candidate)

## 2. TD-60 해소 — 세션 260 (2026-05-04, F417 후속 Master inline)

**passThreshold 0.75 → 0.6 인하**:
- **시뮬레이션 발견**: Haiku 모델은 점수를 prompts.ts rubric tier 중간값(~0.42 / 0.62 / 0.82 / 0.95)으로 **discrete bin 출력**
- 0.75 threshold는 0.62 cluster 통째로 fail로 cut
- **0.6 threshold가 자연스러운 분리 경계** (rubric tier 사이 valley)

**코드 변경 5건**:
1. `packages/types/src/ai-ready.ts:22` z.literal(0.75) → z.literal(0.6)
2. `services/svc-skill/src/ai-ready/evaluator.ts:164,184`
3. `services/svc-skill/src/routes/ai-ready.ts:124`
4. 단위 테스트 5건 (repository.test.ts 6 row + ai-ready.test.ts 3 case + evaluator.test.ts 1 desc)

**결과 (LPON-schema F418 latest, 35건)**:

| Criterion | 0.75 threshold | 0.6 threshold | Δ |
|-----------|---------------:|--------------:|---:|
| overallPassed | 0/35 (0%) | **20/35 (57.1%)** | +57.1pp |
| io_structure | 0% | **60.0%** | +60.0pp |
| exception_handling | 0% | **71.4%** | +71.4pp |
| testability | 0% | **74.3%** | +74.3pp |
| srp_reusability | 0% | 37.1% | +37.1pp |

**D1 ai_ready_scores 백필 안 함**: 기존 row `pass_threshold` 0.75로 보존 (감사 추적성). 신규 평가만 0.6 적용.

**참조**: `reports/ai-ready-threshold-0.6-reaggregation-2026-05-04.{json,md}` + SPEC §8 ~~TD-60~~ ✅ 해소 entry.

## 3. F356-A Phase 2 GO 도달 (Sprint 332 F504 세션 299 2026-05-12)

**방식 B 전수 적용 7 containers + Sonnet 8 재평가**:
- **44/48 = 91.7% PASS rate** (Phase 2 GO 임계 80% 대비 **+11.7%pp 초과**)
- avg score **0.860**
- 6 criteria 정점 4종:
  - source_consistency 100%
  - testability 100%
  - exception_handling 100%
  - comment_doc_alignment 87.5% (+50.0%pp vs F492 37.5%)
  - srp_reusability 87.5%
  - io_structure 75.0% (+37.5%pp vs F492 37.5%)

**F492 약점 2종 영구 해소** (Sprint 325 F492 vs Sprint 332 F504):
- io_structure 37.5% → **75.0%**
- comment_doc_alignment 37.5% → **87.5%**

**비용**: $2.4386 (예상 $4.5 대비 -46% 절약)

## 4. 통합 메타 분석 — 2축 fix의 상호작용

### 축 1: threshold lowering (TD-60 fix, S260)
- **메커니즘**: rubric tier valley(0.62~0.82 사이) 통한 PASS 경계 조정
- **효과 한계**: 0.6 threshold도 LPON 35의 srp_reusability 0.368 avg는 못 살림 — 구조적 약점은 threshold로 해소 불가
- **가치**: 0.62 tier (Haiku 평균 능력) skill을 PASS로 분류 + production 운영 가능 + 운영 영향 최소

### 축 2: provenance 구조 보강 (F496 → F504 방식 B, S299)
- **메커니즘**: spec-container provenance.yaml에 `inputSchema` (BL 함수 시그니처) + `esToBlMapping` (ES↔BL 매핑) + 23 runbooks `Related BL` cross-ref 헤더 추가
- **효과**: io_structure 37.5%→75%, comment_doc_alignment 37.5%→87.5% (input 정확도 보강이 LLM evaluator의 정확 판정 유도)
- **가치**: **구조적 정공** — input data quality가 본질적 병목임을 정량 입증

### 결합 효과
- TD-60 fix만 (S260): LPON 35 → 20/35 PASS (57.1%) at threshold=0.6
- F504 방식 B 전수 + Sonnet 재평가 (S299): 44/48 = 91.7% at threshold=**0.75** (역으로 0.75 회복 검증 가능)
- **메타 결론**: input data 정공 + Sonnet 능력 활용 시 **0.6 threshold 자체 불필요**. 0.75 threshold 유지 + 방식 B 적용이 정공.

## 5. 결정 (S300 retrospective)

### TD-60 status (현재 정합 확인)
- ✅ **해소 (S260, 2026-05-04)** — passThreshold 0.6 인하 + 단위 테스트 통과 + 효과 정량 입증
- ✅ **F356-A Phase 2 GO 도달 (S299)** — 방식 B 우위 입증, 0.6 threshold 영향 없이 91.7% 달성

### 후속 결정 (deferred / not required)
- **0.6 → 0.75 회복 후보 deferred**: F504 본 sprint는 8 containers 평가에서만 91.7% 달성. 다른 도메인(Miraeasset / 신규 industry) 적용 시 효과 일관성 검증 필요 (~5 Sprint 누적 후 통계적 결정).
- **6-criteria rubric 재설계 (대안 C)**: deferred. 현 6-criteria가 91.7% 도달 가능 입증 → 재설계 시급성 ↓.
- **criteria weighted average (대안 B)**: deferred. 91.7% 도달했으므로 가중 미적용 가능성 충분.

### 정합 점검 결과
- SPEC §8 TD-60 entry ✅ 해소 마킹 정확 — drift 0건
- SPEC §6 F417 [~] PARTIAL_FAIL ✅ 유지 (PoC 결과 historical, 정합)
- SPEC §6 F418 [~] → [x] DONE drift 1건 → 본 Sprint 336에서 정합화 완료 (별도 commit)

## 6. drift cleanup grep 점검 결과

**§6 stale `📋 PLANNED` 검사**:
- F508 (본 Sprint 336 self-reference) — 정합 (현 작업 중)
- F509 (Sprint 337) / F510 (Sprint 338) / F490 (Sprint 339 할당) — 모두 정상 PLANNED
- **stale 0건** (drift 부재)

**§6 `[~]` PARTIAL state 검사**:
- F412 (~~strikethrough~~ + PARTIAL FAIL, AIF-REQ-041 Sprint 247 F416 우회 경로 DONE) — 정합 (의도적 PARTIAL_FAIL 이력 보존)
- F417 [~] PARTIAL_FAIL (AIF-REQ-042 정합) — 정합
- F418 [~] PARTIAL_FAIL — **drift 1건 발견** → ✅ [x] DONE 갱신 (본 Sprint 336 §6 정합화)

**최종 drift**: **1건 (F418)** → 정합화 완료. drift cleanup 4회차 패턴 (S279 8건 → S297 1건 → S299 1건 → S300 1건).

## 7. DoD 6/6 PASS

- [x] reports/sprint-336-td60-passthreshold-analysis-2026-05-12.md 신설 ✅
- [x] F417 baseline 실측 + 세션 260 0.6 인하 효과 정량 인용 ✅
- [x] F356-A Phase 2 GO 도달(S299 F504 91.7%) 메타 통합 분석 ✅
- [x] §6 drift cleanup grep 점검 — F418 1건 발견 → 정합화 ✅
- [x] TD-60 retrospective 정확 reframe (이미 해소 인지 후 docs 갱신) ✅
- [x] 후속 deferred 결정 명시 (0.75 회복 / rubric 재설계 / weighted average 모두 deferred) ✅

## 8. 산출물

- 본 분석 문서 (AIF-ANLS-122) ✅
- SPEC §6 F418 [~] → [x] DONE drift cleanup 1건 정합화 (별도 commit)
- TaskUpdate Sprint 336 completed 마킹

## 9. 메타 학습 5종

1. **사전 등록 자체에 fs 실측 누락 사례** (rules/development-workflow.md S283 패턴): Sprint 336 사전 등록 시 TD-60을 "OPEN 가정"으로 적었으나 실제로는 S260 RESOLVED. **rules 적용 4회차 발견** (S280 F435 / S282 F437 / S299 F506 + S300 F508). 사전 등록 단계 fs 점검 절차 표준 강화 후보.

2. **2축 fix 상호작용 입증**: threshold lowering (TD-60 fix) + structural improvement (방식 B) 양축이 **독립적이지 않고 보완적**. 표면적으로는 threshold 인하만으로 PASS rate 향상이지만, 본질은 input data quality 정공 (F496 패턴). **방식 B 적용 시 0.75 threshold 회복 가능성 검증 후보**.

3. **drift cleanup 4회차 정착**: S279 (8건 일관) → S297 (1건) → S299 (1건) → S300 (1건). post-MERGED hook 자동화 후보.

4. **TD 클로징 패턴 인식**: TD가 fix되지 않고 **조건 자체가 무효화되어 클로징**되는 패턴 (TD-58은 fix-by-implementation, TD-60은 fix-by-threshold-lowering, TD-64는 fix-by-normalization). 패턴 종류별로 SPEC §8 갱신 자동화 휴리스틱 가능.

5. **retrospective docs의 가치**: Sprint 336 자체가 작업량 ~5분 (실제 정합화)이지만, 본 retrospective docs로 **2축 fix 통합 메타 인식** + **F356-A Phase 2 GO 도달 근거 정량 명시** + **후속 deferred 결정 SSOT 보존**. 차기 세션 context 복원 시점 retrospective 인용 가치 큼.
