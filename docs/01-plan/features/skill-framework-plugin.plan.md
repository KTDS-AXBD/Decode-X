---
code: AIF-PLAN-skill-framework-plugin-plan
title: "Skill Framework Plugin — Planning Document"
version: 1.0
status: active
category: plan
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
---

# Skill Framework Plugin — Planning Document

> **Summary**: 기존 skill-framework/ 디렉토리를 독립 Claude Code 플러그인으로 패키징하여, `claude plugin add` 1줄로 어떤 프로젝트에서든 설치·동기화 가능하도록 변환
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **REQ**: AIF-REQ-029 (Phase 4 — 플러그인 패키징, chore)
> **Predecessor**: [skill-framework-3.plan.md](skill-framework-3.plan.md) (Phase 3, 100% PASS)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Skill Framework 8 CLI + 훅 + 데이터가 `res-ai-foundry/skill-framework/`에 묶여 있어 다른 프로젝트에서 사용 불가. 실행 시 프로젝트 루트 필수 (`cd ~/work/axbd/res-ai-foundry && node skill-framework/scripts/scan.mjs`) |
| **Solution** | 독립 Git 리포(`KTDS-AXBD/skill-framework`)에 CC 플러그인 구조로 재배치. 8개 스크립트를 slash command로 래핑. 훅·데이터·문서·템플릿 포함 |
| **Function/UX Effect** | `claude plugin add git@github.com:KTDS-AXBD/skill-framework.git` 1줄로 설치. `/sf-scan`, `/sf-lint --fix`, `/sf-deploy --target team` 등 어디서나 호출. 업데이트는 `claude plugin update` |
| **Core Value** | Phase 1~3 "프레임워크 완성" → Phase 4 **"프레임워크 독립 배포"**: 프로젝트 종속성 제거, 팀 전체가 동일 도구를 공유. Skill Framework가 진정한 팀 인프라로 승격 |

---

## 1. Overview

### 1.1 Purpose

Phase 1~3에서 완성한 Skill Framework(8 CLI, 1 훅, 43 테스트, 210 스킬 100% 분류)가 `res-ai-foundry` 프로젝트에 묶여 있어:
- 다른 프로젝트에서 사용하려면 전체 리포를 clone해야 함
- CWD가 프로젝트 루트여야 실행 가능 (`node skill-framework/scripts/scan.mjs`)
- 팀원이 설치하려면 수동 파일 복사 필요

CC 플러그인으로 패키징하면 이 모든 문제가 해결돼요.

### 1.2 CC Plugin 구조 (참고: 공식 플러그인)

```
.claude-plugin/
  plugin.json          ← 매니페스트 (name, description, author)
skills/
  sf-scan/SKILL.md     ← /sf-scan 스킬
  sf-lint/SKILL.md     ← /sf-lint 스킬
  ...
hooks/
  usage-tracker.sh     ← PreToolUse 훅
data/                  ← 분류 키워드, 린트 규칙 등
templates/             ← 스킬 템플릿 3종
docs/                  ← 가이드라인, 폐기 정책
scripts/               ← 실행 스크립트 (SKILL.md에서 Bash로 호출)
```

### 1.3 Related Documents

- Phase 1a~3 PDCA 문서들 (skill-framework*.md)
- PRD: `skill-framework/prd-final.md` §4.2-6 (팀 배포 + 플러그인 패키징)
- CC Plugin 구조: `.claude-plugin/plugin.json` + auto-discovery

---

## 2. Scope

### 2.1 In Scope

- [ ] **FR-01**: 독립 Git 리포 생성 (`KTDS-AXBD/skill-framework`)
- [ ] **FR-02**: `.claude-plugin/plugin.json` 매니페스트 작성
- [ ] **FR-03**: 8개 CLI → 8개 slash command 스킬로 래핑 (`/sf-scan`, `/sf-lint`, `/sf-catalog`, `/sf-search`, `/sf-deploy`, `/sf-usage`, `/sf-refactor`, `/sf-deps`)
- [ ] **FR-04**: `${CLAUDE_PLUGIN_ROOT}` 경로 참조로 스크립트 실행 (프로젝트 독립)
- [ ] **FR-05**: hooks/, data/, templates/, docs/ 포함
- [ ] **FR-06**: README.md (설치/사용 가이드)
- [ ] **FR-07**: 기존 `res-ai-foundry/skill-framework/` 제거 또는 플러그인 참조로 교체

### 2.2 Out of Scope

- **npm 패키지 배포**: CC 플러그인이면 충분, npm은 과도
- **CI/CD 자동화**: 리포 생성 후 수동 관리 (스킬 프레임워크 자체가 자주 변경되지 않음)
- **마켓플레이스 등록**: 팀 내부 사용이므로 마켓플레이스 불필요

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | **독립 리포**: `KTDS-AXBD/skill-framework` 리포 생성, 현재 skill-framework/ 내용 이동 | High | Pending |
| FR-02 | **plugin.json**: name `skill-framework`, description, author(KTDS AX BD팀) | High | Pending |
| FR-03 | **8 Skills**: 각 스크립트를 SKILL.md로 래핑. frontmatter(name, description, user-invocable) + `bash node ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.mjs` 호출 | High | Pending |
| FR-04 | **경로 독립**: 모든 스크립트에서 `__dirname` 기반 상대 경로로 data/ 참조. `process.cwd()` 의존 제거 | High | Pending |
| FR-05 | **hooks 포함**: usage-tracker.sh가 플러그인 설치 시 자동 등록 가능하도록 구조 배치 | Medium | Pending |
| FR-06 | **README**: 설치 1줄 + 사용 예시 + 스킬 목록 + 업데이트 방법 | Medium | Pending |
| FR-07 | **원본 정리**: res-ai-foundry에서 skill-framework/ 제거, CLAUDE.md 참조 업데이트 | Low | Pending |

### 3.2 경로 전환 핵심

현재 스크립트들이 `process.cwd()` 기반으로 `skill-framework/data/`를 참조해요:
```javascript
// 현재 (프로젝트 루트 의존)
const defaultOutput = join(projectRoot, 'skill-framework', 'data', 'skill-catalog.json');

// 변경 후 (플러그인 루트 독립)
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOutput = join(PLUGIN_ROOT, 'data', 'skill-catalog.json');
```

이 변경이 scan.mjs, lint.mjs, classify.mjs, catalog.mjs, search.mjs, deploy.mjs, usage.mjs, refactor.mjs, deps.mjs **9개 파일** 전체에 적용돼야 해요.

---

## 4. Target Plugin Structure

```
skill-framework/                    ← Git 리포 루트
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── sf-scan/SKILL.md            ← /sf-scan
│   ├── sf-lint/SKILL.md            ← /sf-lint
│   ├── sf-catalog/SKILL.md         ← /sf-catalog
│   ├── sf-search/SKILL.md          ← /sf-search
│   ├── sf-deploy/SKILL.md          ← /sf-deploy
│   ├── sf-usage/SKILL.md           ← /sf-usage
│   ├── sf-refactor/SKILL.md        ← /sf-refactor
│   └── sf-deps/SKILL.md            ← /sf-deps
├── hooks/
│   └── usage-tracker.sh
├── scripts/
│   ├── scan.mjs
│   ├── lint.mjs
│   ├── catalog.mjs
│   ├── search.mjs
│   ├── deploy.mjs
│   ├── usage.mjs
│   ├── refactor.mjs
│   ├── deps.mjs
│   ├── classify.mjs                ← 공유 유틸
│   └── scan.test.mjs
├── data/
│   ├── categories.json
│   ├── classify-keywords.json
│   ├── deploy-config.json
│   ├── lint-rules.json
│   └── skill-catalog.json          ← 설치 후 자동 생성
├── templates/
│   ├── command.template.md
│   ├── skill.template.md
│   └── agent.template.md
├── docs/
│   ├── skill-writing-guide.md
│   └── deprecation-policy.md
├── README.md
└── LICENSE
```

---

## 5. SKILL.md 래핑 패턴

```yaml
---
name: sf-scan
description: |
  Scan all Claude Code skills (user/project/plugin) and build skill-catalog.json.
  Use when: inventorying skills, updating catalog, auto-classifying uncategorized skills.
user-invocable: true
argument-hint: "[--scope user|project|plugin|all] [--auto-classify] [--threshold 0.2]"
---
```

```markdown
# /sf-scan — Skill Inventory Scanner

Run the skill scanner to discover and catalog all Claude Code skills.

## Usage

```bash
/sf-scan                          # 전체 스캔
/sf-scan --scope user             # user scope만
/sf-scan --auto-classify          # 자동분류 포함
/sf-scan --auto-classify --threshold 0.15  # 낮은 threshold
```

## Steps

1. Bash로 스크립트 실행:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs $ARGUMENTS
   ```
2. 결과를 사용자에게 표시
```

---

## 6. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| `skill-catalog.json` 경로가 플러그인 내부 → 다른 프로젝트와 데이터 공유 | Medium | `--output` 옵션으로 프로젝트별 catalog 경로 지정 가능 (기본: 플러그인 내부) |
| 플러그인 업데이트 시 skill-catalog.json 덮어쓰기 | High | `.gitignore`에 `data/skill-catalog.json` 추가, 최초 1회만 동봉 |
| `${CLAUDE_PLUGIN_ROOT}` 미지원 CC 버전 | Low | CC 2.1.0+ 필수 (현재 사용 중), fallback 없음 |

---

## 7. Sprint Plan

이 작업은 코드 변경이 아닌 **구조 재배치**이므로 Agent Team 없이 리더가 직접 수행해요.

| # | 작업 | 예상 시간 |
|---|------|----------|
| 1 | GitHub에 `KTDS-AXBD/skill-framework` 리포 생성 | 2분 |
| 2 | 파일 복사 + plugin.json + 8 SKILL.md 작성 | 15분 |
| 3 | 스크립트 경로 전환 (`process.cwd()` → `PLUGIN_ROOT`) | 10분 |
| 4 | 테스트 실행 (43 PASS 확인) | 2분 |
| 5 | README.md 작성 | 5분 |
| 6 | Git push + `claude plugin add` 테스트 | 3분 |
| 7 | res-ai-foundry에서 skill-framework/ 정리 | 5분 |

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`skill-framework-plugin.design.md`)
2. [ ] 리더 직접 구현 (Agent Team 불필요)
3. [ ] `claude plugin add` 테스트
4. [ ] Completion Report

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Initial plugin plan | Sinclair Seo |
