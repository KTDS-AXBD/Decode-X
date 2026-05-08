---
code: AIF-DSGN-skill-framework-plugin-design
title: "Skill Framework Plugin — Design Document"
version: 1.0
status: active
category: design
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
---

# Skill Framework Plugin — Design Document

> **Summary**: skill-framework/를 독립 CC 플러그인으로 패키징. 경로 전환(CWD→PLUGIN_ROOT) + plugin.json + 8 SKILL.md + README
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **Planning Doc**: [skill-framework-plugin.plan.md](../01-plan/features/skill-framework-plugin.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **경로 독립**: 모든 스크립트가 `process.cwd()` 대신 `PLUGIN_ROOT`(스크립트 자체 위치 기준) 사용
2. **플러그인 매니페스트**: `.claude-plugin/plugin.json` 작성
3. **8 Skill 래핑**: 각 CLI를 `/sf-*` slash command로 호출 가능하게
4. **독립 Git 리포**: `KTDS-AXBD/skill-framework` 리포 생성 + push
5. **원본 정리**: `res-ai-foundry/skill-framework/` → 플러그인 리포로 이전

### 1.2 설계 원칙

- **기존 코드 최소 변경**: 경로 참조만 수정, 로직 변경 없음
- **하위 호환**: `--input`, `--output`, `--catalog` 옵션으로 경로 override 가능 유지
- **자동 검색(auto-discovery)**: CC가 skills/, hooks/ 디렉토리를 자동 인식

---

## 2. 경로 전환 상세 (핵심 변경)

### 2.1 PLUGIN_ROOT 패턴

모든 스크립트에 동일한 패턴을 적용해요:

```javascript
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..');  // scripts/ → 플러그인 루트
```

### 2.2 파일별 변경 목록

| 파일 | 변경 줄 | 변경 내용 |
|------|:-------:|----------|
| **scan.mjs** | 4줄 | `projectRoot` → `PLUGIN_ROOT` 기본값. categories.json, classify 경로. `process.cwd()`는 user/project 스킬 스캔용으로 유지 |
| **classify.mjs** | 1줄 | `basePath` 매개변수 기본값 → `PLUGIN_ROOT` |
| **lint.mjs** | 3줄 | input/rules default → `PLUGIN_ROOT/data/...`, `loadKeywordsMap(PLUGIN_ROOT)` |
| **catalog.mjs** | 2줄 | input/output default → `PLUGIN_ROOT/data/...`, `PLUGIN_ROOT/docs/...` |
| **search.mjs** | 1줄 | input default → `PLUGIN_ROOT/data/...` |
| **deploy.mjs** | 3줄 | `ROOT` → `PLUGIN_ROOT`, config/catalog default |
| **usage.mjs** | 1줄 | defaultCatalog → `PLUGIN_ROOT/data/...` |
| **refactor.mjs** | 2줄 | catalog/rulesPath default → `PLUGIN_ROOT/data/...` |
| **deps.mjs** | 1줄 | catalogPath default → `PLUGIN_ROOT/data/...` |

### 2.3 scan.mjs 특별 처리

scan.mjs는 `process.cwd()`를 **스킬 탐색 경로**로 사용해요 (user/project scope 스캔). 이건 유지해야 해요:

```javascript
// 변경 전
const projectRoot = resolve(process.cwd());
const defaultOutput = join(projectRoot, 'skill-framework', 'data', 'skill-catalog.json');

// 변경 후
const PLUGIN_ROOT = resolve(__dirname, '..');
const scanRoot = resolve(process.cwd());  // CWD는 스킬 탐색용으로 유지
const defaultOutput = join(PLUGIN_ROOT, 'data', 'skill-catalog.json');
```

categories.json과 keywordsMap은 PLUGIN_ROOT에서 로드:
```javascript
// 변경 전
const catPath = join(projectRoot, 'skill-framework', 'data', 'categories.json');
const keywordsMap = loadKeywordsMap(projectRoot);

// 변경 후
const catPath = join(PLUGIN_ROOT, 'data', 'categories.json');
const keywordsMap = loadKeywordsMap(PLUGIN_ROOT);
```

### 2.4 classify.mjs 경로 변경

```javascript
// 변경 전
export function loadKeywordsMap(basePath) {
  const p = resolve(basePath, 'skill-framework/data/classify-keywords.json');

// 변경 후
export function loadKeywordsMap(basePath) {
  const p = resolve(basePath, 'data/classify-keywords.json');
```

`basePath`가 이제 `PLUGIN_ROOT`(= `skill-framework/`)이므로 `skill-framework/` 중첩 제거.

---

## 3. Plugin Structure

### 3.1 plugin.json

```json
{
  "name": "skill-framework",
  "version": "1.0.0",
  "description": "Claude Code 스킬 인벤토리·분류·린트·배포·추적·리팩토링 프레임워크. 210+ 스킬 관리 도구 8종.",
  "author": {
    "name": "KTDS AX BD팀",
    "email": "ktds.axbd@gmail.com"
  }
}
```

### 3.2 SKILL.md 래핑 패턴 (8개)

각 스킬은 동일한 패턴이에요:

```yaml
---
name: sf-scan
description: |
  Scan all Claude Code skills (user/project/plugin) and build skill-catalog.json.
  Use when: inventorying skills, updating catalog, auto-classifying uncategorized skills.
  Triggers: scan, inventory, classify, catalog update, 스캔, 인벤토리, 분류
user-invocable: true
argument-hint: "[--scope user|project|plugin|all] [--auto-classify] [--threshold 0.2]"
---

# Skill Inventory Scanner

Scans user/project/plugin scopes and builds skill-catalog.json.

## Steps

Run the scanner with provided arguments:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs $ARGUMENTS
```

Display the output to the user.
```

### 3.3 8개 스킬 매핑

| Slash Command | 스크립트 | 설명 |
|---------------|---------|------|
| `/sf-scan` | scan.mjs | 스킬 인벤토리 스캔 + 자동분류 |
| `/sf-lint` | lint.mjs | 품질 린트 + --fix 자동교정 |
| `/sf-catalog` | catalog.mjs | 카탈로그 Markdown 생성 |
| `/sf-search` | search.mjs | 스킬 키워드 검색 |
| `/sf-deploy` | deploy.mjs | 팀 Git 리포 배포 |
| `/sf-usage` | usage.mjs | 사용량 리포트 + 폐기 후보 |
| `/sf-refactor` | refactor.mjs | 일괄 리팩토링 |
| `/sf-deps` | deps.mjs | 의존성 그래프 + 순환 검출 |

### 3.4 디렉토리 구조

```
skill-framework/               ← Git 리포 루트
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── sf-scan/SKILL.md
│   ├── sf-lint/SKILL.md
│   ├── sf-catalog/SKILL.md
│   ├── sf-search/SKILL.md
│   ├── sf-deploy/SKILL.md
│   ├── sf-usage/SKILL.md
│   ├── sf-refactor/SKILL.md
│   └── sf-deps/SKILL.md
├── hooks/
│   └── usage-tracker.sh
├── scripts/
│   ├── scan.mjs, lint.mjs, catalog.mjs, search.mjs
│   ├── deploy.mjs, usage.mjs, refactor.mjs, deps.mjs
│   ├── classify.mjs
│   └── scan.test.mjs
├── data/
│   ├── categories.json
│   ├── classify-keywords.json
│   ├── deploy-config.json
│   ├── lint-rules.json
│   └── .gitignore              ← skill-catalog.json 제외
├── templates/
│   ├── command.template.md
│   ├── skill.template.md
│   └── agent.template.md
├── docs/
│   ├── skill-writing-guide.md
│   └── deprecation-policy.md
├── .gitignore
├── README.md
└── LICENSE
```

### 3.5 .gitignore

```
data/skill-catalog.json
data/skill-catalog.json.bak
data/deploy-config.json
```

`skill-catalog.json`은 `scan.mjs` 실행 시 자동 생성되므로 Git에서 제외. `deploy-config.json`도 환경마다 다르므로 제외하고 `deploy-config.example.json`을 제공해요.

---

## 4. Git 리포 생성 + 배포

### 4.1 리포 생성

```bash
gh repo create KTDS-AXBD/skill-framework --private --description "Claude Code Skill Framework — 스킬 관리 도구 8종"
```

### 4.2 파일 이동

```bash
# 임시 디렉토리에 플러그인 구조 생성
mkdir -p /tmp/skill-framework-plugin/{.claude-plugin,skills,scripts,data,hooks,templates,docs}

# 스크립트 복사
cp skill-framework/scripts/*.mjs /tmp/skill-framework-plugin/scripts/

# 데이터 복사 (catalog 제외)
cp skill-framework/data/{categories,classify-keywords,lint-rules}.json /tmp/skill-framework-plugin/data/
cp skill-framework/data/deploy-config.json /tmp/skill-framework-plugin/data/deploy-config.example.json

# 훅/템플릿/문서 복사
cp skill-framework/hooks/*.sh /tmp/skill-framework-plugin/hooks/
cp skill-framework/templates/*.md /tmp/skill-framework-plugin/templates/
cp skill-framework/docs/{skill-writing-guide,deprecation-policy}.md /tmp/skill-framework-plugin/docs/
```

### 4.3 설치 테스트

```bash
claude plugin add git@github.com:KTDS-AXBD/skill-framework.git
# → /sf-scan, /sf-lint 등 사용 가능 확인
```

---

## 5. 원본 프로젝트 정리

`res-ai-foundry/skill-framework/`를 정리해요:

1. **skill-framework/** 디렉토리 삭제 (PRD/인터뷰 산출물은 archive/)
2. **CLAUDE.md** 업데이트: 프로젝트 스킬 → 플러그인 참조로 변경
3. **MEMORY.md** 업데이트: skill-framework 플러그인 참조

---

## 6. Implementation Checklist

1. [ ] GitHub 리포 `KTDS-AXBD/skill-framework` 생성
2. [ ] `.claude-plugin/plugin.json` 작성
3. [ ] 8개 `skills/sf-*/SKILL.md` 작성
4. [ ] 9개 스크립트 경로 전환 (PLUGIN_ROOT)
5. [ ] classify.mjs `skill-framework/` 중첩 제거
6. [ ] `data/.gitignore` + `deploy-config.example.json`
7. [ ] README.md 작성
8. [ ] 테스트 실행 (43 PASS)
9. [ ] Git push
10. [ ] `claude plugin add` 테스트
11. [ ] res-ai-foundry에서 skill-framework/ 정리

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Initial plugin design | Sinclair Seo |
