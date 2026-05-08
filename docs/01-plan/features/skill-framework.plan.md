---
code: AIF-PLAN-skill-framework-plan
title: "Skill Framework Planning Document"
version: 1.0
status: active
category: plan
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
---

# Skill Framework Planning Document

> **Summary**: Claude Code 스킬 210+ 자산을 체계적으로 분류·관리·공유하는 프레임워크 구축
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **REQ**: AIF-REQ-029

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 210+ 스킬이 3개 scope(user/project/plugin)에 분산, 분류·발견·공유 체계 없이 단편적으로 생성되어 중복·비일관성·팀 공유 불가 상태 |
| **Solution** | Anthropic 9-카테고리 기반 분류 체계 + 통합 인벤토리/카탈로그 + 스킬 작성 가이드라인 + 팀 배포 파이프라인 |
| **Function/UX Effect** | 스킬을 카테고리별 카탈로그에서 검색·발견하고, 표준 템플릿으로 신규 스킬을 생성하며, 팀원이 즉시 설치·활용 가능 |
| **Core Value** | 개인 스킬 자산의 팀 자산화 — 재사용성 극대화, 중복 제거, 품질 표준화로 개발 생산성 향상 |

---

## 1. Overview

### 1.1 Purpose

Claude Code 스킬(commands, skills, plugins)이 필요할 때마다 단편적으로 만들어져 약 210+ 자산이 산재해 있다. 발견성이 낮고, 중복·비일관성이 존재하며, 팀원 간 공유 구조가 없다. Anthropic이 공개한 9가지 카테고리 분류 체계와 실전 팁을 참고하여, 스킬 자산을 체계적으로 정리하고 팀에 공유한다.

### 1.2 Background

- AI Foundry Phase 4 완료, Phase 5 진입하면서 스킬 수 계속 증가
- Anthropic 내부 스킬 운용 노하우 공개 (2026-03-20) — 9가지 카테고리, Gotchas, Progressive Disclosure, On Demand Hooks, 마켓플레이스 배포 등
- 현재 자산: user commands 15개, user skills 1개, project skills 6개, bkit plugin skills 188개
- 3라운드 외부 AI 검토 완료 (ChatGPT + DeepSeek + Gemini, 전원 Conditional → 착수 가능)

### 1.3 Related Documents

- PRD: `skill-framework/prd-final.md` (3라운드 AI 검토 완료)
- 인터뷰 로그: `skill-framework/interview-log.md`
- SPEC: AIF-REQ-029

---

## 2. Scope

### 2.1 In Scope

**Phase 1a (2주) — 인벤토리 + 수동 분류 + PoC**
- [ ] 카테고리 분류 체계 확정 (Anthropic 9가지 + 프로젝트 커스텀)
- [ ] user scope 스킬 인벤토리 (commands 15 + skills 1)
- [ ] project scope 스킬 인벤토리 (skills 6)
- [ ] bkit plugin 스킬 인벤토리 (188개 자동 스캔)
- [ ] 전체 스킬 카테고리 태깅 (수동 분류)
- [ ] 중복 스킬 식별 및 1차 클린업
- [ ] 탐색성/검색 PoC (CLI 기반)

**Phase 1b (2주) — 가이드라인 + 자동화 + 카탈로그**
- [ ] 스킬 작성 가이드라인 v1 (gotchas, progressive disclosure, description 최적화, 폴더 구조)
- [ ] 스킬 카탈로그 문서 v1 (카테고리별 정리)
- [ ] 자동화 도구 PoC (중복 검출, 린트, 인벤토리 스캔)
- [ ] 스킬 품질 검증 린터
- [ ] 폐기/아카이브 정책 확정
- [ ] ax-req-manage 인터뷰 절차 보강

**Phase 2 (후속 스프린트) — 배포 + 추적 + 고도화**
- [ ] 팀 배포 파이프라인 (Git 기반 + 플러그인 패키징)
- [ ] 사용량 추적 훅 (PreToolUse 로깅)
- [ ] On Demand Hooks (/careful, /freeze)
- [ ] 스킬 조합(Composition) 및 의존성 관리
- [ ] 메모리/데이터 저장 표준
- [ ] 스크립트 라이브러리
- [ ] 기존 스킬 리팩토링
- [ ] 팀 온보딩/Adoption 워크플로우

### 2.2 Out of Scope

- bkit 플러그인 내부 코드 수정 (분류·참조만)
- Claude Code Plugin Marketplace 인프라 구축
- 비 Claude Code 도구(Cursor, Copilot 등) 통합
- 중앙 집중식 카탈로그만을 강제하는 아키텍처 (분산형도 검토 가능)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Anthropic 9가지 + 커스텀 카테고리 분류 체계 정의 | High | Pending |
| FR-02 | user/project/plugin 3 scope 통합 인벤토리 자동 스캔 | High | Pending |
| FR-03 | 스킬 작성 가이드라인 (gotchas, progressive disclosure, description, 폴더 구조) | High | Pending |
| FR-04 | 카테고리별 스킬 카탈로그 문서 생성 | High | Pending |
| FR-05 | 중복 스킬 식별 기준 정의 + 자동/수동 검출 + 정리 프로세스 | High | Pending |
| FR-06 | 카탈로그 검색/필터/정렬 (카테고리, 키워드, 의존성, 사용빈도) | High | Pending |
| FR-07 | 카테고리별 스킬 생성 템플릿 (references/, assets/, scripts/ 폴더) | Medium | Pending |
| FR-08 | 스킬 품질 자동 검증 린터 (gotchas 존재, description 품질, 폴더 구조) | Medium | Pending |
| FR-09 | PreToolUse 훅 기반 스킬 사용량 추적 로깅 | Medium | Pending |
| FR-10 | On Demand Hooks (/careful, /freeze 등 동적 가드레일) | Medium | Pending |
| FR-11 | 스킬 간 의존성 선언(YAML) + 순환 탐지 + 그래프 시각화 | Medium | Pending |
| FR-12 | 스킬 폐기/아카이브 정책 + 자동 후보 선정 + 팀 리뷰 | Medium | Pending |
| FR-13 | Git 기반 팀 배포 파이프라인 (sandbox → traction → marketplace) | Medium | Pending |
| FR-14 | ax-req-manage 인터뷰 절차 보강 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 성능 | 카탈로그 검색 < 2초 (210+ 스킬) | CLI 응답 시간 측정 |
| 호환성 | WSL + Mac 크로스 플랫폼 동작 | 환경별 테스트 |
| 확장성 | 500+ 스킬까지 성능 저하 없음 | 부하 PoC |
| 보안 | 스킬 내 시크릿/크레덴셜 포함 탐지 | 자동 스캔 린터 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 카테고리 분류 체계 확정 (9+α)
- [ ] 전체 스킬 인벤토리 완료 (user + project + bkit 참조)
- [ ] 스킬 작성 가이드라인 v1 완성
- [ ] 카탈로그 문서 v1 생성
- [ ] 중복 스킬 식별 기준 + 1차 클린업 완료
- [ ] 탐색/검색 PoC (CLI) 시연
- [ ] 자동화 도구(중복 검출/린트/인벤토리) 1차 PoC 완료

### 4.2 Quality Criteria

- [ ] 카테고리 분류 커버리지 100%
- [ ] 중복률 10% 미만 또는 주요 기능 중복 5건 미만
- [ ] 가이드라인 준수율 (신규 스킬) 100%
- [ ] 자동화 도구 정확도 80% 이상

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 210+ 스킬 분류 작업량 과소평가 | High | High | Phase 1a/1b 세분화, 자동 스캔 우선, bkit은 참조만 |
| 실사용자 Adoption 저조 | High | Medium | 파일럿 사용 → 피드백 → 개선 루프, 온보딩/교육 |
| 분류 체계 불일치 | Medium | Medium | Anthropic 체계 기반 + 실제 맞춤 조정, 2회 이상 재설계 시 중단 검토 |
| Claude Code Plugin System 불안정 | Medium | Medium | PoC 선행, 장애 시 수동 배포 fallback |
| 담당자(1명) 병목 | High | Medium | 문서화 + 자동화로 의존성 최소화, Phase별 마일스톤 조정 |
| 크로스플랫폼 호환성 (WSL/Mac) | Medium | Low | Bash/Node.js PoC 환경별 테스트 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites, portfolios | ☐ |
| **Dynamic** | Feature-based modules, BaaS | Web apps with backend | ☑ |
| **Enterprise** | Strict layer separation, DI | High-traffic systems | ☐ |

> Dynamic 레벨 — 프레임워크 자체는 파일 시스템 + CLI 도구 + 문서이지만, 팀 배포/추적/자동화가 포함되어 Dynamic 수준의 구조화 필요

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 스킬 메타데이터 | YAML frontmatter / JSON / SQLite | YAML frontmatter | Claude Code 표준, 기존 SKILL.md 호환 |
| 카탈로그 저장 | 단일 JSON / Markdown 문서 / SQLite | Markdown + JSON 인덱스 | 사람·기계 모두 읽기 가능, Git 친화 |
| 인벤토리 스캔 | Bash script / Node.js / 수동 | Node.js (mjs) | 크로스 플랫폼, YAML 파싱 용이 |
| 중복 검출 | 메타데이터 비교 / LLM 분류 / 수동 | 메타데이터 + 수동 (Phase 1a), LLM 보조 (Phase 1b) | 점진적 자동화 |
| 사용량 추적 | PreToolUse 훅 / 로그 파일 / SQLite | PreToolUse 훅 + JSON 로그 | Claude Code 네이티브, 경량 |
| 배포 방식 | Git repo / Plugin marketplace / npm | Git repo (Phase 1) → Plugin (Phase 2) | 단계적 확장 |

### 6.3 System Architecture

```
┌─────────────────────────────────────────────────────┐
│ Skill Framework Architecture                         │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ User Scope  │  │Project Scope │  │Plugin Scope│ │
│  │ ~/.claude/  │  │ .claude/     │  │ ~/.claude/ │ │
│  │ commands/   │  │ skills/      │  │ plugins/   │ │
│  │ skills/     │  │              │  │            │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                 │        │
│         └────────────────┼─────────────────┘        │
│                          │                          │
│                ┌─────────▼─────────┐                │
│                │  Inventory Scanner │                │
│                │  (Node.js mjs)     │                │
│                └─────────┬─────────┘                │
│                          │                          │
│              ┌───────────▼───────────┐              │
│              │  Core Registry (JSON) │              │
│              │  - skill metadata     │              │
│              │  - category tags      │              │
│              │  - dependency graph   │              │
│              │  - usage stats        │              │
│              └───────────┬───────────┘              │
│                          │                          │
│         ┌────────────────┼────────────────┐         │
│         │                │                │         │
│  ┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼──────┐ │
│  │ Catalog Doc │ │Quality Lint │ │ Usage Tracker│ │
│  │ (Markdown)  │ │ (Node.js)   │ │(PreToolUse)  │ │
│  └─────────────┘ └─────────────┘ └──────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [ ] Skill-specific conventions document (to be created)
- [x] ESLint configuration (`.eslintrc.*`)
- [x] TypeScript configuration (`tsconfig.json`)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **스킬 네이밍** | 불일치 (ax-*, 프로젝트별 자유) | kebab-case, scope 접두사 규칙 | High |
| **폴더 구조** | 없음 | SKILL.md + references/ + scripts/ + assets/ | High |
| **Description** | 자유 형식 | 트리거 조건 중심 작성 (When to use) | High |
| **Gotchas** | 대부분 없음 | 모든 스킬에 gotchas 섹션 필수 | High |
| **의존성 선언** | 없음 | YAML frontmatter `dependencies:` 필드 | Medium |

### 7.3 Anthropic 9+α 카테고리 체계 (확정 대상)

| # | Category | Description | 현재 해당 스킬 (예상) |
|---|----------|-------------|---------------------|
| 1 | Library & API Reference | 라이브러리/SDK 사용법 | context7, bkend-* |
| 2 | Product Verification | 동작 테스트/검증 | e2e-pipeline, zero-script-qa |
| 3 | Data Fetching & Analysis | 데이터/모니터링 연결 | sync |
| 4 | Business Process & Team Automation | 반복 워크플로우 자동화 | ax-session-start/end, ralph |
| 5 | Code Scaffolding & Templates | 보일러플레이트 생성 | db-migrate, starter, dynamic, enterprise |
| 6 | Code Quality & Review | 코드 품질/리뷰 | ax-code-verify, code-review |
| 7 | CI/CD & Deployment | 배포 자동화 | deploy, ax-code-deploy |
| 8 | Runbooks | 증상→조사→리포트 | secrets-check |
| 9 | Infrastructure Operations | 운영/유지보수 | ax-infra-selfcheck, ax-gov-* |
| 10 | **Requirements & Planning** (커스텀) | 요구사항/기획 | ax-req-*, pdca, plan-plus |
| 11 | **Documentation & Governance** (커스텀) | 문서/거버넌스 관리 | ax-gov-doc, ax-gov-version, bkit-templates |

---

## 8. Implementation Strategy

### Phase 1a Sprint Plan (2주)

| Week | Task | 산출물 |
|------|------|--------|
| W1 | 카테고리 체계 확정 + 인벤토리 스크립트 개발 | `skill-catalog.json`, scan script |
| W1 | user/project scope 수동 분류 (22개) | 카테고리 태깅 완료 |
| W2 | bkit plugin 자동 스캔 + 참조 분류 (188개) | 통합 인벤토리 |
| W2 | 중복 식별 + 1차 클린업 + 검색 PoC | 중복 보고서, CLI PoC |

### Phase 1b Sprint Plan (2주)

| Week | Task | 산출물 |
|------|------|--------|
| W3 | 스킬 작성 가이드라인 v1 | `skill-writing-guide.md` |
| W3 | 카탈로그 문서 v1 | `skill-catalog.md` |
| W4 | 린터 + 자동화 도구 PoC | lint script, 자동 검증 |
| W4 | 폐기 정책 + ax-req-manage 보강 | 정책 문서, 스킬 개선 |

---

## 9. Next Steps

1. [ ] `/pdca design skill-framework` — Design 문서 작성
2. [ ] 팀 리뷰 및 승인
3. [ ] Phase 1a 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Initial draft (PRD 기반, 3라운드 AI 검토 반영) | Sinclair Seo |
