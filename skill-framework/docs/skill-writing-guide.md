# Skill Writing Guide

> Claude Code 스킬/커맨드/에이전트를 작성할 때 따라야 할 가이드라인.
> 트리거 정확도, 유지보수성, 일관성을 높이기 위한 실전 패턴 모음.

---

## 1. TL;DR Checklist

- [ ] **Description은 트리거 조건 중심**으로 작성했는가? (기능 설명이 아니라 "언제 호출되는가")
- [ ] **YAML frontmatter 필수 필드**(name, description)를 빠짐없이 채웠는가?
- [ ] **Gotchas 섹션**을 포함하여 흔한 실수를 사전 방지했는가?
- [ ] **Progressive Disclosure 3단계**를 지켜 컨텍스트 낭비를 최소화했는가?
- [ ] **categories.json 11개 카테고리** 중 정확한 카테고리를 지정했는가?

---

## 2. Description 작성법

### 핵심 원칙

Description은 Claude가 **이 스킬을 호출할지 말지 판단하는 유일한 입력**이다.
기능 나열이 아니라 **트리거 조건(언제, 어떤 상황에서)**을 명시해야 한다.

### BAD vs GOOD 예시

**BAD** — 기능 나열형:
```
description: "코드를 분석하고 품질을 검사하는 도구입니다."
```
문제: "코드 분석"이 너무 넓어서 거의 모든 코딩 작업에 매칭됨.

**GOOD** — 트리거 조건형:
```
description: >-
  Use this skill when the user requests code review, quality check,
  or bug detection after completing implementation.
  Do NOT use for: design documents, deployment, or gap analysis.
```
핵심: **언제 사용** + **언제 사용하지 않는지**(Do NOT use for)를 모두 명시.

### BAD vs GOOD — 트리거 키워드

**BAD** — 키워드 없음:
```
description: "배포를 도와줍니다."
```

**GOOD** — 다국어 트리거 키워드 포함:
```
description: >-
  Triggers: deploy, CI/CD, production, 배포, デプロイ, 部署,
  despliegue, déploiement, Bereitstellung, distribuzione.
  Do NOT use for: local dev, design phase.
```

### 다국어 트리거 키워드 패턴

8개 언어를 지원하는 표준 키워드 블록:
```
Triggers: {EN}, {KO}, {JA}, {ZH}, {ES}, {FR}, {DE}, {IT}
```
- 모든 키워드를 넣을 필요는 없음. 사용자가 실제로 쓸 가능성 있는 것만.
- 동의어/약어도 포함: `k8s`, `kubernetes`, `쿠버네티스` 등.

### Do NOT use for 패턴

반드시 포함해야 할 exclusion:
- 비슷하지만 다른 스킬이 담당하는 영역
- 흔히 혼동되는 상황
- 이 스킬의 범위를 벗어나는 작업

```
Do NOT use for: {유사 스킬 영역}, {범위 밖 작업}, {흔한 혼동 상황}.
```

---

## 3. Progressive Disclosure

스킬 내용이 길어지면 컨텍스트 윈도우를 소모한다. 3단계 구조로 분리:

### Level 1: Frontmatter (항상 로딩)

```yaml
---
name: my-skill
description: >-
  Use when ... Triggers: ... Do NOT use for: ...
---
```
- 1줄 description만으로 트리거 판단이 가능해야 한다.
- Claude는 이 정보만으로 스킬 선택 여부를 결정한다.

### Level 2: SKILL.md 본문 (스킬 호출 시 로딩)

```markdown
# My Skill

## Overview
핵심 동작 설명 (5~10줄)

## Steps
1. ...
2. ...

## Gotchas
- 주의사항 1
- 주의사항 2
```
- 실행에 필요한 핵심 정보만 포함.
- 200줄 이내 권장. 넘으면 Level 3로 분리.

### Level 3: references/ (필요 시 Read)

```
my-skill/
├── SKILL.md          # Level 2
└── references/
    ├── api-spec.md   # Level 3 — API 상세
    └── examples.md   # Level 3 — 예제 모음
```
- 대량 참조 데이터, 상세 예제, API 스펙 등.
- SKILL.md에서 `Read references/api-spec.md` 지시로 필요 시에만 로딩.

---

## 4. Gotchas Section

### 왜 중요한가?

Anthropic 권장: **Gotchas 섹션은 실수 방지에 가장 효과적**인 구조이다.
Claude가 반복적으로 틀리는 패턴을 명시하면 동일 실수 재발율이 크게 감소한다.

### 반드시 포함할 항목

1. **환경 의존성** — 특정 환경에서만 동작하는 제약
2. **흔한 파라미터 실수** — 잘못 전달하기 쉬운 인자
3. **순서 의존성** — 반드시 선행해야 하는 단계
4. **부작용** — 실행 시 변경되는 외부 상태

### 작성 패턴과 예시

형식: `- **{상황}**: {잘못} → {올바른 방법}`

- **D1 remote 실행**: `--file` 옵션은 OAuth 에러 가능 → `--command` 인라인 사용
- **Pages 시크릿**: `wrangler.toml` vars 아님 → `wrangler pages secret put` 필요
- **프로덕션 배포**: `--env production` 누락 시 staging으로 배포됨

---

## 5. Folder Structure Standard

```
skill-name/
├── SKILL.md          # 메인 (Level 2)
├── references/       # 상세 참조 (Level 3) — SKILL.md 200줄 초과 시 분리
├── scripts/          # Bash 스크립트 — allowed-tools에 Bash 포함 시
└── assets/           # JSON 템플릿, 스키마 — 코드 생성/검증용 정적 파일
```

---

## 6. YAML Frontmatter Standard

### 필수 필드

```yaml
---
name: skill-name            # kebab-case, 유일한 식별자
description: >-             # 트리거 조건 중심 설명 (2번 섹션 참고)
  Use when ... Triggers: ... Do NOT use for: ...
---
```

### 권장 필드

```yaml
---
name: skill-name
description: >-
  Use when ...
user-invocable: true        # /skill-name 으로 사용자가 직접 호출 가능
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]  # 허용 도구 목록
category: code-quality      # categories.json의 id 값
argument-hint: "[파일경로]"  # 인자 힌트 (커맨드용)
model: sonnet               # 에이전트 모델 (sonnet, opus, haiku)
---
```

### 필드별 가이드

| 필드 | 타입 | 설명 |
|------|------|------|
| `name` | string | kebab-case. 스킬 파일명과 일치 권장 |
| `description` | string | **가장 중요**. 트리거 정확도 결정 |
| `user-invocable` | boolean | `true`면 슬래시 커맨드로 노출 |
| `allowed-tools` | string[] | 도구 제한. 생략 시 전체 허용 |
| `category` | string | 11개 카테고리 중 하나 (7번 섹션 참조) |
| `argument-hint` | string | 커맨드 실행 시 인자 안내 텍스트 |
| `model` | string | 에이전트 전용. 실행 모델 지정 |

---

## 7. Category Classification Guide

categories.json의 11개 카테고리별 판단 기준:

| ID | 카테고리 | 이 카테고리에 넣는 기준 |
|----|----------|------------------------|
| `library-reference` | Library & API Reference | 특정 라이브러리/SDK/CLI 사용법을 가르치는가? |
| `product-verification` | Product Verification | E2E 테스트, QA, 통합 검증을 수행하는가? |
| `data-analysis` | Data Fetching & Analysis | 데이터 소스 연결, 메트릭 수집, 모니터링을 하는가? |
| `business-automation` | Business Process & Team Automation | 반복 워크플로우, 세션 관리, 팀 협업을 자동화하는가? |
| `code-scaffolding` | Code Scaffolding & Templates | 보일러플레이트 코드, 프로젝트 구조를 생성하는가? |
| `code-quality` | Code Quality & Review | 코드 리뷰, 버그 탐지, 린트, 타입체크를 하는가? |
| `cicd-deployment` | CI/CD & Deployment | 빌드, 배포, 릴리스 파이프라인을 관리하는가? |
| `runbooks` | Runbooks | 증상 기반 진단 가이드(symptom → investigate → report)인가? |
| `infra-operations` | Infrastructure Operations | 인프라 설정, 환경 동기화, 운영 유지보수인가? |
| `requirements-planning` | Requirements & Planning | 요구사항 수집, PRD, PDCA 계획, 범위 산정인가? |
| `doc-governance` | Documentation & Governance | 문서 생명주기, 버전 관리, 거버넌스 표준인가? |

### 판단 순서

1. **핵심 동작**이 무엇인지 1문장으로 정의
2. 위 표에서 해당 동작과 가장 가까운 카테고리 선택
3. 2개 이상 해당되면 **주된 목적** 기준으로 1개만 선택
4. 애매하면 `examples` 필드의 기존 스킬과 비교

### 흔한 혼동 해소

- **code-quality** vs **product-verification**: 코드 자체 품질이면 `code-quality`, 제품 동작 검증이면 `product-verification`
- **code-scaffolding** vs **library-reference**: 코드를 생성하면 `code-scaffolding`, 기존 라이브러리 사용법이면 `library-reference`
- **business-automation** vs **infra-operations**: 업무 프로세스 자동화면 `business-automation`, 인프라 설정/운영이면 `infra-operations`
- **runbooks** vs **product-verification**: 증상 기반 진단이면 `runbooks`, 자동화된 테스트면 `product-verification`

---

## 8. Anti-patterns

| # | 안티패턴 | BAD | GOOD | 문제 |
|---|----------|-----|------|------|
| 1 | **기능만 나열** | `"코드를 분석하고 리뷰합니다"` | `"Use when ... Triggers: ... Do NOT use for: ..."` | 트리거 키워드 없으면 오탐 급증 |
| 2 | **SKILL.md 비대화** | 500줄 단일 파일 | SKILL.md(100줄) + references/(상세) | 컨텍스트 윈도우 소모 |
| 3 | **Gotchas 누락** | Steps만 있고 주의사항 없음 | Steps + Gotchas 섹션 포함 | 같은 실수 세션마다 반복 |
| 4 | **카테고리 오분류** | 배포인데 `code-quality` | `cicd-deployment` (정확한 id) | 카탈로그 검색에서 누락 |
| 5 | **Do NOT use for 누락** | `"보안 관련 작업에 사용"` | exclusion 명시 + 대체 스킬 안내 | 유사 스킬 간 동시 트리거 |

---

## 9. Quality Checklist (Lint 7 Rules)

자가 검증용 체크리스트. `skill-lint` CLI의 7개 규칙과 동일:

| # | 규칙 | 검증 기준 |
|---|------|-----------|
| 1 | **frontmatter-required** | `name`과 `description`이 YAML frontmatter에 존재 |
| 2 | **description-trigger-pattern** | Description에 `Triggers:` 또는 `Use when` 패턴 포함 |
| 3 | **description-exclusion** | Description에 `Do NOT use for:` 패턴 포함 |
| 4 | **gotchas-section** | SKILL.md에 `## Gotchas` 섹션 존재 |
| 5 | **category-valid** | `category` 값이 categories.json의 11개 id 중 하나 |
| 6 | **line-count** | SKILL.md 본문 200줄 이내 (초과 시 references/ 분리 필요) |
| 7 | **folder-structure** | 필수 파일(SKILL.md 또는 COMMAND.md) 존재 확인 |

### 자가 검증 절차

```bash
# 전체 린트 실행
bun run skill-lint

# 단일 스킬 검증
bun run skill-lint --path skills/my-skill/

# 경고만 표시
bun run skill-lint --level warn
```

검증 후 warning이 0이면 품질 기준 충족.
