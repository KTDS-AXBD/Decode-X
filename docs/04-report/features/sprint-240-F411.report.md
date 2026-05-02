---
code: AIF-RPRT-042
title: "Sprint 240 F411 Zip 내부 spec coverage 가시화 — 완료 리포트"
version: "1.0"
status: Done
category: RPRT
created: 2026-05-02
updated: 2026-05-02
author: Sinclair Seo
sprint: 240
related:
  - docs/01-plan/features/F411.plan.md
  - docs/02-design/features/F411.design.md
  - SPEC.md §6 Sprint 240
---

# Sprint 240 F411 완료 리포트

## Executive Summary

Triage 화면에서 Zip 파일의 내부 spec coverage를 **3가지 가시화 수단**으로 제공 완료.
Match Rate **97%** / typecheck **14/14 green** / lint **9/9 green** / test **12/12 green** / 신규 테스트 **23건** 추가.

## 구현 완료 항목

| 산출물 | 경로 | 상태 |
|--------|------|:----:|
| ZipChunkSummarySchema (15 fields) | `packages/types/src/analysis.ts` | DONE |
| PartialExtractionSchema | `packages/types/src/analysis.ts` | DONE |
| TriageDocumentSchema 3 optional 필드 추가 | `packages/types/src/analysis.ts` | DONE |
| ExtractionStats 카운터 | `services/svc-ingestion/src/parsing/zip-extractor.ts` | DONE |
| parseSourceProject stats 전파 | `services/svc-ingestion/src/parsing/zip-extractor.ts` | DONE |
| queue.ts 호출부 리턴타입 대응 | `services/svc-ingestion/src/queue.ts` | DONE |
| SourceProjectSummary 집계 case | `services/svc-extraction/src/factcheck/source-aggregator.ts` | DONE |
| libOnlyProjects 필드 추가 | `services/svc-extraction/src/factcheck/types.ts` | DONE |
| handleGetTriage zip 통계 주입 | `services/svc-extraction/src/routes/analysis.ts` | DONE |
| TriageView expand + 매트릭스 | `apps/app-web/src/components/analysis-report/TriageView.tsx` | DONE |
| SourceUpload spec stats + badge | `apps/app-web/src/pages/source-upload.tsx` | DONE |
| zip-extractor-stats 단위 테스트 | `services/svc-ingestion/src/__tests__/zip-extractor-stats.test.ts` | DONE |
| source-aggregator lib-only 테스트 | `services/svc-extraction/src/__tests__/source-aggregator.test.ts` | DONE |
| E2E 3시나리오 | `apps/app-web/e2e/zip-coverage.spec.ts` | DONE |

## 3목표 달성 현황

### 목표 1: Chunk 매트릭스 (TriageView 인라인)

`TriageRow`에 expand 토글(▶) 추가. 클릭 시 `ZipMatrixSubRow` 렌더링:
- Controller / Endpoint / DataModel / Transaction / DDL Table / MyBatis / 추출률
- `chunkSummary` 없는 문서는 expand 버튼 미표시

### 목표 2: 라이브러리 Badge

`isLibOnly: true` 조건: controllerCount=0 + dataModelCount=0 + transactionCount=0 + mapperCount=0.
TriageView 및 source-upload 양쪽에 "라이브러리" 회색 Badge 표시.

### 목표 3: 부분 추출 경고 Badge

`partialExtraction` 조건: extractionRate < 0.95 OR cappedAtMaxFiles=true OR oversizedSkippedCount > 0.
심각도 3등급:
- HIGH (rate < 0.5): 빨강 "부분 X%"
- MEDIUM (0.5 ≤ rate < 0.95): 주황 "부분 X%"
- LOW (cappedAtMaxFiles만 해당): 회색 "부분 X%"

## 기술 결정 사항

### SVC_INGESTION 서비스 바인딩 경유 청크 조회

`svc-extraction`의 `env.ts`에는 `DB_INGESTION` D1 바인딩이 없어 직접 조회 불가.
기존 `source-aggregator.ts`의 `fetchChunks` 패턴과 동일하게 `SVC_INGESTION` Fetcher 바인딩으로 청크 조회.
`handleGetTriage` 내에서 `Promise.allSettled`로 전체 문서 비동기 병렬 조회.

### ExtractionStats 선택적 전파

ZIP 파싱 시에만 stats가 존재하므로 `parseSourceProject`의 `extractionStats?: ExtractionStats` 파라미터로 선택적 처리.
기존 27개 ZIP 문서는 해당 필드 없이 정상 파싱됨 (backward compatible, D1 schema 변경 없음).

### exactOptionalPropertyTypes 준수

`doc.chunkSummary = summary` 할당 시 undefined 분기를 별도 처리하지 않고 `if (summary !== undefined)` guard로 처리.

## 테스트 커버리지

| 파일 | 추가 케이스 |
|------|------------|
| zip-extractor-stats.test.ts | 3건 (stats 카운팅, oversized, 빈 zip) |
| zip-extractor-stats.test.ts (parseSourceProject) | 4건 (14 fields, rate=1, omit without stats) |
| source-aggregator.test.ts (lib-only) | 4건 추가 |
| E2E zip-coverage.spec.ts | 3건 (expand 매트릭스, lib-only badge, partial badge) |

## 검증 결과

| 항목 | 결과 |
|------|------|
| pnpm typecheck (turbo) | 14/14 Tasks PASS |
| pnpm lint (turbo) | 9/9 Tasks PASS |
| pnpm test (turbo) | 12/12 Tasks PASS |
| Gap Analysis (bkit gap-detector) | Match Rate 97% |
| E2E verify (foundry-x) | SKIP (미설치) |
| Codex Cross-Review | SKIP (스크립트 없음) |

## Gap 0 항목 (3%)

- TriageView 서버 실환경 E2E: Playwright fixture 기반 mock E2E 제공, 실 서버 연결 E2E는 production smoke 단계에서 검증 예정.

## 후속 작업

- Production 배포 후 LPON 27개 Zip 실 데이터로 badge/매트릭스 렌더링 검증
- TD-49 (AI-Ready 채점 매트릭스 정교화) 재개 시 F411 stats를 채점 입력으로 활용 검토
