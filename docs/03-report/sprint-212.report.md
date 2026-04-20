---
id: REPORT-SPRINT-212
sprint: 212
title: "svc-ingestion Java/Spring AST 파서 + Source-First Reconciliation 엔진"
status: DONE
created: "2026-04-20"
match_rate: 100
---

# Sprint 212 — 완료 보고서

## 요약

svc-ingestion Stage 1 입력 채널에 Java/Spring 소스 분석 능력을 추가하고,
소스-문서 대조를 통해 3종 차이 마커를 생성하는 Reconciliation 엔진을 구축했어요.

## 구현 결과

| 파일 | 상태 |
|------|------|
| `packages/types/src/reconcile.ts` | ✅ 신규 — ReconcileMarker·DocApiSpec·ReconcileResult·ReconciliationReport 타입 |
| `packages/types/src/index.ts` | ✅ 수정 — reconcile re-export 추가 |
| `packages/utils/src/reconcile.ts` | ✅ 신규 — Source-First Reconciliation 엔진 |
| `packages/utils/src/index.ts` | ✅ 수정 — reconcile re-export 추가 |
| `scripts/java-ast/package.json` | ✅ 신규 — offline CLI 패키지 |
| `scripts/java-ast/src/index.ts` | ✅ 신규 — CLI 진입점 (--dir/--out/--project/--verbose) |
| `scripts/java-ast/src/runner.ts` | ✅ 신규 — 파서 조합 (Controller/Service/DataModel) |
| `scripts/java-ast/src/types.ts` | ✅ 신규 — CLI 자립 타입 |
| `packages/utils/src/__tests__/reconcile.test.ts` | ✅ 신규 — 7개 시나리오 유닛 테스트 |

## KPI 달성

| KPI | 결과 |
|-----|------|
| LPON 결제 소스 1개 모듈 AST 추출 | ✅ 테스트 픽스처(`LponPaymentController.java`) + CLI runner로 추출 검증 |
| 문서 대조 시 최소 1건 DIVERGENCE 생성 | ✅ `DIVERGENCE: paramCount: source=2 doc=3` 로그 생성 확인 |
| TypeScript 빌드 오류 0건 | ✅ `pnpm typecheck` 14개 패키지 통과 |
| 유닛 테스트 통과 | ✅ 42개 테스트 통과 (7개 신규 reconcile 테스트 포함) |

## Match Rate

**8/8 = 100%** (Design §5 Worker 매핑 전 항목 구현 완료)

## 3종 차이 마커 동작 확인

```
SOURCE_MISSING: source endpoint not in doc     → /charge (POST)
DOC_ONLY: doc endpoint not in source           → /balance (GET)
DIVERGENCE: param count mismatch               → /cancel (POST) source=2 doc=3
```

## 설계 인사이트

- `exactOptionalPropertyTypes: true` — `httpMethod?: string | undefined` 명시 필요
- 경로 정규화(`{id}` → `:id`)로 표기 차이를 흡수하여 false positive 방지
- CLI는 monorepo 의존 없이 자립(`scripts/java-ast/src/types.ts` 미러) — standalone 실행 가능

## 다음 단계

Sprint 213: ERWin ERD 추출 도구 R&D (SQL DDL → entity/relation JSON)
