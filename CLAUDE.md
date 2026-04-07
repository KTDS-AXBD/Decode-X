# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Recon-X** — 기존 시스템·SI 산출물(소스코드, 요구사항 정의서, API 명세서, 테이블 정의서, 화면 설계서)을 정찰(Reconnaissance)하여 기능 스펙을 역추출하는 엔진. **AI Foundry 플랫폼**의 1단계 수집 서비스.

> **한줄 정의**: 기존 자산을 탐색·분석하여 가치를 추출하는 정찰 엔진

**포지셔닝**: AI Foundry 플랫폼 산하 `*-X` 패밀리 서비스 중 하나. 역공학으로 기존 산출물에서 스펙을 추출하고, Foundry-X(발굴·형상화)로 핸드오프한다. MSA 재조정 계획: `docs/AX-BD-MSA-Restructuring-Plan.md`.

```
Input:  소스코드 + SI 산출물 (요구사항, API 명세, 테이블 정의, 화면 설계서)
Process: 5-Stage 역공학 파이프라인 + Fact Check + Spec Export
Output: Dev Spec Package (API 명세 + 테이블 정의 + Gap 리포트)
         → Foundry-X로 핸드오프 → 발굴·형상화 단계 입력
```

Full product requirements: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`. 정체성 재정의: `docs/AI_Foundry_Identity.md`. Built by KTDS AX BD팀. Pilot domain: 퇴직연금 + 온누리상품권.

> **Status**: Phase 5 완료 (Recon-X MSA 재조정). **7 Workers** + Pages 배포. 플랫폼 SVC 5개 분리 완료 (llm-router/security/governance/notification/analytics → AI Foundry 포털). 2-org 파일럿. LLM HTTP REST 전환 (`packages/utils/src/llm-client.ts`). 상세 수치는 SPEC.md §2 참조.
> 
> **GitHub**: `KTDS-AXBD/Recon-X`. "AI Foundry"는 상위 포털 플랫폼 이름으로 승격.

---

## Commands

```bash
# Install (pnpm 전환 진행 중)
pnpm install

# Dev / Build / Check (via Turborepo)
pnpm dev             # turbo run dev --parallel
pnpm typecheck       # turbo run typecheck
pnpm lint            # turbo run lint
pnpm test            # turbo run test
pnpm build           # turbo run build

# Single service dev
cd services/svc-ingestion && wrangler dev

# Single service test
cd services/svc-ingestion && pnpm test

# Deploy a service
cd services/svc-ingestion && CLOUDFLARE_API_TOKEN="..." wrangler deploy

# Set a secret (use printf, not echo — avoids trailing newline)
printf 'value' | CLOUDFLARE_API_TOKEN="..." wrangler secret put SECRET_NAME
```

---

## Repo Structure

```
Recon-X/
├── packages/
│   ├── types/                 # @ai-foundry/types — shared Zod schemas & TS types
│   └── utils/                 # @ai-foundry/utils — shared utilities + llm-client.ts
├── services/                  # 7 Workers (5-Stage Pipeline)
│   ├── svc-ingestion/         # SVC-01  Document Ingestion (R2, Queue)
│   ├── svc-extraction/        # SVC-02  Structure Extraction (LLM HTTP, Neo4j)
│   ├── svc-policy/            # SVC-03  Policy Inference (LLM HTTP, DO, Queue)
│   ├── svc-ontology/          # SVC-04  Ontology (Neo4j, Workers AI)
│   ├── svc-skill/             # SVC-05  Skill Packaging (LLM HTTP, R2)
│   ├── svc-queue-router/      # Queue Router (pipeline event bus)
│   └── svc-mcp-server/        # SVC-11  MCP Server (Streamable HTTP, Skill tools)
├── apps/app-web/              # Recon-X 전용 Pages SPA (~10 pages)
├── docs/                      # PRD, CHANGELOG, MSA 재조정 설계서
├── scripts/                   # 운영 스크립트
├── infra/migrations/          # D1 migrations (5 DBs: ingestion, structure, policy, ontology, skill)
├── eslint.config.js           # ESLint Flat Config
├── turbo.json                 # Turborepo task config
├── tsconfig.json              # Root TS config (strict)
├── pnpm-workspace.yaml        # pnpm workspaces
└── package.json               # Monorepo root
```

Each service has its own `wrangler.toml` and deploys independently.

---

## Architecture

### 6-Layer System
| Layer | Responsibility |
|---|---|
| **Core Engine** | 5-stage reverse-to-forward pipeline (산출물 → 반제품) |
| **AI Governing** | LLM policy, prompt versioning, cost/data governance, audit |
| **Evaluation** | 3-level trust scoring (individual output → Skill package → system) |
| **DevSecOps** | RBAC, CI/CD, env separation, monitoring, resilience |
| **AI UX** | 21 screens across 5 personas (Cloudflare Pages SPA) |
| **Data & Ontology** | D1 (10 DBs), Neo4j Aura (graph), SKOS/JSON-LD (ontology), R2 (objects) |

### 5-Stage Core Engine Pipeline (역공학 → 반제품)
```
Stage 1: Document Ingestion (문서 구조화)
  Input: PDF, PPT, DOCX, Excel, Image (ERD), 소스코드
  Engine: Unstructured.io (main) + Claude Vision (ERD) + Custom Excel parser + AST parser
  Output: Structured chunks + classification labels

Stage 2: Structure Extraction (구조 추출)
  Engine: Claude Sonnet (complex) / Haiku (standard)
  Output: Process graph + entity relation map + trace matrix

Stage 3: Policy Inference (비즈니스 룰 명시화) ← competitive moat; HITL core
  Engine: Claude Opus (policy gen) + Cloudflare HITL (DO + Queues)
  Output: Policy candidates → HITL review → confirmed policies (condition-criteria-outcome triples)

Stage 4: Ontology Normalization (도메인 용어 통일)
  Engine: SKOS/JSON-LD + Neo4j Aura + Haiku/Workers AI (embedding)
  Output: Domain ontology graph + terminology dictionary

Stage 5: Skill Packaging + 반제품 생성
  Engine: Custom Skill Spec + Claude Sonnet (docs) + Bundler
  Output: .skill.json + MCP adapter + OpenAPI adapter
          + Working Prototype (하네스 + Spec 초안 + 스키마) → Foundry-X 핸드오프
```

### MSA — 7 Cloudflare Workers (Recon-X 전용)
**Domain (Pipeline):**
- `SVC-01` Document Ingestion — Workers, R2, Queue
- `SVC-02` Structure Extraction — LLM HTTP REST, Neo4j
- `SVC-03` Policy Inference — LLM HTTP REST, Durable Objects, Queue
- `SVC-04` Ontology — Neo4j Aura, Workers AI
- `SVC-05` Skill Packaging — LLM HTTP REST, R2

**Infrastructure:**
- Queue Router — pipeline event bus, fan-out to stages
- `SVC-11` MCP Server — Streamable HTTP, Skill tools for Claude Desktop

**분리됨 (AI Foundry 포털로 이관):**
- ~~SVC-06 LLM Router~~ → `packages/utils/src/llm-client.ts` HTTP REST로 대체
- ~~SVC-07 Security~~ → `packages/utils/src/rbac.ts` inline RBAC로 대체
- ~~SVC-08 Governance~~ / ~~SVC-09 Notification~~ / ~~SVC-10 Analytics~~ → 포털 서비스로 이관

### Infrastructure (Cloudflare-native)
- **Compute**: Workers (7 SVCs) + Durable Objects (HITL session state)
- **Storage**: D1 (5 DBs: ingestion, structure, policy, ontology, skill) + R2 (documents, Skill packages) + KV (cache)
- **Async**: Cloudflare Queues (pipeline event bus: 6 event types)
- **Frontend**: Cloudflare Pages (SPA, ~10 Recon-X 전용 screens)
- **LLM gateway**: Cloudflare AI Gateway (logging, caching, rate limiting for all LLM calls — Anthropic/OpenAI/Google)
- **Auth**: Cloudflare Access (Zero Trust, SSO with KT DS IdP)
- **Graph DB**: Neo4j Aura (Free → Pro as needed)

### LLM Tier Routing (via llm-client.ts HTTP REST → 외부 svc-llm-router)
- **Tier 1** (Opus): complexity score > 0.7 — Stage 3 policy inference
- **Tier 2** (Sonnet/Haiku): complexity 0.4–0.7 / < 0.4 — Stages 2, 4, 5
- **Tier 3** (Workers AI): embeddings, classification, similarity
- **호출 방식**: `callLlm()` from `@ai-foundry/utils/llm-client` — HTTP REST to external LLM Router Worker

### Skill Package Output Format
- File: `.skill.json` (JSON Schema Draft 2020-12), stored in R2 `skill-packages/`
- Core fields: `skillId`, `metadata`, `policies[]` (condition-criteria-outcome triples), `trust`, `provenance`, `ontologyRef`
- Policy code format: `POL-{DOMAIN}-{TYPE}-{SEQ}` (e.g., `POL-PENSION-WD-HOUSING-001`)
- Adapters are generated projections from the core spec (MCP in Phase 3, OpenAPI in Phase 4)

---

## Key Design Decisions
| ID | Decision |
|---|---|
| T-1 | Hybrid document parsing: Unstructured.io + Claude Vision + custom Excel parser |
| T-2 | Claude-centric tiered LLM: Opus/Sonnet/Haiku + Workers AI (60–70% cost reduction) |
| T-3 | SKOS/JSON-LD ontology schema + Neo4j Aura execution layer |
| T-4 | Custom AI Foundry Skill Spec as single source of truth; MCP/OpenAPI are adapters |
| T-5 | HITL workflow via Cloudflare native primitives (Workers + DO + Queues + D1) |
| T-6 | Full Cloudflare stack + Anthropic API + Neo4j Aura |
| T-7 | Reverse-to-Forward Bridge: 5-Stage 역공학 출력을 Working Prototype(반제품)으로 확장, Foundry-X 핸드오프 |
| T-8 | Foundry-X 제품군 통합: MCP 프로토콜 + Working Prototype 포맷이 연결 인터페이스 |

---

## RBAC Roles
5 roles: `Analyst` (upload/run), `Reviewer` (HITL policy review), `Developer` (Skill integration), `Client` (read-only), `Executive` (dashboards). Details in PRD §18.

## Development Phases
Phase 1 ✅ → 2 ✅ → 3 ✅ → 4 ✅ → **5 ✅** (Recon-X MSA 재조정 완료). 각 Phase 상세는 `SPEC.md` 참조.

---

## Data & Ontology Architecture
- **5 D1 databases** — pipeline SVCs only (`db-ingestion`, `db-structure`, `db-policy`, `db-ontology`, `db-skill`). ~~db-llm, db-security, db-governance, db-notification, db-analytics~~ 는 AI Foundry 포털로 이관. Cross-DB references use ID-based loose coupling.
- **Neo4j schema** — 12 node types (Domain, Process, Policy, Entity, Attribute, Screen, API, Document, Term, Skill, Organization, Reviewer) and 20 relationship types.
- **SKOS/JSON-LD** — manages cross-organization term mappings; each `Term` node in Neo4j maps 1:1 to a SKOS Concept.

---

## Security & Data Governance
- All documents are masked before any external API call (PII → tokens, stored encrypted in D1)
- Data classification: Confidential (no LLM) → Internal (masked only) → Public (all tiers)
- Audit logs: 5-year retention (financial regulation compliance)
- Prompt Registry: every prompt versioned (semver), regression-tested against Golden Test Set before deploy, Blue-Green rollout (10% → 50% → 100%)

---

## Environments
| Resource | Dev | Staging | Production |
|---|---|---|---|
| Workers | `wrangler dev` local | Staging deployment | Production |
| D1 | Local SQLite | Staging DB | Encrypted prod DB |
| LLM | Haiku only | Sonnet | Full tier routing |
| Data | Synthetic only | Anonymized samples | Real (masked) |

---

## Code Patterns & Gotchas

### TypeScript Strictness
`tsconfig.base.json`에 아래 옵션이 활성화되어 있다. 코드 생성 시 반드시 준수:
- `exactOptionalPropertyTypes: true` — optional prop에 `undefined`를 명시적으로 할당하면 에러. `delete obj.prop` 사용하거나 타입에 `| undefined`를 명시
- `noUncheckedIndexedAccess: true` — `array[i]`와 `record[key]`가 `T | undefined`를 반환. 반드시 null check 필요
- `noImplicitOverride: true` — 상속 메서드 재정의 시 `override` 키워드 필수
- `noPropertyAccessFromIndexSignature: true` — index signature 타입에 dot notation 접근 불가. `obj["key"]` 사용

### Inter-Service Communication
- **인증**: 모든 내부 호출에 `X-Internal-Secret` 헤더 필수 (값: `INTERNAL_API_SECRET` secret)
- **예외**: `/health` 엔드포인트는 인증 없이 접근 가능
- **LLM 호출**: `packages/utils/src/llm-client.ts`의 `callLlm()` — 외부 svc-llm-router에 HTTP REST. ~~service binding 아님~~
- **LlmRequestSchema 필수 필드**: `tier`, `messages[]`, `callerService`
- **RBAC**: `packages/utils/src/rbac.ts`의 `checkPermission()` — inline 호출. ~~svc-security 경유 아님~~

### Shared Packages
- `@ai-foundry/types`, `@ai-foundry/utils`는 raw `.ts` 파일을 export (빌드 스텝 없음)
- Wrangler의 esbuild가 번들링 시 직접 처리
- import 예: `import { MaskRequest } from '@ai-foundry/types'`

### Foundry-X Integration
- **MCP Streamable HTTP**: `Accept: application/json, text/event-stream` 헤더 필수
- **Skill → MCP 엔드포인트**: `POST /mcp/:skillId` — skill별 독립 MCP 서버
- **Bundled skills R2 이슈**: rebundle로 생성된 bundle 파일은 R2에 미업로드 (개별 superseded skills만 R2 존재)

### Migration Paths
- **기본 경로**: `infra/migrations/db-{name}/` (5 DBs: ingestion, structure, policy, ontology, skill)
- 적용: `cd services/svc-xxx && npx wrangler d1 execute db-{name} --file=../../infra/migrations/db-{name}/NNNN_desc.sql`
- svc-skill은 `services/svc-skill/migrations/`에도 로컬 마이그레이션 존재
- ~~db-llm, db-security, db-governance, db-notification, db-analytics~~ migrations 삭제됨 (Phase 5)

### Worker Patterns
- 비동기 D1 쓰기는 `ctx.waitUntil()`로 non-blocking 처리
- 각 서비스마다 독립 D1 DB (cross-DB 참조는 ID 기반 loose coupling)

### Testing Patterns
- **Framework**: Vitest (`pnpm test` via Turborepo, 단일 서비스: `cd services/svc-xxx && pnpm test`)
- **D1 Mock**: 각 서비스 테스트에서 `createTestD1()` 또는 인메모리 SQLite mock 사용
- **Error Classes**: `AppError` → `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `UpstreamError`, `RateLimitError`
- **Response Helpers**: `ok()`, `created()`, `noContent()`, `err()`, `notFound()`, `unauthorized()`, `forbidden()`, `badRequest()`
- **Route Organization**: 각 서비스 `src/routes/` 하위에 핸들러 함수 분리 (e.g., `handleUpload`, `handleGetDocument`)

---

## IMPORTANT: 워크플로우 우선순위 (SDD-primary)

SPEC.md 기반 SDD(Spec-Driven Development)가 이 프로젝트의 **주 워크플로우**이다.

### 세션 시작/종료
- 세션 시작: `/ax:session-start [작업]` (MEMORY.md 자동 로딩 → SPEC.md 보충 읽기)
- 세션 종료: `/ax:session-end [메모]` (Git 커밋 + SPEC.md §5 지표 + MEMORY.md 컨텍스트 + CHANGELOG.md 세션 기록 + git push)
- 세션 히스토리: `docs/CHANGELOG.md` (SPEC.md에 세션 로그 누적 금지)

### Validation Discipline
코드 변경 후 아래 검증을 기본 수행:
```bash
pnpm typecheck && pnpm lint
```

### 커밋 & 배포
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `chore:`
- `main` 단일 브랜치 운영, 직접 push
- 배포: `/ax:session-end`에 git push 포함. `/ax:code-deploy --preview`는 프리뷰 전용

### 스킬

#### ax 플러그인 (user scope, 범용 — 22 skills)
| 카테고리 | 스킬 | 용도 |
|----------|------|------|
| **세션** | `/ax:session-start` | 프로젝트 컨텍스트 복원 (MEMORY → SPEC 보충 읽기) |
| | `/ax:daily-check` | 환경 점검 + SPEC.md 수치 정합성 자동 보정 |
| | `/ax:session-end` | 수치 동기화 + 코드 커밋 + 문서 갱신 + git push + CI/CD 배포 |
| **코드** | `/ax:code-verify` | lint + typecheck + test 통합 실행, 실패 시 자동 수정 |
| | `/ax:e2e-audit` | E2E 실행 + 감사 + 커버리지 매트릭스 |
| | `/ax:code-deploy` | 프리뷰 배포 또는 명시적 재배포 |
| **Git** | `/ax:git-sync` | 멀티 환경 프로젝트 동기화 (push/pull/stash/config) |
| | `/ax:git-team` | tmux in-window split Agent Team 병렬 수행 |
| | `/ax:sprint` | Sprint 계획 + worktree 오케스트레이션 |
| | `/ax:sprint-autopilot` | Sprint WT 전체 자동화 — Plan→Design→Implement→Analyze→Report |
| | `/ax:sprint-pipeline` | 복수 Sprint 의존성 분석→배치 병렬 실행→자동 merge |
| **거버넌스** | `/ax:gov-doc` | 문서 관리 (GOV-001 기반) |
| | `/ax:gov-version` | 버전 관리 — 상태 확인, 범프, 태그 (GOV-002) |
| | `/ax:gov-risk` | 리스크/기술부채 등록, 조회, 해소 (GOV-005) |
| | `/ax:gov-retro` | 마일스톤 회고 — 지표 수집 + CHANGELOG/MEMORY 반영 |
| | `/ax:gov-standards` | 15개 표준 적용 상태 점검 및 관리 |
| **요구사항** | `/ax:req-manage` | 요구사항 등록/분류/상태변경/SPEC 동기화 |
| | `/ax:req-integrity` | SPEC ↔ GitHub Issues ↔ Execution Plan 3-way 정합성 검증 |
| | `/ax:req-interview` | 요구사항 인터뷰 → PRD 작성 → 외부 AI 다중 검토 → 착수 판단 |
| **인프라** | `/ax:infra-selfcheck` | ax plugin 구조 자율점검 (8개 항목) |
| | `/ax:infra-statusline` | tmux pane StatusLine 요구사항 표시 관리 |
| | `/ax:help` | ax 스킬셋 사용 가이드 — 전체 목록 + 실전 사례 |

#### 프로젝트 스킬 (res-ai-foundry 전용)
| 스킬 | 용도 |
|------|------|
| `/deploy` | Cloudflare Workers 배포 (CI/CD + DB migration 체크 + health check) |
| `/sync` | SPEC.md ↔ GitHub 이슈 상태 동기화 |
| `/db-migrate` | D1 마이그레이션 생성→적용→검증 |
| `/secrets-check` | 전 서비스 wrangler secrets 상태 환경별 검증 |
| `/e2e-pipeline` | 5-Stage 파이프라인 E2E 테스트 실행+결과 요약 |
| `/ralph` | 자율 태스크 루프 (PRD 추출 → 반복 구현 → 품질 검증 → 커밋) |

### 에이전트
- `security-reviewer`
- `migration-checker`
- `status-transition-reviewer`
- `wrangler-config-reviewer` — 7개 서비스 wrangler.toml 일관성 검증

### Agent Teams
- agent team 작업 시 항상 `/ax:git-team` 스킬 사용 (tmux split pane)

### MCP Servers
- `.mcp.json` (repo root, git 커밋) — 팀 공유 MCP: context7 (라이브러리 문서 조회)
- `settings.local.json` — 개인 MCP: Cloudflare Developer Platform (API 토큰 필요)

### Hooks (자동 실행)
- **PreToolUse (Edit|Write)**: `.env`/`.dev.vars` 편집 차단 + 시크릿 하드코딩 차단
- **PostToolUse (Edit|Write)**: typecheck+lint 자동 실행 + migration 파일 변경 알림

### 상태 추적 (3-Tier)
- **Tier 1**: CLAUDE.md + `MEMORY.md` (자동 로딩) → **Tier 2**: SPEC.md (세션 시작 시 Read) → **Tier 3**: docs/CHANGELOG.md (검색 시에만)

### Project Management Rules
1. SPEC.md를 SSOT로 유지
2. 변경 이력은 CHANGELOG.md에 기록
3. 작은 단위 커밋 + 명확한 커밋 메시지(Conventional Commits)
4. 보안/권한/감사 설계를 초기에 반영

### 요구사항 관리 (GOV-003)
> 이 프로젝트의 오버라이드. 글로벌 표준: `~/.claude/standards/requirements-governance.md`

- **ID**: `AIF-REQ-{NNN}` (일련번호, 결번 허용)
- **분류**: [유형/도메인] — 유형: Feature/Bug/Improvement/Chore, 도메인: Pipeline/UX/Infra/Governance/Data/Integration
- **우선순위**: P0(즉시) / P1(이번 마일스톤) / P2(다음) / P3(백로그)
- **상태**: OPEN → TRIAGED → PLANNED → IN_PROGRESS → DONE / REJECTED
- **등록처**: SPEC.md §7 "Requirements Backlog"
- 새 작업/버그 발견 시 SPEC.md §7에 등록 → TRIAGED 후 Sprint에 배치

