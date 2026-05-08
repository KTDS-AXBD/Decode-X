---
code: AIF-PLAN-skill-framework-3-plan
title: "Skill Framework Phase 3 — Planning Document"
version: 1.0
status: active
category: plan
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
---

# Skill Framework Phase 3 — Planning Document

> **Summary**: Phase 1~2 인프라(6 CLI + 훅 + 자동분류 95% + 43 테스트) 위에 기존 스킬 일괄 리팩토링 + 의존성 그래프 시각화 + 10개 미분류 잔여 해소 + scan threshold 기본값 수정을 추가하여 프레임워크 v1.0 완성
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **REQ**: AIF-REQ-029 (Phase 3)
> **Predecessor**: [skill-framework-2.plan.md](skill-framework-2.plan.md) (Phase 2, 96% PASS)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Phase 1~2에서 도구·추적·배포 인프라를 완성했지만, ① 기존 ax-*/프로젝트 스킬 22개가 가이드라인 미준수(gotchas 없음, 폴더 구조 불일치), ② dependencies 필드만 있고 의존성 시각화 없음, ③ 10개 미분류 잔존, ④ Phase 2 threshold 기본값 미변경 |
| **Solution** | refactor.mjs 일괄 리팩토링 스크립트 + deps.mjs 의존성 그래프 CLI + 10개 수동 분류 + scan.mjs threshold 0.3→0.2 기본값 수정 |
| **Function/UX Effect** | `node refactor.mjs --dry-run`으로 가이드라인 준수율 즉시 확인 + 자동 교정. `node deps.mjs graph`로 Mermaid 의존성 다이어그램 생성. 분류율 95%→100%. Phase 2 Gap G-1 해소 |
| **Core Value** | Phase 1a "가시성" → 1b "실용성" → 2 "운용성" → Phase 3 **"품질 완성"**: 210 스킬 전체가 표준 준수 + 의존성 파악 완료. Skill Framework v1.0 릴리스 가능 상태 |

---

## 1. Overview

### 1.1 Purpose

Phase 1~2가 CLI 도구·자동분류·배포·추적을 완성했지만, 아래 갭이 프레임워크 v1.0 완성을 가로막고 있다:

| Gap ID | 미완 항목 | 영향 | 준비도 |
|--------|----------|------|:------:|
| P3-G1 | 기존 스킬 가이드라인 미준수 | user+project 22개 중 다수가 gotchas 없음, 폴더 구조 불일치 | 50% |
| P3-G2 | 의존성 그래프 없음 | dependencies 필드만 존재, 순환 검출·시각화 불가 | 25% |
| P3-G3 | 10개 미분류 잔존 | 분류율 95.2%, 100% 미달 | — |
| P3-G4 | scan.mjs threshold 기본값 0.3 | Phase 2 Gap G-1, Design 대비 미변경 | — |

### 1.2 Phase 1a+1b+2 성과 (선행 조건)

| 항목 | Phase 1a | Phase 1b | Phase 2 | 합계 |
|------|:--------:|:--------:|:-------:|:----:|
| CLI 도구 | 4종 | +2 확장 | +2 신규 | 6+2 |
| 훅 | 0 | 0 | 1 | 1 |
| 테스트 | 17 | +11 | +15 | 43 |
| 분류율 | 10% | 65% | 95.2% | — |
| 문서 | 1 | +2 | 0 | 3 |
| 템플릿 | 0 | 3 | 0 | 3 |

### 1.3 Related Documents

- Phase 1a~2: Plan/Design/Analysis/Report (skill-framework*.md)
- PRD: `skill-framework/prd-final.md` (§4.2-9 리팩토링, §4.2-12 의존성)
- 가이드라인: `skill-framework/docs/skill-writing-guide.md`
- 린트 규칙: `skill-framework/data/lint-rules.json`

---

## 2. Scope

### 2.1 In Scope (Phase 3)

- [ ] **FR-01**: 기존 스킬 일괄 리팩토링 스크립트 (`refactor.mjs`) — lint 위반 분석 + --fix 자동교정 + 리포트
- [ ] **FR-02**: 의존성 그래프 CLI (`deps.mjs`) — catalog에서 dependencies 추출 → 순환 검출 → Mermaid 다이어그램 생성
- [ ] **FR-03**: 10개 미분류 수동 분류 — classify-keywords.json으로 해결 안 되는 스킬에 catalog 직접 태깅
- [ ] **FR-04**: scan.mjs threshold 기본값 0.3→0.2 수정 (Phase 2 Gap G-1 해소)
- [ ] **FR-05**: 테스트 확장 — refactor.mjs 3건, deps.mjs 3건, threshold 1건 = 7건 추가 (43→50 목표)

### 2.2 Out of Scope (Phase 4 이연)

- **On Demand Hooks** (`/careful`, `/freeze`): Claude Code 훅 시스템에 동적 등록/해제 메커니즘이 없음 — settings.json 수동 변경만 가능. 별도 도구/래퍼 설계 필요 (PRD §4.2-11)
- **메모리/데이터 저장 표준**: 범용 표준은 별도 PRD 필요 (PRD §4.2-13)
- **스크립트 라이브러리**: 공유 헬퍼는 classify.mjs 패턴이 이미 존재. 추가 확장은 필요 시 (PRD §4.2-14)
- **팀 Onboarding 워크플로우**: 프레임워크 v1.0 완성 후 (PRD §4.2-16)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | **리팩토링 스크립트** (`refactor.mjs`): skill-catalog.json의 user+project 스킬을 대상으로 lint 규칙 위반 분석. `--fix` 모드에서 gotchas 섹션 scaffold 추가, references/ 디렉토리 생성. `--dry-run`으로 변경 미리보기. 결과 Markdown 리포트 출력 | High | Pending |
| FR-02 | **의존성 그래프** (`deps.mjs`): `graph` 서브커맨드로 Mermaid 다이어그램 생성. `check` 서브커맨드로 순환 의존성 검출. `list` 서브커맨드로 의존성 테이블 출력 | High | Pending |
| FR-03 | **수동 분류 10건**: skill-catalog.json에서 uncategorized 10개를 수동으로 적합한 카테고리 배정 | Medium | Pending |
| FR-04 | **threshold 기본값**: scan.mjs의 `getArg('threshold', '0.3')` → `'0.2'`로 변경 | Low | Pending |
| FR-05 | **테스트 확장**: refactor 3건, deps 3건, threshold 1건 = 7건 추가 (43→50) | Medium | Pending |

### 3.2 Non-Functional Requirements

| ID | Category | Criteria | Measurement |
|----|----------|----------|-------------|
| NFR-01 | 호환성 | refactor.mjs는 기존 lint 규칙 재사용 (lint-rules.json) | import 확인 |
| NFR-02 | 안전성 | refactor --fix는 변경 전 backup 생성 (`.bak`) | backup 존재 확인 |
| NFR-03 | 이식성 | deps.mjs Mermaid 출력은 GitHub/GitLab에서 직접 렌더링 가능 | GitHub 호환성 |
| NFR-04 | 테스트 | 기존 43 + 신규 7 = 50 테스트 전체 PASS | `node --test` |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] `refactor.mjs --dry-run` 실행 → 가이드라인 위반 리포트 출력
- [ ] `deps.mjs graph` 실행 → Mermaid 다이어그램 생성
- [ ] `deps.mjs check` 실행 → 순환 의존성 0건 확인
- [ ] 분류율 100% (210/210)
- [ ] scan.mjs threshold 기본값 0.2
- [ ] 50 테스트 전체 PASS

### 4.2 Quality Criteria

- [ ] lint 에러 0
- [ ] 기존 43 테스트 regression 없음
- [ ] PDCA Match Rate ≥ 90%

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| refactor --fix가 스킬 콘텐츠를 의도치 않게 변경 | Medium | Low | --dry-run 기본, --fix 시 .bak 백업 + diff 리포트 |
| 10개 수동 분류가 부정확 | Low | Low | 기존 카테고리 정의 + description 분석으로 판단 |
| 의존성 그래프에 데이터 부족 | Low | Medium | dependencies 필드가 비어있는 스킬이 대부분 → "no dependencies declared" 경고 출력 |

---

## 6. Architecture Considerations

### 6.1 파일 구조 (Phase 3 추가분)

```
skill-framework/
├── scripts/
│   ├── refactor.mjs       ← NEW: 일괄 리팩토링 스크립트
│   ├── deps.mjs           ← NEW: 의존성 그래프 CLI
│   ├── scan.mjs           ← MODIFIED: threshold 0.3→0.2
│   └── scan.test.mjs      ← MODIFIED: 7건 테스트 추가
├── data/
│   └── skill-catalog.json ← MODIFIED: 10개 수동 분류
└── ...                     (기존 유지)
```

### 6.2 Agent Team 전략

```
Team: sf-3 (2 Workers, 예상 5분)
├── W1: 리팩토링 + 수동분류 (refactor.mjs + catalog 수동 태깅)
│   허용 파일: scripts/refactor.mjs, data/skill-catalog.json
└── W2: 의존성 + threshold + 테스트 (deps.mjs + scan.mjs + tests)
    허용 파일: scripts/deps.mjs, scripts/scan.mjs, scripts/scan.test.mjs
```

---

## 7. Next Steps

1. [ ] Design 문서 작성 (`skill-framework-3.design.md`)
2. [ ] Agent Team sf-3 실행 (2 Workers)
3. [ ] Gap Analysis → Match Rate ≥ 90%
4. [ ] Completion Report → AIF-REQ-029 DONE (v1.0 릴리스)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Initial Phase 3 plan | Sinclair Seo |
