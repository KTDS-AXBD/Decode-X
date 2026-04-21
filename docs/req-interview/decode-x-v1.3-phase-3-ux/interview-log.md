---
code: AIF-INTV-decode-x-v1.3-phase-3-ux
title: Decode-X v1.3 Phase 3 UX 재편 요구사항 인터뷰 로그
version: 0.1
status: Active
category: INTERVIEW
system-version: 0.7.0
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
related:
  - docs/req-interview/decode-x-v1.3-phase-3-ux/prd-final.md
  - docs/req-interview/decode-x-v1.3-phase-3-ux/review-history.md
  - docs/req-interview/decode-x-v1.3-phase-3/prd-final.md
  - docs/AX-BD-MSA-Restructuring-Plan.md
  - apps/app-web/src/components/Sidebar.tsx
  - SPEC.md §7 AIF-REQ-036
---

# Decode-X v1.3 Phase 3 UX 재편 요구사항 인터뷰 로그

> 진행일: 2026-04-21 (세션 220 착수 준비)
> 방식: `/ax:req-interview` 스킬 5파트 인터뷰, AskUserQuestion 단일 질문 단위
> 진행자: Sinclair (겸임 Decode-X/Foundry-X PM)
> 선행 컨텍스트:
> - Phase 2 본 개발 ✅ 완주 (Match 95.6%, round-trip 91.7%)
> - Phase 3 PRD v1.2 Ready (품질 도구 + Production 운영화, TD-24/25 완결 중심)
> - 현재 Sidebar: 5그룹(Extract/Verify/Deliver/Experience/Admin) × 24 페이지
> - AXIS Design System 존재: `IDEA-on-Action/AXIS-Design-System` (`@axis-ds/tokens,react,templates,prototype-kit,figma-sync`)
> - `apps/app-web` 현행: shadcn/ui 기반 (20개 UI 컴포넌트)

---

## 0. Pre-Interview 스코프 확정

인터뷰 진입 전 AskUserQuestion 4문항 + 1문항(AXIS 경계) 응답 기록.

| 축 | 결정 |
|---|---|
| REQ 성격 | **신규 독립 REQ** (AIF-REQ-036). 기존 Phase 3 PRD(prd-final.md v1.2)는 그대로 유지. UX 레이어는 별도 트랙. |
| 타깃 Audience | **듀얼 트랙 동등** — Executive View (본부장) + Engineer Workbench (전문 엔지니어). 로그인 역할에 따라 기본 진입점 전환, 상호 이동 가능. |
| 검증/실험 UX 핵심 | **Spec→Source 역추적 Split View** — policy/rule/skill detail 선택 시 좌 Spec / 우 원본 소스(줄 하이라이트) + 원본 문서(페이지 앵커). provenance 링크 자동 해상도. |
| Archive 방식 | **사용 빈도 기반 자동 제안** — 30일 미사용 + 두 audience 핵심 작업과 무관한 페이지를 자동 후보로 제안, 사용자가 Archive/Keep/Merge 결정. |
| AXIS DS 연동 범위 | **Full — 신규 컴포넌트 기여 포함** — `@axis-ds/tokens` 적용 + `@axis-ds/react`로 shadcn 대체 + 도메인 특화 컴포넌트(`SpecSourceSplitView`, `ProvenanceInspector`, `StageReplayer` 등)를 AXIS DS 레포에 재활용 가능한 형태로 기여. 별도 리듬(AXIS DS 레포 PR + 버전 협상 + 문서화). |

---

## Part 1 — 왜 (목적/문제)

### Q1. 해결해야 할 핵심 문제 (복수 선택)

**답변**:
1. **Spec → 원본 역추적 동선 부재** — policy/rule/skill detail → source-upload → 외부 IDE 옵스윗 탭 왕복. provenance 필드는 있으나 UI에서 단일 화면으로 도달 불가. TD-24(DIVERGENCE 마커) 검증 직서 성립 안 됨.
2. **메뉴·페이지 노이즈** — 사용 안 되는 페이지 다수 (benchmark, ontology, api-console, guide, poc-ai-ready, poc-phase-2-report 등 과거 Sprint 흔적 누적).
3. **기존 5 페르소나(Analyst/Reviewer/Developer/Client/Executive) 완전 삭제** — Google OAuth Login 기능으로 대체. 하드코딩된 7명 DEMO_USERS + localStorage 기반 가짜 로그인 폐기.

> 중요 부가 결정: Audience 분기는 이제 **OAuth 로그인 후 역할(Executive/Engineer)로 결정**. 페르소나 라벨 UI 노출 전면 제거.

### Q2. Not-Do 리스크 (최대 우려)

**답변**: **메뉴 비대화 관성 고착** — Sprint마다 페이지 없추가를 반복하여 이미 24 페이지, Phase 3 종료 시 30+ 관측. Archive 기준이 서지 않아 기술부채 식 누적.

### Q3. 착수 Timing

**답변**: **지금 즉시 (Sprint 219와 병행)** — 별도 pane에서 UX REQ 인터뷰 → PRD → Sprint 220부터 구현 진입. Phase 3 품질 도구가 완성될 때 UX가 동시에 준비.

### Part 1 Pain Point 종합

| Pain | 심각도 | 근거 |
|------|:------:|------|
| Spec↔원본 역추적 동선 단절 | P0 | TD-24 검증 블로커, Phase 3 KPI 설득력 저하 |
| 메뉴 노이즈 (24→정리 필요) | P1 | 세션마다 페이지 증식, Archive 기준 부재 |
| 페르소나→OAuth 전환 | P0 | 더미 로그인 체계 실 인증 부재. 본부장 리뷰 + 외부 회람 불가 |
| 본부장 3분 설득 대시보드 없음 | P1 | 자가보고-독립검증 drift 재발 위험 |

---

## Part 2 — 누가 (Audience / Stakeholder)

### Q4. Google OAuth 접근 경계

**답변**: **특정 이메일 Allowlist** — 관리자가 D1 `users` 테이블(또는 KV/SPEC 설정)에 명시적 등록한 이메일만 통과. 미등록 → 403 "등록되지 않은 사용자입니다" 안내 + 관리자 요청 CTA.

### Q5. Executive vs Engineer 역할 분기

**답변**: **하이브리드 (관리자 지정 기본 + 사용자 토글)** — OAuth 성공 시 users 테이블의 `primary_role` 적용 → 상단 모드 토글(Executive↔Engineer)로 수동 전환 허용. 토글은 세션 범위. 재로그인 시 primary_role 복귀. 본부장이 직접 "엔지니어 뷰로 전환"해 디테일 확인 가능.

### Q6. 기타 Audience

**답변** (복수): **Admin** + **Guest/Demo**
- **Admin**: OAuth allowlist 관리, users 테이블 CRUD, 사용량 대시보드. 기존 Sidebar Admin 그룹을 실질 관리자 용도로 재정의.
- **Guest/Demo**: 로그인 없이 접근 가능한 랜딩 페이지 + (선택) 읽기 전용 데모. 외부 클라이언트 시연/영업.

### Q7. 비로그인 접근

**답변**: **랜딩 페이지만 공개** — `/` 또는 `/welcome` 1페이지에 Decode-X 소개/스크린샷/Google 로그인 CTA. 나머지 모든 경로는 302 리다이렉트.

### Part 2 Audience 종합

| 역할 | 인증 | 기본 진입점 | 범위 |
|------|------|-------------|------|
| Guest | 없음 | `/` 랜딩 | 랜딩 1페이지만 |
| Executive | Google OAuth (allowlist) | Executive View 대시보드 | Executive 메뉴 + 토글로 Engineer View 전환 가능 |
| Engineer | Google OAuth (allowlist) | Engineer Workbench | Workbench 메뉴 + 토글로 Executive View 전환 가능 |
| Admin | Google OAuth (allowlist) | Admin 대시보드 | 전 메뉴 + users 관리 |

**범위 추가 사항** (MVP에 포함):
- Google OAuth (Allowlist) 도입 (현재 DEMO_USERS 폐기)
- D1 `users` 테이블 신설 (email, primary_role, status, created_at)
- Admin 페이지: users CRUD
- 랜딩 페이지 (`/welcome` 또는 `/` 비인증 전용)
- 상단 모드 토글 UI (Executive ↔ Engineer)

---

## Part 3 — 무엇을 (Scope / 기능)

### Q8. 메뉴 구조 최상위 조직

**답변**: **모드별 사이드바** — 상단 모드 토글(Executive | Engineer) 선택에 따라 사이드바 메뉴 전체 교체.
- Executive 모드: 3~4개 메뉴 (Overview / Evidence / Export)
- Engineer 모드: 5~6개 메뉴 (Workbench / Replay / Spec Catalog / Source Inspector / Admin Tools)
- Admin은 역할 `admin`일 때 별도 최상위 링크(사이드바 하단 또는 사용자 프로필 메뉴) 노출

### Q9. Executive View 핵심 위젯

**답변**: **Foundry-X 핸드오프 실사례 타임라인** (단일 선택)
- 6개 서비스(예산/충전/구매/결제/환불/선물)의 Production round-trip 성공 사례를 타임라인으로 표시
- 각 사례: 아이콘 + 1줄 요약 + "Engineer View에서 자세히 보기" 링크 (해당 skill detail로 점프)
- **제외된 위젯(후순위)**: Phase 3 KPI 숫자 베이스 헤더 / Drift 트렌드 / Cross-Org 대시보드
  → Phase 2 기 구현(`analysis-report/ProjectStatusTab`, `CrossOrgComparisonTab`)은 Archive 후보로 분류 또는 Engineer Workbench → Evidence 서브메뉴로 이관

> 중요 함의: Exec View는 "증거 타임라인 중심"으로 좁혀짐. KPI 대시보드는 Engineer Workbench 하위로 이동.

### Q10. Engineer Workbench 메인 플로우

**답변**: **Skill Catalog → Detail (Split View) → Provenance**
- 진입 = Skill Catalog (필터: 도메인/서비스/상태/품질 점수)
- Skill 선택 = Detail 화면
  - 좌: Spec (policy/rule/term/API) — 현재 `skill-detail.tsx`의 Spec 탭 확장
  - 우: 원본 소스코드 (줄 하이라이트) + 원본 문서 (페이지 앵커) 탭 전환
- provenance 링크로 다른 Skill/Policy/Term 이동 (그래프 탐색)
- Stage Replay는 별도 **보조 탭** (`/workbench/replay?sourceId=...`)

### Q11. Archive 결정 워크플로우

**답변**: **현시점 분석 + 인터뷰 내 일괄 결정** — 아래 §3.5 Archive 후보 분류표에서 사용자 일괄 승인.

### 3.5 Archive 후보 분류 (24 페이지 → Keep / Merge / Archive)

현재 `apps/app-web/src/pages/` 24 페이지 각 축(Executive View 기여 / Engineer Workbench 기여 / 최근 6개월 변경 / 실제 본부장·엔지니어 쓰임새) 검토 결과.

| 페이지 | 현 그룹 | 제안 | 근거 |
|--------|---------|------|------|
| `dashboard.tsx` | 대시보드 | **Executive View "Overview" 메인으로 재설계** | Exec 진입점. 위젯 전면 교체. |
| `login.tsx` | (standalone) | **OAuth 로그인 페이지로 재설계** | DEMO_USERS 삭제, Google OAuth 로그인 UI. |
| `not-found.tsx` | (standalone) | Keep | 기본 404. |
| `upload.tsx` | Extract | **Engineer → Experiment 탭으로 이동** | Stage Replay 진입점. |
| `source-upload.tsx` | Extract | **Engineer → Experiment 탭과 통합** | upload와 중복. |
| `analysis.tsx` | Extract | Archive (Merge → skill-detail) | analysis-report와 기능 중복. |
| `analysis-report.tsx` | Extract | **Executive → Evidence 서브메뉴로 이관** | Cross-Org/상태 보고서 일부만. |
| `hitl.tsx` | Verify | Engineer → Workbench 하위 | HITL 리뷰 화면. Phase 3 품질 도구에 편입. |
| `fact-check.tsx` | Verify | Engineer → Workbench 하위 | FactCheck 계속 사용. |
| `gap-analysis.tsx` | Verify | Engineer → Workbench 하위 | 계속 사용. |
| `skill-catalog.tsx` | Deliver | **Engineer Workbench 진입점** | 메인 플로우 시작. |
| `skill-detail.tsx` | Deliver | **Engineer → Split View 화면으로 전면 재구성** | 핵심 재설계 대상. |
| `spec-catalog.tsx` | Deliver | Engineer → Workbench 하위 | Keep. |
| `spec-detail.tsx` | Deliver | Engineer → Workbench 하위 | Keep. |
| `org-spec.tsx` | Deliver | Executive → Evidence 하위 | 조직별 종합 스펙. |
| `export-center.tsx` | Deliver | **Executive/Engineer 공용 Export 메뉴로 격상** | 본부장 산출물 다운로드. |
| `api-console.tsx` | Deliver | Admin 하위 | 엔지니어 디버깅용. 사용 빈도 낮음. |
| `mockup.tsx` | Experience | Archive 또는 Guest/Demo 전용 | Working Mock-up, 영업 데모 전용. |
| `poc-report.tsx` | Experience | **Executive → Evidence 하위로 이관** | Phase 2 PoC 과정 보고서. |
| `poc-phase-2-report.tsx` | Experience | Archive (Merge → poc-report) | 중복. |
| `poc-ai-ready.tsx` | (숨김?) | Archive | Phase 3 S-1 구현과 대체될 예정. |
| `poc-ai-ready-detail.tsx` | (숨김?) | Archive | 위와 같이 Phase 3 S-1 대체. |
| `ontology.tsx` | Admin | Engineer → Workbench 하위 | Neo4j 그래프 탐색. |
| `benchmark.tsx` | Admin | Archive | 벤치마크 리포트, 최근 사용 없음. |
| `settings.tsx` | Admin | Admin → Admin 대시보드 통합 | 헬스 모니터링 유지. |
| `guide.tsx` | Guide (standalone) | Keep (Guest/Demo 페이지와 통합 가능) | 이용 가이드. |

**요약**:
- **Archive**: `analysis`, `poc-phase-2-report`, `poc-ai-ready`, `poc-ai-ready-detail`, `benchmark` (5 페이지)
- **재설계**: `dashboard`, `login`, `skill-detail`, `upload` + `source-upload` 통합 (5 페이지)
- **이관**: Executive Evidence로 `analysis-report`, `org-spec`, `poc-report` (3) / Engineer Workbench로 `hitl`, `fact-check`, `gap-analysis`, `spec-catalog`, `spec-detail`, `ontology` (6) / Admin으로 `api-console`, `settings` (2)
- **공용/유지**: `export-center`, `guide`, `not-found`, `mockup`(Guest) (4)

### Part 3 범위 종합

| 구분 | 내용 |
|------|------|
| MVP 범위 (P0) | OAuth 로그인 + 모드 토글 / Executive View(Overview+Foundry-X 타임라인+Evidence+Export) / Engineer Workbench(Skill Catalog + Split View + Provenance + Stage Replay) / Archive 반영 / Admin 기본 페이지 / 랜딩 페이지 |
| Should (P1) | AXIS DS Full 전환 (토큰 + React 컴포넌트) / 도메인 특화 컴포넌트 3종(`SpecSourceSplitView`, `ProvenanceInspector`, `StageReplayer`) AXIS DS 기여 |
| 후순위 (P2) | Guest/Demo 읽기 전용 모드 / 외부 감사 로그인 |
| 범위 외 | Figma Sync / @axis-ds/prototype-kit 연동 / 모바일 최적화 |

---

---

## Part 4 — 어떻게 (접근 / 제약)

### Q12. AXIS DS 패키지 소비 전략

**답변**: **npm registry + 버전 pinning** — `@axis-ds/*`를 `package.json`에 exact version으로 고정. 신규 컴포넌트는 AXIS DS repo PR → release → Decode-X upgrade 순. 로컬 개발은 npm pack / yalc 등으로 prerelease 테스트 가능.

### Q13. Google OAuth 구현

**답변**: **Cloudflare Access + Google IdP** — Cloudflare Zero Trust에 Google IdP 등록 후 Access Policy로 Allowlist 적용. Worker/Pages는 `Cf-Access-Jwt-Assertion` 헤더만 검증. 앱 코드에 OAuth 로직 없음. CLAUDE.md `Auth: Cloudflare Access` 의도와 일치.

### Q14. Sprint 219 병행 롤아웃 전략

**답변**: **Feature Flag 기반 듀얼 화면** — 기존 /login 무인증 모드를 `?legacy=1` 플래그로 잔존. 신규 UX가 기본, 관리자 배포 후 스모크 테스트 완료 시 legacy 삭제. 요일별 cutover 전환 가능.

### Q15. 기술 제약/의존성 — 명시 체크 항목

**답변**: **R2·Neo4j provenance 데이터의 Split View UI 바인딩**
- 현재 skill R2 객체에 provenance 필드(source_code path, line range, doc path, page anchor)가 완전히 채워져 있는지 점검 필요
- 부족할 경우 svc-skill/svc-extraction 백엔드 확장 작업이 UX 구현 전에 선행 (F-item으로 분리)

**묵시 실행 항목** (선택되지 않았으나 기본 포함):
- AXIS DS 패키지 실존/성숙도 실측 (T-check)
- Cloudflare Access team domain + Google IdP 설정 (인프라)
- D1 `users` 테이블 마이그레이션 (svc-security 또는 신규 svc-auth)

---

---

## Part 5 — 언제/어떻게 측정 (성공 지표 / 타임라인)

### Q16. MVP Definition of Done — 성공 지표

**답변** (복수 선택):

1. **본부장 3분 설득력 테스트 통과** (P0)
   - 측정: 놀교우 동료 1명을 Executive 역할로 세워 Foundry-X 실사례 1건을 "설명 없이" 3분 내에 파악하는 관찰 스크립트 실행. 녹화 1회로 증거 확보.
2. **Spec→Source 역추적 클릭 수 3회 이하** (P0)
   - 측정: 임의 policy/rule/skill 1건 선택 → 발원 소스 라인 + 원본 문서 페이지까지 도달하는 클릭 횟수 3 이하. E2E 스크립트 또는 수동 관찰.

**미선택(측정 제외)**:
- 페이지 수 40% 감축(24→14) — 정량 목표는 Archive 자동 결과로 자연스럽게 달성 예상, 별도 KPI 아님
- AXIS DS 교체율 ≥80% — 품질 지표라기보다는 구현 체크리스트로 관리

### Q17. Sprint Timeline

**답변**: **Sprint 219 ~ 221 3개 Sprint MVP + S222(Should)**

| Sprint | 기간 | 주요 산출물 | 종속 |
|--------|------|-------------|------|
| **S219 (병행)** | F355b/F362와 동시 | OAuth skeleton (Cloudflare Access + Google IdP), AXIS DS 패키지 import, D1 users 테이블, Feature Flag `?legacy=1`, 랜딩 페이지 1개 | REQ-035 S219 주력과 충돌 없음 |
| **S220** | Phase 3 Should 착수기 | Executive View (Overview + Foundry-X 타임라인) + Archive 5페이지 삭제 + Evidence 서브메뉴 구성 | REQ-035 Phase 3 Foundry-X Production E2E 6/6 데이터 있어야 타임라인 풀. 부분 데이터로도 UI shipping 가능 |
| **S221** | Phase 3 S-1/S-2 완료 후 | Engineer Workbench (Split View 신규 구현 + Provenance Inspector) + AXIS DS 핵심 컴포넌트 8종 교체 + 모드 토글 + Admin 기본 화면 | Provenance 데이터 완전성 선행 필요 |
| **S222 (Should)** | — | 도메인 특화 컴포넌트(SpecSourceSplitView, ProvenanceInspector, StageReplayer) AXIS DS 레포 기여 PR + Guest/Demo 읽기 전용 모드 | AXIS DS upstream 반응 필요 |

### Q18. REQ-035(Phase 3 본 PRD)과의 종속 관계

**답변**: **병렬 진행, 어안히 선행 성구** — 우선순위는 `REQ-035 Must > REQ-036 Must > REQ-035 Should > REQ-036 Should`. REQ-036 Exec View는 REQ-035 Must 산출물(AI-Ready 95%, Foundry-X E2E 6/6, DIVERGENCE 3+)을 **데이터 소스로 사용**. 즉 UX 완성도는 Phase 3 산출물 완성도에 연결됨.

### Q19. 최대 리스크

**답변**: **Provenance 데이터 불완전** (단일 선택) — 현 R2 skill 객체의 `provenance` 필드에 source line range + doc page anchor가 완전히 채워졌는지 미확인. 비어있다면 svc-skill/svc-extraction 백엔드 확장이 S219 착수 전 선행 과제. PRD §9 Risk에 최상위 기재.

**묵시 리스크(중위 관리)**:
- AXIS DS 성숙도 리스크 — S219 초반에 npm publish 실측 (가장 먼저 실행)
- Cloudflare Access 플랜 리스크 — Zero Trust Free tier(50석) 범위 내 해결
- 본부장 피드백 리스크 — S220 종료 시 리뷰 세션으로 중간 반영

### Part 5 성공 지표 & 타임라인 종합

| 항목 | 값 |
|------|----|
| **MVP Definition of Done** | 본부장 3분 설득력 테스트 PASS + Spec→Source 클릭 수 ≤3 |
| **Target Sprint** | S219(병행) → S220 → S221 (3-Sprint MVP) |
| **Should Have** | S222 (AXIS DS 기여 + Guest/Demo) |
| **최대 리스크** | Provenance 데이터 불완전 (S219 선행 체크) |
| **종속 관계** | REQ-035 Must > REQ-036 Must > REQ-035 Should > REQ-036 Should |

---

## 인터뷰 종료 후 — PRD 준비 체크리스트

- [x] Part 1~5 응답 정리 (세션 220, 2026-04-21)
- [x] Pre-interview 스코프 확정 (§0) — REQ 성격/Audience/검증 UX/Archive/AXIS 5축
- [ ] Ambiguity 지표 산출 (추정: 0.10, Phase 1/2 선례 0.15/0.120보다 낮음)
- [ ] prd-final.md 초안 작성 (v0.1)
- [ ] 외부 AI 검토 (R1, R2) — 사용자 판단 필요
- [ ] review-history.md 갱신
- [ ] 착수 정당화 판단 (R1 + R2 평균 ≥74 AND Ambiguity ≤0.15)
