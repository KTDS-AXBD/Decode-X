---
code: AIF-DSGN-026E
title: "반제품 생성 엔진 Sprint 2 — LLM 생성기 5종 설계"
version: "1.0"
status: Active
category: DSGN
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
feature: req-026-phase-2-sprint-2
refs: "[[AIF-PLAN-026E]] [[AIF-DSGN-026D]]"
---

# 반제품 생성 엔진 Sprint 2 — LLM 생성기 5종 설계

> **Summary**: svc-skill orchestrator.ts의 TODO(L165)를 구현. 5개 생성기(data-model, feature-spec, architecture, api-spec, claude-md)의 입출력, LLM 프롬프트, 체이닝 로직을 설계한다.
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Active
> **Planning Doc**: [req-026-phase-2-sprint-2.plan.md](../01-plan/features/req-026-phase-2-sprint-2.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. Sprint 1의 GeneratedFile 인터페이스를 그대로 준수
2. 생성기 간 체이닝: G1 출력 → G4/G5 입력 → G6/G7 입력 → G8 입력
3. LLM 호출은 svc-llm-router 경유 (tier2: Sonnet)
4. 모든 생성기에 `skipLlm` mechanical fallback 지원

### 1.2 Design Principles

- **Sprint 1 패턴 동일**: parsePolicyCode, groupPolicies, mechanicalFallback 패턴 재활용
- **프롬프트 분리**: 각 생성기의 system/user 프롬프트를 상수로 분리
- **체이닝은 orchestrator 책임**: 생성기는 자신의 입력만 알고, 다른 생성기 출력은 orchestrator가 전달

---

## 2. Architecture

### 2.1 Orchestrator 수정 (orchestrator.ts)

```typescript
// L165 TODO 교체 — 3-Phase 실행
export async function generatePrototype(env, prototypeId, orgId, orgName, options) {
  const data = await collectOrgData(env, orgId);
  const files: GeneratedFile[] = [];
  const skipLlm = options?.skipLlm ?? false;

  // ── Mechanical (Sprint 1, 변경 없음) ──
  files.push(generateOriginJson(orgId, orgName, data));
  files.push(generateRulesJson(data.policies));
  files.push(generateTermsJsonld(data.terms));

  // ── Phase 1: 독립 생성 (병렬) ──
  const [bl, dm] = await Promise.all([
    generateBusinessLogic(env, data.policies, { skipLlm }),
    generateDataModel(env, data.terms, { skipLlm }),
  ]);
  files.push(bl, dm);

  // ── Phase 2: 의존 생성 ──
  const fs = await generateFeatureSpec(env, data, bl, dm, { skipLlm });
  files.push(fs);

  const [arch, api] = await Promise.all([
    generateArchitecture(env, data, fs, { skipLlm }),
    generateApiSpec(env, fs, { skipLlm }),
  ]);
  files.push(arch, api);

  // ── Phase 3: 요약 ──
  const claudeMd = generateClaudeMd(orgName, data, { bl, dm, fs, arch, api });
  files.push(claudeMd);

  // ── README 갱신 (8파일 반영) ──
  files.push(generateReadme(orgName, data));

  // ── Manifest + ZIP + R2 ──
  files.push(createManifest(orgName, files, options));
  const zipData = createZip(files);
  const r2Key = await uploadToR2(env, prototypeId, zipData);
  await updatePrototypeStatus(env, prototypeId, "completed", r2Key, data);
}
```

### 2.2 Data Flow

```
collectOrgData()
  ├── policies[] ──┬── G1: business-logic ──┐
  │                │                        │
  ├── terms[]   ──┼── G4: data-model ──────┤
  │                │                        │
  ├── skills[]  ──┘                        ▼
  │                              G5: feature-spec
  ├── documents[]                     │
  │                         ┌─────────┼──────────┐
  └── extractions[]         ▼         ▼          ▼
                      G6: arch   G7: api   G8: claude-md
```

---

## 3. Generator Specifications

### 3.1 G4: data-model.ts

**파일**: `services/svc-skill/src/prototype/generators/data-model.ts`
**출력**: `specs/02-data-model.md`

#### 입력

```typescript
export function generateDataModel(
  env: Env,
  terms: TermRow[],
  options?: { skipLlm?: boolean }
): Promise<GeneratedFile>
```

#### Mechanical 로직 (skipLlm=true)

1. terms를 `term_type`별 분류: entity / attribute / relation
2. entity → 테이블명 (label → snake_case)
3. 각 entity 아래 attribute 매핑:
   - `broader_term_id`가 entity의 `term_id`와 일치하는 attribute → 해당 테이블 컬럼
   - 일치하지 않는 attribute → `_unassigned` 섹션
4. relation → FK 관계 추론 (두 entity 간 관계)
5. Mermaid ERD 생성

```typescript
// Mechanical 변환 규칙
function termToTableName(label: string): string {
  return label
    .replace(/[가-힣]+/g, (m) => m) // 한국어 유지
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function inferColumnType(definition: string | null): string {
  if (!definition) return 'TEXT';
  if (/금액|수량|건수|횟수/.test(definition)) return 'INTEGER';
  if (/비율|점수|확률/.test(definition)) return 'REAL';
  return 'TEXT';
}
```

#### LLM 프롬프트 (skipLlm=false)

```
System: 너는 데이터 모델 설계 전문가야. 도메인 용어 목록에서 관계형 DB 스키마를 설계한다.
출력 포맷: Markdown + CREATE TABLE SQL (SQLite 호환) + Mermaid ERD.

User:
아래 도메인 용어 {N}건을 분석하여 데이터 모델을 설계해줘.

## 용어 목록
{entity terms: label, definition}
{attribute terms: label, definition, broader}
{relation terms: label, definition}

## 요구사항
1. 각 entity → CREATE TABLE (id TEXT PRIMARY KEY, ... 컬럼, created_at, updated_at)
2. attribute → 적절한 컬럼 타입 (TEXT/INTEGER/REAL)
3. relation → FOREIGN KEY + Mermaid erDiagram
4. 각 테이블에 비즈니스 의미 주석
5. Enum CHECK 제약 (status 등)
6. 인덱스 (FK, status, 자주 조회 컬럼)
```

#### 출력 구조

```markdown
# 데이터 모델 명세

## ERD
```mermaid
erDiagram
  users ||--o{ vouchers : "owns"
  ...
```

## 테이블 정의

### {table_name} ({label})
```sql
CREATE TABLE {table_name} (
  id TEXT PRIMARY KEY,
  ...
);
```
```

---

### 3.2 G5: feature-spec.ts

**파일**: `services/svc-skill/src/prototype/generators/feature-spec.ts`
**출력**: `specs/03-functions.md`

#### 입력

```typescript
export function generateFeatureSpec(
  env: Env,
  data: CollectedData,
  blFile: GeneratedFile,    // G1 출력 — 비즈니스 로직
  dmFile: GeneratedFile,    // G4 출력 — 데이터 모델
  options?: { skipLlm?: boolean }
): Promise<GeneratedFile>
```

#### Mechanical 로직

1. skills[]를 subdomain별 그룹핑 → 각 그룹이 1개 기능(FN)
2. 각 FN에 관련 policies 매핑 (skill.r2_key의 policies 참조 또는 도메인/서브도메인 매칭)
3. FN-NNN 순번 부여
4. 테이블명은 dmFile.content에서 `CREATE TABLE (\w+)` 패턴 추출

#### LLM 프롬프트

```
System: 너는 기능 정의서 작성 전문가야. 비즈니스 로직과 데이터 모델을 기반으로 기능별 입출력/처리플로우/에러케이스를 정의한다.

User:
## 비즈니스 로직 (요약)
{blFile.content의 BL 목록 — 최대 3000자}

## 데이터 모델 (테이블 목록)
{dmFile.content의 CREATE TABLE 요약}

## 스킬 목록
{skills: domain, subdomain, policy_count}

각 스킬을 기능(FN-NNN)으로 변환해줘:
- 입력 (필드/타입/필수/검증규칙)
- 처리 플로우 (단계별, BL-NNN 참조)
- 출력 (필드/타입)
- 에러 케이스 (코드/조건/HTTP)
- 크로스 레퍼런스 매트릭스 (FN↔BL↔테이블)
```

---

### 3.3 G6: architecture.ts

**파일**: `services/svc-skill/src/prototype/generators/architecture.ts`
**출력**: `specs/04-architecture.md`

#### 입력

```typescript
export function generateArchitecture(
  env: Env,
  data: CollectedData,
  fsFile: GeneratedFile,    // G5 출력 — 기능 정의서
  options?: { skipLlm?: boolean }
): Promise<GeneratedFile>
```

#### Mechanical 로직

1. fsFile에서 FN 목록 추출 → 모듈 구성
2. 고정 레이어: Presentation / Application / Domain / Infrastructure
3. RBAC: 기본 3역할 (USER / ADMIN / SYSTEM)
4. 비기능: 고정 템플릿 (100명 동시, <500ms, 99.5%)

#### LLM 프롬프트

기능 목록을 입력으로 모듈 책임/의존/RBAC 매트릭스/비기능 수치를 생성.

---

### 3.4 G7: api-spec.ts

**파일**: `services/svc-skill/src/prototype/generators/api-spec.ts`
**출력**: `specs/05-api.md`

#### 입력

```typescript
export function generateApiSpec(
  env: Env,
  fsFile: GeneratedFile,    // G5 출력
  options?: { skipLlm?: boolean }
): Promise<GeneratedFile>
```

#### Mechanical 로직

1. fsFile에서 FN-NNN 목록 추출
2. 각 FN → REST 엔드포인트 매핑 규칙:
   - 조회 → `GET /api/v1/{resource}`
   - 생성 → `POST /api/v1/{resource}`
   - 상태변경 → `POST /api/v1/{resource}/{id}/{action}`
3. 입력/출력 필드 → JSON Schema 변환
4. 에러 케이스 → HTTP 에러 코드 매핑

#### LLM 보강

FN의 입출력을 JSON Schema로 정교하게 변환, 예시 페이로드 생성.

---

### 3.5 G8: claude-md.ts

**파일**: `services/svc-skill/src/prototype/generators/claude-md.ts`
**출력**: `CLAUDE.md`

#### 입력

```typescript
interface GeneratorOutputs {
  bl: GeneratedFile;
  dm: GeneratedFile;
  fs: GeneratedFile;
  arch: GeneratedFile;
  api: GeneratedFile;
}

export function generateClaudeMd(
  orgName: string,
  data: CollectedData,
  outputs: GeneratorOutputs
): GeneratedFile
```

#### 로직 (Template — LLM 불필요)

```markdown
# {orgName} Working Prototype

## 도메인
{inferDomain(data)}. 역공학 결과물 기반 자동 생성.

## 아키텍처
{arch 요약 — 레이어/모듈 목록}

## 비즈니스 룰
`specs/01-business-logic.md` 참조. 모든 BL-NNN을 코드에 반영.

## 데이터 모델
`specs/02-data-model.md` 참조. CREATE TABLE SQL 그대로 사용.

## 기능 목록
`specs/03-functions.md` 참조. FN-001부터 순서대로 구현.

## API 명세
`specs/05-api.md` 참조.

## 구현 스택
- TypeScript strict, Hono, better-sqlite3, jose, Vitest
- 응답: { success, data } / { success, error: { code, message } }

## 데이터 소스
- 정책: {data.policies.length}건
- 용어: {data.terms.length}건
- 스킬: {data.skills.length}건

*AI Foundry 반제품 생성 엔진에서 자동 생성*
```

---

## 4. Test Plan

### 4.1 각 생성기 단위 테스트

| 생성기 | 파일 | 테스트 수 | 핵심 케이스 |
|--------|------|:---------:|------------|
| G4 data-model | `data-model.test.ts` | 6 | entity→TABLE, attribute→COLUMN, relation→FK, ERD, 빈 terms, mechanical fallback |
| G5 feature-spec | `feature-spec.test.ts` | 6 | skill→FN, BL 참조, 테이블 참조, 에러케이스, 크로스레퍼런스, skipLlm |
| G6 architecture | `architecture.test.ts` | 4 | 모듈 추출, RBAC 매트릭스, 비기능, skipLlm |
| G7 api-spec | `api-spec.test.ts` | 5 | FN→엔드포인트, JSON Schema, 에러코드, 그룹핑, skipLlm |
| G8 claude-md | `claude-md.test.ts` | 3 | 파일 참조, 스택 정보, 데이터 수치 |

### 4.2 통합 테스트

| 테스트 | 파일 | 내용 |
|--------|------|------|
| Orchestrator 전체 | `orchestrator.test.ts` (기존 확장) | 8개 파일 생성 확인, 체이닝 검증 |
| ZIP 구조 | `packager.test.ts` (기존 확장) | 11개 파일(8 spec + manifest + origin + readme) 포함 확인 |
| E2E | `prototype.test.ts` (기존 확장) | POST /generate → GET status → GET download → ZIP 검증 |

**목표**: +30 테스트 (현재 262 → 292)

---

## 5. Implementation Order

| # | 파일 | 의존 | Worker 할당 |
|:-:|------|------|:-----------:|
| 1 | `generators/data-model.ts` + test | terms[] | W1 |
| 2 | `generators/feature-spec.ts` + test | G1+G4+skills | W1 |
| 3 | `generators/architecture.ts` + test | G5 | W2 |
| 4 | `generators/api-spec.ts` + test | G5 | W2 |
| 5 | `generators/claude-md.ts` + test | all | Leader |
| 6 | `orchestrator.ts` 수정 | all | Leader |
| 7 | `orchestrator.test.ts` 확장 | all | Leader |
| 8 | typecheck + lint + test | - | Leader |

**Worker 병렬화**:
- W1: G4 + G5 (데이터 → 기능, 순차적 의존)
- W2: G6 + G7 (아키텍처 + API, 병렬 가능)
- Leader: G8 + orchestrator 통합 + 테스트

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| terms에 entity가 0건 | mechanical: 빈 데이터 모델 반환 + 경고 주석 |
| LLM 응답 파싱 실패 | mechanical fallback으로 전환 (Sprint 1 패턴) |
| 생성기 체이닝 실패 (G5가 G4 출력 읽기 실패) | G5를 skills만으로 기계적 생성 |
| 전체 생성 시간 > 30초 | ctx.waitUntil() 이미 적용, D1 status tracking |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | 5개 생성기 상세 설계 | Sinclair Seo |
