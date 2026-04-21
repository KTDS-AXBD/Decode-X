---
code: AIF-PRD-decode-x-v1.3-phase-3-ux
title: Decode-X v1.3 Phase 3 UX 재편 PRD — 듀얼 트랙 + AXIS DS 연동
version: 0.1
status: Draft
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

# Decode-X v1.3 Phase 3 UX 재편 PRD (v0.1 Draft)

**버전**: v0.1 (초안)
**날짜**: 2026-04-21 (세션 220)
**작성자**: AX BD팀 (Sinclair Seo)
**상태**: 외부 AI 검토 대기

---

## 1. 요약 (Executive Summary)

**한 줄 정의:**
Phase 3 품질 도구와 Foundry-X Production E2E 실사례를 **본부장이 3분 내에 설득되고, 전문 엔지니어가 Spec→Source를 3클릭 내에 역추적할 수 있는** 듀얼 트랙 UX 레이어로 재편한다. AXIS Design System(조직 공용 DS)의 첫 Full 소비자로서 토큰 + React 컴포넌트 전환 + 도메인 특화 컴포넌트 기여까지 수행한다.

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

### 2.2 Not-Do 리스크

**메뉴 비대화 관성 고착** — Sprint마다 페이지 증설을 반복하여 이미 24 페이지. Phase 3 종료 시 30+ 관측. Archive 기준이 서지 않으면 기술부채 식 누적 (사용자 확인).

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
- **Evidence 서브메뉴**: 기존 analysis-report / org-spec / poc-report를 재배치

#### (4) Engineer Workbench — Spec→Source 역추적 Split View

- **진입점**: Skill Catalog (필터: 도메인/서비스/상태/품질 점수)
- **Detail 화면 구성**:
  - 좌측: Spec (policy/rule/term/API) — 현재 `skill-detail.tsx` 확장
  - 우측 탭 A: 원본 소스코드 (줄 하이라이트, monospace, 언어 구문 강조)
  - 우측 탭 B: 원본 문서 (페이지 앵커, 이미지 또는 텍스트 렌더)
- **provenance 자동 해상도** — R2 원본 경로 + Neo4j 링크를 1회 API 호출로 집약
- **그래프 탐색** — provenance 링크로 다른 Skill/Policy/Term 이동
- **Stage Replay 보조 탭** (`/workbench/replay?sourceId=...`)

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

Archive 방식: **하드 삭제** (`apps/app-web/src/pages/_archived/`로 git mv + 라우트 제거 + 부수 코드 해소).

#### (6) AXIS Design System 연동

- **Tier 1 (S219~S221)**: `@axis-ds/tokens` CSS variable로 주입, 기존 `styles/theme.css` 교체
- **Tier 2 (S221)**: `@axis-ds/react`로 shadcn UI 8종 교체 (Button/Card/Tabs/Dialog/Input/Select/Tooltip/Badge)
- **Tier 3 (S222 Should)**: 도메인 특화 컴포넌트 3종을 AXIS DS 레포에 기여
  - `SpecSourceSplitView` (좌 Spec / 우 Source+Doc 탭)
  - `ProvenanceInspector` (provenance 그래프 우측 drawer)
  - `StageReplayer` (Stage 1-5 단계 버튼 + 중간 결과 카드)

#### (7) Feature Flag 롤아웃

- 기존 무인증 UX를 `?legacy=1` 플래그로 잔존
- 신규 UX 기본. 관리자 스모크 후 legacy 삭제

### 3.2 Out of Scope

- Figma Sync (`@axis-ds/figma-sync`)
- @axis-ds/prototype-kit 연동 (Foundry-X 쪽 작업)
- 모바일/태블릿 최적화
- Guest/Demo 읽기 전용 데이터 모드 (S222 Should로 분리)
- 외부 감사 로그인

---

## 4. Audience & Persona

| 역할 | 인증 | 기본 진입점 | 목표 사용 시나리오 |
|------|------|-------------|---------------------|
| Guest | 없음 | `/welcome` | Decode-X 소개 3줄 요약 + Google 로그인 CTA |
| Executive | Google OAuth | Executive View Overview | Foundry-X 타임라인에서 실사례 1건을 3분 내 파악 |
| Engineer | Google OAuth | Engineer Workbench | Skill 1건 → Split View → 원본 소스 라인 + 원본 문서 페이지 도달 클릭 ≤3 |
| Admin | Google OAuth | Admin Users | OAuth allowlist CRUD + 사용 빈도 대시보드 |

---

## 5. 성공 지표 (KPI)

| KPI | 목표 | 측정 방법 |
|-----|------|-----------|
| **본부장 3분 설득력** | 놀교 동료 1명이 Foundry-X 실사례 1건을 설명 없이 3분 내 파악 | 관찰 스크립트 + 녹화 1회 (Sprint 221 완료 시) |
| **Spec→Source 역추적 클릭 수** | ≤ 3 클릭 | E2E 스크립트 또는 수동 관찰 (임의 policy/rule/skill 10건 샘플) |

**후순위 체크리스트** (KPI 아님):
- 페이지 수 40% 감축 (24→14 이하) — Archive 자동 결과
- AXIS DS 핵심 컴포넌트 교체율 ≥80% — 구현 체크리스트
- Legacy flag 삭제 완료

---

## 6. 접근 방식 (How)

### 6.1 기술 스택 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| AXIS DS 소비 | npm registry + 버전 pinning | 안정성, 기여 시 upstream release 경유 |
| OAuth 구현 | Cloudflare Access + Google IdP | 앱 코드 OAuth 로직 zero, Allowlist 가능, CLAUDE.md 의도 부합 |
| 롤아웃 | Feature Flag `?legacy=1` 듀얼 화면 | 기존 사용자 방해 ZERO, 롤백 쉬움 |
| Split View 백엔드 | 기존 provenance + 보강 | svc-skill에 `GET /skills/:id/provenance/resolve` 신규 가능성 |

### 6.2 선행 작업 (Sprint 219 진입 전)

1. **Provenance 데이터 완전성 실측** (최우선 리스크)
   - 무작위 skill 10건 sampling → R2 객체 `provenance` 필드 확인
   - source code path + line range + doc path + page anchor 채움률 측정
   - 60% 미만 시 svc-skill 확장 작업이 UX 구현 전에 선행
2. **AXIS DS npm publish 실측** — `@axis-ds/tokens`, `@axis-ds/react` npm view 확인
3. **Cloudflare Access Free tier 50석 범위 확인** — KTDS-AXBD org 현황

### 6.3 Sprint 분해

| Sprint | 주요 F-item (제안, §9 참조) | 종속 |
|--------|------------------------------|------|
| **S219 (병행)** | F370 OAuth + F371 D1 users + F372 랜딩 + F373 AXIS 토큰 + F374 Feature Flag skeleton | Phase 3 F355b/F362와 동시 pane |
| **S220** | F375 Executive View + F376 Foundry-X 타임라인 + F377 Archive 실행 + F378 Evidence 서브메뉴 | REQ-035 Phase 3 Foundry-X 데이터 있으면 유리 |
| **S221** | F379 Engineer Workbench Split View + F380 Provenance Inspector + F381 AXIS 컴포넌트 8종 교체 + F382 Admin 기본 | Provenance 데이터 완전성 확보 |
| **S222 (Should)** | F383 AXIS 기여(Split View/Inspector/Replayer) + F384 Guest/Demo | S221 완료 후 |

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

---

## 9. 리스크 & 가정

### 9.1 주요 리스크

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R1 | **Provenance 데이터 불완전** | Split View 해상도 저하, KPI#2 측정 불가 | S219 초반 실측 + 부족 시 svc-skill 확장 F-item 분리 |
| R2 | AXIS DS 골포림/미성숙 | 범위 2배 폭증, PRD 착수 지연 | S219 첫 날 npm publish 실측, 미성숙 시 MVP에서 Tier 3(AXIS 기여)만 S222로 미룸 |
| R3 | Cloudflare Access 플랜 한계 | 유료 플랜 필요 시 승인 지연 | 무료 tier 50석 범위 확인 (KTDS-AXBD org 대부분 커버) |
| R4 | 본부장 피드백으로 범위 변경 | 재작업 소요 | S220 종료 시 중간 리뷰 세션 + S221 시작 시 반영 윈도우 1일 |

### 9.2 가정

- Sprint 219~221 기간 Sinclair 1인 주 개발자 (Phase 3 본 PRD와 동일 인력)
- AXIS DS 레포에 접근/기여 가능 (IDEA-on-Action org 권한)
- Cloudflare Access + Google IdP 설정 권한 확보

---

## 10. 외부 AI 검토 & 착수 정당화

### 10.1 검토 대기

- [ ] Round 1 (R1): Claude Opus / GPT-4 / Gemini 중 2+
- [ ] Round 2 (R2): R1 피드백 반영 후 재검토
- [ ] Ambiguity 지표 산출 (목표: ≤0.15)
- 상세: `review-history.md`

### 10.2 착수 기준

- R1 + R2 평균 ≥ 74 (Phase 1/2 선례)
- Ambiguity ≤ 0.15

**Phase 1/2 선례**:
- Phase 1: R2 68, Ambiguity 0.15 → 착수 성공
- Phase 2: R2 74, Ambiguity 0.120 → 착수 성공
- Phase 3 본: R1 74 / R2 77, Ambiguity 0.122 → 착수 성공

### 10.3 Ambiguity 추정 (자체 평가)

| 축 | 명확도 |
|----|:------:|
| 목적 / 타깃 Audience | ★★★★★ |
| 범위 (MVP/Should/Out) | ★★★★☆ |
| 기술 결정 | ★★★★☆ (Provenance 실측 의존) |
| Timeline | ★★★★★ |
| KPI | ★★★★★ |
| **Ambiguity 추정** | **0.10** (Phase 2/3 0.120 수준) |

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
| v0.1 | 2026-04-21 | Sinclair | 초안 작성 (interview-log 5파트 기반) |
