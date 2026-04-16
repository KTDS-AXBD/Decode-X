---
title: "Sprint 206 — Technical Schema + Extraction 프롬프트 강화"
sprint: 206
requirement: AIF-REQ-034
track: B
created: 2026-04-16
---

# Sprint 206 Plan — Technical 4축 스키마 + 프롬프트 강화

## 목표

기존 Business 4축(processes, entities, relationships, rules) 추출에 **Technical 4축**을 additive하게 추가하여 Stage 2 추출 품질을 강화한다.

## Technical 4축 정의

| 축 | 추출 대상 | 프롬프트 가이드 |
|---|---|---|
| **apis** | API endpoint, method, request/response schema | 인터페이스 명세서, 소스코드 |
| **tables** | table name, columns (name, type, FK) | ERD, 테이블 정의서 |
| **dataFlows** | 함수 호출 관계, 모듈 의존성 | 소스코드, 아키텍처 문서 |
| **errors** | 에러 코드, 예외 경로, 처리 방식 | 소스코드, 요구사항 명세 |

## 작업 항목

### Task 1: Zod 스키마 (packages/types)

- `packages/types/src/extraction.ts` 신규 생성
- `ExtractionResultSchema` — Business 4축 + Technical 4축 (Technical은 optional)
- `packages/types/src/index.ts`에 re-export 추가
- `extract.ts`, `handler.ts`의 inline interface를 shared type으로 교체

### Task 2: 프롬프트 강화 (svc-extraction)

- `services/svc-extraction/src/prompts/structure.ts`에 Technical 4축 섹션 additive 추가
- 기존 Business 추출 프롬프트 유지 (breaking change 없음)
- 문서 분류별 Technical 가이드 추가 (api_spec → apis 강조, erd → tables 강조 등)

## 영향 범위

- `packages/types/` — 신규 파일 1개
- `services/svc-extraction/` — 프롬프트 1개 + 소비자 2개 (extract.ts, handler.ts)
- Breaking change: **없음** (Technical 4축은 optional, 기존 파싱 호환)
