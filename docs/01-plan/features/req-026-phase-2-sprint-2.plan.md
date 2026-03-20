---
code: AIF-PLAN-026E
title: "반제품 생성 엔진 Sprint 2 — LLM 생성기 5종 추가"
version: "1.0"
status: Active
category: PLAN
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
feature: req-026-phase-2-sprint-2
refs: "[[AIF-REQ-026]] [[AIF-PLAN-026D]] [[AIF-RPRT-026D]] [[AIF-RPRT-027]]"
---

# 반제품 생성 엔진 Sprint 2 — LLM 생성기 5종 추가

> **Summary**: svc-skill Working Prototype Generator에 5개 생성기(data-model, feature-spec, architecture, api-spec, claude-md)를 추가하여, POST /prototype/generate 한 번으로 8개 파일이 포함된 완전한 반제품 ZIP을 자동 생성한다.
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Active

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Sprint 1에서 구현된 생성기 3종(business-logic, rules-json, terms-jsonld)만으로는 Claude Code가 Working Version을 만들기에 부족. AIF-REQ-027 PoC에서 나머지 5개 문서(데이터 모델/기능 정의/아키텍처/API/CLAUDE.md)를 수동 작성해야 했음 |
| **Solution** | 생성기 5종(data-model, feature-spec, architecture, api-spec, claude-md)을 추가하여 orchestrator에서 8개 파일을 자동 생성. 기존 collector 데이터(policies, terms, skills) + 생성기 간 체이닝으로 구현 |
| **Function/UX Effect** | `POST /prototype/generate` → 202 → ZIP 다운로드 시 8개 스펙 파일 완비. 수동 작성 0건으로 Claude Code에 바로 입력 가능 |
| **Core Value** | 역공학→스펙→코드 파이프라인의 "스펙 생성" 단계를 완전 자동화. AIF-REQ-027에서 실증한 포맷을 엔진으로 제품화 |

---

## 1. Overview

### 1.1 Purpose

Sprint 1에서 구축된 Working Prototype Generator 인프라(collector 5 SVC + orchestrator + packager + R2/D1)에 5개 생성기를 추가하여, 한 번의 API 호출로 완전한 반제품 스펙 ZIP을 자동 생성한다.

### 1.2 Background

- **Sprint 1 완료** (세션 182): collector(5 SVC 병렬) + generators 3종(business-logic/rules-json/terms-jsonld) + fflate ZIP → R2. 262 tests, PDCA 93%
- **AIF-REQ-027 PoC 검증** (세션 183): 6개 스펙 문서로 Working Version 자동 생성 성공 (24 테스트 100%, 사람 개입 0회)
- **갭**: 나머지 5개 문서(02-data-model ~ CLAUDE.md)는 세션 183에서 수동/Worker로 작성. 이를 자동화해야 제품화 가능

### 1.3 Related Documents

- Sprint 1 Plan: [[AIF-PLAN-026D]]
- Sprint 1 Report: [[AIF-RPRT-026D]] (PDCA 93%)
- 반제품 스펙 PoC: [[AIF-RPRT-027]] (포맷 검증 완료)
- Orchestrator TODO: `services/svc-skill/src/prototype/orchestrator.ts:165`

---

## 2. Scope

### 2.1 In Scope

- [ ] **G4: data-model 생성기** — terms(entity/attribute/relation) → CREATE TABLE SQL + Mermaid ERD
- [ ] **G5: feature-spec 생성기** — skills + policies + BL → FN-NNN 기능 정의서
- [ ] **G6: architecture 생성기** — 기능 구성 → 레이어/모듈/RBAC/비기능
- [ ] **G7: api-spec 생성기** — FN → REST 엔드포인트/JSON Schema/에러코드
- [ ] **G8: claude-md 생성기** — 전체 요약 → CLAUDE.md (Claude Code 입력용)
- [ ] **Orchestrator 통합** — 8개 생성기 순차/병렬 호출 + 체이닝
- [ ] **테스트** — 각 생성기 단위 테스트 + 통합 테스트
- [ ] **Production 배포** — 3환경 배포 + E2E 검증

### 2.2 Out of Scope

- collector 변경 (Sprint 1에서 완료, 그대로 활용)
- packager 변경 (ZIP/R2 구조 유지)
- 프론트엔드 UI (기존 Export Center에서 다운로드 가능)
- 화면 정의서 생성기 (06-screens.md — 후순위, Sprint 3)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Type |
|----|-------------|----------|------|
| FR-01 | data-model: entity terms → CREATE TABLE SQL (SQLite 호환) + Mermaid ERD | High | LLM |
| FR-02 | data-model: attribute terms → 컬럼 매핑 + Enum 정의 | High | Mechanical+LLM |
| FR-03 | feature-spec: skill policies → FN-NNN (입력/출력/플로우/에러) | High | LLM |
| FR-04 | feature-spec: BL-NNN ↔ FN-NNN ↔ 테이블 크로스 레퍼런스 | High | Mechanical |
| FR-05 | architecture: 모듈 구성 + 레이어 + RBAC 매트릭스 + 비기능 | Medium | LLM |
| FR-06 | api-spec: FN → REST 엔드포인트 + JSON Schema + 에러코드 | Medium | LLM |
| FR-07 | claude-md: 프로젝트 요약 + 스택 지정 + 파일 참조 | Medium | Template+LLM |
| FR-08 | 생성기 간 체이닝: G1(BL) → G4(테이블) → G5(FN) → G6/G7/G8 | High | Orchestrator |
| FR-09 | skipLlm 옵션: LLM 생성기도 mechanical fallback 지원 | Medium | All |
| FR-10 | 모든 생성기가 GeneratedFile 인터페이스 준수 | High | All |

### 3.2 Non-Functional Requirements

| Category | Criteria |
|----------|----------|
| 생성 시간 | 전체 8개 파일 < 120초 (LLM 포함) |
| ZIP 크기 | < 500KB (텍스트 기반) |
| 테스트 커버리지 | 각 생성기 ≥ 5 테스트, 전체 ≥ 30 추가 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 5개 생성기 구현 + orchestrator 통합
- [ ] POST /prototype/generate → ZIP에 8개 스펙 파일 포함
- [ ] 생성된 ZIP의 스펙으로 Claude Code Working Version 생성 가능 (AIF-REQ-027 재검증)
- [ ] 단위 테스트 ≥ 30건 추가, 전체 통과
- [ ] Production 3환경 배포 + LPON org E2E 검증

### 4.2 Quality Criteria

- [ ] typecheck + lint 0 error
- [ ] 생성된 문서에 모호 표현 0건
- [ ] BL↔FN↔API↔테이블 크로스 레퍼런스 무결성

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM 토큰 한계로 대량 정책 처리 불가 | High | Medium | 도메인별 청크 분할 (Sprint 1 business-logic 패턴 재활용) |
| 생성기 간 체이닝에서 데이터 불일치 | Medium | Medium | 각 생성기의 출력을 GeneratedFile로 표준화, orchestrator에서 context 전달 |
| entity→TABLE 매핑 정확도 부족 | Medium | High | LLM 생성 + mechanical fallback (terms.term_type 기반) |
| Workers 30초 CPU 타임아웃 | High | Low | ctx.waitUntil() 이미 적용 (Sprint 1). 생성기 병렬화로 추가 완화 |

---

## 6. Implementation Plan

### 6.1 생성기 의존 그래프

```
[collector 데이터]
  │
  ├─ policies ──→ G1: business-logic ✅ (Sprint 1)
  │                    │
  ├─ terms ─────→ G4: data-model (NEW)
  │                    │
  ├─ skills ────→ G5: feature-spec (NEW) ←── G1(BL) + G4(테이블)
  │                    │
  │               G6: architecture (NEW) ←── G5(모듈 구성)
  │                    │
  │               G7: api-spec (NEW) ←── G5(FN→엔드포인트)
  │                    │
  └──────────────→ G8: claude-md (NEW) ←── 전체 요약
```

### 6.2 구현 순서

| 순서 | 파일 | 타입 | 의존 | 예상 |
|:----:|------|------|------|------|
| 1 | `generators/data-model.ts` | LLM+Mechanical | terms | 중 |
| 2 | `generators/feature-spec.ts` | LLM | G1+G4+skills | 대 |
| 3 | `generators/architecture.ts` | LLM | G5 | 소 |
| 4 | `generators/api-spec.ts` | LLM | G5 | 중 |
| 5 | `generators/claude-md.ts` | Template | 전체 | 소 |
| 6 | `orchestrator.ts` 수정 | - | 전체 | 소 |
| 7 | 테스트 30건+ | - | - | 중 |
| 8 | Production 배포 + E2E | - | - | 소 |

### 6.3 병렬화 전략

```typescript
// orchestrator 내 실행 순서
// Phase 1: 독립 생성 (병렬)
const [bl, dataModel, rulesJson, termsJsonld] = await Promise.all([
  generateBusinessLogic(env, data.policies, options),     // G1 ✅
  generateDataModel(env, data.terms, options),            // G4 NEW
  generateRulesJson(data.policies),                       // G2 ✅
  generateTermsJsonld(data.terms),                        // G3 ✅
]);

// Phase 2: 의존 생성 (순차)
const featureSpec = await generateFeatureSpec(env, data, bl, dataModel, options); // G5
const [arch, apiSpec] = await Promise.all([
  generateArchitecture(env, featureSpec, options),         // G6
  generateApiSpec(env, featureSpec, options),              // G7
]);

// Phase 3: 요약 생성
const claudeMd = generateClaudeMd(env, { bl, dataModel, featureSpec, arch, apiSpec }); // G8
```

---

## 7. Architecture Considerations

### 7.1 GeneratedFile 인터페이스 (기존)

```typescript
interface GeneratedFile {
  path: string;              // ZIP 내 경로
  content: string;           // 파일 내용
  type: "spec" | "schema" | "rules" | "ontology" | "meta" | "readme";
  generatedBy: "mechanical" | "llm-sonnet" | "template";
  sourceCount: number;
}
```

### 7.2 생성기 간 체이닝 — Context 객체

```typescript
interface GeneratorContext {
  bl?: GeneratedFile;         // G1 출력 → G5 입력
  dataModel?: GeneratedFile;  // G4 출력 → G5 입력
  featureSpec?: GeneratedFile; // G5 출력 → G6, G7 입력
  arch?: GeneratedFile;       // G6 출력 → G8 입력
  apiSpec?: GeneratedFile;    // G7 출력 → G8 입력
}
```

### 7.3 ZIP 최종 구조

```
working-prototypes/{prototypeId}.zip
├── .foundry/origin.json              ✅ Sprint 1
├── .foundry/manifest.json            ✅ Sprint 1
├── README.md                         ✅ Sprint 1
├── specs/01-business-logic.md        ✅ Sprint 1 (G1)
├── rules/business-rules.json         ✅ Sprint 1 (G2)
├── ontology/terms.jsonld             ✅ Sprint 1 (G3)
├── specs/02-data-model.md            🆕 Sprint 2 (G4)
├── specs/03-functions.md             🆕 Sprint 2 (G5)
├── specs/04-architecture.md          🆕 Sprint 2 (G6)
├── specs/05-api.md                   🆕 Sprint 2 (G7)
└── CLAUDE.md                         🆕 Sprint 2 (G8)
```

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`/pdca design req-026-phase-2-sprint-2`)
2. [ ] G4 data-model 생성기 구현 시작
3. [ ] tmux Worker 병렬 구현 (G4+G5 / G6+G7+G8)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | 초안 — Sprint 1 분석 + 5개 생성기 설계 | Sinclair Seo |
