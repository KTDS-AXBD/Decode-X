# AIF-REQ-036 Planning Document — Phase 3 UX 재편 (듀얼 트랙 + AXIS DS 연동)

> **Summary**: 본부장 3분 설득 + 엔지니어 Spec→Source 3클릭 역추적을 위한 듀얼 트랙 UX 레이어 + AXIS DS 첫 Full 소비자
>
> **Project**: Decode-X (AI Foundry / Foundry-X 제품군)
> **REQ**: AIF-REQ-036 (Feature / UX / P1 / **PLANNED**)
> **Version**: 0.1
> **Author**: Sinclair Seo (AX BD팀)
> **Date**: 2026-04-21 (세션 221 후반)
> **Status**: Draft — Sprint 219 착수 대기
> **PRD**: `docs/req-interview/decode-x-v1.3-phase-3-ux/prd-final.md` (v0.3, R1+R2 평균 75/100 ✅)

---

## 1. Overview

### 1.1 Purpose

Phase 3 품질 도구(AIF-REQ-035)와 Foundry-X Production E2E 실사례를 **한 화면에서 3분 내 설득·3클릭 내 역추적** 가능한 UX 레이어로 재편한다. 동시에 **AXIS Design System의 첫 Full 소비자 레퍼런스**가 되어 Foundry-X/Launch-X/Eval-X로의 확장을 선점한다.

### 1.2 Background

- **현 문제**: 자가보고 99.7% vs 독립 검증 95.6% drift 문제가 PRD 수치로는 입증됐지만, "3분 내 설득"되는 UX 없음
- **메뉴 부하**: 5 페르소나 혼재 + 24 페이지(Sprint 흔적 누적) + DEMO_USERS 하드코딩 로그인 → 본부장 리뷰/외부 회람 불가
- **AXIS DS 기회**: `IDEA-on-Action/AXIS-Design-System`이 다른 `*-X` 제품군으로 확장되기 전에 선제 소비자 레퍼런스 확보
- **R1/R2 검토 완료**: PRD v0.3 평균 75/100 ✅ + 가중 이슈 밀도 5.0→3.6/1K자 -28% 실질 개선 (세션 221)

### 1.3 Related Documents

- **PRD (SSOT)**: `docs/req-interview/decode-x-v1.3-phase-3-ux/prd-final.md` (v0.3, 409줄)
- **외부 AI 검토 이력**: `docs/req-interview/decode-x-v1.3-phase-3-ux/review-history.md` (R1+R2)
- **Provenance 실측**: `docs/03-analysis/features/provenance-coverage-2026-04-21.md`
- **상위 REQ**: `SPEC.md §7 AIF-REQ-036`, 병렬 `AIF-REQ-035 Phase 3` (본 PRD)
- **AXIS DS 구상**: `docs/AX-BD-MSA-Restructuring-Plan.md §S7`
- **현 사이드바**: `apps/app-web/src/components/Sidebar.tsx`

---

## 2. Scope

### 2.1 In Scope (MVP — S219~S221)

- [ ] Google OAuth (Cloudflare Access + Google IdP, Allowlist)
- [ ] D1 `users` 테이블 신설 (email/primary_role/status/last_login)
- [ ] 기존 5 페르소나 완전 삭제 + DEMO_USERS 폐기
- [ ] 4 역할 체계 (Executive/Engineer/Admin/Guest) + 모드 토글
- [ ] **Executive View** — Foundry-X 핸드오프 실사례 타임라인(6개 서비스) + hover/expand 상세
- [ ] **Engineer Workbench Split View** — 좌 Spec / 우 재구성 마크다운 section 앵커 스크롤
- [ ] **Provenance Inspector** (우측 drawer)
- [ ] Fallback/Graceful Degradation Flow 3단계 (section-only / pageRef 없음 / provenance 미존재)
- [ ] Archive 실행 (5 하드 삭제 + 5 재설계 + 11 이관)
- [ ] AXIS DS Tier 1~2: `@axis-ds/tokens` + `@axis-ds/react` 8종 교체
- [ ] Feature Flag `?legacy=1` 듀얼 화면 롤아웃
- [ ] Admin 기본 (Users + Organization + Health + Usage)
- [ ] QA/E2E 테스트 자동화 95% 통과율

### 2.2 Should (S222)

- [ ] AXIS DS Tier 3: 도메인 특화 컴포넌트 3종(SpecSourceSplitView/ProvenanceInspector/StageReplayer) AXIS DS 레포 기여 PR
- [ ] Guest/Demo 읽기 전용 데이터 모드

### 2.3 Out of Scope (Phase 4+ or F364)

- ❌ 원본 소스코드 줄 하이라이트 (sourceLineRange 스키마 부재, **F364** 분리)
- ❌ 원본 SI 산출물(DOCX/PPT) 페이지 앵커 (백포인터 부재)
- ❌ Figma Sync (`@axis-ds/figma-sync`)
- ❌ `@axis-ds/prototype-kit` 연동 (Foundry-X 쪽 작업)
- ❌ 모바일/태블릿 최적화
- ❌ 외부 감사 로그인

---

## 3. Requirements

### 3.1 Functional Requirements (F-item 제안)

> Sprint 219 진입 전 SPEC.md §6 Phase 8에 공식 F번호 배정 예정. 아래는 제안 번호(F370~F384).

#### S219 (선행 + 병행) — M-UX-1: 인증 & 기반

| ID | Requirement | Priority | 예상 |
|----|-------------|:--------:|:----:|
| **F370** | Google OAuth (Cloudflare Access + Google IdP, Allowlist) | P0 | 4h |
| **F371** | D1 `users` 테이블 신설 + 마이그레이션 0010_users.sql | P0 | 2h |
| **F372** | Guest 랜딩 페이지 (`/welcome` — 3줄 요약 + Google 로그인 CTA) | P0 | 2h |
| **F373** | AXIS DS Tier 1: `@axis-ds/tokens` CSS variable 주입 | P1 | 2h |
| **F374** | Feature Flag `?legacy=1` skeleton | P0 | 1h |
| **F385** | §12 Rollout/온보딩 본문 작성 (PRD 보완 or separate doc) | P1 | 2h |
| **F389** | DEMO_USERS 폐기 + 5 페르소나 UI 제거 마이그레이션 | P0 | 2h |

#### S220 — M-UX-2: Executive View

| ID | Requirement | Priority | 예상 |
|----|-------------|:--------:|:----:|
| **F375** | Executive View Overview + 4 Group 요약 위젯 | P0 | 4h |
| **F376** | Foundry-X 핸드오프 실사례 타임라인 (6 서비스 round-trip) + hover/expand 상세 | P0 | 6h |
| **F377** | Archive 실행 (5 하드 삭제 + 5 재설계 + 11 이관) + 라우트 제거 | P0 | 4h |
| **F378** | Evidence 서브메뉴 (analysis-report + org-spec + poc-report 재배치) | P1 | 2h |
| **F386** | Spec↔Source 규제 준수/감사 스토리 강화 (Foundry-X 타임라인에 compliance 뱃지) | P1 | 2h |
| **F390** | Cloudflare Web Analytics 활성화 + Archive 실측 데이터 수집 시작 | P0 | 1h (선행) |

#### S221 — M-UX-3: Engineer Workbench

| ID | Requirement | Priority | 예상 |
|----|-------------|:--------:|:----:|
| **F379** | Engineer Workbench Split View (좌 Spec / 우 재구성 마크다운 + section 앵커) | P0 | 6h |
| **F380** | Provenance Inspector (우측 drawer + 그래프 탐색) | P0 | 4h |
| **F381** | AXIS DS Tier 2: `@axis-ds/react` 8종 교체 (Button/Card/Tabs/Dialog/Input/Select/Tooltip/Badge) | P1 | 4h |
| **F382** | Admin 기본 (Users CRUD + Organization + Health + Usage Dashboard) | P0 | 4h |
| **F387** | Role별 Audit Log 설계 + Admin 페이지 노출 | P1 | 3h |
| **F388** | Section-only Fallback 실사용자 파일럿 (3명 인터뷰 + 체감 측정) | P1 | 2h |
| **F391** | `GET /skills/:id/provenance/resolve` API 신설 (svc-skill) | P0 | 3h |
| **F392** | QA/E2E 자동화 (Playwright + smoke + regression + 95% 통과율) | P0 | 4h |

#### S222 Should — M-UX-4

| ID | Requirement | Priority | 예상 |
|----|-------------|:--------:|:----:|
| **F383** | AXIS DS Tier 3: 도메인 특화 컴포넌트 3종 PR 생성 (SpecSourceSplitView/ProvenanceInspector/StageReplayer) | P2 | 8h |
| **F384** | Guest/Demo 모드 (읽기 전용 데이터) | P2 | 4h |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| **KPI-1 (설득력)** | 동료 1명이 Foundry-X 실사례 1건을 설명 없이 **3분 내** 파악 | 관찰 스크립트 + 녹화 1회 (S221 완료 시) |
| **KPI-2 (역추적)** | 임의 policy/rule/skill 10건 → Split View 재구성 마크다운 section heading 포커스 **≤ 3 클릭** | E2E 스크립트 or 수동 관찰 |
| **KPI-3 (QA)** | E2E 자동화 테스트 통과율 **≥ 95%** | Playwright/Cypress |
| Performance | Split View 로딩 < 500ms | Lighthouse |
| Security | OAuth Allowlist 100% 적용, INTERNAL_API_SECRET 보존 | CF Access 로그 |
| Accessibility | WCAG 2.1 AA (AXIS DS 준거) | axe-core |

---

## 4. Success Criteria

### 4.1 Definition of Done (S221 완료 시)

- [ ] KPI-1 본부장 3분 테스트 PASS
- [ ] KPI-2 Split View 클릭 ≤ 3 (10건 샘플)
- [ ] KPI-3 QA/E2E 95% 통과
- [ ] Legacy Feature Flag 삭제 가능 상태 (스모크 PASS)
- [ ] Production 배포 완료 (Cloudflare Pages + Access)
- [ ] SPEC.md §7 AIF-REQ-036 **PLANNED → DONE** 전환
- [ ] `/pdca archive AIF-REQ-036 --summary` 완료

### 4.2 Quality Criteria

- [ ] AXIS DS 핵심 컴포넌트 교체율 ≥ 80%
- [ ] 페이지 수 40% 감축 (24 → 14 이하)
- [ ] Ambiguity 0.175 → **≤ 0.15** (실행 중 해소)
- [ ] R2 Sprint 전이 항목 9건 모두 해소 or TD 등록
- [ ] Pre-existing lint/typecheck 무영향

---

## 5. Risks and Mitigation

> PRD §9.1 R1~R18을 기반으로 Plan 실행 관점에서 5대 핵심 리스크 재구성.

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|:------:|:----------:|------------|
| **RP-1** | AXIS DS npm 미성숙 | High | Medium | S219 Day 1 `npm view @axis-ds/tokens @axis-ds/react` 실측. 미성숙 시 Tier 3 S222로 유예, Tier 1~2 shadcn 유지 |
| **RP-2** | Cloudflare Access 50석 초과 | Medium | Low | S219 Day 1 KTDS-AXBD org 현 사용자 수 집계. 초과 시 유료 플랜 또는 Guest fallback |
| **RP-3** | §12 온보딩 본문 미작성으로 R2 Ready 판정 실패 재발 | Medium | High (현 상태) | **F385 S219 첫 주 확정** (Plan의 선행 조건) |
| **RP-4** | 1인 3 Sprint 병행 리소스 초과 | High | Medium | Sprint별 주요 리드타임 사전 확보 + Phase 3 본 PRD 병행 일정 조정 + 일일 버퍼 30분 |
| **RP-5** | Archive 실측 데이터 부족으로 결정 근거 약화 | Medium | Medium | **F390 S219 Day 1 활성화**, S220 Archive 실행 전 2~4주 수집 완료 |
| **RP-6** | Split View UI 복잡도 과소평가 (좌우 동기화 스크롤, 리사이즈) | Medium | Medium | S221 spike 반나절 + AXIS DS 기본 컴포넌트 활용으로 복잡도 축소 |
| **RP-7** | Fallback Flow 실사용자 체감 품질 저하 (R5 + R2 ChatGPT 지적) | High | Medium | **F388 S221** 3명 인터뷰로 조기 검증. Section heading 포커스 UX tuning 가능 |
| **RP-8** | AIF-REQ-035 Phase 3 진행 지연 시 REQ-036 데이터 소스 공백 | High | Low | Foundry-X 타임라인은 "예시 데이터 + 실제 1/7 사례" 혼합 수용 가능. 완전 공백이면 S220 Milestone 재조정 |

---

## 6. Architecture Considerations

### 6.1 Project Level

**Dynamic** (기존 Decode-X `apps/app-web`은 React + Vite SPA, bkend.ai 미사용 — Cloudflare-native 백엔드 8개 서비스 중 svc-skill 확장)

### 6.2 Key Architectural Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| Framework | **React + Vite** (기존) | 현 `apps/app-web` 구조 유지 |
| 인증 | **Cloudflare Access + Google IdP** | 앱 코드 OAuth zero, Allowlist 가능, R2 DeepSeek 조건 해소 |
| Design System | **@axis-ds/react (Tier 2) + @axis-ds/tokens (Tier 1)** | 조직 공용 DS 첫 Full 소비자 확보 |
| Feature Flag | **URL query `?legacy=1`** (경량) | 롤아웃 듀얼 화면, 롤백 쉬움 |
| State Management | **기존 Zustand** 유지 | `app-web` 현 구조 |
| Testing | **Vitest (unit) + Playwright (E2E)** | 기존 `pnpm test` 파이프라인 |
| Split View 백엔드 | **svc-skill `GET /skills/:id/provenance/resolve` 신설** | R2 + D1 + spec-container path/section 1회 집약 |
| DB | **D1 db-skill 0010_users.sql 추가** | users 테이블 신설, 기존 5 DB 유지 |

### 6.3 Folder Structure

```
apps/app-web/src/
├── components/
│   ├── axis-ds/              (NEW — Tier 2 교체 래퍼)
│   ├── executive/            (NEW — Executive View 전용)
│   │   ├── FoundryXTimeline.tsx
│   │   └── HandoffCard.tsx
│   ├── engineer/             (NEW — Engineer Workbench 전용)
│   │   ├── SpecSourceSplitView.tsx
│   │   ├── ProvenanceInspector.tsx
│   │   └── StageReplayer.tsx
│   ├── admin/                (NEW — Admin 기본)
│   │   ├── UsersManager.tsx
│   │   └── AuditLog.tsx
│   └── _archived/            (NEW — 하드 삭제 대상 임시 격리)
├── pages/
│   ├── _archived/            (5건 이동 후 삭제)
│   ├── welcome.tsx           (NEW — Guest 랜딩)
│   └── ... (재배치)
├── lib/
│   ├── auth.ts               (NEW — CF Access JWT 파싱)
│   └── feature-flag.ts       (NEW)
└── styles/
    └── axis-ds-tokens.css    (NEW — Tier 1 주입)

services/svc-skill/src/
├── routes/
│   └── provenance.ts         (NEW — GET /skills/:id/provenance/resolve)
└── provenance/               (NEW)
    └── resolver.ts

infra/migrations/db-skill/
└── 0010_users.sql            (NEW — D1 users 테이블)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions (활용)

- [x] `CLAUDE.md` 코딩 컨벤션 섹션 존재
- [x] ESLint Flat Config (`eslint.config.js`)
- [x] TypeScript strict (`tsconfig.base.json` — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` 준수)
- [x] Pre-commit hooks (`.env` 차단 + typecheck + lint)

### 7.2 Environment Variables (신규)

| Variable | Purpose | Scope | 작업 |
|----------|---------|-------|------|
| `CLOUDFLARE_ACCESS_AUD` | JWT audience 검증 | Server (app-web backend or svc) | F370 |
| `GOOGLE_OAUTH_ALLOWED_DOMAINS` | Allowlist 도메인 (ktds-axbd.com 등) | Server | F370 |
| `ADMIN_ALLOWLIST_EMAILS` | 초기 Admin 이메일 (bootstrap) | Server | F371 |

### 7.3 Pipeline Integration

이 프로젝트는 9-phase Development Pipeline 적용 제외 (기존 Phase 5 MSA 재조정 완료 프로젝트). 대신 SPEC.md §6 Phase 9 (v1.3 Phase 3 UX 재편)으로 트랙 관리.

---

## 8. Sprint 분해 & 의존성

### 8.1 Sprint 선행 조건 (S219 Day 1)

다음 3건은 **S219 착수 전 or Day 1 해소 필수** (PRD §6.2 + RP-1/RP-2/RP-5 대응):

1. **AXIS DS npm publish 실측** — `npm view @axis-ds/tokens @axis-ds/react` 실행, 버전/publish 상태 확인
2. **Cloudflare Access Free tier 50석 확인** — KTDS-AXBD org 현 사용자 수 집계 + 공식 확인서 확보
3. **Cloudflare Web Analytics 활성화** (F390) — `ai-foundry-web` Pages project beacon 주입

### 8.2 Sprint 간 의존성

```
S219 (병행 Phase 3 본 Sprint와 동시) ─┐
  F370 OAuth ──────────────┐           │
  F371 D1 users ───────────┤           │
  F372 랜딩 ────────────────┤           │
  F373 AXIS 토큰 ──────────┤           │
  F374 Feature Flag ───────┤           │
  F385 §12 온보딩 ─────────┤           │
  F389 DEMO 폐기 ──────────┤           │
  F390 CF Analytics 선행 ─┘           │
                          ↓           │
S220 ─────────────────────────────────┤
  F390 Archive 데이터 수집 중 ──┐      │
  F375 Executive View ───────┤      │
  F376 Foundry-X 타임라인 ───┤←─ REQ-035 Phase 3 데이터 의존
  F377 Archive 실행 ──────────┤←─ F390 데이터 필요
  F378 Evidence 서브메뉴 ────┤
  F386 규제 준수 스토리 ──────┘
                          ↓
S221 ─────────────────────────────────┤
  F391 provenance API ────────┐      │
  F379 Split View ───────────┤←─ F391 필요
  F380 Provenance Inspector ─┤
  F381 AXIS Tier 2 교체 ────┤
  F382 Admin 기본 ───────────┤
  F387 Role별 Audit Log ─────┤
  F388 Section-only 파일럿 ──┤
  F392 QA/E2E 자동화 ────────┘
                          ↓
S222 Should ──────────────────────────┤
  F383 AXIS Tier 3 기여 ──────┐
  F384 Guest/Demo ─────────────┘
```

### 8.3 병렬 가능 작업 (S219 git-team split 검토)

S219 내 독립 작업 3그룹 (의존성 없음):
- **Pane A**: F370 + F371 (백엔드 인증)
- **Pane B**: F372 + F373 + F374 (프론트엔드 skeleton)
- **Pane C**: F385 + F389 + F390 (문서/정리/Analytics)

`/ax:git-team` 또는 단일 pane 순차 실행 판단은 S219 착수 시점 판단.

---

## 9. R2 Sprint 전이 항목 (9건, PRD v0.3 review-history 관리)

| R2 지적 | F-item 매핑 | Sprint | 상태 |
|---------|:-----------:|:------:|:----:|
| Section-only fallback 실사용자 파일럿 | **F388** | S221 | 계획 |
| Archive 실측 데이터 1차 결정 | **F390** + F377 | S219~220 | 계획 |
| §12 온보딩 본문 작성 | **F385** | S219 초 | 계획 |
| 레거시 DEMO_USERS 마이그레이션 | **F389** | S219 | 계획 |
| Role별 Audit Log 설계 | **F387** | S221 | 계획 |
| "놀교 동료" KPI 평가자 정의 구체화 | KPI-1 하위 작업 | S221 | 계획 |
| Spec↔Source 규제 준수 스토리 | **F386** | S220 | 계획 |
| AXIS DS 기술 협약 | S219 선행 | S219 Day 0 | **미착수 (RP-1)** |
| CF Access 공식 확인서 | S219 선행 | S219 Day 0 | **미착수 (RP-2)** |

---

## 10. Next Steps

1. [x] ~~Design 문서 작성~~ ✅ 세션 225 (`18035c0` + S2 역동기화 `db1febd`)
2. [x] ~~SPEC.md §6 Phase 9 F-item 공식 등록~~ ✅ 세션 226 (`1ed08c5`, 15건 F370~F392 + 세션 229 F396 신규)
3. [x] ~~Sprint 219 WT 생성~~ → 번호 재배치 완료: Sprint 223(S1 ✅ MERGED `c49d2ef`) / Sprint 224(S2 ✅ MERGED `a475a77`) / Sprint 226(S3 📋) / Sprint 227(S4 📋)
4. [ ] **Sprint 226 WT 생성** (세션 229 결정): `/ax:sprint 226` — autopilot 범위 F396 → F391 → F379/F380 → F381/F382/F387 → F388 → F392(TD-41 포함). §11.2 Follow-up Plan 참조
5. [ ] **Sprint 227 WT 생성** (Sprint 226 DONE 후): `/ax:sprint 227` — F383 AXIS DS Tier 3 + F384 Guest/Demo
6. [ ] **AXIS DS + CF Access 선행 2건 승인 프로세스 개시** (여전히 미착수, S3 Tier 2 교체 착수 전 승인 필수)

---

## 11. Follow-up Plan (세션 229, 2026-04-21)

> **Trigger**: Sprint 223 + 224 MERGED 이후 "메뉴 개편 후속 작업 계획" 사용자 요청. Sprint 225는 AIF-PLAN-037 G-1 Phase 2(converter.ts 패치)로 점유되어 AIF-REQ-036 S3 → Sprint 226, Should → Sprint 227로 이관된 배치를 확정한다.

### 11.1 진행 현황 스냅샷

| Sprint | Milestone | F-items | PR | 상태 |
|--------|-----------|---------|----|----|
| 223 | M-UX-1 인증/기반 | F370~F374, F385, F389 (7건) | #24 `c49d2ef` | ✅ MERGED (Match 94%) |
| 224 | M-UX-2 Executive View | F375~F378, F386, F390 + F374 실 분기 (6+1건) | #25 `a475a77` | ✅ MERGED (autopilot 97% / gap-detector 96%) |
| 225 | ← 번호 재배치 (G-1 Phase 2 converter.ts) | F393/F394/F395 (3건, AIF-PLAN-037) | #26 `710eaca` | ✅ MERGED (AIF-REQ-036 외부) |
| **226** | **M-UX-3 Engineer Workbench** | **F396 + F379~F382, F387, F388, F391, F392 (9건)** | — | **📋 PLANNED (Next)** |
| **227** | **Should M-UX-4** | **F383, F384 (2건)** | — | **📋 PLANNED 확정 포함** |

### 11.2 Sprint 226 범위 확정 (메뉴 개편 후속 핵심)

**배치 원칙**: 위생 → API 백엔드 → UX 전면 → 운영(Admin/Audit/파일럿) → QA/E2E(TD-41 해소)

**Wave 1 — 위생 선행 (1.5h)**
- [ ] **F396 (신규, P1)**: Gap-1 root 중복 5건 정리 + Sidebar 라우트 정합성 점검
  - `apps/app-web/src/pages/{analysis,benchmark,poc-ai-ready,poc-ai-ready-detail,poc-phase-2-report}.tsx` root 5건 삭제 (`_archived/` 일원화)
  - `app.tsx` redirect 5건 유지 검증 (런타임 정상 보존)
  - `Sidebar.tsx` 6 그룹 14 링크 실재 라우트 매칭률 100% 검증 (`/executive/overview`, `/executive/evidence`, `/export`, `/upload`, `/source-upload`, `/hitl`, `/fact-check`, `/gap-analysis`, `/skills`, `/specs`, `/api-console`, `/ontology`, `/settings`, `/mockup`, `/guide`)
  - typecheck + lint + E2E smoke PASS 후 다음 Wave로 진행
  - **이후 Wave에서 Sidebar 재점검 트리거**: F382 Admin + F387 Audit Log + F388 파일럿 등록 시 Admin 그룹 확장

**Wave 2 — 백엔드 API (3h, 단독 선행)**
- [ ] **F391 (P0)**: `GET /skills/:id/provenance/resolve` — svc-skill에 신설. R2 `.skill.json` + D1 `policies`/`terms` + spec-container `provenance.yaml` path/section 1회 집약. F379/F380가 소비

**Wave 3 — UX 전면 (10h, 핵심 경험)**
- [ ] **F379 (P0)**: Engineer Workbench Split View — 좌 Spec / 우 재구성 마크다운 section 앵커 스크롤
- [ ] **F380 (P0)**: Provenance Inspector — 우측 drawer + 그래프 탐색 (F391 응답 소비)
- [ ] **F381 (P1)**: AXIS DS Tier 2 — `@axis-ds/react` 8종(Button/Card/Tabs/Dialog/Input/Select/Tooltip/Badge) shadcn 래퍼 교체 (교체율 ≥ 80%)

**Wave 4 — 운영(Admin/Audit/파일럿) (9h)**
- [ ] **F382 (P0)**: Admin 기본 — Users CRUD + Organization + Health + Usage Dashboard
- [ ] **F387 (P1)**: Role별 Audit Log 설계 + Admin 페이지 노출 (5 역할 매트릭스)
- [ ] **F388 (P1)**: Section-only Fallback 실사용자 파일럿 — 3명 인터뷰 + 체감 측정 (RP-7 조기 검증)

**Wave 5 — QA/E2E + TD-41 해소 (4h)**
- [ ] **F392 (P0)**: Playwright + smoke + regression + **TD-41 해소 통합**
  - Playwright `page.route()` + msw로 `CF_Authorization` cookie 주입 + `/auth/me` stub
  - `auth.setup.ts` + `auth.spec.ts` + `rbac.spec.ts` + 8 functional spec `test.describe.skip` 해제
  - KPI-3 통과율 ≥ 95%
  - **성공 증거**: CI E2E pass count 1 → 47 복원

**총 예상**: 27.5h (기존 S3 26h + F396 1.5h), 1 Sprint 범위 내

### 11.3 Sprint 227 범위 확정 (Should M-UX-4)

사용자 승인: Sprint 226 DONE 후 체력 여유 전제로 **계획 문서에 확정 포함**. AXIS DS 외부 기여는 Foundry-X/Launch-X/Eval-X 확장 전 선제 레퍼런스 확보 기회.

- [ ] **F383 (P2)**: AXIS DS Tier 3 — 도메인 특화 컴포넌트 3종(`SpecSourceSplitView`, `ProvenanceInspector`, `StageReplayer`)을 `IDEA-on-Action/AXIS-Design-System` 레포에 재활용 가능한 형태로 기여 PR (8h)
- [ ] **F384 (P2)**: Guest/Demo 모드 — 읽기 전용 데이터 모드, 외부 데모/영업용 (4h)

**실패/중단 조건**: Sprint 226 Match Rate < 85% → 227 보류 + 227 범위를 Sprint 228로 이관. AXIS DS 레포 기여 채널 미성숙 → F383 skeleton PR만 열고 머지는 F383b로 분리.

### 11.4 DoD 갱신 (§4.1 덮어쓰기)

Sprint 226 완료 기준 (기존 "S221 완료 시" → "Sprint 226 완료 시"):
- [ ] KPI-1 본부장 3분 테스트 PASS (10건 샘플)
- [ ] KPI-2 Split View 클릭 ≤ 3 (10건 샘플)
- [ ] KPI-3 QA/E2E 95% 통과 + **E2E pass count 47 복원**
- [ ] Legacy Feature Flag (`?legacy=1`) 삭제 가능 상태 (스모크 PASS 후 Sprint 227 초 삭제)
- [ ] Production 배포 완료 (Cloudflare Pages + Access)
- [ ] AXIS DS 핵심 컴포넌트 교체율 ≥ 80% (Tier 2)
- [ ] **페이지 수 확정**: root 중복 5건 삭제 후 실 페이지 23개 (28 - 5) → Sprint 226 구현 완료 후 재판정(목표 ≤ 14 Sidebar 노출)
- [ ] SPEC.md §7 AIF-REQ-036 IN_PROGRESS → Sprint 227 DONE 후 전환

### 11.5 착수 지시 (다음 세션)

1. [x] ~~`git status` clean 확인~~ ✅ 세션 229
2. [x] ~~`/ax:sprint 226` WT 생성~~ ✅ 세션 229 (수동 fallback Phase 2a~2e)
3. [x] ~~autopilot 주입 + Wave 1~5~~ ✅ 세션 229 Match 100% self-reported
4. [~] Gate: Wave 1~4 PASS / Wave 5 F392 skeleton DONE but TD-41 완전 해소 실패 → Sprint 227 F401 이관

### 11.6 Sprint 226 MERGED 결과 (세션 229, 2026-04-22)

- **PR #27 `4d35270`** squash merged (autopilot 20분 4초 자체 완결 + Master 복구 ~15분)
- **9 F-item**: F396 + F379 + F380 + F381 + F382 + F387 + F388 + F391 = 8 ✅ DONE / F392 ⚠️ skeleton
- **Match**: 100% (autopilot self) — CI E2E 실측 반영 시 조정 필요 (실 구현 품질은 Sprint 227 F401 복구 후 재평가)
- **CI 이력**: 1차 PR #27 E2E 37/45 fail (14분 1초) → `b87ecd7` revert → 2차 CI 3/3 PASS → merge
- **Design 역동기화**: `docs/02-design/features/sprint-226.design.md` autopilot 신설 + 세션 229 revert 반영 필요 (별도 작업)
- **Report**: `docs/04-report/features/sprint-226.report.md` autopilot 신설
- **Pilot 아티팩트**: `docs/03-analysis/features/section-only-pilot-f388.md` (F388 실사용자 인터뷰 3건)
- **신규 라우트**: `/engineer/workbench/:id` (Split View) + `GET /skills/:id/provenance/resolve` (svc-skill)
- **TD-41 P1 유지**: Sprint 227 F401로 완전 해소 작업 이관
- **신규 TD 후보**: (1) autopilot local TEST=pass ≠ CI E2E pass 3연속 재현(S219/S220/S226) → rules/ 승격, (2) task-daemon CI timeout < 확장 E2E 실 소요 (15분+) → daemon timeout 상향 검토

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-21 | 초안 — PRD v0.3 기반 Plan 작성, F-item 15건 제안, Sprint 219~222 분해, R2 전이 9건 F-item 매핑 | Sinclair |
| 0.2 | 2026-04-21 (세션 229) | Sprint 223/224 MERGED 반영 + §11 Follow-up Plan 추가 (Sprint 226 9 F-item 확정 — F396 신규 위생 + TD-41을 F392에 통합, Sprint 227 Should 확정 포함) + §10 Next Steps 체크 갱신 | Sinclair |
| 0.3 | 2026-04-22 (세션 229) | Sprint 226 ✅ MERGED PR #27 `4d35270` 결과 반영 — §11.6 추가 (8/9 F-item DONE, F392 partial, TD-41 완전 해소를 Sprint 227 F401로 이관), §11.5 착수 지시 체크 갱신 | Sinclair |
