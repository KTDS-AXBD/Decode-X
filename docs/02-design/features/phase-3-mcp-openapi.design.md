# Phase 3 — MCP/OpenAPI 실사용 검증 Design Document

> **Summary**: Skill evaluate 엔드포인트 + MCP Server Worker + Skill Marketplace의 상세 기술 설계
>
> **Project**: RES AI Foundry
> **Version**: v0.8 (Phase 3)
> **Author**: Sinclair Seo
> **Date**: 2026-03-03
> **Status**: Draft
> **Planning Doc**: [phase-3-mcp-openapi.plan.md](../01-plan/features/phase-3-mcp-openapi.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. `POST /skills/:id/evaluate` — 정책의 condition-criteria-outcome을 LLM에 전달하여 평가 결과 반환
2. 멀티 프로바이더 벤치마크 — 동일 입력에 대해 Anthropic/OpenAI/Google 3사 결과 비교
3. MCP Server Worker — Claude Desktop에서 직접 연결 가능한 독립 MCP protocol Worker
4. Skill Marketplace — 검색/필터/미리보기/다운로드 프론트엔드 UX

### 1.2 Design Principles

- **Projection 패턴 유지**: R2 `.skill.json`을 SSOT로, evaluate/MCP/OpenAPI는 모두 on-the-fly 변환
- **기존 인프라 활용**: svc-llm-router 경유 (tier routing + fallback + cost tracking)
- **최소 스키마 변경**: D1 테이블 1개 추가 (skill_evaluations), 기존 테이블 변경 없음
- **하위 호환성**: 기존 888+ tests 무결성 유지

---

## 2. Architecture

### 2.1 Sprint 1 — Evaluate 엔드포인트 데이터 플로우

```
Client (Claude Desktop / Swagger UI / curl)
     │
     ▼
POST /skills/:id/evaluate
     │
     ├─ 1. D1 lookup: skills.skill_id → r2_key
     ├─ 2. R2 fetch: skill-packages/{skillId}.skill.json
     ├─ 3. Policy 선택: policyCode 매칭 (또는 전체)
     ├─ 4. Prompt 조립: system(정책 규칙) + user(context + parameters)
     ├─ 5. svc-llm-router 호출: POST /complete (tier: sonnet)
     ├─ 6. 응답 파싱: { result, confidence, reasoning, policyCode }
     ├─ 7. D1 기록: skill_evaluations (ctx.waitUntil, non-blocking)
     └─ 8. Response 반환
```

### 2.2 Sprint 3 — MCP Server Worker 아키텍처

```
Claude Desktop
     │  stdio / SSE (Streamable HTTP)
     ▼
svc-mcp-server (NEW Cloudflare Worker)
     │
     ├─ POST /mcp  (Streamable HTTP Transport)
     │   ├─ initialize → { protocolVersion, capabilities, serverInfo }
     │   ├─ tools/list → svc-skill GET /skills/:id/mcp → tool 목록
     │   └─ tools/call → svc-skill POST /skills/:id/evaluate → 정책 평가
     │
     ├─ Service Bindings:
     │   ├─ SVC_SKILL (fetch MCP spec + evaluate)
     │   └─ SECURITY (audit logging)
     │
     └─ Auth: Bearer token 또는 MCP auth negotiation
```

### 2.3 Sprint 2 — Skill Marketplace 컴포넌트 구조

```
app-web
├── /skill-catalog (ENHANCE)
│   ├── SkillSearchBar        — 키워드 + 필터 드롭다운
│   ├── SkillFilterSidebar    — domain, trust, status 체크박스
│   ├── SkillCardGrid         — 카드 뷰 (3열 반응형)
│   └── SkillPagination       — offset/limit 기반
│
├── /skill-detail/:id (ENHANCE)
│   ├── SkillHeader           — 메타데이터 + 신뢰도 배지
│   ├── PolicyTable           — 정책 목록 (condition-criteria-outcome)
│   ├── AdapterPreview        — MCP/OpenAPI JSON 미리보기 탭
│   ├── AdapterDownload       — 다운로드 버튼 (core/mcp/openapi)
│   └── EvaluatePlayground    — 정책 선택 → context 입력 → evaluate 호출
│
└── API Client (skill.ts 확장)
    ├── searchSkills(params)
    ├── evaluateSkill(id, body)
    └── fetchSkillEvaluations(id)
```

### 2.4 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| evaluate route | svc-llm-router (service binding) | LLM 호출 (tier routing + fallback) |
| evaluate route | R2_SKILL_PACKAGES | .skill.json 정책 조회 |
| evaluate route | DB_SKILL | 평가 결과 기록 |
| svc-mcp-server | SVC_SKILL (service binding) | MCP spec + evaluate 위임 |
| Skill Marketplace | svc-skill API | 검색/상세/다운로드/evaluate |

---

## 3. Data Model

### 3.1 신규 테이블: skill_evaluations

```sql
-- D1 Migration: db-skill/0002_evaluations.sql
CREATE TABLE IF NOT EXISTS skill_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  skill_id      TEXT NOT NULL,
  policy_code   TEXT NOT NULL,
  provider      TEXT NOT NULL,         -- 'anthropic' | 'openai' | 'google' | 'workers-ai'
  model         TEXT NOT NULL,         -- e.g. 'claude-sonnet-20250514', 'gpt-4o'
  input_context TEXT NOT NULL,         -- 사용자가 제공한 context
  input_params  TEXT,                  -- JSON string, 추가 파라미터
  result        TEXT NOT NULL,         -- LLM 평가 결과
  confidence    REAL NOT NULL,         -- 0.0–1.0
  reasoning     TEXT,                  -- 평가 근거
  latency_ms    INTEGER NOT NULL,      -- 응답 시간 (ms)
  token_count   INTEGER,              -- 사용 토큰 수
  evaluated_by  TEXT NOT NULL DEFAULT 'anonymous',
  evaluated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE INDEX idx_eval_skill ON skill_evaluations(skill_id);
CREATE INDEX idx_eval_provider ON skill_evaluations(provider);
CREATE INDEX idx_eval_policy ON skill_evaluations(policy_code);
```

### 3.2 기존 테이블 변경: 없음

기존 `skills`, `skill_downloads` 테이블은 변경하지 않는다.

---

## 4. API Specification

### 4.1 Endpoint List (Phase 3 신규/변경)

| Method | Path | Description | Auth | Sprint |
|--------|------|-------------|------|--------|
| POST | `/skills/:id/evaluate` | 정책 평가 요청 | RBAC (skill:evaluate) | 1 |
| GET | `/skills/:id/evaluations` | 평가 이력 조회 | RBAC (skill:read) | 1 |
| GET | `/skills/search` | 카탈로그 검색 | RBAC (skill:read) | 2 |
| POST | `/mcp` | MCP protocol 엔트리 (svc-mcp-server) | Bearer / MCP auth | 3 |

### 4.2 POST /skills/:id/evaluate

**Request:**
```typescript
// EvaluateRequestSchema (Zod)
{
  policyCode: string;              // required: 평가할 정책 코드 (e.g. "POL-PENSION-WD-001")
  context: string;                 // required: 적용 대상의 상황 설명
  parameters?: Record<string, unknown>;  // optional: 추가 파라미터
  provider?: 'anthropic' | 'openai' | 'google';  // optional: 특정 프로바이더 지정
  benchmark?: boolean;             // optional: true이면 3사 모두 호출하여 비교
}
```

**Response (200 OK):**
```typescript
// 단일 프로바이더 응답
{
  success: true,
  data: {
    evaluationId: string;
    skillId: string;
    policyCode: string;
    provider: string;
    model: string;
    result: string;                // 정책 평가 결과 텍스트
    confidence: number;            // 0.0–1.0
    reasoning: string;             // 평가 근거 설명
    latencyMs: number;
  }
}

// benchmark=true 일 때
{
  success: true,
  data: {
    benchmark: true,
    results: [
      { provider: 'anthropic', model: '...', result: '...', confidence: 0.92, reasoning: '...', latencyMs: 1200 },
      { provider: 'openai',    model: '...', result: '...', confidence: 0.88, reasoning: '...', latencyMs: 800 },
      { provider: 'google',    model: '...', result: '...', confidence: 0.85, reasoning: '...', latencyMs: 950 }
    ],
    consensus: {
      agreementRate: number;       // 결과 일치율 (0.0–1.0)
      summary: string;             // 합의 요약
    }
  }
}
```

**Error Responses:**
- `400`: policyCode가 skill에 존재하지 않음, context 누락
- `404`: skillId 또는 R2 파일 없음
- `429`: LLM rate limit (fallback 실패 시)
- `500`: LLM 호출 오류

### 4.3 GET /skills/:id/evaluations

**Query Parameters:**
- `policyCode` (optional): 특정 정책 필터
- `provider` (optional): 특정 프로바이더 필터
- `limit` (optional): 1–100, default 20
- `offset` (optional): default 0

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    evaluations: EvaluationRow[],
    total: number,
    limit: number,
    offset: number
  }
}
```

### 4.4 GET /skills/search

**Query Parameters:**
- `q` (optional): 키워드 검색 (domain, subdomain, tags, author)
- `domain` (optional): 정확 매치
- `trustLevel` (optional): 'unreviewed' | 'reviewed' | 'validated'
- `status` (optional): 'draft' | 'published' | 'archived'
- `minPolicies` (optional): 최소 정책 수
- `sortBy` (optional): 'created_at' | 'trust_score' | 'policy_count' (default: 'created_at')
- `order` (optional): 'asc' | 'desc' (default: 'desc')
- `limit` (optional): 1–100, default 20
- `offset` (optional): default 0

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    skills: SkillRow[],
    total: number,              // 전체 결과 수 (COUNT)
    limit: number,
    offset: number,
    facets: {                   // 필터 카운트 (UI 사이드바용)
      domains: { [domain: string]: number },
      trustLevels: { [level: string]: number }
    }
  }
}
```

**D1 쿼리 전략:**
```sql
-- 키워드 검색 (LIKE, 171건 규모에선 충분)
SELECT *, COUNT(*) OVER() as total_count
FROM skills
WHERE (?1 IS NULL OR domain LIKE '%' || ?1 || '%'
       OR subdomain LIKE '%' || ?1 || '%'
       OR tags LIKE '%' || ?1 || '%'
       OR author LIKE '%' || ?1 || '%')
  AND (?2 IS NULL OR domain = ?2)
  AND (?3 IS NULL OR trust_level = ?3)
  AND (?4 IS NULL OR status = ?4)
  AND (?5 IS NULL OR policy_count >= ?5)
ORDER BY ?6 DESC
LIMIT ?7 OFFSET ?8
```

### 4.5 MCP Server Protocol (svc-mcp-server)

**Transport**: Streamable HTTP (2025-03-26 spec) — 단일 POST /mcp 엔드포인트

**Supported Methods:**

| Method | Description |
|--------|-------------|
| `initialize` | 프로토콜 버전 + capabilities 교환 |
| `tools/list` | skill의 policy 목록을 MCP tool로 반환 |
| `tools/call` | 특정 policy의 evaluate 실행 후 결과 반환 |

**initialize Response:**
```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": {
    "tools": { "listChanged": false }
  },
  "serverInfo": {
    "name": "ai-foundry-skill-server",
    "version": "1.0.0"
  }
}
```

**tools/call Flow:**
```
Claude Desktop → tools/call(name: "pol-pension-wd-001", arguments: { context: "..." })
     │
     ▼
svc-mcp-server
     ├─ Parse tool name → policyCode
     ├─ Map to skillId (config 기반 또는 단일 skill 모드)
     ├─ Delegate: svc-skill POST /skills/{skillId}/evaluate
     │     body: { policyCode, context, parameters }
     ├─ Format MCP response: { content: [{ type: "text", text: result }] }
     └─ Return
```

---

## 5. Evaluate 프롬프트 설계

### 5.1 System Prompt

```
You are an AI policy evaluator for the "{domain}" domain.
You evaluate situations against predefined policies extracted from official documents.

## Policy: {policyCode}
- **Title**: {title}
- **Condition (IF)**: {condition}
- **Criteria**: {criteria}
- **Outcome (THEN)**: {outcome}

## Instructions
1. Analyze the given context against the policy's condition and criteria.
2. Determine if the policy applies and what the outcome should be.
3. Provide:
   - **result**: A clear determination (APPLICABLE / NOT_APPLICABLE / PARTIALLY_APPLICABLE)
     followed by a concise explanation in Korean.
   - **confidence**: A score between 0.0 and 1.0 indicating your certainty.
   - **reasoning**: Step-by-step reasoning in Korean explaining how you arrived at the result.

Respond in JSON format:
{
  "result": "string",
  "confidence": number,
  "reasoning": "string"
}
```

### 5.2 User Prompt

```
## Context
{context}

## Additional Parameters
{JSON.stringify(parameters) or "없음"}

Evaluate this context against the policy above.
```

### 5.3 LLM Tier 선택

| 시나리오 | Tier | 근거 |
|----------|------|------|
| 단일 evaluate (기본) | Sonnet | 정책 평가는 complexity 0.5~0.7 범위 |
| benchmark 모드 | 각 프로바이더 Sonnet급 | Anthropic Sonnet, OpenAI GPT-4o, Google Gemini Pro |
| 복잡한 정책 (condition 길이 > 500자) | Opus | 고복잡도 정책은 Tier 1 |

---

## 6. 변경 대상 파일 목록

### Sprint 1 — Evaluate 엔드포인트

| # | File | Service | Change Type | FR |
|---|------|---------|-------------|-----|
| 1 | `packages/types/src/skill.ts` | shared | EvaluateRequest/Response 타입 추가 | FR-03 |
| 2 | `services/svc-skill/src/routes/evaluate.ts` | SVC-05 | **NEW** evaluate 라우트 핸들러 | FR-03 |
| 3 | `services/svc-skill/src/routes/evaluations.ts` | SVC-05 | **NEW** 평가 이력 조회 | FR-03 |
| 4 | `services/svc-skill/src/index.ts` | SVC-05 | 라우트 등록 추가 | FR-03 |
| 5 | `services/svc-skill/src/prompts/evaluate.ts` | SVC-05 | **NEW** 프롬프트 빌더 | FR-03 |
| 6 | `infra/migrations/db-skill/0002_evaluations.sql` | infra | **NEW** skill_evaluations 테이블 | FR-03 |
| 7 | `services/svc-skill/tests/evaluate.test.ts` | SVC-05 | **NEW** 유닛 테스트 | FR-03 |

### Sprint 2 — Skill Marketplace

| # | File | Service | Change Type | FR |
|---|------|---------|-------------|-----|
| 8 | `services/svc-skill/src/routes/search.ts` | SVC-05 | **NEW** 검색 라우트 | FR-04 |
| 9 | `apps/app-web/src/api/skill.ts` | app-web | API 함수 확장 | FR-04~06 |
| 10 | `apps/app-web/src/pages/skill-catalog.tsx` | app-web | 카드 뷰 + 필터 사이드바 리팩토링 | FR-06 |
| 11 | `apps/app-web/src/pages/skill-detail.tsx` | app-web | **NEW** 상세 페이지 (미리보기+평가) | FR-05 |
| 12 | `apps/app-web/src/components/skill/` | app-web | **NEW** 컴포넌트 디렉토리 | FR-05~06 |

### Sprint 3 — MCP Server Worker + 버전관리

| # | File | Service | Change Type | FR |
|---|------|---------|-------------|-----|
| 13 | `services/svc-mcp-server/` | **NEW** | 독립 MCP Worker 전체 | FR-08 |
| 14 | `services/svc-mcp-server/wrangler.toml` | NEW | Worker 설정 + service binding | FR-08 |
| 15 | `services/svc-mcp-server/src/index.ts` | NEW | MCP protocol 핸들러 | FR-08 |
| 16 | `services/svc-mcp-server/src/handlers/` | NEW | initialize, tools/list, tools/call | FR-08 |
| 17 | `services/svc-skill/src/routes/skill.ts` | SVC-05 | version 관련 라우트 추가 | FR-07 |

---

## 7. UI/UX Design

### 7.1 Skill Detail 페이지 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Catalog                                       │
├─────────────────────────────────────────────────────────┤
│ SkillHeader                                             │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🏷 퇴직연금 / 중도인출       [validated] ★ 0.92     │ │
│ │ v1.0.0 · 15 policies · by ai-foundry-pipeline      │ │
│ │ Tags: #퇴직연금 #인출 #주택구입                       │ │
│ │ [📥 .skill.json] [📥 MCP] [📥 OpenAPI]              │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ [Policies] [MCP Preview] [OpenAPI Preview] [Evaluate]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Tab: Policies                                           │
│ ┌───────────────────────────────────────────────────┐   │
│ │ POL-PENSION-WD-001 · 주택구입 중도인출            │   │
│ │ IF: 가입자가 무주택자이며... │ THEN: 인출 가능   │   │
│ │ Trust: ★ 0.95 [validated]                         │   │
│ ├───────────────────────────────────────────────────┤   │
│ │ POL-PENSION-WD-002 · 의료비 중도인출              │   │
│ │ ...                                                │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ Tab: Evaluate (Playground)                              │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Policy: [POL-PENSION-WD-001 ▼]                    │   │
│ │                                                   │   │
│ │ Context:                                          │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ 가입자 A는 무주택자이며, DC형 퇴직연금에    │   │   │
│ │ │ 5년간 가입하였고, 주택구입 목적으로 중도인  │   │   │
│ │ │ 출을 신청하였습니다...                       │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │                                                   │   │
│ │ ☐ Benchmark Mode (3 providers)                    │   │
│ │                                                   │   │
│ │ [🚀 Evaluate]                                     │   │
│ │                                                   │   │
│ │ Result:                                           │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ ✅ APPLICABLE (confidence: 0.92)             │   │   │
│ │ │ 가입자 A는 무주택자 조건을 충족하며...       │   │   │
│ │ │ Reasoning: 1) 무주택 여부 확인...            │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Skill Catalog 카드 뷰

```
┌────────────────────────────────────────────────────────────┐
│ Skill Marketplace                                          │
│ ┌─────────────────────────────────────────────────┐        │
│ │ 🔍 Search skills...           [Domain ▼] [Trust ▼]      │
│ └─────────────────────────────────────────────────┘        │
│                                                            │
│ 171 skills found                          Sort: Recent ▼   │
│                                                            │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│ │ 🏷 퇴직연금    │ │ 🏷 퇴직연금    │ │ 🏷 퇴직연금    │        │
│ │   중도인출     │ │   수급자격     │ │   이전/해지    │        │
│ │              │ │              │ │              │        │
│ │ 15 policies  │ │ 8 policies   │ │ 12 policies  │        │
│ │ ★ 0.92       │ │ ★ 0.87       │ │ ★ 0.90       │        │
│ │ [validated]  │ │ [reviewed]   │ │ [validated]  │        │
│ │              │ │              │ │              │        │
│ │ [View →]     │ │ [View →]     │ │ [View →]     │        │
│ └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                            │
│ [1] [2] [3] ... [9]                                        │
└────────────────────────────────────────────────────────────┘
```

---

## 8. Security Considerations

- [x] evaluate 호출: RBAC `skill:evaluate` 권한 필수 (기존 RBAC 미들웨어 재사용)
- [x] LLM 호출: svc-llm-router 경유 → AI Gateway rate limiting 적용
- [x] 입력 검증: Zod safeParse (context 길이 제한: max 10,000자)
- [x] MCP Server: Bearer token 인증 (claude_desktop_config.json에 설정)
- [x] 평가 결과 기록: evaluated_by 필드로 사용자 추적 (RBAC context)
- [ ] evaluate context에 PII 포함 가능성 → svc-security /mask 선행 호출 고려 (Phase 4)

---

## 9. Test Plan

### 9.1 Test Scope

| Type | Target | Tool | Sprint |
|------|--------|------|--------|
| Unit Test | evaluate 프롬프트 빌더, 응답 파서 | Vitest | 1 |
| Unit Test | search 쿼리 빌더, facet 계산 | Vitest | 2 |
| Handler Test | POST /evaluate, GET /evaluations | Vitest + mock | 1 |
| Handler Test | GET /search | Vitest + mock | 2 |
| E2E Test | Claude Desktop → MCP → evaluate | Manual + script | 3 |
| E2E Test | Swagger UI → OpenAPI → evaluate | Manual + script | 1 |

### 9.2 Test Cases (Key)

**Sprint 1:**
- [ ] evaluate 성공: 유효한 policyCode + context → 200 + result
- [ ] evaluate 실패: 존재하지 않는 policyCode → 400
- [ ] evaluate 실패: skill 없음 → 404
- [ ] benchmark 모드: 3사 결과 반환 + consensus 계산
- [ ] LLM 실패: fallback 동작 확인 (Anthropic → OpenAI)
- [ ] 평가 이력 조회: provider/policyCode 필터 동작

**Sprint 2:**
- [ ] 키워드 검색: domain, tags, author 매치
- [ ] 복합 필터: domain + trustLevel + minPolicies
- [ ] facet 카운트: domain별, trustLevel별 정확성
- [ ] 페이지네이션: offset/limit + total count

**Sprint 3:**
- [ ] MCP initialize: protocolVersion 응답
- [ ] MCP tools/list: policy 목록 → tool 목록 매핑
- [ ] MCP tools/call: evaluate 위임 + 결과 포맷

---

## 10. Implementation Order

### Sprint 1 (P0: Evaluate 엔드포인트)
1. [ ] `packages/types/src/skill.ts` — EvaluateRequest/Response 스키마 추가
2. [ ] `infra/migrations/db-skill/0002_evaluations.sql` — D1 마이그레이션
3. [ ] `services/svc-skill/src/prompts/evaluate.ts` — 프롬프트 빌더
4. [ ] `services/svc-skill/src/routes/evaluate.ts` — evaluate 핸들러
5. [ ] `services/svc-skill/src/routes/evaluations.ts` — 이력 조회 핸들러
6. [ ] `services/svc-skill/src/index.ts` — 라우트 등록
7. [ ] `services/svc-skill/tests/evaluate.test.ts` — 유닛 + 핸들러 테스트
8. [ ] D1 마이그레이션 적용 (staging → production)
9. [ ] 배포 + E2E 검증 (curl / Swagger UI)

### Sprint 2 (P1: Skill Marketplace)
10. [ ] `services/svc-skill/src/routes/search.ts` — 검색 핸들러 + facet
11. [ ] `apps/app-web/src/api/skill.ts` — searchSkills, evaluateSkill 추가
12. [ ] `apps/app-web/src/pages/skill-catalog.tsx` — 카드 뷰 + 필터 리팩토링
13. [ ] `apps/app-web/src/pages/skill-detail.tsx` — 상세 페이지 (미리보기 + playground)
14. [ ] `apps/app-web/src/components/skill/` — 공유 컴포넌트
15. [ ] Pages 배포 + 프론트엔드 검증

### Sprint 3 (P2: MCP Server + 버전관리)
16. [ ] `services/svc-mcp-server/` — Worker scaffold (wrangler.toml, src/index.ts)
17. [ ] MCP protocol 핸들러 (initialize, tools/list, tools/call)
18. [ ] Windows Claude Desktop 연동 테스트 + 문서화
19. [ ] Skill 버전 관리 라우트 (optional)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-03 | Initial draft — Sprint 1~3 상세 설계 | Sinclair Seo |
