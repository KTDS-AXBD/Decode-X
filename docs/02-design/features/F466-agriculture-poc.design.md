---
id: AIF-ANLS-099
sprint: 300
feature: F466
title: Agriculture 30번째 도메인 신규 — Design
status: active
created: 2026-05-10
plan_ref: AIF-PLAN-098
---

# F466 Design — AIF-ANLS-099

## §1 개요

Pharmacy(F465) 동일 패턴으로 Agriculture(농업) 합성 도메인을 30번째 도메인으로 추가한다.
19번째 신규 산업(1차 산업 — 원자재 농공품). Sprint 300 마일스톤.

## §2 BL 매핑

| BL | Detector | Function | 패턴 |
|----|----------|----------|------|
| AG-001 | ThresholdCheck (Path A, UPPERCASE) | `recordCropYield()` | `cropYield >= MAX_YIELD_PER_HECTARE` |
| AG-002 | ThresholdCheck (Path B, var-vs-var, `limit` keyword) | `applyPesticide()` | `pesticideApplied > pesticideQuotaLimit` |
| AG-003 | AtomicTransaction | `processHarvest()` | db.transaction: 수확 + 등급 + 출하 INSERT |
| AG-004 | StatusTransition | `transitionCropStatus()` | planted→growing→mature→harvested→sold |
| AG-005 | StatusTransition (batch) | `markBatchGrading()` | batch: status='graded' (CC-005 패턴 19번째) |
| AG-006 | AtomicTransaction | `issueCertification()` | db.transaction: 인증 검증 + 서류 발급 + 라벨링 |

## §3 변경 파일

### §3.1 신규 생성
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/agriculture.ts` (~280 lines)
- `.decode-x/spec-containers/agriculture/provenance.yaml`
- `.decode-x/spec-containers/agriculture/rules/agriculture-rules.md`
- `.decode-x/spec-containers/agriculture/rules/AG-001.md` ~ `AG-006.md` (6파일)
- `.decode-x/spec-containers/agriculture/runbooks/AG-001.md` ~ `AG-006.md` (6파일)
- `.decode-x/spec-containers/agriculture/tests/AG-001.yaml`

### §3.2 수정
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP에 agriculture 30번째 entry 추가
- `packages/utils/src/divergence/rules-parser.ts` — BL_ID_PATTERN에 `AG` prefix 추가 (comment + regex)
- `packages/utils/src/divergence/bl-detector.ts` — BL_DETECTOR_REGISTRY에 AG-001~006 추가
- `packages/utils/test/bl-detector.test.ts` — 159→165 count update + AG sorted list + PRESENCE tests 6건

## §4 검증 기준

- vitest: 254 + 6 = 260 PASS (회귀 0)
- typecheck: turbo --force PASS
- detect-bl: agriculture 6 BLs, 0 ABSENCE, coverage ≥ 90.7%
- write-provenance --apply: 0/30 changes (PRESENCE 자동 입증)
- withRuleId 28 Sprint 연속 정점 (신규 detector 0개)
- 19 산업 연속 0 ABSENCE: CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG

## §5 Worker 파일 매핑 (단일 구현)

단일 Worker — Claude 직접 구현 (worktree 병렬 불필요, 파일 7종 + 수정 4종).
