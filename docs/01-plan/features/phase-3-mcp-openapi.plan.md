# Phase 3 — MCP/OpenAPI 실사용 검증

> **Summary**: Phase 2에서 구현한 MCP adapter와 OpenAPI adapter를 실제 클라이언트(Claude Desktop, Postman 등)에서 테스트하고, Skill 패키지의 재사용성을 입증하는 검증 Phase
>
> **Project**: RES AI Foundry
> **Version**: v0.8 (Phase 3)
> **Author**: Sinclair Seo
> **Date**: 2026-03-03
> **Status**: Draft

---

## 0. Key Decisions (리뷰 확정)

| 항목 | 결정 | 근거 |
|------|------|------|
| **최우선 목표** | MCP 연동 검증 | Claude Desktop에서 Skill을 tool로 사용하는 E2E 경험이 AI Foundry 핵심 가치 |
| **테스트 환경** | Windows Claude Desktop | WSL2가 아닌 실제 데스크톱 앱에서 MCP Server 연결 |
| **LLM 전략** | 멀티 프로바이더 벤치마크 | 동일 정책에 대해 Anthropic/OpenAI/Google 3사 evaluate 결과 비교 |
| **진행 범위** | Sprint 1~3 전체 (10 태스크) | MCP Server Worker + Skill 버전관리까지 포함 |

---

## 1. Overview

### 1.1 Purpose

Phase 2까지 5-Stage 파이프라인을 완성하고, MCP/OpenAPI adapter 코드를 구현+배포했다 (48+ tests, staging/production). Phase 3의 **최우선 목표는 MCP 연동 검증** — Claude Desktop에서 퇴직연금 Skill을 tool로 사용하는 경험을 입증하는 것이다.

1. **[핵심] MCP adapter → Windows Claude Desktop** 연동으로 Skill-as-Tool 경험 검증
2. **OpenAPI adapter를 외부 REST 클라이언트**에서 호출하여 통합 가능성 입증
3. **멀티 프로바이더 벤치마크** — 동일 정책에 대해 Anthropic/OpenAI/Google evaluate 결과 비교
4. **Skill Marketplace MVP** — 검색/필터/다운로드 UX 구현
5. **MCP Server Worker** — 독립 Worker로 MCP protocol 전체 구현 (Sprint 3)

### 1.2 Background

- Phase 2 완료 상태: 11 Workers, 888+ tests, 13/15 문서 파싱, 171 skills (org-mirae-pension)
- MCP adapter: `GET /skills/:id/mcp` — 2024-11-05 protocol, 18 tests
- OpenAPI adapter: `GET /skills/:id/openapi` — 3.0.3 spec, 30+ tests
- .skill.json: JSON Schema Draft 2020-12, R2 저장, D1 카탈로그
- Cross-Org Comparison: 백엔드 API 완료, 프론트엔드 4번째 탭 구현

### 1.3 Related Documents

- PRD/TDS: `docs/AI_Foundry_PRD_TDS_v0.6.docx` (§44 Phase 3)
- Phase 2 Plan: `docs/01-plan/features/phase-2-pilot.plan.md`
- SPEC.md §5 Current Status / §6 Phase 3 계획
- MCP adapter: `services/svc-skill/src/routes/mcp.ts`
- OpenAPI adapter: `services/svc-skill/src/routes/openapi.ts`
- Skill types: `packages/types/src/skill.ts`

---

## 2. Scope

### 2.1 In Scope

- [ ] **P0** MCP adapter → Claude Desktop 실제 연동 테스트
- [ ] **P0** OpenAPI adapter → Swagger UI / Postman 실제 호출 테스트
- [ ] **P0** Skill evaluate 엔드포인트 구현 (POST /skills/:id/evaluate)
- [ ] **P1** Skill 카탈로그 검색/필터 API 고도화 (domain, trust level, keyword)
- [ ] **P1** Skill Detail 페이지 — MCP/OpenAPI 다운로드 + 미리보기
- [ ] **P1** Skill Marketplace 브라우즈 UX (카드 뷰, 필터 사이드바)
- [ ] **P2** Skill 버전 관리 (semver, breaking change 감지)
- [ ] **P2** MCP Server 모드 (standalone Worker로 MCP protocol 완전 구현)

### 2.2 Out of Scope

- 다른 도메인(퇴직연금 외) 문서 투입 → Phase 4
- MCP adapter의 실시간 정책 실행 (evaluate + reasoning) → Phase 4
- OpenAPI 기반 외부 시스템 프로덕션 통합 → Phase 4
- Skill 패키지 간 의존성 그래프 → Phase 4+

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | MCP adapter JSON을 Claude Desktop `claude_desktop_config.json`에 등록하고 tool로 사용 가능 | High | Pending |
| FR-02 | OpenAPI spec을 Swagger UI에서 import하고 evaluate 엔드포인트 호출 가능 | High | Pending |
| FR-03 | `POST /skills/:id/evaluate` — 정책 평가 요청을 받아 LLM 기반 응답 반환 (멀티 프로바이더 벤치마크 포함) | High | Pending |
| FR-04 | Skill 카탈로그 API: 도메인/신뢰도/키워드 기반 필터 + 페이지네이션 | Medium | Pending |
| FR-05 | Skill Detail 페이지에서 MCP/OpenAPI spec JSON 미리보기 + 다운로드 버튼 | Medium | Pending |
| FR-06 | Skill Marketplace 카드 뷰 — 도메인, 정책 수, 신뢰도 배지, 태그 표시 | Medium | Pending |
| FR-07 | Skill 다운로드 통계 대시보드 (adapter 유형별 다운로드 수 시계열) | Low | Pending |
| FR-08 | MCP Server Worker — 독립 Worker로 MCP protocol 전체 구현 (initialize, tools/list, tools/call) | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | MCP/OpenAPI spec 생성 < 200ms (on-the-fly) | Cloudflare Worker analytics |
| Performance | Skill evaluate 응답 < 5s (LLM 포함) | E2E test timing |
| Compatibility | MCP 2024-11-05 protocol 100% 준수 | Claude Desktop 실동작 |
| Compatibility | OpenAPI 3.0.3 유효성 100% | Swagger Validator |
| Security | evaluate 호출 시 Bearer JWT 인증 필수 | RBAC 미들웨어 |
| Availability | Skill API 가용성 99.9% | Cloudflare analytics |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Claude Desktop에서 MCP tool 목록 표시 + 실제 invoke 성공
- [ ] Swagger UI에서 OpenAPI spec 로드 + evaluate 호출 + 응답 수신
- [ ] Skill Marketplace 페이지에서 검색/필터/다운로드 동작
- [ ] Skill Detail 페이지에서 MCP/OpenAPI JSON 미리보기
- [ ] evaluate 엔드포인트 E2E 테스트 PASS
- [ ] typecheck + lint + 기존 tests 전체 PASS

### 4.2 Quality Criteria

- [ ] 신규 코드 테스트 커버리지 80% 이상
- [ ] Zero lint errors
- [ ] Production + Staging 배포 + health 12/12

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Claude Desktop MCP 연동 실패 (프로토콜 변경) | High | Low | MCP spec 2024-11-05 기준 구현 완료; 버전 확인 후 대응 |
| Anthropic 크레딧 부족으로 evaluate LLM 호출 불가 | High | Low | ✅ API 키 확보 완료; 멀티 프로바이더 fallback도 유지 |
| WSL2에서 Claude Desktop 연동 불가 | Medium | N/A | ✅ Windows Claude Desktop에서 테스트하기로 결정 |
| OpenAPI evaluate 엔드포인트 보안 우려 | Medium | Low | Bearer JWT + RBAC + rate limiting (svc-security) |
| Skill 평가 결과 품질 불일치 | Medium | Medium | Golden Test Set 정의 → LLM 출력 비교 → 프롬프트 튜닝 |

---

## 6. Architecture Considerations

### 6.1 Project Level

Enterprise (기존 아키텍처 유지 — 10 Workers MSA + Cloudflare 인프라)

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| MCP 제공 방식 | A) JSON 다운로드 + 외부 서버 설정 / B) 독립 MCP Worker | **A 우선, B는 P2** | A가 빠르게 검증 가능; B는 MCP 전체 프로토콜 구현 필요 |
| Evaluate 엔드포인트 위치 | A) svc-skill 내 라우트 / B) 별도 Worker | **A** | 기존 서비스에 라우트 추가가 단순; Skill 데이터 접근 용이 |
| LLM 호출 방식 | A) svc-llm-router 경유 / B) 직접 호출 | **A** | 기존 tier routing + fallback + cost tracking 활용 |
| Skill 검색 | A) D1 LIKE 쿼리 / B) Workers AI embedding 검색 | **A 우선** | 171건 규모에선 LIKE로 충분; 규모 확대 시 B 전환 |

### 6.3 신규 컴포넌트

```
Phase 3 신규/변경:
┌─────────────────────────────────────────────────────────┐
│ svc-skill (기존 Worker 확장)                              │
│   ├── POST /skills/:id/evaluate    ← NEW (정책 평가)     │
│   ├── GET  /skills/search          ← NEW (카탈로그 검색)  │
│   ├── GET  /skills/:id/mcp         ← EXISTING            │
│   └── GET  /skills/:id/openapi     ← EXISTING            │
├─────────────────────────────────────────────────────────┤
│ app-web (Pages SPA 확장)                                  │
│   ├── /skill-catalog → 카드 뷰 + 필터 사이드바  ← ENHANCE │
│   ├── /skill-detail  → MCP/OpenAPI 미리보기     ← ENHANCE │
│   └── /marketplace   → 통합 브라우즈 UX         ← NEW     │
├─────────────────────────────────────────────────────────┤
│ MCP Server Worker (P2, 선택)                              │
│   └── svc-mcp-server ← NEW (독립 MCP Worker)             │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Implementation Plan (태스크 분해)

### Sprint 1 — MCP/OpenAPI 실증 (핵심)

| ID | Task | Dependency | Priority |
|----|------|-----------|----------|
| P3-01 | `POST /skills/:id/evaluate` 엔드포인트 구현 (svc-skill) | - | P0 |
| P3-02 | evaluate 라우트 테스트 작성 (unit + integration) | P3-01 | P0 |
| P3-03 | MCP adapter → Claude Desktop 연동 테스트 + 문서화 | P3-01 | P0 |
| P3-04 | OpenAPI adapter → Swagger UI 연동 테스트 + 문서화 | P3-01 | P0 |

### Sprint 2 — Skill Marketplace UX

| ID | Task | Dependency | Priority |
|----|------|-----------|----------|
| P3-05 | `GET /skills/search` 카탈로그 검색 API (domain, trust, keyword, pagination) | - | P1 |
| P3-06 | Skill Detail 페이지 고도화 — MCP/OpenAPI JSON 미리보기 + 다운로드 | P3-05 | P1 |
| P3-07 | Skill Marketplace 카드 뷰 + 필터 사이드바 | P3-05 | P1 |
| P3-08 | 다운로드 통계 API + Analytics 대시보드 연동 | P3-05 | P2 |

### Sprint 3 — 고도화 (선택)

| ID | Task | Dependency | Priority |
|----|------|-----------|----------|
| P3-09 | MCP Server Worker (독립 MCP protocol 구현) | P3-03 | P2 |
| P3-10 | Skill 버전 관리 (semver + migration helper) | - | P2 |

---

## 8. Convention Prerequisites

### 8.1 Existing Conventions (Phase 2에서 확립)

- [x] `CLAUDE.md` 코딩 규약 (TypeScript strict, inter-service auth, Worker 패턴)
- [x] ESLint + TypeScript strict 설정
- [x] Conventional Commits
- [x] D1 마이그레이션 패턴 (`.sql` + `wrangler d1 migrations apply`)
- [x] Service binding 내부 호출 패턴 (`X-Internal-Secret` 헤더)

### 8.2 Phase 3 추가 규약

| Category | Rule |
|----------|------|
| MCP tool naming | policy code lowercase, 하이픈 유지 (e.g., `pol-pension-wd-001`) |
| OpenAPI operationId | policy code, 하이픈→언더스코어 (e.g., `evaluate_pol_pension_wd_001`) |
| Evaluate 응답 | `{ result: string, confidence: number, reasoning?: string, policyCode: string }` |
| Skill 검색 API | `?domain=&trust=&q=&page=&limit=` 쿼리 파라미터 |

---

## 9. Next Steps

1. [ ] 이 Plan 문서 리뷰 → 승인
2. [ ] Design 문서 작성 (`phase-3-mcp-openapi.design.md`)
3. [ ] Sprint 1부터 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-03 | Initial draft | Sinclair Seo |
| 0.2 | 2026-03-03 | Key Decisions 반영 (MCP 우선, Windows Claude Desktop, 멀티 프로바이더, Sprint 1~3 전체) | Sinclair Seo |
