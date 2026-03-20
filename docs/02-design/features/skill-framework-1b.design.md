# Skill Framework Phase 1b — Design Document

> **Summary**: Phase 1b 기술 설계 — 스킬 작성 가이드라인, 템플릿 3종, lint --fix, 플러그인 자동분류, 폐기 정책
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **Planning Doc**: [skill-framework-1b.plan.md](../01-plan/features/skill-framework-1b.plan.md)
> **REQ**: AIF-REQ-029 (Phase 1b)
> **Predecessor Design**: [skill-framework.design.md](skill-framework.design.md) (Phase 1a)

---

## 1. Overview

### 1.1 Design Goals

- **가이드라인 + 템플릿**: 신규 스킬 작성 시 즉시 참조 가능한 가이드라인과 scaffold 템플릿 제공
- **lint --fix**: fixable 위반을 자동 교정하여 수동 작업 최소화
- **자동분류**: 188개 uncategorized 플러그인 스킬을 키워드 기반으로 카테고리 배정
- **폐기 정책**: 미사용·중복 스킬의 생명주기 관리 표준 확립

### 1.2 Design Principles

- **Phase 1a 호환**: 기존 SkillEntry 스키마·CLI 인터페이스 변경 없음
- **제로 의존성 유지**: 외부 npm 패키지 추가 없이 Node.js 내장 모듈만 사용
- **수동 태깅 우선**: 자동분류 결과보다 기존 수동 태깅이 항상 우선

---

## 2. Architecture

### 2.1 Phase 1b 확장 아키텍처

```
┌── Phase 1a (기존) ──────────────────────────────────────────┐
│                                                              │
│  Source Scopes → scan.mjs → skill-catalog.json (SSOT)       │
│                                    │                         │
│                              ┌─────┼─────┐                  │
│                              ▼     ▼     ▼                  │
│                         catalog  lint  search                │
│                                                              │
├── Phase 1b (신규) ──────────────────────────────────────────┤
│                                                              │
│  ┌─ 문서 산출물 ───────────────────────────────────────┐    │
│  │  skill-writing-guide.md   ← 작성 가이드라인 (수동)   │    │
│  │  deprecation-policy.md    ← 폐기 정책 (수동)         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ 템플릿 ───────────────────────────────────────────┐     │
│  │  templates/                                         │     │
│  │    command.template.md  ← command 스켈레톤           │     │
│  │    skill.template.md    ← skill SKILL.md 스켈레톤    │     │
│  │    agent.template.md    ← agent .md 스켈레톤         │     │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ 코드 확장 ────────────────────────────────────────┐     │
│  │  lint.mjs  ← --fix 플래그 추가                       │     │
│  │  scan.mjs  ← --auto-classify 플래그 추가              │     │
│  │  data/classify-keywords.json ← 카테고리별 키워드 맵   │     │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow (Phase 1b 추가분)

```
자동분류 플로우:
  skill-catalog.json + classify-keywords.json
    → scan.mjs --auto-classify
    → 카테고리 추론 (키워드 매칭)
    → skill-catalog.json 갱신 (수동 태깅 보존)

lint --fix 플로우:
  skill-catalog.json
    → lint.mjs --fix
    → fixable 위반 수집
    → skill-catalog.json 백업 + 수정
    → 결과 요약 출력
```

---

## 3. Data Model (Phase 1b 추가)

### 3.1 Classify Keywords Map

**파일**: `skill-framework/data/classify-keywords.json`

```typescript
interface ClassifyKeywordsMap {
  [categoryId: string]: {
    keywords: string[];    // 대소문자 무시 매칭
    weight: number;        // 기본 1.0, 높을수록 우선
  };
}
```

**예시**:
```json
{
  "library-reference": {
    "keywords": ["library", "SDK", "API reference", "documentation", "docs", "query-docs", "resolve-library"],
    "weight": 1.0
  },
  "cicd-deployment": {
    "keywords": ["deploy", "CI/CD", "pipeline", "build", "release", "production", "staging", "wrangler"],
    "weight": 1.0
  },
  "code-quality": {
    "keywords": ["review", "lint", "quality", "bug", "refactor", "simplify", "test coverage", "code-review"],
    "weight": 1.0
  },
  "code-scaffolding": {
    "keywords": ["scaffold", "template", "starter", "init", "generate", "create", "boilerplate", "new project"],
    "weight": 1.0
  },
  "requirements-planning": {
    "keywords": ["plan", "PRD", "requirement", "PDCA", "discovery", "strategy", "roadmap", "feature spec", "interview"],
    "weight": 1.0
  },
  "doc-governance": {
    "keywords": ["document", "governance", "version", "changelog", "standard", "retro", "archive", "index"],
    "weight": 1.0
  },
  "business-automation": {
    "keywords": ["session", "automate", "workflow", "loop", "batch", "team", "coordination", "recurring"],
    "weight": 1.0
  },
  "product-verification": {
    "keywords": ["test", "QA", "verify", "e2e", "validation", "check", "coverage", "assertion"],
    "weight": 1.0
  },
  "data-analysis": {
    "keywords": ["analytics", "data", "metric", "dashboard", "monitor", "sync", "fetch", "report"],
    "weight": 0.8
  },
  "runbooks": {
    "keywords": ["runbook", "diagnose", "troubleshoot", "incident", "health", "selfcheck", "secrets"],
    "weight": 1.0
  },
  "infra-operations": {
    "keywords": ["infrastructure", "cloud", "AWS", "kubernetes", "terraform", "docker", "migration", "config"],
    "weight": 1.0
  }
}
```

### 3.2 SkillEntry 확장 (하위 호환)

Phase 1b에서 SkillEntry에 선택적 필드를 추가한다. 기존 필드는 변경 없음.

```typescript
interface SkillEntry {
  // ... 기존 18 필드 유지 ...

  // Phase 1b 추가 (선택적)
  autoClassified?: boolean;      // 자동분류 여부 (수동 = false/undefined)
  classifyConfidence?: number;   // 자동분류 신뢰도 (0.0 ~ 1.0)
  deprecated?: boolean;          // 폐기 마킹
  deprecatedAt?: string;         // 폐기일 (ISO 8601)
  deprecatedReason?: string;     // 폐기 사유
}
```

---

## 4. Tool Specifications (Phase 1b)

### 4.1 lint.mjs --fix 확장

**CLI 변경**:
```bash
node skill-framework/scripts/lint.mjs --fix [--scope user|project|all] [--severity error|warning|all]
```

**동작**:
1. 기존 lint 실행으로 전체 위반 수집
2. fixable 위반 필터링 (아래 표 참조)
3. `skill-catalog.json` 백업 → `.skill-catalog.json.bak`
4. 수정 적용:
   - `single-category`: 자동분류 알고리즘 적용 (§4.2 참조)
   - `name-kebab`: ID를 kebab-case로 변환
5. 수정된 JSON 저장
6. 결과 출력:
   ```
   Fixed 12 issues:
     single-category: 10 (auto-classified)
     name-kebab: 2 (renamed)
   Remaining 5 issues (manual fix required):
     has-description: 2
     has-gotchas: 3
   ```

**Fixable 규칙 정의**:

| Rule | Fixable | 교정 방식 |
|------|:-------:|----------|
| `single-category` | ✅ | classify-keywords.json 기반 자동분류 |
| `name-kebab` | ✅ | `toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')` |
| `has-description` | ❌ | 사람이 작성 필요 |
| `description-trigger` | ❌ | 내용 품질 판단 필요 |
| `has-gotchas` | ❌ | 도메인 지식 필요 |
| `folder-structure` | ❌ | 파일 생성은 위험 |
| `no-secrets` | ❌ | 시크릿 제거는 사람 판단 필요 |

**구현 상세** (`lint.mjs` 내부):

```javascript
// --fix 관련 추가 CLI 옵션
const { values } = parseArgs({
  options: {
    // ... 기존 옵션 ...
    fix: { type: 'boolean', default: false },
  },
  strict: false,
});

// fix 모드 핵심 로직
function applyFixes(catalog, issues) {
  const classifyMap = JSON.parse(
    readFileSync(resolve('skill-framework/data/classify-keywords.json'), 'utf-8')
  );
  let fixCount = 0;
  const fixResults = { 'single-category': 0, 'name-kebab': 0 };

  for (const issue of issues) {
    const skill = catalog.skills.find(s => s.id === issue.skillId);
    if (!skill) continue;

    if (issue.ruleId === 'single-category') {
      const result = classifyByKeywords(skill, classifyMap);
      if (result.category !== 'uncategorized') {
        skill.category = result.category;
        skill.autoClassified = true;
        skill.classifyConfidence = result.confidence;
        fixResults['single-category']++;
        fixCount++;
      }
    }

    if (issue.ruleId === 'name-kebab') {
      const idPart = skill.id.includes(':') ? skill.id.split(':').pop() : skill.id;
      const fixed = idPart.toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      skill.id = skill.id.includes(':')
        ? skill.id.split(':')[0] + ':' + fixed
        : fixed;
      fixResults['name-kebab']++;
      fixCount++;
    }
  }

  return { fixCount, fixResults };
}
```

### 4.2 scan.mjs --auto-classify 확장

**CLI 변경**:
```bash
node skill-framework/scripts/scan.mjs --auto-classify [--threshold 0.3] [--scope all]
```

**자동분류 알고리즘**:

```javascript
/**
 * 키워드 기반 카테고리 분류
 * @param {SkillEntry} skill - 대상 스킬
 * @param {ClassifyKeywordsMap} keywordsMap - 카테고리별 키워드
 * @returns {{ category: string, confidence: number }}
 */
function classifyByKeywords(skill, keywordsMap) {
  const text = [
    skill.name || '',
    skill.description || '',
    skill.id || '',
    ...(skill.tags || []),
  ].join(' ').toLowerCase();

  const scores = {};

  for (const [categoryId, config] of Object.entries(keywordsMap)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += config.weight;
      }
    }
    if (score > 0) {
      scores[categoryId] = score;
    }
  }

  // 최고 점수 카테고리 선택
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return { category: 'uncategorized', confidence: 0 };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [bestCategory, bestScore] = entries[0];
  const totalKeywords = keywordsMap[bestCategory].keywords.length;

  // 신뢰도: 매칭된 키워드 비율 (0~1)
  const confidence = Math.min(bestScore / Math.max(totalKeywords * 0.3, 1), 1.0);

  return { category: bestCategory, confidence: Math.round(confidence * 100) / 100 };
}
```

**동작 순서**:
1. 기존 scan 수행 (모든 scope)
2. `classify-keywords.json` 로드
3. `uncategorized` 스킬만 필터링
4. 각 스킬에 `classifyByKeywords()` 적용
5. confidence ≥ threshold인 스킬만 카테고리 갱신
6. 결과 요약:
   ```
   Auto-classified 142/188 plugins:
     library-reference: 15
     code-quality: 23
     requirements-planning: 31
     ...
   Remaining uncategorized: 46 (confidence < 0.3)
   ```

**수동 태깅 보존 규칙**:
- `autoClassified !== true`인 기존 분류는 덮어쓰지 않음
- `--force` 플래그로 수동 태깅 포함 재분류 가능 (위험, 확인 필요)

### 4.3 자동분류 → lint --fix 통합

`lint.mjs --fix`에서 `single-category` 교정 시 동일한 `classifyByKeywords()` 함수를 사용한다.
코드 중복을 피하기 위해 `classify.mjs` 유틸리티 모듈을 추출한다.

**새 파일**: `skill-framework/scripts/classify.mjs`

```javascript
// classify.mjs — 키워드 기반 자동분류 유틸리티
// scan.mjs와 lint.mjs에서 공유

export function classifyByKeywords(skill, keywordsMap) {
  // ... 위 알고리즘 동일 ...
}

export function loadKeywordsMap(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf-8'));
}
```

---

## 5. Document Specifications

### 5.1 skill-writing-guide.md 구조

**파일**: `skill-framework/docs/skill-writing-guide.md`

```markdown
# Skill Writing Guide v1

## TL;DR (체크리스트)
- [ ] YAML frontmatter에 name, description 필수
- [ ] description은 트리거 조건 중심 (Use when, Triggers)
- [ ] Gotchas 섹션 작성
- [ ] 50줄 이내 핵심 내용 (Progressive Disclosure)
- [ ] references/ 또는 scripts/ 폴더 활용

## 1. Description 작성법
- 트리거 조건 중심으로 작성
- BAD/GOOD 예시 비교
- 다국어 트리거 키워드 패턴

## 2. Progressive Disclosure
- Level 1: 1줄 요약 (frontmatter description)
- Level 2: SKILL.md 본문 (핵심 사용법)
- Level 3: references/ 하위 (상세 API, 예시)

## 3. Gotchas 섹션
- 반드시 포함해야 할 항목
- 작성 패턴 + 예시

## 4. 폴더 구조 표준
- references/, scripts/, assets/ 용도
- 언제 사용하는가

## 5. YAML Frontmatter 표준
- 필수 필드: name, description
- 권장 필드: user-invocable, allowed-tools, category
- 예시

## 6. 카테고리 분류 기준
- 11 카테고리별 판단 기준 (categories.json 참조)
- 경계 사례 가이드

## 7. 안티패턴
- 너무 긴 description
- Gotchas 없는 복잡한 스킬
- 하드코딩된 경로/시크릿
- 카테고리 미지정

## 8. 품질 체크리스트
- lint 규칙 7종 자가 검증 가이드
```

**분량**: 약 200~300줄 (읽기 10분 이내)

### 5.2 Templates 구조

#### command.template.md

```markdown
---
name: ax-{function-name}
description: |
  {1줄 설명}. Use when {트리거 조건}.
  {추가 설명 (2-3줄 이내)}
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
argument-hint: "[arg1] [--flag]"
---

# {스킬 이름}

## Steps

### 1. {단계 1}

{구현 지시}

### 2. {단계 2}

{구현 지시}

## Gotchas

- **{주의사항 1}**: {설명}
- **{주의사항 2}**: {설명}
```

#### skill.template.md (SKILL.md용)

```markdown
---
name: {skill-name}
description: |
  {1줄 설명}. Use when {트리거 조건}.
  Triggers: {keyword1}, {keyword2}, {한국어 키워드}
---

# {Skill Name}

## Overview

{스킬 목적 1-2줄}

## Usage

{사용법 예시}

## Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `arg1` | {설명} | `value` |

## Gotchas

- **{주의사항}**: {설명}

## References

- [참조 문서](references/{file}.md)
```

#### agent.template.md

```markdown
---
name: {agent-name}
description: |
  {1줄 설명}. Use when {트리거 조건}.
  Triggers: {keyword1}, {keyword2}
model: sonnet
tools:
  - Read
  - Glob
  - Grep
---

# {Agent Name}

{시스템 프롬프트 — 에이전트의 역할과 행동 지침}

## Responsibilities

1. {책임 1}
2. {책임 2}

## Output Format

{출력 형식 지정}

## Constraints

- {제약 1}
- {제약 2}
```

### 5.3 deprecation-policy.md 구조

**파일**: `skill-framework/docs/deprecation-policy.md`

```markdown
# Skill Deprecation & Archive Policy

## 1. 폐기 기준
- usageCount = 0 AND lastUsedAt > 3개월 경과
- 대체 스킬이 존재하고 기능이 완전 포함됨
- 유지보수 불가 (의존 서비스 종료 등)

## 2. 폐기 프로세스
1. `deprecated: true` + `deprecatedReason` 설정
2. catalog.md에 ⚠️ 표시
3. 1개월 유예 기간 (사용자 공지)
4. 유예 후 `archived: true` 전환

## 3. 아카이브 규칙
- skill-catalog.json 메타데이터 유지 (삭제 안 함)
- 파일은 archive/ 하위로 이동
- 카탈로그에서 별도 "Archived" 섹션에 표시

## 4. 복구
- `deprecated: false` 설정으로 재활성화 가능
- 아카이브에서 원래 위치로 파일 복원

## 5. 완전 삭제
- archived 상태에서 6개월 경과
- skill-catalog.json에서 항목 제거
```

---

## 6. File Structure (Phase 1b 최종)

```
skill-framework/
├── scripts/
│   ├── scan.mjs              # ← --auto-classify 추가
│   ├── catalog.mjs           # (변경 없음)
│   ├── lint.mjs              # ← --fix 추가
│   ├── search.mjs            # (변경 없음)
│   ├── classify.mjs          # ★ 신규: 자동분류 공유 유틸리티
│   └── scan.test.mjs         # ← 테스트 확장 (17→28)
├── data/
│   ├── skill-catalog.json    # ← autoClassified 필드 추가
│   ├── categories.json       # (변경 없음)
│   ├── lint-rules.json       # (변경 없음)
│   └── classify-keywords.json # ★ 신규: 카테고리별 키워드 맵
├── docs/
│   ├── skill-catalog.md      # (자동 재생성)
│   ├── skill-writing-guide.md # ★ 신규: 작성 가이드라인
│   └── deprecation-policy.md  # ★ 신규: 폐기 정책
├── templates/                  # ★ 신규 디렉토리
│   ├── command.template.md    # command 템플릿
│   ├── skill.template.md      # skill 템플릿
│   └── agent.template.md      # agent 템플릿
├── prd-final.md
├── interview-log.md
├── review-history.md
└── archive/
```

**신규 파일 7개**: classify.mjs, classify-keywords.json, skill-writing-guide.md, deprecation-policy.md, command.template.md, skill.template.md, agent.template.md

**변경 파일 3개**: scan.mjs, lint.mjs, scan.test.mjs

---

## 7. Error Handling (Phase 1b 추가)

### 7.1 --fix 에러

| Scenario | Handling |
|----------|----------|
| skill-catalog.json 쓰기 실패 | 백업에서 복원 + 에러 메시지 |
| classify-keywords.json 미존재 | --fix 건너뜀 + 경고 메시지 |
| 백업 파일(.bak) 쓰기 실패 | --fix 중단 (원본 보호 우선) |

### 7.2 --auto-classify 에러

| Scenario | Handling |
|----------|----------|
| 키워드 매칭 0건 | uncategorized 유지, 경고 로그 |
| classify-keywords.json 파싱 실패 | 자동분류 스킵 + 에러 메시지 |
| confidence 0.0 (매칭 없음) | uncategorized 유지 (threshold 미달) |

---

## 8. Test Plan (Phase 1b)

### 8.1 추가 테스트 케이스

| # | 영역 | 테스트 | 기대 결과 |
|---|------|--------|----------|
| 1 | classify | 키워드 1개 매칭 시 해당 카테고리 반환 | `{ category: 'cicd-deployment', confidence: > 0 }` |
| 2 | classify | 키워드 0개 매칭 시 uncategorized | `{ category: 'uncategorized', confidence: 0 }` |
| 3 | classify | 복수 카테고리 키워드 매칭 시 최고 점수 선택 | top-1 카테고리 반환 |
| 4 | classify | threshold 미달 시 uncategorized 유지 | confidence < threshold → skip |
| 5 | lint-fix | fixable 규칙만 교정 | single-category 교정, has-description 스킵 |
| 6 | lint-fix | 백업 파일 생성 확인 | `.bak` 파일 존재 |
| 7 | lint-fix | 수동 태깅 보존 | autoClassified=false인 스킬 변경 없음 |
| 8 | lint-fix | name-kebab 교정 | `MySkill` → `my-skill` |
| 9 | scan | --auto-classify 플래그 동작 | uncategorized 스킬만 분류 시도 |
| 10 | scan | 수동 태깅 + 자동분류 공존 | 수동 분류 유지, 나머지만 자동 |
| 11 | edge | 빈 description 스킬 자동분류 | name/id 기반 fallback 매칭 |

**총 테스트**: 기존 17 + 신규 11 = **28개**

### 8.2 수동 검증

| # | 항목 | 검증 방법 |
|---|------|----------|
| 1 | 가이드라인 가독성 | skill-writing-guide.md 직접 읽기 (10분 이내) |
| 2 | 템플릿 실용성 | 템플릿으로 새 스킬 생성 시도 |
| 3 | 자동분류 정확도 | 188개 중 샘플 20개 수동 검수 (≥80% 정확) |
| 4 | 카탈로그 갱신 | `catalog.mjs` 재실행 후 카테고리별 분포 확인 |

---

## 9. Implementation Order

### 9.1 구현 순서 (의존성 기반)

```
Step 1: classify-keywords.json (데이터, 독립)
  ↓
Step 2: classify.mjs (공유 유틸리티)
  ↓
Step 3: scan.mjs --auto-classify (classify.mjs 의존)
     ↕ (병렬 가능)
Step 4: lint.mjs --fix (classify.mjs 의존)
  ↓
Step 5: scan.test.mjs 확장 (Step 2~4 이후)

─── 독립 (문서, 병렬 가능) ───
Step A: skill-writing-guide.md
Step B: templates/ (3종)
Step C: deprecation-policy.md
```

### 9.2 Agent Team 분배

| Worker | 담당 | 파일 |
|--------|------|------|
| **W1 (문서)** | Step A + B + C | `docs/skill-writing-guide.md`, `docs/deprecation-policy.md`, `templates/*.md` |
| **W2 (코드)** | Step 1~5 | `data/classify-keywords.json`, `scripts/classify.mjs`, `scripts/scan.mjs`, `scripts/lint.mjs`, `scripts/scan.test.mjs` |

**파일 겹침**: 없음 (W1=docs+templates, W2=scripts+data)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Phase 1b Design 초안 | Sinclair Seo |
