# Recon-X MSA 재조정 Planning Document

> **Summary**: res-ai-foundry를 Recon-X(역공학 전담)로 전환 — 플랫폼 SVC 5개 분리 + RE 파이프라인 집중 + 서비스 연동 인터페이스 정의
>
> **Project**: AI Foundry → Recon-X
> **Version**: v0.6 → v0.7 (전환 완료 후)
> **Author**: Sinclair Seo
> **Date**: 2026-04-07
> **Status**: Draft
> **REQ**: AIF-REQ-030 (P0), AIF-REQ-031 (P1)
> **PRD**: `docs/recon-x-restructuring/prd-final.md`

---

## 1. Overview

### 1.1 Purpose

현재 12개 Cloudflare Workers + 10개 D1이 단일 리포에 공존하는 구조에서, RE(Reverse Engineering) 5-Stage 파이프라인에 집중하기 위해 플랫폼 기능(인증, 거버넌스, 알림, 분석)을 분리한다. 이를 통해:
- Recon-X 역할 명확화 (역공학 전담 서비스)
- 다른 *-X 서비스(Foundry-X, Discovery-X 등)와의 연동 인터페이스 확보
- AX BD MSA 재조정(FX-DSGN-MSA-001)의 첫 번째 서비스 분리 선례

### 1.2 Background

- AI Foundry v0.6은 5-Stage RE 파이프라인 + 플랫폼 기능이 혼재
- AX BD 서비스 그룹 MSA 재조정 설계서(Phase 19, Sprint 175~190)에 따라 7개 독립 서비스로 분리 예정
- 이 Plan은 그 중 S2. Recon-X(현 res-ai-foundry) 전환에 집중
- Foundry-X Phase 18과 병행하여 즉시 시작

### 1.3 Related Documents

- PRD: `docs/recon-x-restructuring/prd-final.md` (82점, 2회 검토)
- MSA 설계서: `docs/AX-BD-MSA-Restructuring-Plan.md` (FX-DSGN-MSA-001 v3)
- SPEC.md §6 Phase 5, §7 AIF-REQ-030/031
- 인터뷰 로그: `docs/recon-x-restructuring/interview-log.md`

---

## 2. Scope

### 2.1 In Scope

- [x] M1: 플랫폼 SVC 5개 제거 (svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics)
- [x] M2: D1 바인딩 정리 — 잔류 7 Workers의 wrangler.toml 불필요 바인딩 제거
- [x] M3: LLM 라우팅 전환 — HTTP 외부 호출 방식으로 전환
- [x] M4: 프론트엔드 정리 — 포털 성격 페이지 제거 (20 → ~10 페이지)
- [x] M5: 리포 리네임 준비 — 내부 참조 정리
- [x] M6: E2E 테스트 조정 — 분리 기능 테스트 제거/수정, 잔류 PASS 확인
- [x] M7: 서비스 연동 인터페이스 정의 — MCP/Event/REST 문서화 + 엔드포인트
- [x] S1~S4: CI/CD, 모니터링, Turborepo, 문서 갱신 (AIF-REQ-031)

### 2.2 Out of Scope

- AI Foundry 포털(S0) 구축 — 별도 프로젝트
- GIVC PoC (F255, F256) — 전환 완료 후
- 새 파일럿 도메인 추가 — 전환 후
- 분리된 SVC의 독립 리포 생성 — 포털 팀에서 처리

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics 5개 Worker 디렉토리 + wrangler.toml 제거 | P0 | Pending |
| FR-02 | 잔류 7 Workers의 wrangler.toml에서 분리된 DB 바인딩(db-llm, db-security, db-governance, db-notification, db-analytics) 제거 | P0 | Pending |
| FR-03 | svc-llm-router 분리 후 파이프라인 LLM 호출을 HTTP REST로 전환. packages/utils에 llm-client 유틸 추가 | P0 | Pending |
| FR-04 | app-web에서 포털 성격 라우트/컴포넌트 제거: dashboard, login, settings, team, audit, chat (~10 라우트) | P0 | Pending |
| FR-05 | package.json, CLAUDE.md, SPEC.md, turbo.json 등 내부 참조를 Recon-X 관점으로 갱신 | P0 | Pending |
| FR-06 | Playwright E2E 테스트에서 분리된 기능 관련 테스트 제거, 잔류 기능 전체 PASS 확인 | P0 | Pending |
| FR-07 | Foundry-X MCP/Event 연동 인터페이스 문서화 + REST 엔드포인트 구현 | P0 | Pending |
| FR-08 | deploy.yml에서 분리된 SVC 배포 제거 | P1 | Pending |
| FR-09 | health-check.sh에서 분리 SVC 제거 | P1 | Pending |
| FR-10 | turbo.json 패키지 목록 정리 | P1 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 데이터 무손실 | policies 3,675 + skills 3,924 무손실 | D1 COUNT 비교 (before/after) |
| 배포 안정성 | Recon-X 7 Workers 독립 배포 정상 | `GET /health` 전체 200 |
| 테스트 | 잔류 기능 E2E 전체 PASS | `bun run test` + Playwright |
| API 호환성 | 기존 MCP/REST API 동일 동작 | E2E + curl 검증 |
| 롤백 가능 | git revert로 전환 전 상태 복원 가능 | git tag v0.6-pre-restructuring |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 플랫폼 5 Workers가 리포에서 완전 제거됨
- [ ] Recon-X 7 Workers가 독립 배포되어 정상 동작 (health 200)
- [ ] 파일럿 데이터 무손실 확인 (D1 COUNT 일치)
- [ ] Foundry-X MCP 연동 인터페이스 정의 + 테스트
- [ ] E2E 테스트 전체 PASS
- [ ] typecheck + lint 0 errors

### 4.2 Quality Criteria

- [ ] typecheck 0 errors (bun run typecheck)
- [ ] lint 0 errors (bun run lint)
- [ ] 잔류 기능 unit test 전체 PASS
- [ ] E2E 테스트 PASS (분리 기능 제외)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM 라우팅 분리로 파이프라인 불안정 | High | Medium | Option A(HTTP 외부호출)로 시작. 문제 시 기존 service binding 코드 백업으로 복원 |
| D1 바인딩 제거 시 런타임 에러 | High | Medium | typecheck로 참조 누락 감지 + 스테이징 테스트 |
| 프론트엔드 공유 컴포넌트 깨짐 | Medium | Medium | shadcn/ui 기반이라 독립적. Layout/Sidebar만 주의 |
| 2주 일정 초과 | Medium | Medium | S1~S4를 별도 Sprint로 분리 가능 |
| GitHub 리네임 후 CI/CD 깨짐 | Low | Low | GitHub 자동 리다이렉트 + Actions secrets 재확인 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, BaaS | Web apps with backend | ☐ |
| **Enterprise** | Strict layer separation, microservices | High-traffic, complex arch | ☑ |

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| LLM 라우팅 | A: HTTP 외부호출 / B: 내재화 | **A: HTTP 외부호출** | 중복 코드 없음, 중앙 관리 유지. 네트워크 홉은 CF Workers 내부라 미미 |
| 프론트엔드 인증 | 독립 인증 / 포털 SSO 의존 | **임시 독립 인증** | 포털 미구축 상태이므로 기존 인증 로직 경량 유지. 포털 구축 후 SSO 전환 |
| 보안 로직 | inline 복사 / 외부 호출 | **경량 inline** | RBAC 미들웨어만 packages/utils에 유지. 감사 로그는 외부 호출 대비 |
| DB 바인딩 분리 | 동일 계정 / 별도 계정 | **동일 계정 잔류** | Cloudflare 계정 분리는 포털 구축 시. 현재는 바인딩 참조만 제거 |

### 6.3 전환 후 아키텍처

```
Recon-X (전환 후)
├── services/
│   ├── svc-ingestion/          # Stage 1: Document Ingestion
│   ├── svc-extraction/         # Stage 2: Structure Extraction
│   ├── svc-policy/             # Stage 3: Policy Inference
│   ├── svc-ontology/           # Stage 4: Ontology
│   ├── svc-skill/              # Stage 5: Skill Packaging
│   ├── svc-queue-router/       # Pipeline Event Bus
│   └── svc-mcp-server/         # MCP Server (Streamable HTTP)
├── apps/app-web/               # Recon-X 전용 UI (~10 pages)
├── packages/
│   ├── types/                  # @ai-foundry/types (Recon-X 전용으로 경량화)
│   └── utils/                  # @ai-foundry/utils (+ llm-client 유틸)
└── infra/migrations/           # 5 DB migrations (ingestion, structure, policy, ontology, skill)

제거 대상 (별도 보관 후 삭제)
├── services/svc-llm-router/    → 포털 or 독립 서비스
├── services/svc-security/      → 포털
├── services/svc-governance/    → 포털
├── services/svc-notification/  → 포털
├── services/svc-analytics/     → 포털
└── infra/migrations/db-{llm,security,governance,notification,analytics}/
```

---

## 7. Implementation Plan

### 7.1 Sprint 구성

#### Sprint 1 (W1: 2026-04-07 ~ 04-13) — 분리 + 정리

| # | 작업 | 파일/모듈 | 예상 규모 |
|---|------|----------|----------|
| 1.1 | 전환 전 태그 생성 | `git tag v0.6-pre-restructuring` | 1 cmd |
| 1.2 | 플랫폼 SVC 5개 디렉토리 제거 | `services/svc-{llm-router,security,governance,notification,analytics}/` | 5 dirs |
| 1.3 | 분리 DB 마이그레이션 디렉토리 제거 | `infra/migrations/db-{llm,security,governance,notification,analytics}/` | 5 dirs |
| 1.4 | 잔류 Workers wrangler.toml 바인딩 정리 | 7개 wrangler.toml | ~7 files |
| 1.5 | LLM 호출 전환: service binding → HTTP REST | packages/utils/src/llm-client.ts + 각 서비스 호출부 | ~10 files |
| 1.6 | packages/types 분리 SVC 전용 타입 제거 | packages/types/src/ | ~5 files |
| 1.7 | 프론트엔드 포털 페이지 제거 | apps/app-web/src/ (routes, components, pages) | ~15 files |
| 1.8 | typecheck + lint 확인 | `bun run typecheck && bun run lint` | verification |

#### Sprint 2 (W2: 2026-04-14 ~ 04-21) — 리네임 + 테스트 + 연동

| # | 작업 | 파일/모듈 | 예상 규모 |
|---|------|----------|----------|
| 2.1 | 내부 참조 정리 (package.json, CLAUDE.md, SPEC.md, turbo.json) | 프로젝트 루트 | ~5 files |
| 2.2 | E2E 테스트 조정 — 분리 기능 제거 + 잔류 PASS | apps/app-web/e2e/ | ~10 files |
| 2.3 | 서비스 연동 인터페이스 문서화 | docs/interfaces/ | ~3 files |
| 2.4 | CI/CD 파이프라인 조정 (deploy.yml) | .github/workflows/ | ~2 files |
| 2.5 | 모니터링 조정 (health-check.sh) | scripts/ | ~1 file |
| 2.6 | 데이터 무손실 검증 | D1 COUNT 비교 스크립트 | ~1 file |
| 2.7 | 배포 + E2E 최종 검증 | production 배포 | verification |
| 2.8 | GitHub repo 리네임 실행 | KTDS-AXBD/AI-Foundry → Recon-X | 1 cmd |

### 7.2 의존성 그래프

```
1.1 (태그) ──→ 1.2 (SVC 제거) ──→ 1.4 (바인딩 정리) ──→ 1.5 (LLM 전환) ──→ 1.8 (typecheck)
                  │                                          │
                  └──→ 1.3 (DB migrations 제거)              └──→ 1.6 (타입 정리)
                                                              │
                                                              └──→ 1.7 (프론트엔드) ──→ 1.8 (typecheck)

1.8 ──→ 2.1 (참조 정리) ──→ 2.2 (E2E) ──→ 2.7 (배포) ──→ 2.8 (리네임)
         │                                   ↑
         └──→ 2.3 (인터페이스) ──→ 2.4 (CI/CD) ──→ 2.5 (모니터링) ──→ 2.6 (데이터 검증)
```

### 7.3 롤백 전략

| 단계 | 롤백 방법 |
|------|----------|
| Sprint 1 중 문제 발생 | `git revert` → v0.6-pre-restructuring 태그로 복원 |
| Sprint 2 배포 후 문제 | `git revert` + `wrangler deploy` (이전 코드 재배포) |
| GitHub 리네임 후 문제 | GitHub이 자동 리다이렉트 제공. CI secrets만 재확인 |
| 데이터 손실 발견 | D1 바인딩 제거만 했으므로 데이터 자체는 Cloudflare 계정에 잔류. 바인딩 복원으로 접근 가능 |

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`recon-x-restructuring.design.md`)
2. [ ] Sprint 1 구현 시작 (W1)
3. [ ] Sprint 2 구현 (W2)
4. [ ] Gap Analysis (`/pdca analyze recon-x-restructuring`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-07 | Initial draft (prd-final.md 기반) | Sinclair Seo |
