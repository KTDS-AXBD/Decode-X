---
code: AIF-PLAN-201
title: "Sprint 201 — Working Prototype Generator 검증 + Foundry-X 핸드오프 포맷"
version: "1.0"
status: Active
category: PLAN
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
feature: sprint-201
refs: "[[AIF-REQ-026]]"
---

# Sprint 201 — Working Prototype Generator 검증 + Foundry-X 핸드오프 포맷

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Background** | SPEC Phase 6 Sprint 201 계획: "generators 추가(api-spec, screen-def 2종), 테스트 하네스 완성, Foundry-X 핸드오프 포맷 검증" |
| **실제 상태** | api-spec(G5→API), screen-spec(G9→화면정의) 생성기는 이전 Sprint 2/3에서 이미 구현됨. 310 tests PASS |
| **Sprint 201 역할** | 구현 검증 + 나머지 gap 2종 완성: (1) README 파일 구조 갱신, (2) Foundry-X 핸드오프 포맷 검증 통합테스트 |
| **핵심 가치** | 반제품 ZIP이 Foundry-X가 기대하는 포맷(PrototypeManifest Zod schema)에 맞는지 공식 검증 완료 |

## 1. 현황 분석

### 1.1 기구현 항목 (이전 Sprint)

| 생성기 | 파일 | Sprint | 상태 |
|-------|------|--------|------|
| business-logic | specs/01-business-logic.md | Sprint 1 | ✅ |
| rules-json | rules/business-rules.json | Sprint 1 | ✅ |
| terms-jsonld | ontology/terms.jsonld | Sprint 1 | ✅ |
| data-model | specs/02-data-model.md | Sprint 2 | ✅ |
| feature-spec | specs/03-functions.md | Sprint 2 | ✅ |
| architecture | specs/04-architecture.md | Sprint 2 | ✅ |
| **api-spec** | **specs/05-api.md** | Sprint 2 | **✅ 기구현** |
| claude-md | CLAUDE.md | Sprint 2 | ✅ |
| **screen-spec** | **specs/06-screens.md** | Sprint 3 | **✅ 기구현** |

### 1.2 식별된 Gap

| ID | 항목 | 위치 | 심각도 |
|----|------|------|:------:|
| G1 | README 파일 구조 outdated — 4-file 구조만 표시 (9-file 실제) | orchestrator.ts:generateReadme() | Medium |
| G2 | 핸드오프 포맷 검증 테스트 부재 — PrototypeManifest Zod schema 파싱 미검증 | __tests__/ | Medium |

## 2. Scope

### In Scope
- G1: `generateReadme()` 파일 구조 섹션 갱신 (9종 generator 반영)
- G2: 핸드오프 포맷 검증 통합 테스트 추가 (`__tests__/handoff-format.test.ts`)
- 전체 310+ tests PASS 유지

### Out of Scope
- 새 generator 구현 (이미 완료)
- LLM 실제 호출 테스트 (API 크레딧 불필요)
- Foundry-X 리포 직접 연동 (Sprint 203 범위)

## 3. 구현 계획

### G1: README 갱신
- `orchestrator.ts` `generateReadme()` 파일 구조 섹션을 9종 generator 목록으로 갱신
- `includeScreenSpec=true` 시 `specs/06-screens.md` 추가 표시
- 사용법 섹션도 8파일 기준으로 갱신

### G2: 핸드오프 포맷 검증 테스트
- `services/svc-skill/src/prototype/__tests__/handoff-format.test.ts` 신규 생성
- 테스트 내용:
  1. `createManifest()` 출력이 `PrototypeManifestSchema` Zod 파싱 통과
  2. `generateOriginJson()` 출력이 `PrototypeOriginSchema` Zod 파싱 통과
  3. 9종 파일 경로 모두 manifest files에 포함 확인 (includeScreenSpec=true)
  4. 8종 파일 경로 manifest files (includeScreenSpec=false, screen 미포함)

## 4. 완료 기준

- [ ] G1: `generateReadme()` 9-file 구조 반영
- [ ] G2: `handoff-format.test.ts` 4개 테스트 PASS
- [ ] 전체 typecheck PASS
- [ ] 전체 test PASS (310+ 유지)
- [ ] SPEC §6 Sprint 201 체크박스 DONE 갱신
