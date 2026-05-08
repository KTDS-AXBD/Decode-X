---
code: AIF-DSGN-skill-framework-design
title: "Skill Framework Design Document"
version: 1.0
status: active
category: design
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
---

# Skill Framework Design Document

> **Summary**: Claude Code 스킬 210+ 자산의 분류·관리·공유 프레임워크 기술 설계
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **Planning Doc**: [skill-framework.plan.md](../01-plan/features/skill-framework.plan.md)
> **REQ**: AIF-REQ-029

---

## 1. Overview

### 1.1 Design Goals

- **단일 JSON 레지스트리**: 210+ 스킬의 메타데이터를 `skill-catalog.json` 하나로 관리하여 검색/필터 성능 확보
- **자동 스캔**: user/project/plugin 3 scope를 자동으로 스캔하여 인벤토리를 빌드하는 Node.js 스크립트
- **품질 린터**: 스킬 작성 가이드라인 준수 여부를 자동 검증하는 CLI 도구
- **카탈로그 생성기**: JSON 레지스트리에서 사람이 읽을 수 있는 Markdown 카탈로그 자동 생성
- **확장 가능**: Phase 2의 사용량 추적, 의존성 관리, 팀 배포에 대비한 스키마 설계

### 1.2 Design Principles

- **파일 시스템 우선**: DB 없이 파일 시스템 기반으로 동작 (Claude Code 환경 특성)
- **점진적 자동화**: 수동 분류(Phase 1a) → 자동 스캔+린트(Phase 1b) → 추적+배포(Phase 2)
- **최소 침습**: 기존 스킬 파일을 수정하지 않고 외부 레지스트리로 메타데이터 관리
- **단일 진실 소스**: `skill-catalog.json`이 SSOT, Markdown 카탈로그는 생성물

---

## 2. Architecture

### 2.1 System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Skill Framework                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌── Source Scopes ──────────────────────────────────────┐   │
│  │                                                        │   │
│  │  ~/.claude/commands/ax-*.md    (15 user commands)     │   │
│  │  ~/.claude/skills/*/SKILL.md   (1 user skill)         │   │
│  │  .claude/skills/*/SKILL.md     (6 project skills)     │   │
│  │  ~/.claude/plugins/**/SKILL.md (188 bkit skills)      │   │
│  │                                                        │   │
│  └────────────────────┬───────────────────────────────────┘   │
│                       │                                      │
│                       ▼                                      │
│  ┌─── Tools ─────────────────────────────────────────────┐   │
│  │                                                        │   │
│  │  scan.mjs ──────▶ skill-catalog.json (SSOT)           │   │
│  │                         │                              │   │
│  │                    ┌────┼────┐                         │   │
│  │                    ▼    ▼    ▼                         │   │
│  │              catalog  lint  search                     │   │
│  │              .mjs    .mjs   .mjs                       │   │
│  │                │      │      │                         │   │
│  │                ▼      ▼      ▼                         │   │
│  │           .md doc  report  results                     │   │
│  │                                                        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─── Outputs ───────────────────────────────────────────┐   │
│  │                                                        │   │
│  │  skill-catalog.json     ← SSOT (메타데이터 레지스트리)  │   │
│  │  skill-catalog.md       ← 생성물 (사람용 카탈로그)      │   │
│  │  skill-writing-guide.md ← 수동 작성 (가이드라인)        │   │
│  │  lint-report.json       ← 생성물 (품질 검증 결과)       │   │
│  │                                                        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
스캔 플로우:
  파일 시스템 → scan.mjs → skill-catalog.json → catalog.mjs → skill-catalog.md

린트 플로우:
  skill-catalog.json + 실제 스킬 파일 → lint.mjs → lint-report.json + 콘솔 출력

검색 플로우:
  사용자 쿼리 → search.mjs → skill-catalog.json 필터 → 결과 출력
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| scan.mjs | 파일 시스템, yaml 파서 | 스킬 파일 스캔 + 메타데이터 추출 |
| catalog.mjs | skill-catalog.json | JSON → Markdown 카탈로그 생성 |
| lint.mjs | skill-catalog.json, 가이드라인 규칙 | 품질 검증 |
| search.mjs | skill-catalog.json | CLI 검색/필터 |

---

## 3. Data Model

### 3.1 Category Taxonomy (11 categories)

```typescript
type SkillCategory =
  | 'library-reference'       // 1. Library & API Reference
  | 'product-verification'    // 2. Product Verification
  | 'data-analysis'           // 3. Data Fetching & Analysis
  | 'business-automation'     // 4. Business Process & Team Automation
  | 'code-scaffolding'        // 5. Code Scaffolding & Templates
  | 'code-quality'            // 6. Code Quality & Review
  | 'cicd-deployment'         // 7. CI/CD & Deployment
  | 'runbooks'                // 8. Runbooks
  | 'infra-operations'        // 9. Infrastructure Operations
  | 'requirements-planning'   // 10. Requirements & Planning (custom)
  | 'doc-governance';         // 11. Documentation & Governance (custom)
```

### 3.2 Skill Metadata Schema

```typescript
interface SkillCatalog {
  version: string;           // Schema version (semver)
  updatedAt: string;         // ISO 8601
  generatedBy: string;       // 'scan.mjs' or 'manual'
  categories: CategoryDef[];
  skills: SkillEntry[];
}

interface CategoryDef {
  id: SkillCategory;
  name: string;              // Display name (English)
  nameKo: string;            // Display name (Korean)
  description: string;       // When to classify a skill here
  examples: string[];        // Anthropic examples
}

interface SkillEntry {
  // Identity
  id: string;                // Unique ID (kebab-case)
  name: string;              // Display name from frontmatter
  scope: 'user' | 'project' | 'plugin';
  type: 'command' | 'skill';
  path: string;              // Absolute or relative path to SKILL.md/command.md

  // Classification
  category: SkillCategory;
  tags: string[];            // Free-form tags for search

  // Quality
  description: string;       // Trigger description
  hasGotchas: boolean;       // Gotchas section exists
  hasReferences: boolean;    // references/ folder exists
  hasScripts: boolean;       // scripts/ folder exists
  qualityScore: number;      // 0-100 (lint result)

  // Relations (Phase 2)
  dependencies: string[];    // Other skill IDs
  dependedBy: string[];      // Reverse deps (auto-computed)

  // Metrics (Phase 2)
  usageCount: number;        // From PreToolUse hook log
  lastUsedAt: string | null; // ISO 8601

  // Metadata
  source: string;            // Plugin name or 'ax' or project name
  addedAt: string;           // First scan date
  updatedAt: string;         // Last scan date
}
```

### 3.3 Lint Rules Schema

```typescript
interface LintRule {
  id: string;                // e.g., 'has-gotchas', 'description-quality'
  severity: 'error' | 'warning' | 'info';
  message: string;
  check: (skill: SkillEntry, fileContent: string) => boolean;
}

// Phase 1b Lint Rules:
const LINT_RULES: LintRule[] = [
  { id: 'has-description',   severity: 'error',   message: 'description 필드 필수' },
  { id: 'description-trigger', severity: 'warning', message: 'description은 트리거 조건 중심으로 작성' },
  { id: 'has-gotchas',       severity: 'warning', message: 'gotchas 섹션 권장' },
  { id: 'folder-structure',  severity: 'info',    message: 'references/ 또는 scripts/ 폴더 권장' },
  { id: 'no-secrets',        severity: 'error',   message: '시크릿/크레덴셜 포함 금지' },
  { id: 'single-category',   severity: 'warning', message: '하나의 카테고리에 맞아야 함' },
  { id: 'name-kebab',        severity: 'warning', message: '스킬 ID는 kebab-case' },
];
```

---

## 4. Tool Specifications

### 4.1 scan.mjs — Inventory Scanner

**용도**: 3 scope의 스킬 파일을 스캔하여 `skill-catalog.json` 생성/갱신

**입력**:
```bash
node scripts/scan.mjs [--scope user|project|plugin|all] [--output path]
```

**스캔 경로**:
| Scope | Pattern | Type |
|-------|---------|------|
| user commands | `~/.claude/commands/ax-*.md` | command |
| user skills | `~/.claude/skills/*/SKILL.md` | skill |
| project skills | `.claude/skills/*/SKILL.md` | skill |
| plugin skills | `~/.claude/plugins/**/SKILL.md` | skill (참조만) |

**동작**:
1. 각 경로의 파일을 Glob으로 수집
2. 각 파일의 YAML frontmatter 파싱 (name, description 추출)
3. 폴더 구조 검사 (references/, scripts/, assets/ 존재 여부)
4. 기존 `skill-catalog.json`이 있으면 merge (수동 태깅 보존)
5. 카테고리가 미지정이면 `'uncategorized'`로 표시
6. 결과를 `skill-catalog.json`에 저장

**핵심 로직 — 수동 태깅 보존**:
```
기존 JSON의 category/tags → 스캔 결과에 유지
새 파일은 category: 'uncategorized'
삭제된 파일은 deleted: true 마킹 (즉시 제거 안 함)
```

### 4.2 catalog.mjs — Catalog Generator

**용도**: `skill-catalog.json`에서 사람이 읽을 수 있는 `skill-catalog.md` 생성

**입력**:
```bash
node scripts/catalog.mjs [--input path] [--output path]
```

**출력 구조**:
```markdown
# Skill Catalog

> 210+ skills across 11 categories. Auto-generated from skill-catalog.json.

## Summary
| Category | Count | User | Project | Plugin |
|----------|:-----:|:----:|:-------:|:------:|
| Library & API Reference | 12 | 0 | 0 | 12 |
| ...

## 1. Library & API Reference (12)
| Skill | Scope | Description | Quality |
|-------|-------|-------------|:-------:|
| context7 | plugin | 라이브러리 문서 조회 | ██░░░ 40 |

## 2. Product Verification (5)
...

## Uncategorized (N)
...
```

### 4.3 lint.mjs — Quality Linter

**용도**: 가이드라인 준수 여부 자동 검증

**입력**:
```bash
node scripts/lint.mjs [--fix] [--scope user|project|all] [--severity error|warning|all]
```

**출력**:
```
🔍 Skill Framework Lint — 22 skills checked

❌ ERROR  ax-session-start: no-secrets — API 키 하드코딩 감지
⚠️  WARN   ax-git-sync: has-gotchas — gotchas 섹션 없음
ℹ️  INFO   deploy: folder-structure — references/ 폴더 없음

Summary: 1 error, 5 warnings, 8 info
Quality Score: 72/100
```

### 4.4 search.mjs — CLI Search

**용도**: 카탈로그에서 스킬 검색/필터

**입력**:
```bash
node scripts/search.mjs <query> [--category cat] [--scope scope] [--sort usage|name|quality]
```

**출력**:
```
🔍 Search: "deploy" (3 results)

1. deploy (project, cicd-deployment) ★ 85
   Cloudflare Workers 배포 수행
2. ax-code-deploy (user, cicd-deployment) ★ 72
   프리뷰 배포 또는 명시적 재배포
3. phase-9-deployment (plugin, cicd-deployment) ★ 60
   배포 스킬 (bkit)
```

---

## 5. File Structure

### 5.1 프레임워크 디렉토리 구조

```
skill-framework/                    # 프로젝트 루트 내
├── scripts/                        # CLI 도구
│   ├── scan.mjs                    # 인벤토리 스캐너
│   ├── catalog.mjs                 # 카탈로그 생성기
│   ├── lint.mjs                    # 품질 린터
│   └── search.mjs                  # CLI 검색
├── data/                           # 생성/관리 데이터
│   ├── skill-catalog.json          # SSOT (메타데이터 레지스트리)
│   ├── categories.json             # 카테고리 정의 (11종)
│   └── lint-rules.json             # 린트 규칙 정의
├── docs/                           # 생성 문서
│   ├── skill-catalog.md            # 카탈로그 (자동 생성)
│   └── skill-writing-guide.md      # 작성 가이드라인 (수동)
├── templates/                      # 스킬 생성 템플릿 (Phase 1b)
│   ├── skill-template/             # 기본 스킬 템플릿
│   │   ├── SKILL.md
│   │   ├── references/
│   │   └── scripts/
│   └── command-template.md         # 기본 커맨드 템플릿
├── interview-log.md                # PRD 인터뷰 원문
├── prd-final.md                    # 최종 PRD
├── review-history.md               # 검토 이력
└── archive/                        # PRD 중간 산출물
```

### 5.2 스킬 표준 폴더 구조 (가이드라인)

```
{skill-name}/
├── SKILL.md                        # 메인 문서 (필수)
│   ├── ---                         # YAML frontmatter
│   │   ├── name                    #   필수
│   │   ├── description             #   필수 (트리거 조건 중심)
│   │   └── category                #   권장 (11종 중 택 1)
│   ├── ## Overview                 # 스킬 목적
│   ├── ## Usage                    # 사용법
│   ├── ## Gotchas                  # 주의사항 (필수 권장)
│   └── ## Examples                 # 사용 예시
├── references/                     # 참조 문서 (선택)
│   └── api.md                      # API 시그니처, 상세 사용법
├── scripts/                        # 실행 스크립트 (선택)
│   └── helper.mjs                  # 헬퍼 함수
├── assets/                         # 에셋 파일 (선택)
│   └── template.md                 # 출력 템플릿
└── config.json                     # 설정 (선택, setup 패턴)
```

---

## 6. Error Handling

### 6.1 스캔 에러

| Scenario | Handling |
|----------|----------|
| 파일 접근 권한 없음 | warning 로그 + 스킵 (스캔 계속) |
| YAML frontmatter 파싱 실패 | name을 파일명에서 추출, description 비워둠 |
| 경로 미존재 (scope 없음) | 해당 scope 0건으로 처리 |
| 기존 catalog.json 손상 | backup 후 새로 생성 |

### 6.2 린트 에러

| Scenario | Handling |
|----------|----------|
| 스킬 파일 삭제됨 | catalog.json에서 deleted 마킹 |
| 바이너리 파일 포함 | 스킵 + info 로그 |
| 시크릿 감지 | error 등급 + 즉시 보고 |

---

## 7. Security Considerations

- [x] 스킬 파일 내 시크릿/크레덴셜 자동 탐지 (lint rule `no-secrets`)
- [x] 기존 PreToolUse 훅 유지 (.env/.dev.vars 편집 차단)
- [ ] 팀 배포 시 코드 보안 검토 프로세스 (Phase 2)
- [ ] 외부 공유 시 KT DS 정책 준수 검증 (Phase 2)

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit Test | scan.mjs 파싱 로직, lint rules | Vitest |
| Integration Test | 전체 스캔 → JSON → Markdown 파이프라인 | Vitest + 임시 파일 시스템 |
| Manual Test | CLI UX, 검색 결과 품질 | 직접 실행 |

### 8.2 Test Cases (Key)

- [ ] scan: user scope commands 15개 정상 스캔
- [ ] scan: YAML frontmatter 없는 파일 graceful 처리
- [ ] scan: 기존 수동 태깅 보존 (merge 동작)
- [ ] catalog: 카테고리별 정렬 + 카운트 정확
- [ ] lint: 시크릿 패턴 감지 (API_KEY, SECRET, PASSWORD)
- [ ] lint: gotchas 섹션 존재 여부 검사
- [ ] search: 카테고리 필터 + 키워드 검색 조합

---

## 9. Implementation Guide

### 9.1 Implementation Order

**Phase 1a (W1-W2)**:
1. [ ] `data/categories.json` — 11 카테고리 정의
2. [ ] `scripts/scan.mjs` — 인벤토리 스캐너 (핵심)
3. [ ] `data/skill-catalog.json` — 첫 스캔 실행 + 수동 분류
4. [ ] `scripts/search.mjs` — CLI 검색 PoC
5. [ ] 중복 스킬 식별 + 보고서

**Phase 1b (W3-W4)**:
6. [ ] `docs/skill-writing-guide.md` — 작성 가이드라인
7. [ ] `scripts/catalog.mjs` — 카탈로그 생성기
8. [ ] `data/lint-rules.json` + `scripts/lint.mjs` — 품질 린터
9. [ ] `templates/` — 스킬 생성 템플릿
10. [ ] 폐기 정책 문서 + ax-req-manage 보강

### 9.2 핵심 구현 상세

#### scan.mjs 핵심 알고리즘

```
1. resolve scan paths per scope
2. for each path:
   a. glob for matching files
   b. read file content
   c. parse YAML frontmatter (between first --- pair)
   d. extract: name, description, user-invocable, allowed-tools
   e. check folder siblings: references/, scripts/, assets/
   f. build SkillEntry object
3. load existing skill-catalog.json (if exists)
4. merge: preserve manual fields (category, tags), update auto fields
5. mark deleted skills (in old but not in scan)
6. write skill-catalog.json
7. print summary
```

#### 수동 분류 워크플로우

```
1. scan.mjs --scope all 실행 → uncategorized 스킬 목록
2. 사용자가 skill-catalog.json 직접 편집 (category 필드)
   또는 CLI: node scripts/classify.mjs <skill-id> <category>
3. 다음 scan 시 수동 분류 보존
```

---

## 10. Convention Reference

### 10.1 스킬 네이밍 규칙

| Scope | Pattern | Example |
|-------|---------|---------|
| user command | `ax-{function}.md` | `ax-session-start.md` |
| user skill | `ax-{function}/SKILL.md` | `ax-req-interview/SKILL.md` |
| project skill | `{function}/SKILL.md` | `deploy/SKILL.md` |
| plugin skill | `{plugin}:{skill}` | `bkit:pdca` |

### 10.2 Description 작성 규칙

```
BAD:  "세션을 시작합니다"           ← 무엇인지만 설명
GOOD: "세션 시작 시 프로젝트 컨텍스트를 복원한다.
       Auto Memory에서 즉시 맥락 파악 후 SPEC.md 보충 읽기.
       Use when: 새 세션 시작, 작업 전 컨텍스트 로딩"  ← 언제 트리거해야 하는지 설명
```

### 10.3 Gotchas 섹션 작성 규칙

```markdown
## Gotchas

- **타임아웃**: PostToolUse hook은 60s timeout 필수. typecheck가 12개 서비스를 순회하므로 5s로는 부족
- **순서 의존**: ax-session-start 전에 MEMORY.md가 로딩되어야 함. 파일 없으면 빈 컨텍스트로 시작
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Initial draft (Plan 기반) | Sinclair Seo |
