---
code: AIF-PLAN-020
title: "Working Mock-up 사이트 — Skill 결과물 기반 핵심 엔진 동작 검증"
version: "1.0"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Working Mock-up 사이트 — 핵심 엔진 동작 검증

> **Summary**: AI Foundry가 추출한 결과물(Skill 3,924건, Policy 3,675건, Ontology, Term 사전)을 기반으로, 핵심 엔진 모듈이 실제 동작하는지 검증하는 Working Mock-up 사이트를 구축한다. Foundry-X 플랫폼과 연동하고, AXIS Design System으로 UI를 구성하며, Agent 기반 자동화로 구축 효율을 극대화한다.
>
> **Project**: RES AI Foundry
> **Version**: v0.7
> **Author**: Sinclair Seo
> **Date**: 2026-03-18
> **Status**: Draft
> **REQ**: AIF-REQ-019 (P0)
> **Depends On**: Phase 4 Sprint 2 완료 (파이프라인 + 데이터 검증 완료)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | AI Foundry가 추출한 3,924 Skills / 3,675 Policies가 실제 업무에서 동작 가능한지 증명할 수단이 없다. 추출은 완료됐지만 "사용 가능성"이 미검증 상태이다. |
| **Solution** | 추출된 결과물을 실제로 소비하는 Working Mock-up 사이트를 구축한다. Foundry-X의 Agent 오케스트레이션 + AI Foundry MCP Server + AXIS Design System agentic-ui를 조합하여 정책 실행·Skill 호출·온톨로지 조회가 동작하는 데모를 만든다. |
| **Function/UX Effect** | 사용자가 도메인(온누리상품권/퇴직연금)을 선택하면 해당 정책 엔진이 조건-기준-결과 로직을 실행하고, Skill을 MCP 도구로 호출하며, 용어 사전을 자동 참조하는 인터랙티브 데모를 체험한다. |
| **Core Value** | "추출에서 활용까지" — AI Foundry 파이프라인의 End-to-End 가치를 증명하여, 파일럿 확대 및 내부 투자 의사결정의 근거를 제공한다. |

---

## 1. Overview

### 1.1 Purpose

Phase 4까지 AI Foundry는 "추출"에 집중했다. 이제 추출된 결과물이 실제로 **동작 가능**한지 증명해야 한다.
Working Mock-up은 완벽한 프로덕션 서비스가 아니라, 핵심 엔진(정책 실행, Skill 호출, 온톨로지 조회)의 **동작을 시연**하는 데모 사이트이다.

### 1.2 Background

- AI Foundry Production 데이터: **policies 3,675** (LPON 848 + Miraeasset 2,827), **skills 3,924** (LPON 859 + Miraeasset 3,065)
- MCP Server 가동 중: Streamable HTTP, E2E 7/7 PASS
- Foundry-X (v0.11.0): Agent 오케스트레이션 + NL→Spec + SSE 스트리밍 보유
- AXIS Design System (v1.1.2): agentic-ui 패키지에 RunProgress, ApprovalCard, StreamingText 등 AI 전용 컴포넌트 보유

### 1.3 Related Documents

- Requirements: [[AIF-REQ-019]], SPEC.md §7
- Foundry-X: https://github.com/KTDS-AXBD/Foundry-X (v0.11.0, SPEC FX-SPEC-001 v2.5)
- AXIS Design System: https://github.com/IDEA-on-Action/AXIS-Design-System (v1.1.2, npm @axis-ds/*)
- AI Foundry PRD: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`
- MCP Server: svc-mcp-server (Streamable HTTP, 515 published skills)

---

## 2. Scope

### 2.1 In Scope

- [ ] **Demo 1: 정책 엔진 실행** — 도메인별 정책(조건-기준-결과 트리플)을 입력 시나리오에 대해 평가하는 데모
- [ ] **Demo 2: Skill MCP 호출** — MCP Server를 통해 published Skill을 실제 도구로 호출하는 데모
- [ ] **Demo 3: 온톨로지 탐색** — 용어 사전 + 도메인 관계 그래프를 인터랙티브로 탐색하는 데모
- [ ] **Demo 4: 산출물 Export 미리보기** — SI 산출물(인터페이스설계서, 업무규칙 등) 렌더링 데모
- [ ] **Foundry-X 연동 검토** — Agent 오케스트레이션을 통한 Skill 소비 PoC
- [ ] **AXIS Design System 적용** — @axis-ds/ui-react + @axis-ds/agentic-ui 컴포넌트 활용
- [ ] **Agent 기반 자동화** — Claude Code Agent 활용하여 보일러플레이트 생성 최소화

### 2.2 Out of Scope

- 프로덕션 수준의 인증/RBAC (데모용 최소 인증만)
- 새 데이터 추출 파이프라인 실행 (기존 Production 데이터 활용)
- Foundry-X 코드베이스 직접 수정 (AI Foundry 측 연동 레이어만)
- 모바일 반응형 최적화
- 성능 최적화 / 부하 테스트

---

## 3. Architecture

### 3.1 3-Layer Integration Model

```
┌───────────────────────────────────────────────────────────┐
│                    Working Mock-up Site                     │
│              (Next.js / Cloudflare Pages)                   │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ AXIS DS     │  │ AXIS DS      │  │ Custom Demo      │  │
│  │ ui-react    │  │ agentic-ui   │  │ Components       │  │
│  │ (30+ comp)  │  │ (12+ comp)   │  │ (Policy/Skill)   │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │
│         └────────────┬───┘                    │             │
│                      ▼                        │             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              Demo Engine (API Layer)                    │ │
│  │  policy-executor │ skill-invoker │ ontology-browser    │ │
│  └──────────┬──────────────┬──────────────┬──────────────┘ │
└─────────────┼──────────────┼──────────────┼────────────────┘
              │              │              │
              ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ AI Foundry   │ │ AI Foundry   │ │ AI Foundry   │
    │ svc-policy   │ │ svc-mcp-     │ │ svc-ontology │
    │ (D1 policies)│ │ server (MCP) │ │ (Neo4j/D1)   │
    └──────────────┘ └──────────────┘ └──────────────┘
```

### 3.2 Foundry-X 연동 방안

Foundry-X의 Agent 오케스트레이션이 AI Foundry MCP Server를 Tool Provider로 등록하는 구조:

```
Foundry-X Agent ──POST /agents/execute──→ Foundry-X API
                                            │
                                            ▼
                                    AgentOrchestrator
                                            │
                                    ┌───────┴────────┐
                                    │ MCP Client      │
                                    │ (AI Foundry)    │
                                    └───────┬────────┘
                                            │
                                            ▼
                                    AI Foundry MCP Server
                                    (svc-mcp-server)
                                    ├─ list_skills
                                    ├─ get_skill
                                    ├─ search_skills
                                    └─ execute_skill
```

**연동 수준 옵션**:

| 수준 | 설명 | 복잡도 | 권장 |
|------|------|--------|------|
| **L1: API 직접 호출** | Mock-up이 AI Foundry API를 직접 fetch | Low | ✅ Phase 1 |
| **L2: MCP Client** | Mock-up에 MCP Client SDK 탑재, svc-mcp-server 연결 | Medium | Phase 2 |
| **L3: Foundry-X 경유** | Foundry-X Agent가 MCP를 통해 Skill 실행 | High | Phase 3 |

**권장**: L1으로 시작하여 동작 검증 후, L2/L3로 점진 확장.

### 3.3 기술 스택

| 영역 | 선택 | 근거 |
|------|------|------|
| **Framework** | Next.js 15 (App Router) | AXIS DS + Foundry-X 동일 스택, SSR/SSG 지원 |
| **UI Library** | @axis-ds/ui-react + @axis-ds/agentic-ui | 팀 Design System 통일 |
| **Styling** | Tailwind CSS + @axis-ds/tokens | AXIS DS 토큰 프리셋 |
| **State** | Zustand + TanStack Query | Foundry-X 동일 패턴, 서버 상태 캐싱 |
| **Deployment** | Cloudflare Pages | 기존 AI Foundry 인프라 활용 |
| **API 연동** | AI Foundry Production API (fetch) | 기존 12 Workers 엔드포인트 활용 |
| **Graph 시각화** | D3.js 또는 @xyflow/react | 온톨로지 그래프 탐색용 |

---

## 4. Demo Specifications

### 4.1 Demo 1: 정책 엔진 실행기

**목적**: 추출된 정책(조건-기준-결과 트리플)이 실제 비즈니스 시나리오에서 올바르게 평가되는지 시연

**데이터 소스**: `svc-policy` D1 (policies 3,675건)

**UI 구성**:
- 도메인 선택 (온누리상품권 / 퇴직연금)
- 시나리오 입력 (예: "충전금액 5만원, 결제유형 온라인")
- 정책 매칭 결과 (조건 충족 정책 목록 + confidence score)
- 정책 상세 (condition → criteria → outcome 트리플 시각화)

**핵심 로직**:
```
Input Scenario → Policy Matcher (condition 평가) → Matched Policies
  → Criteria 검증 → Outcome 결정 → 결과 표시
```

**AXIS DS 컴포넌트**:
- `Card`, `Table`, `Badge` (ui-react)
- `RunProgress` (agentic-ui) — 정책 평가 진행 표시

### 4.2 Demo 2: Skill MCP 호출기

**목적**: Published Skill을 MCP 도구로 실제 호출하여 응답을 확인

**데이터 소스**: `svc-mcp-server` (515 published, KV 3환경)

**UI 구성**:
- Skill 검색 (태그, 도메인, 키워드)
- Skill 상세 (메타데이터 + 파라미터 스키마)
- 실행 패널 (파라미터 입력 → 호출 → 응답 표시)
- 호출 이력 로그

**AXIS DS 컴포넌트**:
- `ToolCallCard` (agentic-ui) — Skill 호출 시각화
- `StreamingText` (agentic-ui) — LLM 응답 스트리밍
- `CodeBlock` (agentic-ui) — JSON 응답 표시
- `Command` (ui-react) — Skill 검색 팔레트

### 4.3 Demo 3: 온톨로지 탐색기

**목적**: 도메인 용어 사전과 관계 그래프를 인터랙티브로 탐색

**데이터 소스**: `svc-ontology` D1 (terms 7,332건) + Neo4j Aura (3,880 노드)

**UI 구성**:
- 용어 검색 + 필터 (도메인, 카테고리)
- 용어 상세 (정의, 동의어, 관련 정책, SKOS 매핑)
- 관계 그래프 (노드: 용어/정책/프로세스, 엣지: 관계 타입)
- 도메인 지식 맵 (Top-down 계층 뷰)

**AXIS DS 컴포넌트**:
- `Tabs`, `ScrollArea`, `Tooltip` (ui-react)
- `ContextPanel` (agentic-ui) — 선택 노드 상세 정보

### 4.4 Demo 4: 산출물 Export 미리보기

**목적**: AI Foundry가 재구성한 SI 산출물이 실제 문서로서 활용 가능한지 확인

**데이터 소스**: `svc-extraction` `/deliverables/export/*` (6종 API)

**UI 구성**:
- 산출물 유형 선택 (인터페이스설계서, 업무규칙, 용어사전, Gap보고서, 비교표)
- 마크다운 렌더링 미리보기
- 다운로드 (Markdown / PDF)

**기존 구현 재활용**: app-web Export Center 탭의 MarkdownContent 컴포넌트 로직 (세션 164)

---

## 5. Implementation Strategy

### 5.1 프로젝트 구조

**옵션 A: AI Foundry 모노레포 내 신규 앱 (권장)**
```
res-ai-foundry/
├── apps/
│   ├── app-web/           # 기존 관리 대시보드
│   └── app-mockup/        # 신규 Working Mock-up
│       ├── src/
│       │   ├── app/           # Next.js App Router
│       │   │   ├── (demos)/
│       │   │   │   ├── policy-engine/
│       │   │   │   ├── skill-invoker/
│       │   │   │   ├── ontology-explorer/
│       │   │   │   └── deliverable-preview/
│       │   │   └── layout.tsx
│       │   ├── components/
│       │   │   ├── demo/      # 데모 전용 컴포넌트
│       │   │   └── shared/    # 공통 레이아웃
│       │   ├── lib/
│       │   │   ├── api/       # AI Foundry API 클라이언트
│       │   │   └── policy/    # 정책 실행 엔진 (클라이언트 사이드)
│       │   └── types/
│       ├── package.json
│       ├── next.config.js
│       └── tailwind.config.js  # @axis-ds/tokens preset
```

**근거**: 기존 모노레포 인프라(Turborepo, @ai-foundry/types) 재활용, Pages Function으로 API 프록시

### 5.2 Build Sequence

| 순서 | 작업 | 산출물 | 예상 규모 |
|------|------|--------|-----------|
| **S1** | 프로젝트 스캐폴딩 | Next.js + AXIS DS + Tailwind 초기 설정 | ~200줄 config |
| **S2** | API 클라이언트 | AI Foundry API fetch 래퍼 (policies, skills, ontology, deliverables) | ~300줄 |
| **S3** | Demo 1: 정책 엔진 | 시나리오 입력 → 정책 매칭 → 결과 표시 | ~500줄 |
| **S4** | Demo 2: Skill 호출기 | 검색 → 상세 → 실행 → 응답 | ~400줄 |
| **S5** | Demo 3: 온톨로지 탐색기 | 용어 검색 + 그래프 시각화 | ~600줄 |
| **S6** | Demo 4: 산출물 미리보기 | Export API → 마크다운 렌더링 | ~300줄 (기존 재활용) |
| **S7** | 랜딩 + 네비게이션 | 전체 데모 허브 + 도메인 선택 | ~200줄 |
| **S8** | Foundry-X 연동 PoC | L1 API 호출 검증 + 문서화 | ~200줄 + 문서 |
| **S9** | 배포 | Cloudflare Pages (별도 프로젝트) | config |

**총 예상**: ~2,700줄 신규 코드

### 5.3 Agent 자동화 전략

| 자동화 대상 | 접근 방식 |
|-------------|-----------|
| **스캐폴딩** | `/ax-06-team`으로 Worker 병렬 생성 (S1+S2 동시) |
| **Demo 구현** | 각 Demo를 독립 Agent Task로 분할, 순차 또는 병렬 실행 |
| **AXIS DS 통합** | MCP Server (`@axis-ds/mcp`)로 컴포넌트 자동 검색 + 코드 생성 |
| **API 클라이언트** | 기존 app-web API 클라이언트 패턴 복제 + 확장 |
| **테스트** | Vitest 단위 + Playwright E2E (핵심 시나리오만) |

---

## 6. Requirements

### 6.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 도메인 선택(온누리상품권/퇴직연금) 후 해당 데이터로 데모 전환 | High | Pending |
| FR-02 | 정책 시나리오 입력 → 조건 매칭 → 결과 정책 목록 표시 | High | Pending |
| FR-03 | Skill 검색 → 상세 → MCP 호출 → 응답 표시 | High | Pending |
| FR-04 | 온톨로지 용어 검색 + 관계 그래프 시각화 | Medium | Pending |
| FR-05 | SI 산출물 5종 마크다운 미리보기 + 다운로드 | Medium | Pending |
| FR-06 | Foundry-X API를 통한 Skill 소비 PoC (L1 수준) | Medium | Pending |
| FR-07 | AXIS DS 컴포넌트 일관 적용 (ui-react + agentic-ui) | High | Pending |

### 6.2 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| Performance | 데모 페이지 초기 로드 < 3s | Lighthouse |
| Usability | 비개발자도 데모 체험 가능 | 3-click 이내 데모 도달 |
| Deployment | Cloudflare Pages 배포 (기존 인프라) | CI/CD 통합 |

---

## 7. Success Criteria

### 7.1 Definition of Done

- [ ] 4개 데모 모두 Production 데이터로 정상 동작
- [ ] 정책 엔진이 최소 5개 시나리오에서 올바른 정책 매칭
- [ ] MCP Skill 호출이 실시간으로 동작 (응답 < 5s)
- [ ] 온톨로지 그래프가 50+ 노드를 인터랙티브로 표시
- [ ] AXIS DS 컴포넌트 10개 이상 활용
- [ ] Cloudflare Pages 배포 완료

### 7.2 Quality Criteria

- [ ] TypeScript strict mode 통과
- [ ] Lint 에러 0건
- [ ] 핵심 데모 시나리오 E2E 테스트 4건 PASS

---

## 8. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AI Foundry Production API 인증 | High | Medium | Pages Function proxy로 INTERNAL_API_SECRET 주입 (app-web 동일 패턴) |
| AXIS DS 버전 호환성 | Medium | Low | v1.1.2 고정, peerDependency React 19 확인 |
| MCP Server 연결 안정성 | Medium | Low | 이미 E2E 7/7 PASS 검증 완료 |
| Neo4j Aura Free 한도 | Low | Low | 파일럿 규모 3,880 노드 → 한도 내 |
| 정책 실행 로직 복잡도 | Medium | Medium | MVP: 단순 조건 매칭만 (복합 조건은 Phase 2) |
| Foundry-X 연동 범위 확대 | Medium | Medium | L1 수준(API 직접)으로 제한, L2/L3는 후속 |
| AIF-REQ-020 인프라 이전과 충돌 | High | Medium | 이전 전에 Mock-up 먼저 완료하거나, 이전 후 URL 갱신 |

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`working-mockup.design.md`) — 컴포넌트 설계 + API 인터페이스 상세
2. [ ] AXIS DS 패키지 설치 테스트 (`pnpm add @axis-ds/ui-react @axis-ds/agentic-ui @axis-ds/theme @axis-ds/tokens`)
3. [ ] app-mockup 스캐폴딩 시작 (S1)
4. [ ] Foundry-X 연동 범위 확정 (L1/L2/L3 중 최종 결정)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial draft — 4 demos + 3-layer architecture + Foundry-X L1 연동 | Sinclair Seo |
