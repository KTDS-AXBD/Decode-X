---
code: AIF-DSGN-recon-x-restructuring-design
title: "Recon-X MSA 재조정 Design Document"
version: 1.0
status: active
category: design
created: 2026-04-07
updated: 2026-04-07
author: AX BD팀
---

# Recon-X MSA 재조정 Design Document

> **Summary**: 플랫폼 SVC 5개 분리 + LLM 라우팅 전환 + 프론트엔드 정리 — Sprint 1 구현 상세 설계
>
> **Project**: AI Foundry → Recon-X
> **Version**: 1.0
> **Author**: Sinclair Seo
> **Date**: 2026-04-07
> **Status**: Draft
> **REQ**: AIF-REQ-030 (P0)
> **Plan**: `docs/01-plan/features/recon-x-restructuring.plan.md`

---

## 1. Overview

### 1.1 Design Goals

Sprint 1의 목표는 res-ai-foundry를 Recon-X(역공학 전담)로 전환하기 위해:
1. 플랫폼 SVC 5개 디렉토리 제거 (svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics)
2. 잔류 7 Workers의 wrangler.toml에서 불필요 바인딩 제거
3. LLM 호출을 service binding → HTTP REST 외부 호출로 전환
4. 프론트엔드에서 포털 성격 페이지 제거
5. packages/types에서 분리 SVC 전용 타입 제거
6. typecheck + lint 0 errors 달성

### 1.2 Constraints

- **데이터 무손실**: D1 데이터베이스 자체는 Cloudflare 계정에 잔류 (바인딩 참조만 제거)
- **롤백 가능**: `v0.6-pre-restructuring` 태그로 복원 가능해야 함
- **프로덕션 배포 없음**: Sprint 1은 코드 정리만, 배포는 Sprint 2에서
- **기존 API 호환**: 잔류 7 Workers의 public API는 변경 없음

---

## 2. Current State Analysis

### 2.1 서비스 의존성 매트릭스

| 잔류 서비스 | SECURITY 의존 | LLM_ROUTER 의존 | NOTIFICATION 의존 | GOVERNANCE 의존 | ANALYTICS 의존 |
|------------|:---:|:---:|:---:|:---:|:---:|
| svc-ingestion | ✅ | — | — | — | — |
| svc-extraction | ✅ | ✅ | — | — | — |
| svc-policy | ✅ | ✅ | ✅ | — | — |
| svc-ontology | ✅ | ✅ | — | — | — |
| svc-skill | ✅ | ✅ | — | — | — |
| svc-queue-router | — | — | ✅ | ✅ | ✅ |
| svc-mcp-server | — | — | — | — | — |

### 2.2 현재 LLM 호출 패턴

```typescript
// 현재: service binding 방식
const response = await env.LLM_ROUTER.fetch("https://svc-llm-router.internal/complete", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Internal-Secret": env.INTERNAL_API_SECRET,
  },
  body: JSON.stringify({
    tier: "sonnet",
    messages: [{ role: "user", content: prompt }],
    callerService: "svc-extraction",
    maxTokens: 2048,
  }),
});
```

### 2.3 현재 RBAC 패턴

```typescript
// svc-security service binding으로 RBAC 검증
const denied = await checkPermission(env, rbacCtx.role, "extraction", "execute");
// → env.SECURITY.fetch("https://svc-security/rbac/check", ...)

// 감사 로그도 svc-security로 전송
ctx.waitUntil(logAudit(env, { userId, action, resource, ... }));
```

---

## 3. Target Architecture

### 3.1 전환 후 구조

```
Recon-X (Sprint 1 완료 후)
├── services/
│   ├── svc-ingestion/          # Stage 1 — D1: db-ingestion, R2, Queue
│   ├── svc-extraction/         # Stage 2 — D1: db-structure, R2
│   ├── svc-policy/             # Stage 3 — D1: db-policy, DO
│   ├── svc-ontology/           # Stage 4 — D1: db-ontology
│   ├── svc-skill/              # Stage 5 — D1: db-skill, R2, KV
│   ├── svc-queue-router/       # Event Bus — Queue consumer
│   └── svc-mcp-server/         # MCP Server — Streamable HTTP
├── apps/app-web/               # Recon-X 전용 UI (~15 pages)
├── packages/
│   ├── types/                  # @ai-foundry/types (경량화)
│   └── utils/                  # @ai-foundry/utils (+ llm-client)
└── infra/migrations/           # 5 DB migrations only
```

### 3.2 LLM 호출 전환 설계

```typescript
// packages/utils/src/llm-client.ts — 새 공통 유틸 (functional API)

export interface LlmClientEnv {
  LLM_ROUTER_URL: string;
  INTERNAL_API_SECRET: string;
}

export async function callLlmRouter(
  env: LlmClientEnv,
  callerService: string,
  tier: LlmTier,
  prompt: string,
  options?: LlmCallOptions,
): Promise<string> { /* ... content string 반환 */ }

export async function callLlmRouterWithMeta(
  env: LlmClientEnv,
  callerService: string,
  tier: LlmTier,
  prompt: string,
  options?: LlmCallOptions,
): Promise<LlmCallResult> { /* ... content + provider + model 반환 */ }

// 각 서비스에서 사용:
// const content = await callLlmRouter(env, "svc-extraction", "sonnet", prompt, { maxTokens: 2048 });
```

### 3.3 보안 레이어 전환 설계

**RBAC 체크**: `packages/utils/src/rbac.ts`에 이미 역할-리소스-액션 매핑이 존재. service binding 대신 inline 호출로 전환.

```typescript
// packages/utils/src/rbac.ts — inline RBAC (types 패키지의 hasPermission 활용)

export function checkPermission(
  role: Role,
  resource: Resource,
  action: Action,
): Response | null {
  // 허용이면 null, 거부면 403 Response 반환 — 서비스 코드에서 바로 사용
  if (!hasPermission(role, resource, action)) {
    return forbidden(`Role '${role}' cannot '${action}' on '${resource}'`);
  }
  return null;
}
```

**감사 로그**: Sprint 1에서는 console.log 기반 구조화 로깅으로 대체. 포털 구축 시 외부 감사 서비스로 전환 예정.

```typescript
// packages/utils/src/audit.ts — 경량 감사 로그

export function logAuditLocal(entry: AuditEntry): void {
  console.log(JSON.stringify({
    type: "audit",
    timestamp: new Date().toISOString(),
    ...entry,
  }));
}
```

### 3.4 Queue Router 전환

svc-queue-router의 이벤트 라우팅에서 3개 서비스(SVC_NOTIFICATION, SVC_ANALYTICS, SVC_GOVERNANCE) 제거:

```
Before: document.uploaded → svc-ingestion + svc-analytics
After:  document.uploaded → svc-ingestion

Before: skill.packaged → svc-notification + svc-governance
After:  skill.packaged → (no dispatch, or self-contained)

Before: ALL events → svc-analytics (shadow dispatch)
After:  ALL events → console.log (structured logging only)
```

---

## 4. Detailed Changes

### 4.1 M1: 플랫폼 SVC 5개 디렉토리 제거

**삭제 대상**:
- `services/svc-llm-router/` (184K)
- `services/svc-security/` (136K)
- `services/svc-governance/` (268K)
- `services/svc-notification/` (72K)
- `services/svc-analytics/` (244K)

**작업**: `rm -rf` 후 pnpm-workspace.yaml에서 참조 제거 확인

### 4.2 M2: 분리 DB 마이그레이션 디렉토리 제거

**삭제 대상**:
- `infra/migrations/db-llm/` (2 files)
- `infra/migrations/db-security/` (1 file)
- `infra/migrations/db-governance/` (4 files)
- `infra/migrations/db-notification/` (1 file)
- `infra/migrations/db-analytics/` (3 files)

**잔류 확인** (5 DB):
- `infra/migrations/db-ingestion/` (3 files) ✅
- `infra/migrations/db-structure/` (8 files) ✅
- `infra/migrations/db-policy/` (2 files) ✅
- `infra/migrations/db-ontology/` (2 files) ✅
- `infra/migrations/db-skill/` (5 files) ✅

### 4.3 M3: 잔류 Workers wrangler.toml 바인딩 정리

각 서비스의 wrangler.toml에서 제거할 바인딩:

| 서비스 | 제거 바인딩 | 추가 vars |
|--------|-----------|----------|
| svc-ingestion | `[[services]] SECURITY` | — |
| svc-extraction | `[[services]] SECURITY`, `[[services]] LLM_ROUTER` | `LLM_ROUTER_URL` |
| svc-policy | `[[services]] SECURITY`, `[[services]] LLM_ROUTER`, `[[services]] NOTIFICATION` | `LLM_ROUTER_URL` |
| svc-ontology | `[[services]] SECURITY`, `[[services]] LLM_ROUTER` | `LLM_ROUTER_URL` |
| svc-skill | `[[services]] SECURITY`, `[[services]] LLM_ROUTER` | `LLM_ROUTER_URL` |
| svc-queue-router | `[[services]] SVC_NOTIFICATION`, `[[services]] SVC_ANALYTICS`, `[[services]] SVC_GOVERNANCE` | — |
| svc-mcp-server | (변경 없음) | — |

**LLM_ROUTER_URL 값**:
- dev: `http://localhost:8706` (svc-llm-router dev port)
- staging: `https://svc-llm-router-staging.ktds-axbd.workers.dev`
- production: `https://svc-llm-router-production.ktds-axbd.workers.dev`

### 4.4 M4: LLM 호출 전환 (service binding → HTTP REST)

**새 파일**: `packages/utils/src/llm-client.ts`

**수정 대상** (각 서비스의 llm/caller.ts):

| 서비스 | 파일 | 변경 내용 |
|--------|------|----------|
| svc-extraction | `src/llm/caller.ts` | `env.LLM_ROUTER.fetch()` → `createLlmClient(env).complete()` |
| svc-policy | `src/llm/caller.ts` | 동일 패턴 전환 |
| svc-ontology | `src/llm/classify-terms.ts` | 동일 패턴 전환 |
| svc-skill | `src/llm/caller.ts` | 동일 패턴 전환 |

**Env 타입 변경** (각 서비스의 env.d.ts 또는 types):
```typescript
// Before:
interface Env {
  LLM_ROUTER: Fetcher;  // service binding
  // ...
}

// After:
interface Env {
  LLM_ROUTER_URL: string;  // HTTP URL
  INTERNAL_API_SECRET: string;
  // ...
}
```

### 4.5 M5: RBAC 전환 (service binding → inline)

**수정 파일**: `packages/utils/src/rbac.ts` — `checkPermissionLocal()` 추가
**새 파일**: `packages/utils/src/audit.ts` — 경량 감사 로그

**각 서비스 수정**:

| 서비스 | 수정 내용 |
|--------|----------|
| svc-ingestion | `checkPermission(env, ...)` → `checkPermissionLocal(...)`, `logAudit(env, ...)` → `logAuditLocal(...)` |
| svc-extraction | 동일 |
| svc-policy | 동일 |
| svc-ontology | 동일 |
| svc-skill | 동일 |

**Env 타입에서 SECURITY 제거**:
```typescript
// Before:
interface Env {
  SECURITY: Fetcher;
  // ...
}

// After: SECURITY 바인딩 삭제
```

### 4.6 M6: packages/types 정리

**제거 대상**:
- `packages/types/src/security.ts` — PII 마스킹 타입 (MaskRequest, MaskResponse 등)
- `packages/types/src/governance.ts` — 프롬프트 레지스트리, 트러스트, 비용 타입

**수정**:
- `packages/types/src/index.ts` — `export * from "./security.js"`, `export * from "./governance.js"` 제거

**보존** (잔류 서비스에서 사용):
- `packages/types/src/llm.ts` — LlmRequest/Response 타입 (llm-client가 사용)
- `packages/types/src/rbac.ts` — RBAC 타입 (inline 체크에서 사용)
- `packages/types/src/events.ts` — PipelineEvent 타입 (queue-router가 사용)

### 4.7 M7: 프론트엔드 정리

**제거 대상 라우트/페이지**:

| 페이지 | 경로 | 제거 이유 |
|--------|------|----------|
| AuditPage | `/audit` | 포털 기능 (감사 로그 조회) |
| Settings > Team | `/settings` 일부 | 포털 기능 (팀 관리) |
| TrustDashboard | `/trust` | svc-governance 의존 (트러스트 평가) |
| AgentConsole | `/agent-console` | 포털 AI 챗 기능 |

**보존 대상**:
- LoginPage (`/login`) — 임시 독립 인증 유지
- DashboardPage (`/`) — 네비게이션 허브 (카드 수 축소)
- UploadPage, SourceUploadPage — 문서 수집
- AnalysisPage, AnalysisReportPage, GapAnalysisPage — 분석
- HITLReviewPage — 정책 검토
- SkillCatalogPage, SkillDetailPage — 스킬 관리
- SpecCatalogPage, SpecDetailPage — 스펙 조회
- OntologyPage — 온톨로지
- FactCheckPage — 팩트체크
- ExportCenterPage — 산출물 내보내기
- BenchmarkPage — 벤치마크
- PocReportPage — PoC 보고서
- GuidePage — 가이드
- ApiConsolePage — API 테스트 (개발용)
- MockupPage — 목업

**App.tsx 수정**: 제거 대상 라우트 삭제, Dashboard 네비게이션 카드 축소

**Sidebar/Layout 수정**: 제거된 페이지 메뉴 항목 삭제

### 4.8 M8: Queue Router 이벤트 라우팅 정리

**svc-queue-router/src/index.ts 수정**:

1. `SVC_NOTIFICATION`, `SVC_ANALYTICS`, `SVC_GOVERNANCE` 서비스 바인딩 참조 제거
2. 이벤트 라우팅에서 해당 서비스 대상 dispatch 제거
3. `policy.candidate_ready` → 기존 svc-notification dispatch 제거 (HITL 알림은 svc-policy 내부 처리로 전환 예정, Sprint 2)
4. ALL events → svc-analytics shadow dispatch 제거 → 구조화 로깅으로 대체

### 4.9 S1: CI/CD 파이프라인 조정

**`.github/workflows/deploy-services.yml`**:
- `ALL_SERVICES` 환경변수에서 5개 플랫폼 서비스 제거
- 잔류: `svc-ingestion, svc-extraction, svc-policy, svc-ontology, svc-skill, svc-queue-router, svc-mcp-server`

**health-check 관련**:
- `scripts/health-check.sh` 또는 관련 워크플로우에서 분리 SVC health URL 제거

---

## 5. Worker 파일 매핑

### Worker A: Infrastructure Cleanup (디렉토리/파일 제거)

| # | 작업 | 대상 |
|---|------|------|
| A1 | 태그 생성 | `git tag v0.6-pre-restructuring` |
| A2 | 플랫폼 SVC 5개 디렉토리 삭제 | `services/svc-{llm-router,security,governance,notification,analytics}/` |
| A3 | 분리 DB 마이그레이션 삭제 | `infra/migrations/db-{llm,security,governance,notification,analytics}/` |
| A4 | packages/types 분리 타입 제거 | `security.ts`, `governance.ts`, index.ts 수정 |

### Worker B: Backend Refactoring (바인딩 + LLM + RBAC)

| # | 작업 | 대상 |
|---|------|------|
| B1 | packages/utils에 llm-client.ts 추가 | `packages/utils/src/llm-client.ts` |
| B2 | packages/utils에 audit.ts 추가 | `packages/utils/src/audit.ts` |
| B3 | packages/utils/src/rbac.ts에 checkPermissionLocal 추가 | |
| B4 | 7개 wrangler.toml 바인딩 정리 | `services/svc-*/wrangler.toml` |
| B5 | svc-extraction LLM 전환 + RBAC inline | `src/llm/caller.ts`, `src/index.ts` |
| B6 | svc-policy LLM 전환 + RBAC inline | `src/llm/caller.ts`, `src/index.ts` |
| B7 | svc-ontology LLM 전환 + RBAC inline | `src/llm/classify-terms.ts`, `src/index.ts` |
| B8 | svc-skill LLM 전환 + RBAC inline | `src/llm/caller.ts`, `src/index.ts` |
| B9 | svc-ingestion RBAC inline (LLM 없음) | `src/index.ts` |
| B10 | svc-queue-router 이벤트 라우팅 정리 | `src/index.ts` |
| B11 | Env 타입에서 SECURITY/LLM_ROUTER 제거 | 각 서비스 env 타입 |

### Worker C: Frontend Cleanup

| # | 작업 | 대상 |
|---|------|------|
| C1 | 포털 페이지 파일 삭제 | `apps/app-web/src/pages/{audit,trust,agent-console}.*` |
| C2 | App.tsx 라우트 정리 | 삭제된 페이지 라우트 제거 |
| C3 | Sidebar/Layout 메뉴 정리 | 삭제된 페이지 메뉴 항목 제거 |
| C4 | Dashboard 네비게이션 카드 축소 | 포털 기능 카드 제거 |

### Worker D: CI/CD + Config

| # | 작업 | 대상 |
|---|------|------|
| D1 | deploy-services.yml 서비스 목록 축소 | `.github/workflows/deploy-services.yml` |
| D2 | health-check 스크립트 정리 | `scripts/health-check.sh` 등 |
| D3 | pnpm-workspace.yaml 정리 | 제거된 서비스 경로 삭제 (필요 시) |
| D4 | packages/utils/src/index.ts 재export 정리 | llm-client, audit export 추가 |

---

## 6. Test Strategy

### 6.1 검증 순서

1. **typecheck**: `pnpm typecheck` — 0 errors
2. **lint**: `pnpm lint` — 0 errors
3. **unit test**: `pnpm test` — 잔류 서비스 테스트 전체 PASS
4. **테스트 파일 정리**: 제거된 서비스의 테스트 파일은 서비스 디렉토리와 함께 자동 삭제

### 6.2 테스트 수정 예상

- svc-extraction 테스트: LLM mock을 service binding → HTTP fetch mock으로 전환
- svc-policy 테스트: 동일
- svc-ontology 테스트: 동일
- svc-skill 테스트: 동일
- svc-ingestion 테스트: SECURITY mock 제거
- svc-queue-router 테스트: 3개 서비스 dispatch 제거

---

## 7. Rollback Strategy

| 시점 | 방법 |
|------|------|
| 구현 중 문제 | `git stash` 또는 `git checkout .` |
| Sprint 완료 후 문제 | `git revert` (커밋 단위) |
| 프로덕션 배포 후 문제 | `v0.6-pre-restructuring` 태그로 복원 + 재배포 |

---

## 8. Dependencies

- **외부**: svc-llm-router가 독립 서비스로 계속 운영되어야 함 (HTTP 엔드포인트 접근 가능)
- **내부**: packages/utils 변경이 모든 서비스에 영향 → 먼저 utils 작업 후 서비스 순차 적용

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-04-07 | Initial design (Sprint 1 scope) | Sinclair Seo |
