---
code: AIF-DSGN-020
title: "Working Mock-up 사이트 — 컴포넌트 설계 + API 인터페이스 상세"
version: "1.0"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Working Mock-up 사이트 — Design Document

> **Summary**: AI Foundry 추출 결과물(Skill/Policy/Ontology) 기반 핵심 엔진 동작 검증용 Working Mock-up 사이트의 컴포넌트 설계, API 인터페이스, 구현 상세를 정의한다.
>
> **Project**: RES AI Foundry
> **Version**: v0.7
> **Author**: Sinclair Seo
> **Date**: 2026-03-18
> **Status**: Draft
> **Planning Doc**: [working-mockup.plan.md](../01-plan/features/working-mockup.plan.md)
> **REQ**: AIF-REQ-019 (P0)

---

## 1. Overview

### 1.1 Design Goals

1. **기존 패턴 최대 재활용**: app-web의 Vite + React + Tailwind + Pages Function 프록시 패턴을 그대로 사용
2. **Radix UI + Tailwind CSS**: AXIS DS 외부 설치 불가(`workspace:*` 프로토콜) → 동일 기반 Radix UI 프리미티브 직접 사용
3. **4개 독립 Demo**: 각 Demo가 독립적으로 동작 가능 (느슨한 결합)
4. **Production 데이터 직접 활용**: 새 DB/API 없이 기존 12 Workers API를 호출

### 1.2 Design Principles

- **Reuse over Rebuild**: app-web의 API 클라이언트, Pages Function, 컨텍스트 패턴 복제
- **Demo-First**: 완벽한 CRUD보다 시연 가능한 인터랙션에 집중
- **Progressive Enhancement**: L1(API 직접) → L2(MCP Client) → L3(Foundry-X Agent) 점진 확장

### 1.3 Key Design Decision: Vite vs Next.js

| 항목 | Vite + React (선택) | Next.js 15 |
|------|:---:|:---:|
| app-web 일관성 | ✅ 동일 패턴 | ❌ 별도 패턴 |
| Pages Function 재활용 | ✅ 동일 구조 | ⚠️ @cloudflare/next-on-pages 필요 |
| Radix UI 호환 | ✅ React 기반 | ✅ React 기반 |
| 배포 복잡도 | Low | Medium |
| SSR/SSG | 불필요 (데모 SPA) | 불필요 |

---

## 2. Architecture

### 2.1 Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     apps/app-mockup                               │
│                   (Vite + React SPA)                              │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    Pages / Routes                         │    │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌─────────┐ │    │
│  │  │ PolicyDemo │ │ SkillDemo  │ │ OntDemo  │ │ExportDmo│ │    │
│  │  └─────┬──────┘ └─────┬──────┘ └────┬─────┘ └────┬────┘ │    │
│  └────────┼──────────────┼─────────────┼────────────┼───────┘    │
│           │              │             │            │             │
│  ┌────────┼──────────────┼─────────────┼────────────┼───────┐    │
│  │        ▼              ▼             ▼            ▼        │    │
│  │            Demo Components (Radix UI + Tailwind)          │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐ │    │
│  │  │ Radix UI     │ │ Custom       │ │ Custom            │ │    │
│  │  │ Tabs/Dialog/ │ │ Card/Badge/  │ │ PolicyCard/       │ │    │
│  │  │ Select/      │ │ Skeleton/    │ │ GraphViewer/      │ │    │
│  │  │ ScrollArea   │ │ StatsBar     │ │ ScenarioInput     │ │    │
│  │  └──────────────┘ └──────────────┘ └───────────────────┘ │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                API Client Layer                            │    │
│  │  policyApi │ skillApi │ ontologyApi │ deliverableApi      │    │
│  │  + buildHeaders() + OrganizationContext                    │    │
│  └─────────────────────────┬────────────────────────────────┘    │
└────────────────────────────┼─────────────────────────────────────┘
                             │  /api/*
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                  functions/api/[[path]].ts                         │
│                (Pages Function Proxy)                              │
│         X-Internal-Secret 자동 주입 + CORS                        │
│                                                                   │
│  /api/policies/** → svc-policy-production                        │
│  /api/skills/**   → svc-skill-production                         │
│  /api/terms/**    → svc-ontology-production                      │
│  /api/graph/**    → svc-ontology-production                      │
│  /api/deliverables/** → svc-analytics-production                 │
│  /api/mcp/**      → svc-mcp-server-production                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
User selects domain (LPON/Miraeasset)
  → OrganizationContext sets X-Organization-Id
  → Demo page fetches data via /api/* proxy
  → Pages Function injects auth, forwards to Worker
  → Worker returns JSON
  → React component renders with Radix UI + Tailwind CSS
```

### 2.3 Dependencies

> **Note**: AXIS DS 패키지(`@axis-ds/*`)는 `workspace:*` 프로토콜 의존성으로 인해 외부 설치 불가. AXIS DS의 기반인 Radix UI 프리미티브를 직접 사용하고, Tailwind CSS로 스타일링한다.

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| app-mockup | @radix-ui/react-tabs | 탭 전환 (4개 Demo) |
| app-mockup | @radix-ui/react-dialog | 상세 보기 모달 |
| app-mockup | @radix-ui/react-select | 드롭다운 선택 (policyCode 등) |
| app-mockup | @radix-ui/react-scroll-area | 스크롤 영역 |
| app-mockup | @radix-ui/react-separator | 섹션 구분선 |
| app-mockup | @radix-ui/react-tooltip | 노드 호버 정보 |
| app-mockup | @radix-ui/react-slot | 컴포넌트 합성 (Slot 패턴) |
| app-mockup | lucide-react | 아이콘 (Moon, Sun 등) |
| app-mockup | class-variance-authority | 컴포넌트 variant 스타일 |
| app-mockup | tailwind-merge + clsx | 클래스 병합 유틸리티 |
| app-mockup | d3-force + d3-selection | 그래프 시각화 (Demo 3) |
| app-mockup | sonner | 토스트 알림 |
| app-mockup | @ai-foundry/types | 공유 Zod 스키마 (Policy, Skill 타입) |
| Pages Function | svc-policy-production | 정책 데이터 |
| Pages Function | svc-skill-production | Skill 패키지 + 평가 API |
| Pages Function | svc-ontology-production | 용어 + 그래프 |
| Pages Function | svc-analytics-production | 산출물 Export |
| Pages Function | svc-mcp-server-production | MCP 프로토콜 (L2 연동 시) |

---

## 3. Data Model

### 3.1 Core Types (AI Foundry 기존 타입 재사용)

```typescript
// @ai-foundry/types에서 import
import type { Policy, SkillPackage, SkillSummary } from '@ai-foundry/types'

// Demo 전용 타입
interface PolicyMatchResult {
  policy: Policy
  matchScore: number        // 0-1, condition 매칭 정도
  matchedConditions: string[] // 매칭된 조건 목록
  outcome: string           // 판정 결과
}

interface ScenarioInput {
  domain: 'giftvoucher' | 'pension'
  description: string       // 자연어 시나리오
  parameters: Record<string, string> // 구조화된 파라미터
}

interface SkillEvaluation {
  evaluationId: string
  skillId: string
  policyCode: string
  result: string
  confidence: number
  reasoning: string
  provider: string
  model: string
  latencyMs: number
}

interface OntologyNode {
  id: string
  label: string
  definition?: string
  frequency: number
  group: 'core' | 'important' | 'standard'
  type: string
}

interface OntologyLink {
  source: string
  target: string
  weight: number
}

interface DomainConfig {
  id: string
  name: string
  organizationId: string
  description: string
  policyCount: number
  skillCount: number
  termCount: number
}
```

### 3.2 Domain Configuration

```typescript
const DOMAINS: DomainConfig[] = [
  {
    id: 'giftvoucher',
    name: '온누리상품권',
    organizationId: 'LPON',
    description: 'LPON 전자식 온누리상품권 플랫폼',
    policyCount: 848,
    skillCount: 859,
    termCount: 7332,
  },
  {
    id: 'pension',
    name: '퇴직연금',
    organizationId: 'Miraeasset',
    description: '미래에셋 퇴직연금 관리 시스템',
    policyCount: 2827,
    skillCount: 3065,
    termCount: 0, // 별도 온톨로지 미구축
  },
]
```

### 3.3 Tech Stack

| 항목 | 선택 | 비고 |
|------|------|------|
| Framework | React 18 + Vite 6 | app-web 동일 패턴 |
| UI Library | Radix UI + Tailwind CSS | AXIS DS는 `workspace:*` 프로토콜로 외부 설치 불가, 동일 기반인 Radix UI 직접 사용 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` 플러그인) | `tailwind.config.ts` 불필요 — v4는 Vite 플러그인 + CSS `@theme` 디렉티브로 설정 |
| Icons | lucide-react | Moon/Sun (테마 토글) 등 |
| Routing | react-router-dom v6 | SPA 라우팅 |
| Graph | d3-force + d3-selection | 온톨로지 노드-엣지 시각화 |
| Toast | sonner | 알림 피드백 |
| Utility | clsx + tailwind-merge (cn()) | 조건부 클래스 병합 |
| Type | TypeScript 5.7 strict mode | exactOptionalPropertyTypes, noUncheckedIndexedAccess 등 |
| Deploy | Cloudflare Pages | Pages Function 프록시 포함 |

> **Tailwind v4 설정 참고**: Tailwind CSS v4는 `tailwind.config.ts` 파일이 아닌 `@tailwindcss/vite` 플러그인으로 동작한다. 커스텀 테마 값은 CSS 파일 내 `@theme { }` 블록에서 정의한다 (`src/styles/index.css` 참조).

---

## 4. API Client Specification

### 4.1 Header Builder (app-web 패턴 복제)

```typescript
// src/lib/api/headers.ts
export function buildHeaders(orgId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Organization-Id': orgId,
    'X-User-Id': 'demo-user',
    'X-User-Role': 'Developer',
  }
  // X-Internal-Secret은 Pages Function이 자동 주입
}
```

### 4.2 Policy API Client

```typescript
// src/lib/api/policy.ts

/** 정책 목록 조회 (페이지네이션) */
GET /api/policies?status=approved&limit=50&offset=0
→ { policies: Policy[], total: number }

/** 단일 정책 조회 */
GET /api/policies/:id
→ Policy (condition, criteria, outcome 포함)

/** 정책 통계 */
GET /api/policies/stats
→ { total, byStatus: {approved, candidate, rejected}, byDomain: {...} }
```

### 4.3 Skill API Client

```typescript
// src/lib/api/skill.ts

/** Skill 목록 (검색) */
GET /api/skills?domain={domain}&tag={tag}&status=published&limit=20&offset=0
→ { skills: SkillSummary[] }

/** Skill 상세 */
GET /api/skills/:id
→ SkillPackage (full, policies[] 포함)

/** Skill 평가 실행 ← 핵심 Demo 2 API */
POST /api/skills/:id/evaluate
Body: { context: string, policyCode?: string, parameters?: object }
→ { evaluationId, result, confidence, reasoning, provider, model, latencyMs }

/** Skill MCP 어댑터 조회 */
GET /api/skills/:id/mcp
→ { serverInfo, instructions, tools[], metadata }

/** Skill 통계 */
GET /api/skills/stats
→ { totalSkills, byDomain, byStatus, avgTrustScore }

/** 태그 목록 */
GET /api/skills/search/tags
→ string[]
```

### 4.4 Ontology API Client

```typescript
// src/lib/api/ontology.ts

/** 용어 목록 */
GET /api/terms?ontologyId={id}&type={type}&limit=50&offset=0
→ { terms: Term[], limit, offset }

/** 용어 통계 */
GET /api/terms/stats
→ { totalTerms, distinctLabels, ontologyCount, byType, neo4j }

/** 그래프 시각화 데이터 ← 핵심 Demo 3 API */
GET /api/graph/visualization?limit=80&term={searchTerm}
→ { nodes: OntologyNode[], links: OntologyLink[] }

/** Cypher 쿼리 (read-only) */
GET /api/graph?query={cypher}
→ { columns: string[], rows: any[][] }
```

### 4.5 Deliverable API Client

```typescript
// src/lib/api/deliverable.ts

/** 산출물 마크다운 조회 */
GET /api/deliverables/export/{type}?organizationId={orgId}
type: 'interface-spec' | 'business-rules' | 'terminology' | 'gap-report' | 'comparison'
→ text/markdown (raw string)
```

### 4.6 Pages Function Route Table (신규 추가분)

```typescript
// functions/api/[[path]].ts — ROUTE_TABLE 확장
const ROUTE_TABLE: Record<string, string> = {
  // 기존 (app-web과 공유)
  policies: 'svc-policy',
  skills: 'svc-skill',
  terms: 'svc-ontology',
  graph: 'svc-ontology',
  deliverables: 'svc-analytics',
  // 신규 (Mock-up 전용, L2 연동 시)
  mcp: 'svc-mcp-server',
}
```

---

## 5. UI/UX Design

### 5.1 Page Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Header: AI Foundry Working Mock-up          [LPON ▾] [🌙]    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Domain Selector                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐                      │  │
│  │  │ 🎫 온누리상품권 │  │ 💰 퇴직연금   │   데이터 통계 배지 │  │
│  │  │  LPON         │  │  Miraeasset   │                     │  │
│  │  └──────────────┘  └──────────────┘                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Tabs: [정책 엔진] [Skill 호출] [온톨로지] [산출물]       │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  Tab Content Area (Demo별 콘텐츠)                        │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Footer: Powered by AI Foundry × Foundry-X                    │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Demo 1: 정책 엔진 — PolicyEngineDemo

```
┌─────────────────────────────────────────────────────────────┐
│  시나리오 입력                                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 시나리오 (자연어):                                     │  │
│  │ ┌─────────────────────────────────────────────────┐   │  │
│  │ │ "온누리상품권으로 5만원 온라인 결제 시 적용되는    │   │  │
│  │ │  정책을 확인하고 싶습니다"                         │   │  │
│  │ └─────────────────────────────────────────────────┘   │  │
│  │  [▶ 정책 매칭 실행]                                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 매칭 결과 (RunProgress) ─────────────────────────────┐  │
│  │ ✅ Step 1: 정책 조회 (848건)                           │  │
│  │ ✅ Step 2: 조건 필터링 (127건 → 23건)                  │  │
│  │ 🔄 Step 3: LLM 평가 중...                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 매칭 정책 목록 ──────────────────────────────────────┐  │
│  │ ┌ PolicyCard ─────────────────────────────────────┐   │  │
│  │ │ POL-GIFT-PAY-003 │ 온라인 결제 한도 정책         │   │  │
│  │ │ IF: 결제유형=온라인 AND 금액≥50000              │   │  │
│  │ │ CRITERIA: 일일 한도 초과 여부                     │   │  │
│  │ │ THEN: 추가 인증 필요                             │   │  │
│  │ │ 신뢰도: 0.92 │ ✅ approved │ Badge: HIGH        │   │  │
│  │ └────────────────────────────────────────────────┘   │  │
│  │ ┌ PolicyCard ─────────────────────────────────────┐   │  │
│  │ │ POL-GIFT-PAY-007 │ ...                           │   │  │
│  │ └────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**핵심 컴포넌트**:

| Component | 구현 방식 | 용도 |
|-----------|-------------|------|
| `ScenarioInput` | Custom (Tailwind Textarea + Button) | 시나리오 입력 |
| `PolicyMatchProgress` | Custom (Tailwind 단계 표시) | 매칭 진행 단계 표시 |
| `PolicyCard` | Custom (Tailwind Card) | 정책 condition/criteria/outcome 표시 |
| `TrustBadge` | Custom (Tailwind Badge) | 신뢰도 점수 + 상태 |

**데이터 플로우**:
```
ScenarioInput.onSubmit(text)
  → GET /api/policies?status=approved (전체 정책 로드, 캐싱)
  → 클라이언트 사이드 keyword 필터링 (condition 텍스트 매칭)
  → 상위 N건에 대해 POST /api/skills/:id/evaluate (LLM 평가)
  → PolicyCard 목록 렌더링 (confidence 순 정렬)
```

### 5.3 Demo 2: Skill MCP 호출기 — SkillInvokerDemo

```
┌─────────────────────────────────────────────────────────────┐
│  ┌── 좌측: Skill 검색 ─────────┐ ┌── 우측: 실행 패널 ────┐ │
│  │ 🔍 [검색 Command Palette]    │ │ Skill: POL-GIFT-...  │ │
│  │                              │ │                       │ │
│  │ ┌ SkillCard ──────────────┐ │ │ Parameters:           │ │
│  │ │ 🎫 온누리 충전 관리      │ │ │ ┌───────────────────┐│ │
│  │ │ 12 policies │ v1.0      │ │ │ │ context:           ││ │
│  │ │ trust: 0.89 │ published │ │ │ │ "고객이 월 50만원  ││ │
│  │ │ tags: 충전, 한도, 결제   │ │ │ │  한도 초과 충전..."││ │
│  │ └────────────────────────┘ │ │ └───────────────────┘│ │
│  │ ┌ SkillCard ──────────────┐ │ │                       │ │
│  │ │ 💳 온누리 결제 처리      │ │ │ policyCode (선택):   │ │
│  │ │ 8 policies │ v1.0       │ │ │ [POL-GIFT-CHG-001 ▾]│ │
│  │ └────────────────────────┘ │ │                       │ │
│  │ ┌ SkillCard ──────────────┐ │ │ [▶ 실행]              │ │
│  │ │ ...                      │ │ │                       │ │
│  │ └────────────────────────┘ │ │ ┌─ ToolCallCard ─────┐│ │
│  └──────────────────────────────┘ │ │ 🔧 evaluate        ││ │
│                                    │ │ provider: anthropic ││ │
│                                    │ │ latency: 1,234ms   ││ │
│                                    │ │                     ││ │
│                                    │ │ 판정: 충전 한도 초과 ││ │
│                                    │ │ 신뢰도: 0.95       ││ │
│                                    │ │ 근거: "월 한도..."  ││ │
│                                    │ └─────────────────────┘│ │
│                                    │                        │ │
│                                    │ ┌─ 호출 이력 ─────────┐│ │
│                                    │ │ #1 POL-...-001 0.95 ││ │
│                                    │ │ #2 POL-...-003 0.87 ││ │
│                                    │ └─────────────────────┘│ │
│                                    └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**핵심 컴포넌트**:

| Component | 구현 방식 | 용도 |
|-----------|-------------|------|
| `SkillSearchPanel` | Custom (Tailwind 검색 UI) | Skill 검색 팔레트 |
| `SkillCard` | Custom (Tailwind Card) | Skill 요약 (정책 수, trust, 태그) |
| `EvaluationPanel` | Custom (Tailwind + Radix Select) | context 입력 + policyCode 선택 + 실행 |
| `EvalResultCard` | Custom (Tailwind Card) | 평가 결과 (판정, 신뢰도, 근거, latency) |
| `EvalHistory` | Custom (Tailwind Table) | 호출 이력 목록 |

### 5.4 Demo 3: 온톨로지 탐색기 — OntologyExplorerDemo

```
┌─────────────────────────────────────────────────────────────┐
│  ┌── 좌측: 용어 검색 + 목록 ──┐ ┌── 우측: 그래프 ────────┐ │
│  │ 🔍 [용어 검색]              │ │                         │ │
│  │                              │ │    ○ 충전              │ │
│  │ 총 7,332건                   │ │   / | \               │ │
│  │                              │ │  ○  ○  ○              │ │
│  │ ┌ TermCard ──────────────┐  │ │ 결제 한도 상품권       │ │
│  │ │ 충전 (charge)           │  │ │  |     |              │ │
│  │ │ 정의: 온누리상품권에...  │  │ │  ○     ○              │ │
│  │ │ 관련 정책: 12건          │  │ │ 카드  환불             │ │
│  │ │ SKOS: concept:charge    │  │ │                         │ │
│  │ └────────────────────────┘  │ │  [선택 노드 상세]       │ │
│  │ ┌ TermCard ──────────────┐  │ │  ┌ ContextPanel ──────┐│ │
│  │ │ 결제 (payment)          │  │ │  │ 충전 (charge)      ││ │
│  │ │ ...                     │  │ │  │ freq: 48           ││ │
│  │ └────────────────────────┘  │ │  │ group: core        ││ │
│  │ ...                         │ │  │ 관련: 결제, 한도... ││ │
│  └──────────────────────────────┘ │  └────────────────────┘│ │
│                                    └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**핵심 컴포넌트**:

| Component | 라이브러리 | 용도 |
|-----------|-----------|------|
| `TermSearch` | Custom (Tailwind Input) + Radix ScrollArea | 용어 검색 + 무한 스크롤 |
| `TermCard` | Custom (Tailwind Card) | 용어 상세 (정의, SKOS URI, 관련 정책) |
| `GraphViewer` | d3-force + d3-selection | 인터랙티브 노드-엣지 그래프 |
| `NodeDetail` | Custom (Tailwind 사이드 패널) | 선택 노드 상세 사이드 패널 |

### 5.5 Demo 4: 산출물 미리보기 — DeliverablePreviewDemo

```
┌─────────────────────────────────────────────────────────────┐
│  산출물 유형 선택                                             │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                        │
│  │D1  │ │D2  │ │D3  │ │D4  │ │D5  │                        │
│  │인터 │ │업무 │ │용어 │ │Gap │ │비교 │                        │
│  │페이 │ │규칙 │ │사전 │ │보고 │ │표  │                        │
│  └────┘ └────┘ └────┘ └────┘ └────┘                        │
│                                                              │
│  ┌── 마크다운 렌더링 미리보기 ───────────────────────────┐  │
│  │ # 인터페이스 설계서                                     │  │
│  │                                                        │  │
│  │ | API명 | 메서드 | 경로 | 설명 |                        │  │
│  │ |-------|--------|------|------|                        │  │
│  │ | 충전요청 | POST | /charge | 온누리상품권 충전 |        │  │
│  │ | ...                                                  │  │
│  │                                                        │  │
│  │                                       [📥 다운로드]     │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**기존 app-web 재활용**: `DeliverableTab.tsx` + `MarkdownContent` 컴포넌트 로직 복제

---

## 6. Component Catalog

### 6.1 Radix UI + Custom 컴포넌트 사용 맵

> **배경**: AXIS DS 패키지(`@axis-ds/*`)는 `workspace:*` 프로토콜 의존성으로 외부 NPM 설치 불가. AXIS DS의 기반인 **Radix UI 프리미티브**를 직접 사용하고, **Tailwind CSS**로 스타일링한다. 커스텀 컴포넌트로 AXIS DS의 고수준 기능(ToolCallCard, RunProgress 등)을 자체 구현한다.

| 패키지 / 구현 | 컴포넌트 | 사용 Demo | 용도 |
|---------------|---------|-----------|------|
| **@radix-ui/react-tabs** | Tabs, TabsList, TabsTrigger, TabsContent | 메인 | 4개 Demo 전환 |
| **@radix-ui/react-dialog** | Dialog, DialogTrigger, DialogContent | Demo 2, 3 | 상세 보기 모달 |
| **@radix-ui/react-select** | Select, SelectTrigger, SelectContent, SelectItem | Demo 2 | policyCode 선택 |
| **@radix-ui/react-scroll-area** | ScrollArea | Demo 3, 4 | 스크롤 영역 |
| **@radix-ui/react-separator** | Separator | 전체 | 섹션 구분 |
| **@radix-ui/react-tooltip** | Tooltip, TooltipTrigger, TooltipContent | Demo 3 | 노드 호버 정보 |
| **lucide-react** | Moon, Sun, Search, Download 등 | 전체 | 아이콘 |
| **d3-force + d3-selection** | GraphViewer (커스텀) | Demo 3 | 노드-엣지 그래프 시각화 |
| **sonner** | Toaster, toast | 전체 | 토스트 알림 |
| **Custom** (Tailwind) | Card, Badge, Button, Input, Textarea, Skeleton | 전체 | Tailwind 기반 기본 UI |
| **Custom** | ThemeProvider (ThemeContext) | 루트 | 다크모드 토글 (localStorage 저장) |
| **Custom** | PolicyCard, EvalResultCard, TermCard | Demo 1-3 | 도메인 데이터 카드 |
| **Custom** | StatsBar | 헤더 | 도메인 통계 배지 (policies/skills/terms) |

### 6.2 Custom 컴포넌트

| Component | 위치 | 용도 | 예상 규모 |
|-----------|------|------|-----------|
| `DomainSelector` | components/shared/ | 도메인 카드 선택 (LPON/Miraeasset) | ~60줄 |
| `PolicyCard` | components/demo/policy/ | 정책 condition-criteria-outcome 시각화 | ~80줄 |
| `ScenarioInput` | components/demo/policy/ | 자연어 시나리오 입력 + 파라미터 | ~50줄 |
| `SkillCard` | components/demo/skill/ | Skill 요약 카드 | ~60줄 |
| `EvaluationPanel` | components/demo/skill/ | 평가 입력 + 실행 | ~100줄 |
| `EvalResultCard` | components/demo/skill/ | ToolCallCard 래퍼 + 결과 포맷 | ~70줄 |
| `GraphViewer` | components/demo/ontology/ | d3/xyflow 기반 그래프 시각화 | ~200줄 |
| `TermCard` | components/demo/ontology/ | 용어 상세 카드 | ~50줄 |
| `MarkdownPreview` | components/demo/deliverable/ | app-web MarkdownContent 복제 | ~150줄 |
| `DeliverableSelector` | components/demo/deliverable/ | D1-D5 선택 카드 | ~60줄 |
| `MockupHeader` | components/shared/ | 헤더 (도메인 선택 + 테마) | ~40줄 |
| `StatsBar` | components/shared/ | 도메인 통계 배지 바 | ~30줄 |

---

## 7. File Structure

```
apps/app-mockup/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── # tailwind.config.ts 불필요 (v4: @tailwindcss/vite 플러그인 사용)
├── wrangler.toml               # Pages 배포 설정
├── functions/
│   ├── _middleware.ts           # CORS
│   └── api/
│       └── [[path]].ts         # API 프록시 (app-web 복제 + 확장)
├── src/
│   ├── main.tsx                 # 앱 진입점
│   ├── app.tsx                  # Routes 정의
│   ├── contexts/
│   │   ├── DomainContext.tsx     # 도메인 선택 상태 (LPON/Miraeasset)
│   │   └── ThemeContext.tsx      # 다크모드
│   ├── lib/
│   │   └── api/
│   │       ├── headers.ts       # buildHeaders()
│   │       ├── policy.ts        # 정책 API 클라이언트
│   │       ├── skill.ts         # Skill API 클라이언트
│   │       ├── ontology.ts      # 온톨로지 API 클라이언트
│   │       └── deliverable.ts   # 산출물 API 클라이언트
│   ├── components/
│   │   ├── shared/
│   │   │   ├── MockupHeader.tsx
│   │   │   ├── DomainSelector.tsx
│   │   │   └── StatsBar.tsx
│   │   └── demo/
│   │       ├── policy/
│   │       │   ├── PolicyEngineDemo.tsx    # Demo 1 메인
│   │       │   ├── ScenarioInput.tsx
│   │       │   └── PolicyCard.tsx
│   │       ├── skill/
│   │       │   ├── SkillInvokerDemo.tsx    # Demo 2 메인
│   │       │   ├── SkillCard.tsx
│   │       │   ├── EvaluationPanel.tsx
│   │       │   └── EvalResultCard.tsx
│   │       ├── ontology/
│   │       │   ├── OntologyExplorerDemo.tsx # Demo 3 메인
│   │       │   ├── GraphViewer.tsx
│   │       │   └── TermCard.tsx
│   │       └── deliverable/
│   │           ├── DeliverablePreviewDemo.tsx # Demo 4 메인
│   │           ├── DeliverableSelector.tsx
│   │           └── MarkdownPreview.tsx
│   ├── pages/
│   │   └── Home.tsx              # 메인 페이지 (도메인 선택 + 4 탭)
│   ├── styles/
│   │   └── index.css             # Tailwind v4 @theme (커스텀 디자인 토큰)
│   └── types/
│       └── demo.ts               # Demo 전용 타입
└── public/
    └── favicon.svg
```

**예상 파일 수**: ~30개 (config 8 + source 22)
**예상 코드 규모**: ~2,500줄

---

## 8. Implementation Order

| # | 단계 | 파일 | 의존성 | 예상 규모 |
|---|------|------|--------|-----------|
| **S1** | 프로젝트 스캐폴딩 | package.json, vite.config, tsconfig, tailwind.config, wrangler.toml, index.html | 없음 | ~150줄 config |
| **S2** | Pages Function + API 클라이언트 | functions/*, src/lib/api/* | S1 | ~350줄 |
| **S3** | 공통 컴포넌트 + 레이아웃 | contexts/*, components/shared/*, pages/Home.tsx, app.tsx | S2 | ~250줄 |
| **S4** | Demo 1: 정책 엔진 | components/demo/policy/* | S3 | ~350줄 |
| **S5** | Demo 2: Skill 호출기 | components/demo/skill/* | S3 | ~400줄 |
| **S6** | Demo 3: 온톨로지 탐색기 | components/demo/ontology/* | S3 | ~450줄 |
| **S7** | Demo 4: 산출물 미리보기 | components/demo/deliverable/* | S3 | ~300줄 |
| **S8** | 통합 + 폴리시 | 전체 | S4-S7 | ~200줄 |
| **S9** | 배포 | CI/CD config | S8 | config |

**병렬화 가능**: S4, S5, S6, S7은 S3 완료 후 독립적으로 병렬 구현 가능 → Agent Team 활용점

---

## 9. Security Considerations

- [x] Pages Function이 X-Internal-Secret 자동 주입 (클라이언트 노출 없음)
- [ ] Demo 전용 읽기 권한만 사용 (X-User-Role: Developer, read-only API만 호출)
- [ ] Skill evaluate는 LLM 비용 발생 → rate limiting 고려 (UI에서 debounce 300ms)
- [ ] CORS: Pages Function에서 처리 (app-web 동일 패턴)
- [ ] Neo4j Cypher 쿼리: svc-ontology에서 read-only 강제 (서버 측 보장)

---

## 10. Test Plan

### 10.1 Test Scope

| Type | Target | Tool | 수량 |
|------|--------|------|------|
| Unit | API 클라이언트 함수 | Vitest | ~10 |
| Component | 각 Demo 컴포넌트 | Vitest + Testing Library | ~12 |
| E2E | 4개 Demo 시나리오 | Playwright | 4 |

### 10.2 Key Test Cases

- [ ] Demo 1: 시나리오 입력 → 정책 매칭 결과 표시 (최소 1건)
- [ ] Demo 2: Skill 선택 → evaluate → 결과 ToolCallCard 표시
- [ ] Demo 3: 그래프 시각화 렌더링 (50+ 노드)
- [ ] Demo 4: 산출물 마크다운 테이블 렌더링
- [ ] 도메인 전환: LPON → Miraeasset → 데이터 갱신 확인
- [ ] 다크모드 토글 정상 동작

---

## 11. Conventions

### 11.1 Naming

| Target | Rule | Example |
|--------|------|---------|
| 컴포넌트 | PascalCase | `PolicyCard`, `EvalResultCard` |
| API 함수 | camelCase, fetch* / get* | `fetchPolicies()`, `evaluateSkill()` |
| 파일 (컴포넌트) | PascalCase.tsx | `PolicyCard.tsx` |
| 파일 (유틸) | camelCase.ts | `headers.ts` |
| 폴더 | kebab-case | `demo/policy/`, `demo/skill/` |

### 11.2 Import Order

```typescript
// 1. React
import { useState, useEffect } from 'react'

// 2. Radix UI + external libs
import * as Tabs from '@radix-ui/react-tabs'
import { Moon, Sun } from 'lucide-react'

// 3. Internal libs
import { fetchPolicies } from '@/lib/api/policy'
import { useDomain } from '@/contexts/DomainContext'

// 4. Local
import { PolicyCard } from './PolicyCard'

// 5. Types
import type { PolicyMatchResult } from '@/types/demo'
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial — 4 Demo UI 설계 + API 인터페이스 + 컴포넌트 카탈로그 + 구현 순서 | Sinclair Seo |
