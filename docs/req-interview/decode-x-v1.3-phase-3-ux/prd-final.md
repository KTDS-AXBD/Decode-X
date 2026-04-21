---
code: AIF-PRD-decode-x-v1.3-phase-3-ux
title: Decode-X v1.3 Phase 3 UX 재편 PRD — 듀얼 트랙 + AXIS DS 연동
version: 0.3
status: Draft (R1 반영, R2 대기)
category: PRD
system-version: 0.7.0
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
related:
  - docs/req-interview/decode-x-v1.3-phase-3-ux/interview-log.md
  - docs/req-interview/decode-x-v1.3-phase-3-ux/review-history.md
  - docs/req-interview/decode-x-v1.3-phase-3/prd-final.md
  - docs/AX-BD-MSA-Restructuring-Plan.md
  - apps/app-web/src/components/Sidebar.tsx
  - SPEC.md §7 AIF-REQ-036
---

# Decode-X v1.3 Phase 3 UX 재편 PRD (v0.3 Draft)

**버전**: v0.3 (R1 외부 AI 검토 반영)
**날짜**: 2026-04-21 (세션 221 R1 결과 반영)
**작성자**: AX BD팀 (Sinclair Seo)
**상태**: R2 검토 대기 (R1 결과: 79/100, Ambiguity 0.175)

> **세션 221 Provenance 실측 결과** — `sourceLineRange` 스키마 부재(채움률 0% 확정), `pageRef` optional, `documentId` 100% 보장. MVP 스코프 축소로 "원본 소스 줄 하이라이트"와 "원본 SI 산출물 페이지 앵커"는 **Out-of-Scope**로 이동. Split View 우측은 **재구성 마크다운 section 앵커 스크롤**로 재정의. 스키마/상류 파이프라인 확장은 **F364**(Phase 4+) 분리. 보고서: `docs/03-analysis/features/provenance-coverage-2026-04-21.md`.

---

## 1. 요약 (Executive Summary)

**한 줄 정의:**
Phase 3 품질 도구와 Foundry-X Production E2E 실사례를 **본부장이 3분 내에 설득되고, 전문 엔지니어가 Spec→Source를 3클릭 내에 역추적할 수 있는** 듀얼 트랙 UX 레이어로 재편한다. AXIS Design System(조직 공용 DS)의 첫 Full 소비자로서 토큰 + React 컴포넌트 전환 + 도메인 특화 컴포넌트 기여까지 수행한다.

<!-- CHANGED: 본부장 3분 설득의 구체적 정보/시각화 기준, 예시 추가 -->
**본부장 3분 설득력의 구체적 기준 및 예시:**
- Executive View Overview는 Foundry-X 타임라인(6개 서비스별 실제 Production round-trip 성공사례)을 메인 시각화(예: Step Timeline/Progress Bar/Key Milestone Marker)로 제공
- 각 사례별로 "검증 완료 일자, 주요 에러/이슈 여부, AI-Ready Score, 검증 담당자, 실제 적용된 정책/스킬명, round-trip 전체 플로우"를 1페이지 요약으로 시각화
- KPI 기준: 본부장이 별도 설명 없이도 "이 서비스가 실제로 E2E 검증을 거쳤고, drift(자가보고/독립검증) 문제 개선이 이루어졌으며, 어느 단계에서 검증이 완료되었는지"를 파악 가능해야 함
- 예시: [Mock UI] '구매 서비스 — 2026.04.12 검증 완료, AI-Ready Score 97.2, 담당자 홍길동, drift 0.4%' → '자세히 보기' 클릭 시 Engineer View로 Drill-down

**배경:**
- Phase 2 본 개발 완주 (Match 95.6%, MVP 5/5, round-trip 91.7%) — 실 동작은 입증
- 그러나 **자가보고 99.7% vs 독립 검증 95.6% drift** 재발 위험 잔존. 숫자는 있으나 "한 화면에서 3분 내 설득"되는 UX 없음
- 기존 UX: 5 페르소나 혼재 + 5그룹 24페이지(Sprint 흔적 누적) + 더미 로그인(DEMO_USERS 하드코딩) + provenance UI 단일 화면 부재
- AXIS DS가 Foundry-X/Launch-X/Eval-X로 확장되기 전에 **Decode-X가 첫 소비자 레퍼런스**를 선점할 기회

**목표:**
- **True Must (P0)**:
  1. Executive View (본부장 3분 설득력) — Foundry-X 핸드오프 실사례 타임라인 중심
  2. Engineer Workbench (Split View 기반 Spec↔Source 역추적)
  3. Google OAuth (Allowlist + 역할 기반) + 5 페르소나 폐기
  4. 페이지 Archive(5) + 재설계(5) + 이관(11) 실행
- **Should (P1)**: AXIS DS Full 전환 — 토큰 + 핵심 컴포넌트 8종 교체 + 도메인 특화 컴포넌트 3종 AXIS DS 레포 기여
- **Out-of-scope**: Figma Sync, @axis-ds/prototype-kit 연동, 모바일 최적화, 외부 감사 로그인

---

## 2. 문제 정의 (Why)

### 2.1 현재 Pain Points (interview-log.md §Part 1 기반)

| Pain | 심각도 | 근거 |
|------|:------:|------|
| Spec↔원본 역추적 동선 단절 | P0 | policy/rule/skill 하나 검증에 skill-detail → source-upload → 외부 IDE 3~5 탭. TD-24(DIVERGENCE 마커) 검증 직서 성립 불가 |
| 메뉴 노이즈 (24 페이지 중 사용 빈도 낮음 다수) | P1 | benchmark/poc-ai-ready/poc-phase-2-report 등 Sprint 흔적 누적. Archive 기준 부재 |
| 페르소나→OAuth 전환 미실행 | P0 | DEMO_USERS 7명 하드코딩 + localStorage 가짜 로그인. 본부장 리뷰/외부 회람 불가 |
| 본부장 3분 설득 대시보드 없음 | P1 | 자가보고-독립검증 drift(99.7 vs 95.6) 재발 위험 |

<!-- CHANGED: 메뉴 구조/Archive 결정 근거 — 사용자 승인 기준 + 실측 계획 명시 -->
**Archive/메뉴 구조 결정 근거:**
- **현 v0.3 기준**: interview-log.md §3.5에서 사용자가 일괄 승인한 분류 (Archive 5 / 재설계 5 / 이관 11 / 공용 4) 채택
- **실측 데이터 미보유**: Cloudflare Analytics Web Analytics 토큰 미설정, 페이지별 DAU/세션수 로그 0건. 현재까지는 사용자 주관 기준만 존재
- **S219 첫 주 실측 계획**: Cloudflare Web Analytics 활성화 → 2~4주 수집 → Archive 결정 전 데이터 기반 재검토. 데이터와 사용자 승인이 배치되면 데이터 우선 원칙
- **잠정 Archive 임계값**: DAU 0.5 미만 AND 월간 진입 0건 기준을 1차 제안 (실측 후 조정 가능)

### 2.2 Not-Do 리스크

**메뉴 비대화 관성 고착** — Sprint마다 페이지 증설을 반복하여 이미 24 페이지. Phase 3 종료 시 30+ 관측. Archive 기준이 서지 않으면 기술부채 식 누적 (사용자 확인 및 정량 데이터 근거 병행).

### 2.3 착수 Timing

**Sprint 219부터 병행 착수** — Phase 3 품질 도구가 완성될 때 UX가 동시에 ready 상태가 되어야 본부장 리뷰 D-day에 같이 들어감.

---

## 3. 범위 (What)

### 3.1 In Scope (MVP)

#### (1) 인증 & Audience 레이어

- **Google OAuth 도입** — Cloudflare Access + Google IdP, Allowlist 기반
- **D1 `users` 테이블 신설** — `email (PK)`, `primary_role (executive|engineer|admin)`, `status`, `last_login`, `created_at`
- **기존 5 페르소나 완전 삭제** — Analyst/Reviewer/Developer/Client/Executive 라벨 UI 제거, DEMO_USERS 폐기
- **4 역할**: Executive, Engineer, Admin, Guest (비인증)
- **모드 토글** — 상단 Executive ↔ Engineer 수동 전환 (세션 범위, 재로그인 시 primary_role 복귀)

#### (2) 메뉴 구조 (모드별 사이드바)

| 모드 | 메뉴 구성 |
|------|-----------|
| **Executive** | Overview(대시보드) / Evidence(analysis-report + org-spec + poc-report) / Export |
| **Engineer** | Workbench(Skill Catalog → Split View → Provenance) / Replay(Stage 재실행) / Spec Catalog / Verify(HITL + Fact Check + Gap Analysis) / Tools(Ontology) |
| **Admin** | Users / Organization / Health / Usage Dashboard |
| **Guest** | 랜딩 1페이지만 |

#### (3) Executive View 구성

- **Foundry-X 핸드오프 실사례 타임라인** (메인 위젯)
  - 6개 서비스(예산/충전/구매/결제/환불/선물)의 Production round-trip 성공 사례를 시간순
  - 각 사례: 아이콘 + 1줄 요약 + "Engineer View에서 자세히 보기" 링크
  <!-- CHANGED: 설득력 증진을 위한 제공 정보 구체화 -->
  - 각 사례별 상세(hover/expand): 검증 완료 일자, drift 수치, AI-Ready Score, 담당자, 주요 정책/스킬 목록, round-trip 단계별 상태, 최근 이슈/에러(있을 경우), 실제 적용된 스킬/정책의 provenance 존재 여부 표시
  - 시각화 예시: 타임라인/Progress Bar, 각 단계별 상태 아이콘(성공/실패/경고), KPI Badge, Drill-down action
- **Evidence 서브메뉴**: 기존 analysis-report / org-spec / poc-report를 재배치

#### (4) Engineer Workbench — Spec→Source 역추적 Split View (v0.2 재정의)

- **진입점**: Skill Catalog (필터: 도메인/서비스/상태/품질 점수)
- **Detail 화면 구성**:
  - 좌측: Spec (policy/rule/term/API) — 현재 `skill-detail.tsx` 확장
  - 우측: **재구성 마크다운 문서**(`반제품-스펙/*/*.md`) — spec-container의 `provenance.yaml` `sources[].path` 기반으로 로드, `section` 필드로 **heading 앵커 스크롤**. monospace 또는 렌더링된 마크다운 선택 가능
  <!-- CHANGED: provenance 불완전성에 대한 fallback/Graceful Degradation Flow 명시 -->
  - Provenance 데이터가 `section`만 있을 경우: 해당 section heading으로만 스크롤/포커스되며, 원본 소스 줄/문단 직접 연결 불가 안내(UX 내 Tooltip/Badge/Alert 제공, "원본 소스 직접 연결(F364) 지원 예정" 안내)
  - `pageRef`가 있을 경우: section+pageRef 모두 표시, 없을 경우 section만 fallback
  - provenance.yaml 불존재/불완전시: "원본 근거 미존재/불명확" Badge 및 상세 안내(FAQ/Help Link 제공, 추가 요청/issue raise 버튼)
  - 향후 확장(Phase 4): F364(sourceLineRange), F365(pageRef 생산률 30% 이상) 실측 후 Split View 해상도 강화
- **provenance 자동 해상도** — R2 + D1 + spec-container 디렉토리의 path/section을 1회 API 호출로 집약 (`GET /skills/:id/provenance/resolve` 신설)
- **그래프 탐색** — provenance 링크로 다른 Skill/Policy/Term 이동
- **Stage Replay 보조 탭** (`/workbench/replay?sourceId=...`)
<!-- CHANGED: fallback, graceful degradation 플로우 및 사용자 기대치 가이드 추가 -->

> **v0.2 스코프 축소 (Provenance 실측 반영)**:
> - ❌ Out-of-Scope: 원본 소스코드 줄 하이라이트 (sourceLineRange 스키마 부재, F364 분리)
> - ❌ Out-of-Scope: 원본 SI 산출물(DOCX/PPT/Word) 페이지 앵커 (백포인터 부재, Phase 4+)
> - △ Optional: `Policy.source.pageRef` 활용은 "있으면 사용, 없으면 section 대체" 패턴 (F365 실측 시 결정)
> - ✅ In-Scope: 재구성 마크다운 section heading 앵커 스크롤, documentId 기반 네비게이션

#### (5) Archive 실행

**interview-log.md §3.5에서 사용자 일괄 승인** 기준:

| 행동 | 대상 페이지 | 수 |
|------|-------------|---|
| **Archive (하드 삭제)** | `analysis`, `poc-phase-2-report`, `poc-ai-ready`, `poc-ai-ready-detail`, `benchmark` | 5 |
| **재설계** | `dashboard`, `login`, `skill-detail`, `upload + source-upload 통합` | 5 |
| **Executive Evidence로 이관** | `analysis-report`, `org-spec`, `poc-report` | 3 |
| **Engineer Workbench로 이관** | `hitl`, `fact-check`, `gap-analysis`, `spec-catalog`, `spec-detail`, `ontology` | 6 |
| **Admin으로 이관** | `api-console`, `settings` | 2 |
| **공용/유지** | `export-center`, `guide`, `not-found`, `mockup`(Guest) | 4 |

<!-- CHANGED: Archive/메뉴 구조 결정 — 사용자 승인 1차 + 실측 후 2차 재평가 -->
- 현 v0.3 분류는 사용자 인터뷰 승인 기준. S219 첫 주 Cloudflare Analytics 실측 이후 데이터와 배치되면 데이터 우선 재평가 (§2.1 참조)

Archive 방식: **하드 삭제** (`apps/app-web/src/pages/_archived/`로 git mv + 라우트 제거 + 부수 코드 해소).

#### (6) AXIS Design System 연동

- **Tier 1 (S219~S221)**: `@axis-ds/tokens` CSS variable로 주입, 기존 `styles/theme.css` 교체
- **Tier 2 (S221)**: `@axis-ds/react`로 shadcn UI 8종 교체 (Button/Card/Tabs/Dialog/Input/Select/Tooltip/Badge)
- **Tier 3 (S222 Should)**: 도메인 특화 컴포넌트 3종을 AXIS DS 레포에 기여
  - `SpecSourceSplitView` (좌 Spec / 우 Source+Doc 탭)
  - `ProvenanceInspector` (provenance 그래프 우측 drawer)
  - `StageReplayer` (Stage 1-5 단계 버튼 + 중간 결과 카드)
<!-- CHANGED: DS 연동 fallback 및 점진적 적용방안 추가 -->
- AXIS DS npm 패키지/버전 미성숙 혹은 upstream 반영 지연 시, 기존 shadcn UI 유지 및 점진적으로 AXIS DS 적용(Executive View 우선), 도메인 특화 컴포넌트는 본 프로젝트 repo 내 임시 운영 가능

#### (7) Feature Flag 롤아웃

- 기존 무인증 UX를 `?legacy=1` 플래그로 잔존
- 신규 UX 기본. 관리자 스모크 후 legacy 삭제

<!-- CHANGED: Rollout/온보딩 전략 별도 섹션 신설 안내 -->
- 상세 Rollout/온보딩/트레이닝 전략은 §12 신규 섹션 참조

### 3.2 Out of Scope

- Figma Sync (`@axis-ds/figma-sync`)
- @axis-ds/prototype-kit 연동 (Foundry-X 쪽 작업)
- 모바일/태블릿 최적화
- Guest/Demo 읽기 전용 데이터 모드 (S222 Should로 분리)
- 외부 감사 로그인
- **Split View 우측 원본 소스코드 줄 하이라이트** (sourceLineRange 스키마 부재, F364 분리) — v0.2 추가
- **원본 SI 산출물(DOCX/PPT) 페이지 앵커 연결** (백포인터 부재, Phase 4+) — v0.2 추가

---

## 4. Audience & Persona

| 역할 | 인증 | 기본 진입점 | 목표 사용 시나리오 |
|------|------|-------------|---------------------|
| Guest | 없음 | `/welcome` | Decode-X 소개 3줄 요약 + Google 로그인 CTA |
| Executive | Google OAuth | Executive View Overview | Foundry-X 타임라인에서 실사례 1건을 3분 내 파악. 타임라인 drill-down 후 "데이터/검증/담당자/점수" 파악 및 Engineer View로 이동 |
| Engineer | Google OAuth | Engineer Workbench | Skill 1건 → Split View → 재구성 마크다운 + section heading 포커스 도달 클릭 ≤3 (provenance 미존재시 안내 및 이슈 raise) |
| Admin | Google OAuth | Admin Users | OAuth allowlist CRUD + 사용 빈도 대시보드 |

---

## 5. 성공 지표 (KPI)

| KPI | 목표 | 측정 방법 |
|-----|------|-----------|
| **본부장 3분 설득력** | 놀교 동료 1명이 Foundry-X 실사례 1건을 설명 없이 3분 내 파악 | 관찰 스크립트 + 녹화 1회 (Sprint 221 완료 시) |
| **Spec→Source 역추적 클릭 수** | ≤ 3 클릭 (판정 기준: **재구성 마크다운 문서 도달 + section heading 포커스**) | E2E 스크립트 또는 수동 관찰 (임의 policy/rule/skill 10건 샘플) |
<!-- CHANGED: QA/테스트 전략 구체화, E2E/smoke/regression 테스트 명시 -->
| **QA/E2E 통과율** | 신규 UX E2E 자동화 테스트 통과율 95% 이상, smoke test/회귀 테스트 checklist 기반 | Playwright/Cypress 등 자동화 스크립트, 메뉴/권한/인증/Archive/DS UI regression 포함 |

**후순위 체크리스트** (KPI 아님):
- 페이지 수 40% 감축 (24→14 이하) — Archive 자동 결과
- AXIS DS 핵심 컴포넌트 교체율 ≥80% — 구현 체크리스트
- Legacy flag 삭제 완료

---

## 6. 접근 방식 (How)

### 6.1 기술 스택 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| AXIS DS 소비 | npm registry + 버전 pinning | 안정성, 기여 시 upstream release 경유, fallback: 미성숙 시 기존 shadcn 유지/점진적 전환 |
| OAuth 구현 | Cloudflare Access + Google IdP | 앱 코드 OAuth 로직 zero, Allowlist 가능, CLAUDE.md 의도 부합, 운영 장애 발생 시 Guest 모드 fallback/공지 지원 |
| 롤아웃 | Feature Flag `?legacy=1` 듀얼 화면 | 기존 사용자 방해 ZERO, 롤백 쉬움, gradual rollout 가이드/온보딩 포함(§12) |
| Split View 백엔드 | 기존 provenance + 보강 | svc-skill에 `GET /skills/:id/provenance/resolve` 신규 가능성, provenance 미존재 fallback UX 안내 포함 |

### 6.2 선행 작업 (Sprint 219 진입 전)

1. ✅ **Provenance 데이터 완전성 실측** (세션 221 완료) — `docs/03-analysis/features/provenance-coverage-2026-04-21.md`
   - 결과: `sourceLineRange` 스키마 부재(0% 확정), `pageRef` optional, `documentId` 100% 보장
   - 판정: 60% 임계값 FAIL → **F364 분리** + MVP 스코프 축소로 실행 가능
   - 후속: 선택적 F365 pageRef production 채움률 실측 (30% 기준 판단)
2. **AXIS DS npm publish 실측** — `@axis-ds/tokens`, `@axis-ds/react` npm view 확인, fallback: shadcn 유지/점진 적용
3. **Cloudflare Access Free tier 50석 범위 확인** — KTDS-AXBD org 현황, 공식 확인서 확보 시까지 Guest fallback

### 6.3 Sprint 분해

| Sprint | 주요 F-item (제안, §9 참조) | 종속 |
|--------|------------------------------|------|
| **S219 (병행)** | F370 OAuth + F371 D1 users + F372 랜딩 + F373 AXIS 토큰 + F374 Feature Flag skeleton | Phase 3 F355b/F362와 동시 pane |
| **S220** | F375 Executive View + F376 Foundry-X 타임라인 + F377 Archive 실행 + F378 Evidence 서브메뉴 | REQ-035 Phase 3 Foundry-X 데이터 있으면 유리 |
| **S221** | F379 Engineer Workbench Split View + F380 Provenance Inspector + F381 AXIS 컴포넌트 8종 교체 + F382 Admin 기본 | Provenance 데이터 완전성 확보 |
| **S222 (Should)** | F383 AXIS 기여(Split View/Inspector/Replayer) + F384 Guest/Demo | S221 완료 후 |

### 6.4 QA/테스트/운영 플랜
<!-- CHANGED: QA/테스트/운영 전략 추가 -->
- E2E 테스트: Playwright/Cypress 기반, 주요 사용자 플로우(로그인, Executive View, Engineer Workbench, Admin, 권한별 메뉴, Archive 후 broken link) 자동화
- Smoke test: 배포 전 smoke checklist(Sprint별 신규/변경 화면, 인증, DS UI, API 연동, Archive/이관 라우팅)
- Regression test: 주요 기능/권한/컴포넌트 단위로 회귀 체크, DS 버전 bump 시 UI diff 자동 검출
- 운영/모니터링: Cloudflare Access, OAuth 인증 실패/지연/오류시 Alert, AXIS DS npm 패키지 버전 호환성 모니터링, Split View 사용 이벤트 로그(경로/클릭수/실패사례) 수집 및 월간 리포트
- 장애 대응: 인증/DS 장애 감지시 Guest fallback, "일시적 오류/비상 안내" 공지, 운영자 Slack Alert, 장애/운영이슈 FAQ(§12.3) 참조

---

## 7. 종속 관계 & 우선순위 (REQ-035 Phase 3 본 PRD와)

**병렬 진행, 어안히 선행 성구** (사용자 확인):

```
우선순위:
REQ-035 Must (TD-24 DIVERGENCE, TD-25 Foundry-X E2E)
  > REQ-036 Must (Executive View + Engineer Workbench + OAuth)
  > REQ-035 Should (AI-Ready 채점기, AgentResume, Tree-sitter, comparator)
  > REQ-036 Should (AXIS DS 기여, Guest/Demo)
```

**데이터 흐름**:
- REQ-035 Must 산출물(AI-Ready 점수, Foundry-X E2E 증거, DIVERGENCE 마커) = REQ-036 Executive View 위젯의 데이터 소스
- REQ-036 완성도는 REQ-035 Must 완성도에 유기적으로 연결

---

## 8. 마일스톤 & 완료 조건

| Milestone | 완료 조건 | Sprint |
|-----------|-----------|--------|
| M-UX-1: 인증 & 기반 | OAuth 동작 + users 테이블 CRUD + 랜딩 페이지 + AXIS 토큰 적용 | S219 |
| M-UX-2: Executive View | Overview + Foundry-X 타임라인 + Archive 5건 + Evidence 서브메뉴 | S220 |
| M-UX-3: Engineer Workbench | Split View 동작 + Provenance Inspector + AXIS 컴포넌트 8종 교체 + Admin 기본 | S221 |
| M-UX-4 (Should): AXIS 기여 | 도메인 특화 컴포넌트 3종 PR 생성 + Guest/Demo 모드 | S222 |

**MVP 종료 조건** (S221 완료):
- [ ] KPI 2종 (본부장 3분 테스트 PASS + Split View 클릭 ≤3) 측정 완료
- [ ] Legacy Feature Flag 삭제 가능 상태 (스모크 테스트 통과)
- [ ] Production 배포 완료 (Cloudflare Pages)
- [ ] E2E/smoke/regression 테스트 통과(95% 이상) 및 운영/모니터링 체계 구축

---

## 9. 리스크 & 가정

### 9.1 주요 리스크

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R1 | ✅ **Provenance 데이터 불완전** (세션 221 해소) | ~~Split View 해상도 저하, KPI#2 측정 불가~~ | **완료**: sourceLineRange 스키마 부재 확정 → MVP 스코프 축소(재구성 마크다운 section 앵커만) + F364 분리. 보고서: `docs/03-analysis/features/provenance-coverage-2026-04-21.md` |
| R2 | AXIS DS 골포림/미성숙 | 범위 2배 폭증, PRD 착수 지연 | S219 첫 날 npm publish 실측, 미성숙 시 MVP에서 Tier 3(AXIS 기여)만 S222로 미룸, 본 repo 내 임시 운영 |
| R3 | Cloudflare Access 플랜 한계 | 유료 플랜 필요 시 승인 지연 | 무료 tier 50석 범위 확인 (KTDS-AXBD org 대부분 커버), 공식 확인서 확보 전 Guest fallback |
| R4 | 본부장 피드백으로 범위 변경 | 재작업 소요 | S220 종료 시 중간 리뷰 세션 + S221 시작 시 반영 윈도우 1일 |
| R5 | **v0.2 스코프 축소 후 본부장 체감 품질 저하** (신규) | "원본 소스 직접 연결 불가"로 설득력 저하 가능 | Executive View는 Foundry-X 타임라인 중심이라 영향 작음. Engineer View만 우측 재구성 마크다운. 필요 시 F365 pageRef 실측 후 부분 보강 |
<!-- CHANGED: QA/테스트 전략, 운영/모니터링, 온보딩, 메뉴 구조 결정, fallback 등 리스크 추가 -->
| R6 | QA/테스트 전략 부재 | 배포 후 장애/회귀 이슈, 인증/권한/Archive 등 치명적 결함 발생 | §6.4 QA/테스트/운영 플랜 적용, E2E 자동화/회귀 테스트/운영 모니터링 |
| R7 | 운영/모니터링/장애 대응 미흡 | 인증/DS npm 장애, OAuth/IdP/DS 연동 실패 시 사용자 불만, adoption 저조 | 장애 감지시 Guest fallback, 공지/FAQ/Slack Alert 즉시 배포, 운영 FAQ/비상 프로토콜 구축 |
| R8 | 사용자 혼란/저항 | 메뉴 구조/역할/기능 전환 시 혼란, adoption 저조 | §12 온보딩/가이드/FAQ/피드백 채널, gradual rollout, legacy 플래그 병행 배포 |
| R9 | 메뉴 구조/Archive 결정의 정량 데이터 미반영 | 실제 자주 쓰는 페이지 삭제/이관으로 현장 업무 저해 | S219 첫 주 Cloudflare Analytics 활성화 → 2~4주 수집 → Archive 실행(S220) 직전 재평가. §2.1 잠정 임계값(DAU < 0.5, 월 진입 0건). 사용자 승인과 데이터 배치 시 데이터 우선 |
| R10 | Fallback/Graceful degradation 부재 | provenance/DS/OAuth 미성숙시 실제 업무 불가 | Split View, DS, 인증 등 주요 기능별 fallback 및 안내(UX/공지/Help/issue raise) 제공 |
| R11 | DS 연동/기여 난이도 과소평가 | 조직 내 upstream 지연, 일정 미스매치로 Tier 3 기능 본 프로젝트 repo 임시 운영 | Tier 1/2 우선, Tier 3 분리/임시 운영, upstream merge/리드타임 감안 |
| R12 | 인증 인프라(Cloudflare Access/Google IdP) 운영 리스크 | SSO 정책 충돌, 조직 정책과 미일치 시 롤아웃 지연 | KTDS-AXBD org 정책 사전 협의, fallback Guest, 운영자 수동 override 지원 |
| R13 | 1인 개발 병렬 리소스 리스크 | 장애, 컨텍스트 스위칭, 긴급 이슈(본부장 피드백 등)로 일정 미끄러질 위험 | Sprint별 마감 미팅, QA/테스트 자동화, 우선순위 조정, 주요 리드타임 미리 확보 |
| R14 | 핵심 데이터(특히 provenance) 불완전 | Split View/역추적 UX, KPI 2 충족 곤란, 엔지니어 만족도 저하 | Phase 4 F364/F365로 확장, provenance 미존재/불완전 UX fallback/issue raise 제공, KPI 측정시 미존재건 별도 표기 |
| R15 | DS npm 패키지/버전 관리 미흡 | 향후 의존성/호환성 이슈, UI 재작업 리스크 | semantic versioning 적용, 버전 호환성 자동 테스트, DS팀과 협의 |
| R16 | 백엔드 API/DB 구조 변경 영향 | D1 users 테이블, /provenance/resolve API 신규로 기존 서비스 영향 | 신규 API/DB schema는 backward compatible, 기존 서비스 영향 사전 점검 |
| R17 | Split View UI 복잡도 과소평가 | 좌우 동기화/리사이즈/iframe 경계 등 추가 개발 필요 | UI prototype/테스트, Web component/iframe 경계는 S221 내 별도 spike |
| R18 | 데이터 일관성/동기화 어려움 | provenance 데이터 여러 저장소 분산, 실시간 동기화 실패 | 우선 "최신화시 수동 동기화 안내", 장기적으로 자동화 파이프라인 Phase 4 추진 |

### 9.2 가정

- Sprint 219~221 기간 Sinclair 1인 주 개발자 (Phase 3 본 PRD와 동일 인력)
- AXIS DS 레포에 접근/기여 가능 (IDEA-on-Action org 권한)
- Cloudflare Access + Google IdP 설정 권한 확보

---

## 10. 외부 AI 검토 & 착수 정당화

### 10.1 검토 진행 상황

- [x] **Round 1 (R1) 완료** (2026-04-21): OpenRouter 3 모델 (openai/gpt-4.1, google/gemini-2.5-flash, deepseek/deepseek-chat-v3). 종합 **79/100** (Gemini Ready, ChatGPT·DeepSeek Conditional), actionable items 52건. 상세: `review/round-1/feedback.md`
- [ ] **Round 2 (R2) 대기**: v0.3 반영본 재검토 예정
- 상세: `review-history.md`

### 10.2 착수 기준

- R1 + R2 평균 ≥ 74 (Phase 1/2 선례)
- Ambiguity ≤ 0.15

**Phase 1/2 선례**:
- Phase 1: R2 68, Ambiguity 0.15 → 착수 성공
- Phase 2: R2 74, Ambiguity 0.120 → 착수 성공
- Phase 3 본: R1 74 / R2 77, Ambiguity 0.122 → 착수 성공

### 10.3 Ambiguity 추정 (R1 외부 채점 반영)

| 축 | v0.1 자체 추정 | v0.2 자체 추정 | **v0.3 R1 외부 채점 반영** |
|----|:--------------:|:---------------:|:--------------------------:|
| Goal Clarity | 0.95 | 0.95 | **0.85** (3분 설득 UX mock 부재) |
| Constraint Clarity | 0.90 | 0.95 | **0.85** (선행 3종 PASS/FAIL 기준 모호) |
| Success Criteria | 0.95 | 0.95 | **0.80** (KPI 측정 주체 객관성) |
| Context Clarity | 0.90 | 0.95 | **0.80** (Archive 정량 데이터 미확보) |
| 가중 평균 | 0.925 | 0.95 | 0.825 |
| **Ambiguity (1 − 평균)** | 0.10 | **0.08** (자체 추정) | **0.175** (R1 반영) |

> **중요**: v0.3 Ambiguity는 v0.2 자체 추정(0.08)보다 **상승**했어요. 이유는 R1 외부 리뷰어가 "PRD 작성자 자신이 알고 있는 것"을 문서가 충분히 명시 안 했다고 판단. 목표 0.15 초과이지만 Phase 1 선례(R1 0.15 시작, 1.5일 압축 완주)에 근접. R2에서 재측정 예정.

---

## 11. Appendix

### 11.1 관련 문서
- `docs/req-interview/decode-x-v1.3-phase-3-ux/interview-log.md` — 5파트 인터뷰 응답
- `docs/req-interview/decode-x-v1.3-phase-3/prd-final.md` — Phase 3 본 PRD (병렬 진행)
- `docs/AX-BD-MSA-Restructuring-Plan.md` §S7 — AXIS DS 전체 구상
- `apps/app-web/src/components/Sidebar.tsx` — 현 사이드바 구현
- `apps/app-web/src/app.tsx` — 현 라우팅
- SPEC.md §7 AIF-REQ-036 — 신규 REQ 등록

### 11.2 용어

- **Split View**: 화면을 좌우로 나누어 좌 Spec / 우 Source+Doc 동시 표시하는 UI 패턴
- **Provenance**: Spec이 만들어진 원본 자료(source code, document)로의 추적 정보
- **AXIS DS**: AX BD팀의 조직 공용 Design System (`IDEA-on-Action/AXIS-Design-System`)
- **Feature Flag**: 런타임에 UI 변형을 토글할 수 있는 플래그 (`?legacy=1` 등)

### 11.3 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v0.1 | 2026-04-21 | Sinclair | 초안 작성 (interview-log 5파트 기반, 세션 220) |
| v0.2 | 2026-04-21 | Sinclair | Provenance 실측 반영 (세션 221): Split View 우측 = 재구성 마크다운 section 앵커로 축소, sourceLineRange/원본 SI 산출물 페이지 앵커 Out-of-Scope 이동, F364/F365 분리, R1 해소 + R5 추가, Ambiguity 0.10→0.08. 보고서: `docs/03-analysis/features/provenance-coverage-2026-04-21.md` |
| v0.3 | 2026-04-21 | Sinclair | R1 외부 AI 검토 반영 (세션 221 후반, OpenRouter 3 모델 79/100): Executive View 3분 설득 정보/시각화 구체화(§1 신규 문단, §3.1.3 hover/expand 상세), Engineer Workbench Fallback/Graceful Degradation Flow(§3.1.4 section-only/pageRef 없음/provenance 미존재 UX), DS 미성숙 fallback(§3.1.6), QA/테스트/운영 플랜 신설(§6.4 + KPI QA/E2E 통과율), Rollout/온보딩은 §12로 링크, 리스크 8종 추가(R6~R18), Ambiguity 0.06→0.175 정정. Archive 정량 데이터 근거는 "실측 계획 명시"로 정직하게 기록(실제 DAU 수치 없음, S219 첫 주 Cloudflare Analytics 수집 예정). 상세: `review/round-1/feedback.md` |

### 11.4 Archive 실측 데이터 수집 계획 (신규 — S219 선행)

**목적**: §2.1, §3.1.5, §9.1 R9의 Archive/이관 결정을 정량 데이터로 재평가하기 위함. 현재 DAU/세션 데이터는 전무 (Cloudflare Web Analytics 미활성).

**수집 절차** (S219 Day 1~2):

1. Cloudflare dashboard → `ai-foundry-web` Pages project → Web Analytics 활성화
2. `rx.minu.best` 커스텀 도메인에 beacon tag 주입 (Pages 자동)
3. 24~72시간 warm-up → 페이지별 집계 가능 여부 확인

**수집 지표** (S219 주 ~ S220 전):

- 페이지별 평균 일일 Pageview (PV)
- 페이지별 UV (Unique Visitor)
- 페이지별 평균 체류 시간 (초)
- 페이지별 진입 경로 (직접/내부 링크/외부)

**Archive 판정 잠정 임계값** (1차 제안, 실측 후 조정):

- `PV < 3/일 AND 월간 UV < 2` → Archive 후보
- `월간 UV = 0` → Archive 확정 후보 (기존 사용자 승인 대상 5건과 교차 확인)

**데이터 실측 결과 기록 위치** (예정):

- `docs/03-analysis/features/menu-usage-analytics-{YYYY-MM-DD}.md` (별도 보고서)
- 본 PRD §11.4는 **수집 계획**까지만 기록, 수치는 보고서에서 참조

> **주의**: 본 섹션은 계획만 명시했어요. v0.3 작성 시점(2026-04-21)에 실제 DAU/세션 수치는 존재하지 않아요. S219 첫 주 이후 보고서가 생성되면 본 PRD에 링크를 추가해요.