---
id: PLAN-SPRINT-212
sprint: 212
title: "svc-ingestion Java/Spring AST 파서 + Source-First Reconciliation 엔진"
status: IN_PROGRESS
created: "2026-04-20"
req: AIF-REQ-035
phase: "Phase 2 B"
---

# Sprint 212 — svc-ingestion Java/Spring AST 파서 + Source-First Reconciliation 엔진

## 목표

Stage 1 입력 채널을 확장하여 Java/Spring 소스코드를 AST 방식으로 분석하고,
문서(스펙 컨테이너)와 대조하여 3종 차이 마커를 생성하는 엔진을 구축한다.

**Source-First 원칙**: 소스코드가 진실의 원천. 문서는 검증 대상.

## 배경

- Sprint 211 완료: FX-SPEC-003 Handoff Contract v1.0 발행
- javaparser(JVM) 직접 실행 불가(CF Worker) → offline CLI/Node wrapper로 사전 파싱 방식 확정
- 기존 파서(`java-controller.ts`, `java-service.ts`, `java-datamodel.ts`)를 CLI로 조립

## 범위

### 신규 파일

| 파일 | 역할 |
|------|------|
| `packages/types/src/reconcile.ts` | ReconcileMarker·ReconcileResult·ReconciliationReport 타입 |
| `packages/utils/src/reconcile.ts` | Source-First Reconciliation 엔진 |
| `scripts/java-ast/package.json` | offline CLI 패키지 설정 |
| `scripts/java-ast/src/index.ts` | CLI 진입점 (--dir, --out 옵션) |
| `scripts/java-ast/src/runner.ts` | 파서 조합 + SourceAnalysisResult 조립 |
| `packages/utils/src/__tests__/reconcile.test.ts` | Reconciliation 엔진 유닛 테스트 |

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `packages/types/src/index.ts` | reconcile 타입 re-export 추가 |
| `packages/utils/src/index.ts` | reconcile 함수 re-export 추가 |

## 3종 차이 마커 정의

| 마커 | 의미 |
|------|------|
| `SOURCE_MISSING` | 소스에 엔드포인트/클래스가 있지만 문서에 없음 → 미문서화 기능 |
| `DOC_ONLY` | 문서에 API가 명시되어 있지만 소스에 구현이 없음 → 미구현 사양 |
| `DIVERGENCE` | 양쪽 모두 존재하지만 내용이 다름(경로, 메서드, 파라미터 등) |

## KPI

- [ ] LPON 결제 소스 1개 모듈 AST 추출 성공 (`scripts/java-ast` CLI 실행)
- [ ] 문서 대조 시 최소 1건 DIVERGENCE 로그 생성 (테스트 픽스처 기반)
- [ ] TypeScript 빌드 오류 0건
- [ ] 유닛 테스트 통과

## 접근 방식

```
Java 소스 디렉토리
    ↓ scripts/java-ast (Node CLI)
SourceAnalysisResult (JSON)
    ↓ packages/utils/src/reconcile.ts
ReconciliationReport { results: ReconcileResult[] }
    ↓ DIVERGENCE/SOURCE_MISSING/DOC_ONLY 로그
```
