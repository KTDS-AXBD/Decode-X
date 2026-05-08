---
code: AIF-DOC-ax-bd-msa-restructuring-plan
title: "AX BD 서비스 그룹 MSA 재조정 설계서"
version: 1.0
status: active
category: general
created: 2026-04-07
updated: 2026-04-07
author: Sinclair Seo
---

# AX BD 서비스 그룹 MSA 재조정 설계서

> **문서 ID**: FX-DSGN-MSA-001 v3 (실측 데이터 반영)
> **작성일**: 2026-04-06 → 2026-04-07 (v3 업데이트)
> **현행**: Phase 18 (Sprint 172 진행 중, ~174까지 계획) — 모놀리스 유지
> **F# 분석 기준**: SPEC.md F1~F267 (Sprint 98 시점), 이후 Sprint 99~174는 모놀리스 내 확장
> **MSA 시작**: **Phase 19 — Sprint 175~**
> **목적**: AX BD 사업개발 체계를 MSA로 재구조화 — 실측 F# 기반 마이그레이션 계획

---

## 1. 서비스 그룹 총괄

### 1.1 네이밍 체계

**AI Foundry**를 전체 플랫폼(포털)의 이름으로 확정하고, 하위 서비스들은 BD 프로세스 단계의 역할을 직관적으로 반영하는 **`*-X` 패밀리 네이밍**으로 통일합니다.

```
AI Foundry (플랫폼)
  ├── Discovery-X    "발견"    — 1단계 수집: Agent 자동 수집
  ├── Recon-X        "정찰"    — 1단계 수집: Reverse Engineering 스펙 추출
  ├── Foundry-X      "제련"    — 2~3단계: 발굴 + 형상화 엔진
  ├── Gate-X         "관문"    — 4단계: 검증 및 의사결정 게이트
  ├── Launch-X       "발사"    — 5~6단계: 제품화 + GTM
  ├── Eval-X         "평가"    — +1단계: 사업·AI 신뢰도 평가
  └── AXIS DS        "축"     — 크로스커팅: 디자인 시스템
```

### 1.2 서비스 매트릭스

| # | 서비스 | 네이밍 의도 | BD 단계 | 핵심 역할 | GitHub | 상태 |
|---|--------|-----------|---------|----------|--------|------|
| 0 | **AI Foundry** | AI 사업을 제련하는 공장 | 전 단계 허브 | 포털·오케스트레이션·포트폴리오 | 신규 생성 | 🆕 |
| 1 | **Discovery-X** | 미지의 것을 발견 | 1단계 수집 | Agent 자동 수집·스크리닝 | KTDS-AXBD/Discovery-X | 기존 활성화 |
| 2 | **Recon-X** | 기존 자산을 정찰·분석 | 1단계 수집(보완) | Reverse Engineering·스펙 추출 | AX-BD-Team/AI-Foundry → 리네임 | 기존 리네임 |
| 3 | **Foundry-X** | 원석을 제련·주조 | 2~3단계 | 발굴(2-0~2-8)+형상화(BDP/PRD/Prototype) | KTDS-AXBD/Foundry-X | 기존 축소 |
| 4 | **Gate-X** | 의사결정 관문 통과 | 4단계 검증 | 본부/전사 2-tier 검증·Go/Hold/Drop | 신규 | 🆕 |
| 5 | **Launch-X** | 시장에 발사·투입 | 5~6단계 | MVP/PoC·Offering Pack·GTM | 신규 | 🆕 |
| 6 | **Eval-X** | 객관적 평가·측정 | +1단계 평가 | 사업평가 매트릭스·AI 신뢰도 | 신규 | 🆕 |
| — | **AXIS DS** | 축·중심 | 크로스커팅 | 디자인 토큰·컴포넌트·템플릿 | IDEA-on-Action/AXIS-Design-System | 기존 확장 |

### 1.3 네이밍 설계 원칙

| 원칙 | 설명 |
|------|------|
| **BD 프로세스 직결** | 각 이름이 해당 단계의 핵심 행위를 한 단어로 표현 |
| **`*-X` 패밀리** | AI Foundry 산하 서비스임을 네이밍 패턴으로 즉시 인식 |
| **영문 동사/명사** | Discovery(발견), Recon(정찰), Foundry(제련), Gate(관문), Launch(발사), Eval(평가) |
| **AI Foundry = 브랜드** | 개별 서비스가 아닌 전체 플랫폼의 아이덴티티 |

---

## 2. 아키텍처 다이어그램

### 2.1 전체 MSA 구조

```
╔══════════════════════════════════════════════════════════════════╗
║                    AI  F O U N D R Y                            ║
║            AX BD 사업개발 통합 플랫폼 (포털)                      ║
║                                                                  ║
║  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           ║
║  │ 통합     │ │Workspace │ │포트폴리오│ │SSO/API   │           ║
║  │ 대시보드  │ │관리      │ │Show-case │ │Gateway   │           ║
║  └──────────┘ └──────────┘ └──────────┘ └──────────┘           ║
╚═══════╤═══════════╤════════════╤════════════╤═══════════╤═══════╝
        │           │            │            │           │
   ┌────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
   │         │ │         │ │         │ │         │ │         │
   │Discovery│ │ Recon-X │ │Foundry-X│ │ Gate-X  │ │Launch-X │
   │   -X    │ │         │ │         │ │         │ │         │
   │─────────│ │─────────│ │─────────│ │─────────│ │─────────│
   │1. 수집   │ │1. 수집   │ │2. 발굴   │ │4. 검증   │ │5. 제품화 │
   │Agent    │ │Reverse  │ │3. 형상화  │ │의사결정  │ │6. GTM   │
   │자동수집  │ │Engineer │ │PRD/BDP  │ │2-tier   │ │MVP/PoC  │
   │스크리닝  │ │스펙추출  │ │Prototype│ │Gate Pkg │ │Offering │
   │         │ │         │ │         │ │         │ │Pack     │
   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └─────────┘
        │           │            │            │
        └─────┬─────┘      ┌────▼────┐       │
              │             │         │       │
              └────────────▶│ Eval-X  │◀──────┘
                            │─────────│
                            │+1. 평가  │
                            │사업평가  │
                            │AI 신뢰도 │
                            └─────────┘

  ╔════════════════════════════════════════════════════════════╗
  ║              A X I S   D E S I G N   S Y S T E M          ║
  ║     토큰 · 컴포넌트 · 산출물 템플릿 · Prototype Kit        ║
  ║         (모든 서비스에 디자인 토큰 공급)                     ║
  ╚════════════════════════════════════════════════════════════╝
```

### 2.2 BD 프로세스 데이터 플로우

```
 1단계 수집              2~3단계 발굴·형상화         4단계 검증        5~6단계 제품화·GTM
 ──────────            ─────────────────          ──────────       ────────────────

 Discovery-X                                      Gate-X
 ┌─────────┐           ┌──────────────┐          ┌─────────┐     ┌──────────┐
 │ Agent   │──아이템──▶│              │──산출물──▶│ 본부    │──Go─▶│ MVP/PoC  │
 │ 자동수집 │   전달    │  Foundry-X   │   전달    │ 검증    │     │ 추적     │
 └─────────┘           │              │          ├─────────┤     ├──────────┤
                       │ 발굴 2-0~2-8 │          │ 전사    │     │ Offering │
 Recon-X               │ ──────────── │          │ 검증    │     │ Pack     │
 ┌─────────┐           │ BMC Canvas   │          ├─────────┤     ├──────────┤
 │ Reverse │──스펙──▶  │ BDP 사업계획서│          │Go/Hold/ │     │ 대고객   │
 │ Engin.  │   전달    │ Offering     │          │Drop     │     │ 선제안   │
 └─────────┘           │ PRD          │          └─────────┘     └──────────┘
                       │ Prototype    │           Gate-X           Launch-X
                       └──────┬───────┘
                              │
                        평가 요청│
                              ▼
                       ┌──────────────┐
                       │   Eval-X     │
                       │ ──────────── │
                       │ 사업평가     │──결과──▶ AI Foundry
                       │ AI 신뢰도   │  리포트   (포트폴리오)
                       │ 벤치마크    │
                       └──────────────┘
```

---

## 3. 서비스별 상세 정의

### S0. AI Foundry — 포털

| 항목 | 내용 |
|------|------|
| **풀네임** | AI Foundry — AX BD 사업개발 통합 플랫폼 |
| **네이밍 의도** | "AI를 제련하는 공장" — 모든 AI 사업 아이템이 이 플랫폼을 거쳐 만들어진다 |
| **역할** | 하위 `*-X` 서비스들의 허브 · API Gateway · SSO 인증 · 통합 대시보드 |
| **GitHub** | 신규 생성 (TBD) |

**주요 기능**:

| 기능 | 설명 |
|------|------|
| Workspace 관리 | 사용자별 개인 WS + 팀 공용 WS, 권한·초대·활동 이력 |
| 6+1단계 대시보드 | 수집→발굴→형상화→검증→제품화→GTM + 평가 전 단계 통합 모니터링 |
| 포트폴리오 Show-case | 사업 아이템별 현재 단계·핵심 지표·산출물 카드 뷰 |
| SSO/API Gateway | JWT 발급, 하위 서비스 라우팅, Rate Limit |
| 알림 허브 | 서비스별 이벤트 → Slack/이메일/인앱 알림 |
| 통합 검색 | 전 서비스 크로스 검색 |
| Activity Feed | 전 서비스 활동 타임라인 |

**Foundry-X에서 이관**: Auth/SSO, Org/Team Settings, Dashboard/KPI, Wiki, Agent Inbox (~70 EP)

---

### S1. Discovery-X — 1단계 수집

| 항목 | 내용 |
|------|------|
| **풀네임** | Discovery-X — AI 사업 아이템 자동 수집 엔진 |
| **네이밍 의도** | "미지의 기회를 발견한다" — 시장/기술/트렌드에서 사업 기회를 탐색 |
| **BD 단계** | 1단계 수집 (Agent 자동 수집 + Field-driven + IDEA Portal) |
| **GitHub** | https://github.com/KTDS-AXBD/Discovery-X |
| **WSL** | `~/work/axbd/Discovery-X` |

**마이크로서비스**:

| 서비스 | 역할 |
|--------|------|
| Collection Agent | 뉴스/논문/특허/기술블로그 자동 수집 (Cron + webhook) |
| Source Manager | 수집 소스 등록·관리·헬스체크 |
| Normalizer | 정규화 + 중복 제거 + 유사도 검사 |
| Screening Queue | AI 1차 필터 → BD팀 HITL 2차 심사 |
| Field Collection | BD팀 수동 수집 (기존 ideas 이관) |
| IDEA Portal | 전사 Bottom-up 채널 (기존 F240 이관) |
| Export API | F208 계약 기반, Foundry-X로 아이템 전달 |

---

### S2. Recon-X — 1단계 수집 (Reverse Engineering)

| 항목 | 내용 |
|------|------|
| **풀네임** | Recon-X — 기존 시스템 정찰 및 스펙 추출 엔진 |
| **네이밍 의도** | "정찰(Reconnaissance)" — 기존 자산을 탐색·분석하여 가치를 추출 |
| **BD 단계** | 1단계 수집 보완 (기존 시스템/서비스에서 스펙 역추출) |
| **GitHub** | https://github.com/AX-BD-Team/AI-Foundry → **리포명 `Recon-X`로 리네임** |
| **WSL** | `~/work/axbd/res-ai-foundry` → `~/work/axbd/Recon-X` (이관 후) |

**네이밍 변경 사유**: 기존 "AI Foundry" 이름이 포털로 승격되면서, RE 전담 서비스는 역할을 더 정확히 반영하는 "Recon-X"로 변경. "정찰"이라는 개념이 기존 시스템을 탐색·분석하는 Reverse Engineering의 본질을 잘 표현합니다.

**마이크로서비스**:

| 서비스 | 역할 |
|--------|------|
| RE Analyzer | 기존 시스템/서비스 리버스 엔지니어링 → 기능 스펙 추출 |
| Spec Producer | 추출 스펙을 표준 포맷(PRD/기능명세)으로 변환 |
| Asset Scanner | kt ds 내부 자산(API/서비스/데이터) 스캔 + 카탈로그화 |
| MCP Bridge | Foundry-X MCP 연동 인터페이스 (F80 프리셋 활용) |

---

### S3. Foundry-X — 2~3단계 발굴 + 형상화

| 항목 | 내용 |
|------|------|
| **풀네임** | Foundry-X — AI 사업 발굴 및 형상화 엔진 |
| **네이밍 의도** | "제련소(Foundry)" — 수집된 원석(아이템)을 분석·가공하여 사업으로 주조 |
| **BD 단계** | 2단계 발굴(2-0~2-8) + 3단계 형상화(BDP/Offering/PRD/Prototype) |
| **GitHub** | https://github.com/KTDS-AXBD/Foundry-X |
| **WSL** | `~/work/axbd/Foundry-X` |

**마이크로서비스** (축소 후 ~120 EP):

| 도메인 | 서비스 | 역할 |
|--------|--------|------|
| 발굴 | DiscoveryService | 2-0~2-8 서브스테이지 + 유형 라우팅 |
| 발굴 | SkillExecutionService | 76개 ai-biz 스킬 실행 엔진 |
| 발굴 | PersonaEvalService | 8 페르소나 자동 평가 |
| 발굴 | DiscoveryReportService | 발굴 통합 결과서 자동 생성 |
| 형상화 | BMCService | BMC Canvas CRUD + 버전 + 댓글 |
| 형상화 | BDPService | 사업계획서 편집 + AI 초안 + 버전 |
| 형상화 | OfferingService | 초도 미팅용 Offering 자동 생성 |
| 형상화 | PRDService | PRD 자동 생성 + shaping 파이프라인 |
| 형상화 | PrototypeService | F278 Prototype 자동생성 (Claude Code CLI) |
| 공통 | HitlReviewService | 발굴·형상화 인라인 검토 |
| 공통 | AgentPlanService | createPlanAndWait, executePlan |

**이관 대상 (Foundry-X에서 제거)**:

| 이관 기능 | 이관 대상 |
|-----------|----------|
| Auth/SSO, Org/Settings, Dashboard/KPI, Wiki, Agent Inbox | → **AI Foundry** (포털) |
| ideas/insights, IR Bottom-up | → **Discovery-X** |
| Validation, Decision, Gate Packages | → **Gate-X** |
| Pipeline, MVP, Offering Pack | → **Launch-X** |

---

### S4. Gate-X — 4단계 검증

| 항목 | 내용 |
|------|------|
| **풀네임** | Gate-X — 사업 아이템 검증 및 의사결정 게이트 |
| **네이밍 의도** | "관문(Gate)" — 통과해야 다음 단계로 진행, Go/Hold/Drop 결정의 관문 |
| **BD 단계** | 4단계 검증 및 공유 (본부 → 전사 2-tier) |
| **GitHub** | 신규 생성 |

**마이크로서비스**:

| 서비스 | 역할 | 출처 |
|--------|------|------|
| HQ Validation | 본부 레벨 — 전문가 인터뷰, 내부 미팅, 본부 보고 | 신규 |
| Corp Validation | 전사 레벨 — 비용 심의, Pre-PRB, 임원 보고 | 신규 |
| Decision Engine | Go/Hold/Drop 2-tier 워크플로 | FX F239 이관 |
| Gate Package | ORB/PRB 게이트 문서 자동 수집 + ZIP | FX F235 이관 |
| Sharing Hub | 산출물 공유 + 외부 전달 | FX F233 이관 |
| Offline Tracker | 전문가 인터뷰/미팅 일정·결과 기록 | 신규 |

---

### S5. Launch-X — 5~6단계 제품화 + GTM

| 항목 | 내용 |
|------|------|
| **풀네임** | Launch-X — 사업 아이템 제품화 및 시장 진입 엔진 |
| **네이밍 의도** | "발사(Launch)" — 검증된 사업을 시장에 투입, 제품으로 발사 |
| **BD 단계** | 5단계 제품화 + 6단계 GTM |
| **GitHub** | 신규 생성 |

**마이크로서비스**:

| 서비스 | 역할 | 출처 |
|--------|------|------|
| MVP Tracker | MVP 제작 상태 추적 | FX F238 이관 |
| PoC Manager | PoC 진행 별도 추적 + 결과 관리 | 신규 |
| Offering Pack Builder | 영업/제안용 번들 (제안서+데모+기술검증+가격) | FX F236 이관 |
| Pipeline View | 칸반/파이프라인 뷰 | FX F232 이관 |
| GTM Planner | 대고객 선제안 워크플로 | 신규 |

---

### S6. Eval-X — +1단계 평가

| 항목 | 내용 |
|------|------|
| **풀네임** | Eval-X — 사업 및 AI 서비스 평가 프레임워크 |
| **네이밍 의도** | "평가(Evaluation)" — 객관적 기준으로 사업성·기술 신뢰도 측정 |
| **BD 단계** | +1단계 평가 (전 단계 횡단) |
| **GitHub** | 신규 생성 |

**마이크로서비스**:

| 서비스 | 역할 |
|--------|------|
| Biz Evaluator | 사업성 평가 — 시장성·기술성·수익성 다축 매트릭스 |
| AI Trust Scorer | AI 신뢰도 평가 — 편향/공정성/설명가능성/보안 |
| Benchmark Engine | 사내외 벤치마크 데이터 관리 + 비교 분석 |
| Report Generator | 평가 결과 보고서 자동 생성 (AXIS DS 템플릿) |

---

### S7. AXIS Design System — 크로스커팅

| 항목 | 내용 |
|------|------|
| **풀네임** | AXIS Design System — AX BD 생태계 통합 디자인 시스템 |
| **네이밍 의도** | "축(Axis)" — 모든 서비스의 시각적 일관성의 중심축 |
| **GitHub** | https://github.com/IDEA-on-Action/AXIS-Design-System |
| **WSL** | `~/work/idea-on-action/AXIS-Design-System` |

**패키지 구조**:

| 패키지 | 역할 | 소비자 |
|--------|------|--------|
| @axis-ds/tokens | 디자인 토큰 (SSOT) | 전 서비스 |
| @axis-ds/react | React 컴포넌트 라이브러리 | 전 서비스 Web |
| @axis-ds/templates | 산출물 템플릿 (PPTX/PDF/HTML) | Foundry-X, Launch-X, Eval-X |
| @axis-ds/prototype-kit | Prototype 자동생성용 React SPA 스캐폴딩 | Foundry-X |
| @axis-ds/figma-sync | Figma ↔ 코드 토큰 자동 동기화 | CI/CD |

---

## 4. 서비스 간 연동

### 4.1 통신 패턴

| 패턴 | 용도 | 예시 |
|------|------|------|
| 동기 REST | 즉시 응답 조회/생성 | AI Foundry → Foundry-X 발굴 현황 조회 |
| 비동기 Event | 상태 변경 전파 | Discovery-X → AI Foundry: "새 아이템 수집됨" |
| Webhook | 서비스 간 콜백 | Foundry-X → Gate-X: "형상화 완료, 검증 요청" |
| Shared JWT | 인증 | AI Foundry 발급 JWT → 전 서비스 검증 |

### 4.2 핵심 이벤트 카탈로그

| Event | Producer | Consumer | 트리거 |
|-------|----------|----------|--------|
| `item.collected` | Discovery-X, Recon-X | AI Foundry, Foundry-X | 새 아이템 수집 |
| `item.screened` | Discovery-X | Foundry-X | 스크리닝 통과 → 발굴 시작 |
| `discovery.completed` | Foundry-X | AI Foundry, Gate-X | 발굴 2-8 완료 |
| `shaping.completed` | Foundry-X | Gate-X, AI Foundry | 형상화 산출물 완료 |
| `prototype.deployed` | Foundry-X | AI Foundry, Launch-X | Prototype 배포 완료 |
| `validation.decided` | Gate-X | AI Foundry, Launch-X | Go/Hold/Drop 결정 |
| `offering-pack.created` | Launch-X | AI Foundry | Offering Pack 번들 완성 |
| `eval.scored` | Eval-X | AI Foundry | 평가 점수 산출 완료 |

### 4.3 인증 플로우

```
사용자 ──→ AI Foundry (SSO) ──→ JWT 발급
              │
              ├──→ Discovery-X (JWT 검증)
              ├──→ Recon-X (JWT 검증)
              ├──→ Foundry-X (JWT 검증)
              ├──→ Gate-X (JWT 검증)
              ├──→ Launch-X (JWT 검증)
              └──→ Eval-X (JWT 검증)
```

---

## 5. 기능 마이그레이션 맵 (실측 기반)

> **기준**: SPEC.md F1~F267, Sprint 98 완료 시점
> **현행 수치**: 73 routes, ~420 EP, 169 services, 87 schemas, D1 0001~0078
> **테스트**: API 2,250 + CLI 149 + Web 265 + E2E 35 specs

### 5.1 서비스별 기능(F#) 배정표

#### S0. AI Foundry (포털) — 이관 대상 F-items

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| Auth/SSO | F40 | JWT Auth + RBAC Middleware | ~12 |
| Auth/SSO | F108 | Auth SSO Integration (3-Service 통합 인증) | ~8 |
| Auth/SSO | F133 | Login/Signup UI + Sidebar Auth | ~4 |
| Auth/SSO | F210 | Password Reset Flow | ~3 |
| Auth/SSO | F248 | ProtectedRoute Auth Guard | ~2 |
| Multitenancy | F83 | Multitenancy Foundation (Orgs + RLS) | ~15 |
| Team/Org | F251 | Team Account Bulk Creation + Org Invite | ~4 |
| Team/Org | F253 | Team Data Sharing (Org-scope) | ~3 |
| Dashboard | F26 | Team Information Sharing Dashboard | ~6 |
| Dashboard | F107 | Multi-Project Dashboard | ~5 |
| Dashboard | F170 | Adoption KPI Dashboard | ~4 |
| Dashboard | F171 | Dashboard IA Redesign (6-step) | ~3 |
| Dashboard | F243 | Dashboard Process Pipeline Progress View | ~3 |
| KPI | F100 | KPI Measurement Infrastructure | ~8 |
| KPI | F125 | Phase 4 Go Decision Prep (KPI Dashboard) | ~4 |
| KPI | F158-F161 | Web Pageview + CLI KPI + Cron + Real Data | ~12 |
| Wiki | F27 | Human Readable Document + Wiki | ~6 |
| Wiki | F46 | Wiki Git Synchronization | ~4 |
| Workspace | F29 | Personal Workspace (ToDo, Messages, Settings) | ~8 |
| Agent Inbox | F30 | Agent Transparency View | ~4 |
| Agent Inbox | F71 | Agent-to-Agent Inbox Communication | ~3 |
| Agent Inbox | F76 | AgentInboxPanel UI + AgentPlanCard | ~4 |
| Agent Inbox | F81 | AgentInboxPanel Thread View | ~3 |
| Agent Inbox | F87-F89 | Thread Reply (Form + API + Tests) | ~6 |
| Onboarding | F120-F122 | Onboarding Guide + Checklist + Kickoff | ~8 |
| Onboarding | F132 | Onboarding Kickoff Checklist | ~2 |
| Onboarding | F172-F173 | Interactive Tour + Self-Onboarding | ~5 |
| Onboarding | F252 | Onboarding Guide Enhancement | ~3 |
| Feedback | F121 | Feedback Collection System (NPS) | ~3 |
| Feedback | F174 | In-App Feedback Widget | ~2 |
| Feedback | F254 | NPS Feedback Collection | ~2 |
| Identity | F47 | Production Site Design | ~2 |
| Identity | F74 | Project Intro Page Redesign | ~2 |
| Identity | F119 | Identity & Intro Page Update | ~2 |
| Identity | F205 | Foundry-X Intro Continuous Updates | ~1 |
| Sidebar | F241 | Sidebar Process 6-Step Restructuring | ~3 |
| Token/Cost | F31 | Token/Cost Management | ~5 |
| Token/Cost | F143 | Model Cost/Quality Dashboard | ~4 |
| SSE | F44 | SSE Real-time Communication | ~4 |
| SSE | F55 | SSE Events (Agent Task Propagation) | ~3 |
| Notification | F67 | MCP Resources + Notifications | ~3 |
| Notification | F85 | Slack Integration | ~5 |
| Notification | F94 | Slack Enhancement | ~3 |
| **소계** | **42건** | | **~215 EP** |

#### S1. Discovery-X — 이관 대상 F-items

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| Collection | F179 | Business Item Collection Channel Integration | ~8 |
| Ideas | F198 | Idea Registration & Tagging | ~6 |
| Insights | F202 | Market Keyword Summary (InsightAgent) | ~4 |
| API Contract | F208 | Discovery-X API Interface Contract | ~3 |
| Bottom-up | F240 | IR Bottom-up Channel | ~5 |
| BD Items | F257 | Additional BD Item Exploration | ~4 |
| **소계** | **6건** | | **~30 EP** |

#### S3. Foundry-X (잔류) — 2~3단계 핵심 기능

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| 발굴 Core | F182 | 5 Starting Points Classification + Path Guidance | ~4 |
| 발굴 Core | F183 | Discovery 9-Criteria Checklist + Exception | ~4 |
| 발굴 Core | F184 | pm-skills Execution Guide + Context | ~3 |
| 발굴 Core | F190 | Market/Trend Data Auto-Integration | ~4 |
| 발굴 Core | F193-F194 | pm-skills Methodology + Validation Criteria | ~5 |
| 발굴 Core | F212 | AX BD Discovery Skill System Integration | ~4 |
| 발굴 Core | F213 | Foundry-X API v8.2 Extension | ~8 |
| 발굴 Core | F214 | Web Discovery Dashboard | ~6 |
| 발굴 UX | F258 | BD 프로세스 가이드 UI (2-0~2-10) | ~6 |
| 발굴 UX | F259 | BD 스킬 카탈로그 UI (76스킬+36커맨드) | ~6 |
| 발굴 UX | F260 | BD 스킬 실행 엔진 | ~8 |
| 발굴 UX | F261 | BD 산출물 저장 + 버전 관리 | ~6 |
| 발굴 UX | F262 | BD 프로세스 진행 추적 + 사업성 신호등 | ~5 |
| 발굴 UX | F263 | 발굴 위저드 UI (멀티스텝) | ~5 |
| 발굴 UX | F264 | Help Agent (OpenRouter SSE 챗봇) | ~6 |
| 발굴 UX | F265 | 발굴 온보딩 투어 (5스텝) | ~3 |
| 발굴 UX | F266 | HITL 인터랙션 패널 (4-action) | ~5 |
| 발굴 UX | F267 | BD 팀 공용 스킬 GitHub 배포 | ~2 |
| 형상화 BMC | F197 | BMC Canvas CRUD (9 Blocks) | ~10 |
| 형상화 BMC | F199 | BMC Draft Auto-Generation (BMCAgent) | ~4 |
| 형상화 BMC | F200 | BMC Version History | ~3 |
| 형상화 BMC | F201 | BMC Block Insight Recommendation | ~3 |
| 형상화 BMC | F203 | Idea-BMC Connection | ~3 |
| 형상화 BMC | F204 | BMC Comments & Collaboration | ~4 |
| 형상화 BDP | F180 | Business Plan Draft Auto-Generation | ~5 |
| 형상화 BDP | F234 | BDP Edit/Version Management | ~5 |
| 형상화 BDP | F237 | Business Proposal Auto-Generation | ~4 |
| 형상화 PRD | F45 | NL→Spec Conversion (LLM) | ~4 |
| 형상화 PRD | F54 | NL→Spec Conflict Detection | ~3 |
| 형상화 PRD | F185 | PRD Auto-Generation | ~4 |
| 형상화 Proto | F181 | Prototype Auto-Generation | ~3 |
| Methodology | F116 | KT DS SR Scenario Concretization | ~3 |
| Methodology | F191-F192 | Methodology Registry/Router + BDP Modular | ~6 |
| Methodology | F195 | Methodology Management UI | ~4 |
| HITL | F186 | Multi-AI Review Pipeline | ~4 |
| HITL | F189 | Discovery Progress Dashboard | ~4 |
| Agent Plan | F70 | PlannerAgent (Task Pre-Research) | ~4 |
| Agent Plan | F75 | PlannerAgent LLM Real Integration | ~4 |
| Agent Plan | F82 | PlannerAgent → Orchestrator Integration | ~3 |
| Agent Plan | F90-F91 | PlannerAgent Prompt + repoUrl | ~3 |
| Infrastructure | F28 | Architecture View (4 tabs) | ~4 |
| Infrastructure | F109 | API BFF→Integration | ~5 |
| Infrastructure | F242 | ProcessStageGuide Component | ~2 |
| Infrastructure | F244 | AXIS DS Color Badge + Active Stage Border | ~2 |
| **소계** | **43건** | | **~195 EP** |

#### S4. Gate-X — 이관 대상 F-items

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| Validation | F187 | Multi-Persona Pre-Evaluation (8 페르소나) | ~5 |
| Validation | F188 | Six Hats Discussion | ~4 |
| Decision | F239 | Step-by-step Decision Workflow (Go/Hold/Drop) | ~6 |
| Gate Package | F235 | ORB/PRB Gate Preparation (문서 자동 수집) | ~5 |
| **소계** | **4건** | | **~20 EP** |

#### S5. Launch-X — 이관 대상 F-items

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| Pipeline | F232 | Pipeline Integration Dashboard | ~8 |
| Sharing | F233 | Artifact Sharing System | ~5 |
| Offering | F236 | Offering Pack Generation | ~5 |
| MVP | F238 | MVP Tracking + Automation | ~5 |
| Customer | F117 | External Customer Pilot (📋 계획) | ~3 |
| Customer | F169 | Customer Demo Environment | ~3 |
| **소계** | **6건** | | **~29 EP** |

#### S6. Eval-X — 이관/신규 F-items

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| Evaluation | F207 | Evaluation Management Framework MVP | ~8 |
| KPI (일부) | F100 | KPI Measurement Infrastructure (평가 파트) | ~4 |
| Trust Score | — | AI Trust Scorer (신규) | ~6 |
| Benchmark | — | Benchmark Engine (신규) | ~5 |
| **소계** | **2건 이관 + 2건 신규** | | **~23 EP** |

#### S2. Recon-X — 기존 + GIVC

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| MCP | F80 | AI Foundry MCP Integration | ~5 |
| GIVC | F245 | GIVC Ontology PoC (📋 계획) | ~8 |
| GIVC | F255 | GIVC Ontology PoC 1st Phase (Property Graph) | ~16 |
| GIVC | F256 | GIVC PoC 2nd Phase (4 Scenarios) | ~10 |
| **소계** | **4건** | | **~39 EP** |

#### Agent Evolution (Foundry-X → 향후 AI Foundry로 이관 검토)

| 도메인 | F# | 기능명 | EP 추정 |
|--------|-----|--------|--------|
| Agent Core | F50, F53, F58, F61 | Agent Orchestration + Claude API + MCP | ~20 |
| Agent Evolution | F135-F152 | OpenRouter, Model Routing, 7종 Agent, Marketplace 등 18건 | ~45 |
| Agent Quality | F101-F103 | Hook Auto-Fix, Auto-Rebase, Semantic Lint | ~8 |
| Agent Test | F216-F219 | TestAgent Research~TDD Skill | ~8 |
| GitHub/Slack | F84-F86, F93-F94 | GitHub Sync, Slack Integration | ~15 |
| **소계** | **28건** | | **~96 EP** |

#### CLI 전용 (패키지 잔류)

| F# | 기능명 | 비고 |
|-----|--------|------|
| F1-F5 | Monorepo + Shared + Harness + Plumb + Services | 기반 인프라 |
| F6-F11 | init/sync/status + Templates + Verification + npm | CLI 코어 |
| F15-F18, F20 | Ink TUI Components + Views + Non-TTY | CLI UI |
| F25 | status --watch Real-time | CLI 모니터링 |
| F32-F36 | Dynamic Doc Generation + Verify + Freshness | Harness 도구 |
| **소계** | **21건** | CLI 패키지 독립 유지 |

#### 인프라/빌드/기타 (서비스 공통)

| F# | 기능명 | 비고 |
|-----|--------|------|
| F12-F14, F19, F21-F24 | ADR, Contract, Lint, Tests | 기반 |
| F37-F39, F41-F43, F48-F49 | Cloudflare, OpenAPI, D1, Web, E2E | 배포/인프라 |
| F51-F52, F57, F62-F63, F66, F69, F77 | Production, Release, Stabilization | 배포 |
| F72 | git worktree Isolation | 개발도구 |
| F79, F104 | AXIS DS UI Conversion | 디자인 |
| F220-F231 | Ecosystem Benchmarking (Ref/Watch) | Phase 6 참고 |
| F246-F247 | Next.js → Vite 전환 | 완료, 공통 |
| F249-F250 | E2E Auth Fixture, Login E2E | 테스트 |
| **소계** | **~35건** | 서비스별 분산 |

### 5.2 서비스별 EP 규모 (실측 기반 업데이트)

| 서비스 | 이관 F-items | 이관 EP | 신규 EP | 합계 | 비율 |
|--------|-------------|--------|---------|------|------|
| AI Foundry (포털) | 42건 | ~215 | ~30 | **~245** | 37% |
| Discovery-X | 6건 | ~30 | ~40 | **~70** | 11% |
| Recon-X | 4건 | ~39 | ~15 | **~54** | 8% |
| **Foundry-X** (잔류) | 43건 | ~195 | ~10 | **~205** | 31% |
| Gate-X | 4건 | ~20 | ~30 | **~50** | 8% |
| Launch-X | 6건 | ~29 | ~15 | **~44** | 7% |
| Eval-X | 2건+2신규 | ~12 | ~20 | **~32** | 5% |
| **합계** | **107건 핵심** | **~540** | **~160** | **~700** | |

> **참고**: Agent Evolution 28건(~96 EP)은 1차에서 Foundry-X 잔류, 2차에서 AI Foundry로 이관 검토.
> CLI 21건은 CLI 패키지 독립 유지. 인프라/기타 ~35건은 서비스별 분산.
> 총 F-items: 267건 = 핵심 107 + Agent 28 + CLI 21 + 인프라 35 + Ecosystem Ref 76

### 5.3 D1 마이그레이션 분할 계획

현행 D1 migrations (0001~0078, `foundry-x-db`)를 서비스별로 분리:

| 서비스 | 관련 테이블 (주요) | 마이그레이션 범위 |
|--------|-------------------|-----------------|
| AI Foundry | users, orgs, org_members, sessions, tokens, kpi_*, agent_inbox, wiki_* | 0001~0015, 0035~0040 등 |
| Discovery-X | biz_items, ideas, insights, collection_* | 0050~0055 등 |
| Foundry-X | ax_discovery_*, ax_skill_*, bmc_*, bdp_*, offering_*, prd_* | 0060~0078 |
| Gate-X | validation_*, decision_*, gate_packages | 신규 0001~ |
| Launch-X | pipeline_*, mvp_*, offering_pack_* | 신규 0001~ |
| Eval-X | evaluation_*, benchmark_* | 신규 0001~ |
| Recon-X | re_specs, asset_catalog, givc_* | 신규 0001~ |

---

## 6. 인프라 총괄

| 서비스 | 호스팅 | DB | 도메인 (안) |
|--------|--------|-----|------------|
| AI Foundry | Workers + Pages | D1 `ai-foundry-portal-db` | `ai-foundry.axbd.ktds.co.kr` |
| Discovery-X | Workers + Queues | D1 `discovery-x-db` + R2 | `dx.axbd.ktds.co.kr` |
| Recon-X | Workers (또는 VM) | D1 `recon-x-db` | `rx.axbd.ktds.co.kr` |
| Foundry-X | Workers + Pages | D1 `foundry-x-db` | `fx.axbd.ktds.co.kr` |
| Gate-X | Workers + Pages | D1 `gate-x-db` | `gx.axbd.ktds.co.kr` |
| Launch-X | Workers + Pages | D1 `launch-x-db` | `lx.axbd.ktds.co.kr` |
| Eval-X | Workers + Pages | D1 `eval-x-db` | `ex.axbd.ktds.co.kr` |
| AXIS DS | npm registry | — | `@axis-ds/*` |

---

## 7. 마이그레이션 로드맵 (Phase 19 — Sprint 175~)

> **전략**: Strangler Fig 패턴 — 기존 Foundry-X 모놀리스에서 점진적 분리
> **현행**: Phase 18 (Sprint 172 진행 중, ~174까지 계획) — 모놀리스 유지 중
> **MSA 시작**: **Phase 19 = Sprint 175~** (Phase 18 완료 직후)
> **참고**: Sprint 99~174 동안 모놀리스 내에서 기능 확장 계속됨 (F268+ 추가 F-items 존재 가능)

### 7.1 Phase 19-A: 포털 기반 + AI Foundry 분리 (Sprint 175~178)

| Sprint | 작업 | 핵심 산출물 |
|--------|------|------------|
| 175 | AI Foundry 포털 scaffold (Hono Workers + Pages) + JWT SSO Gateway | `ai-foundry-portal-db` D1 생성, Workers 뼈대 |
| 176 | Auth/SSO 이관 (F40, F108, F133, F210, F248 계열) | users/orgs/sessions 테이블 분리, SSO 독립 |
| 177 | Dashboard/KPI 이관 (F26, F107, F170-F171, F158-F161 계열) | 통합 대시보드, KPI 자동 집계 |
| 178 | Workspace/Wiki/Onboarding/Feedback 이관 (F27, F29, F120-F122, F172-F174 계열) | 개인 WS + Wiki + 온보딩 가이드 |

**M1 완료 기준**: AI Foundry 포털이 독립 Workers로 동작, SSO JWT 발급, ~215 EP 이관 완료
**리스크**: 이관 EP 수가 많아 Sprint 초과 가능 → 우선순위 Auth/SSO/Dashboard 먼저

### 7.2 Phase 19-B: Discovery-X 활성화 (Sprint 179~180)

| Sprint | 작업 | 핵심 산출물 |
|--------|------|------------|
| 179 | Discovery-X 수집 기능 이관 (F179, F198, F202, F208, F240 계열) + 스크리닝 | `discovery-x-db` D1, ideas/insights 테이블 이관 |
| 180 | Agent 수집 자동화 MVP + Normalizer + Source Manager | Collection Agent Cron, Screening Queue |

**M2 완료 기준**: Discovery-X가 독립 서비스로 수집·스크리닝 담당
**의존성**: AI Foundry SSO → Discovery-X JWT 검증

### 7.3 Phase 19-C: Foundry-X 범위 한정 + Gate-X (Sprint 181~184)

| Sprint | 작업 | 핵심 산출물 |
|--------|------|------------|
| 181 | Foundry-X DB 정리 — 2~3단계 전용으로 축소 | `foundry-x-db` 경량화, ~195 EP만 잔류 |
| 182 | Gate-X scaffold + 검증/의사결정 이관 (F187, F188, F235, F239 계열) | `gate-x-db` D1, 2-tier 워크플로 |
| 183 | Gate-X HQ/Corp Validation + Offline Tracker 신규 | 본부/전사 검증 분리, 전문가 인터뷰 기록 |
| 184 | Foundry-X → Gate-X 이벤트 연동 (`shaping.completed` → `validation.decided`) | 비동기 Event 파이프라인 구축 |

**M3 완료 기준**: Foundry-X가 2~3단계만 담당, Gate-X 독립 운영

### 7.4 Phase 19-D: Launch-X + Eval-X + Recon-X (Sprint 185~190)

| Sprint | 작업 | 핵심 산출물 |
|--------|------|------------|
| 185 | Launch-X scaffold + 파이프라인/MVP 이관 (F232, F233, F236, F238 계열) | `launch-x-db` D1, Pipeline View + Offering Pack |
| 186 | Launch-X GTM 기능 신규 + 대고객 선제안 | GTM Planner, PoC Manager |
| 187 | Eval-X scaffold + 평가 프레임워크 이관 (F207 계열) + 신규 | `eval-x-db`, Biz Evaluator + AI Trust Scorer |
| 188 | Recon-X 리네임 + GIVC 이관 (F255, F256 계열) | `recon-x-db`, RE Analyzer + GIVC Property Graph |
| 189 | AXIS DS 확장 — @axis-ds/templates + @axis-ds/prototype-kit | 산출물 템플릿 전 서비스 적용 |
| 190 | 전 서비스 이벤트 카탈로그 완성 + 통합 E2E 테스트 | 8개 핵심 이벤트 검증, 크로스서비스 E2E |

**M4 완료 기준**: 7개 서비스 + 1 포털 + AXIS DS 모두 독립 운영
**최종 목표 EP**: ~700 (현행 기준 ~420+α에서 신규 기능 포함 확장)

### 7.5 로드맵 타임라인 요약

```
Phase 18 (현행)                Phase 19 — MSA Migration
Sprint 172~174                 Sprint 175                                              190
───────────┤                   ├────── M1: AI Foundry ──────┤
                                                             ├── M2: Discovery-X ─┤
                                                                                   ├──── M3: FX축소+Gate-X ────┤
                                                                                                                ├──── M4: Launch/Eval/Recon ────┤
                               └──────────────── Phase 19 (16 Sprints, ~4개월) ─────────────────────────────────┘
```

### 7.6 Sprint 99~174 증분 반영 주의사항

Sprint 98(F267) 이후 현재 Sprint 172까지 약 74 Sprint 동안 모놀리스 내에서 상당한 기능 추가가 있었을 것입니다.
MSA 이관 시작 전 반드시:

1. **현행 F-item 전수 재조사** — F268+ 추가된 기능들의 서비스 배정 재확인
2. **현행 EP/라우트/서비스 수 재측정** — `ls packages/api/src/routes/` 실행
3. **D1 마이그레이션 최신 번호 확인** — 0078 이후 추가분 반영
4. **테스트 커버리지 재측정** — API/Web/E2E 최신 수치로 갱신

### 7.6 마이그레이션 체크리스트

각 서비스 이관 시 반드시 수행:

1. Workers + Pages scaffold (`wrangler init`)
2. D1 데이터베이스 생성 + 스키마 마이그레이션
3. JWT 검증 미들웨어 (AI Foundry 발급 토큰)
4. CORS 설정 (AI Foundry 포털 Origin)
5. 이관 라우트 Foundry-X에서 Proxy → 신규 서비스로 전환 (Strangler)
6. 이관 완료 후 Foundry-X에서 해당 라우트 제거
7. 이벤트 발행/구독 연동 테스트
8. AXIS DS 토큰 적용 확인
9. E2E 테스트 크로스서비스 시나리오 추가

---

## 8. 프로젝트 경로 총괄

| 서비스 | GitHub | WSL 경로 |
|--------|--------|---------|
| AI Foundry (포털) | TBD (신규) | `~/work/axbd/AI-Foundry` |
| Discovery-X | `KTDS-AXBD/Discovery-X` | `~/work/axbd/Discovery-X` |
| Recon-X | `AX-BD-Team/AI-Foundry` → 리네임 `Recon-X` | `~/work/axbd/Recon-X` |
| Foundry-X | `KTDS-AXBD/Foundry-X` | `~/work/axbd/Foundry-X` |
| Gate-X | TBD (신규) | `~/work/axbd/Gate-X` |
| Launch-X | TBD (신규) | `~/work/axbd/Launch-X` |
| Eval-X | TBD (신규) | `~/work/axbd/Eval-X` |
| AXIS DS | `IDEA-on-Action/AXIS-Design-System` | `~/work/idea-on-action/AXIS-Design-System` |

---

*v2: 포털 네이밍 AI Foundry 확정, 기존 AI Foundry(RE) → Recon-X 리네임, BD 프로세스 기반 `*-X` 패밀리 네이밍 적용*
