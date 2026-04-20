---
id: PLAN-213
title: "Sprint 213 — ERWin SQL DDL 파서 PoC (경로 A)"
req: AIF-REQ-035
sprint: 213
status: IN_PROGRESS
created: 2026-04-20
---

# Sprint 213 Plan — ERWin SQL DDL 파서 PoC

## 목표

SQL DDL export 파일을 파싱하여 **entity/relation JSON** 을 생성하는 PoC 구현.

ERWin의 "Generate DDL" 기능이 출력하는 SQL DDL을 소스로 삼아,
DB 역공학 첫 단계(구조 추출)를 자동화한다.

## 경로 A 선택 근거

- 경로 A (SQL DDL): ERWin → File > Generate DDL → 표준 SQL
- 경로 B (ERX 바이너리): ERWin 독점 포맷, 리버스 엔지니어링 필요 → 보류
- **결정**: 경로 A만 PoC. DDL은 이식성이 높고 현재 파일럿 자산(`0001_init.sql`)이 이미 존재

## 범위

### 포함
- SQL DDL 파서 라이브러리: `packages/utils/src/erd-parser.ts`
- CLI 스크립트: `scripts/erwin-extract/index.ts`
- Vitest 단위 테스트: `packages/utils/src/erd-parser.test.ts`
- 출력 형식: JSON (`ErdParseResult`)

### 제외
- UI 연동 (별도 Sprint)
- ERX 바이너리 파싱 (경로 B 보류)
- ALTER TABLE 기반 FK 패턴 (추후 확장)

## KPI

| 지표 | 목표 | 소스 |
|------|------|------|
| 추출 테이블 수 | ≥ 5 | `0001_init.sql` (17개 목표) |
| 추출 관계 수 | ≥ 10 | inline FOREIGN KEY (22개 목표) |
| 테스트 커버리지 | pass | Vitest green |
| 타입 오류 | 0 | pnpm typecheck |

## 구현 대상 파일

```
packages/utils/src/erd-parser.ts         신규 — 핵심 파서 라이브러리
packages/utils/src/erd-parser.test.ts    신규 — Vitest 단위 테스트
scripts/erwin-extract/index.ts           신규 — CLI entrypoint
scripts/erwin-extract/package.json       신규 — CLI 패키지
```

## 타임라인

| 단계 | 예상 시간 |
|------|----------|
| 파서 설계 + 핵심 구현 | 1h |
| 테스트 작성 | 30m |
| CLI wrapper | 20m |
| 검증 (실제 DDL 실행) | 20m |
