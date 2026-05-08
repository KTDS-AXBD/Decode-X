---
code: AIF-REQI-prd-v1
title: "Decode-X Deep Dive PRD"
version: 1.0
status: active
category: req-interview
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
---

# Decode-X Deep Dive PRD

**버전:** v1
**날짜:** 2026-04-16
**작성자:** AX BD팀
**상태:** 🔄 검토 중
**참조:** `docs/AI_Foundry_OS_DeepDive_v0.3.html`

---

## 1. 요약 (Executive Summary)

**한 줄 정의:**
Decode-X 파이프라인을 Business + Technical + Quality 3종 Spec 완결성을 갖추도록 심화하여, Foundry-X의 자동 반제품 생산을 위한 **AI 개발 필요충분조건**을 충족한다.

**배경:**
현 Decode-X는 코드·문서 2종만 처리하며 Policy·Ontology·Skill 중심 추출에 머물러 있다. Deep Dive v0.3 문서가 정의한 "경험 → Spec 자산화" 3단계 파이프라인 중 (a) 암묵지(Tacit) 수집 미지원, (b) 3종 Spec 완결성 미확보, (c) AI-Ready 6기준 자동 검증 부재 상태다.

**목표:**
- Business·Technical·Quality 3종 Spec Schema + Zod 검증 + AI-Ready 6기준 자동 채점 구현
- HITL Tacit Interview Agent 신설 (담당자 구조화 질문 → Spec 조각 추출)
- 수행팀 Handoff 패키지 표준 포맷 + 검증기 도입
- 퇴직연금 + 온누리상품권 파일럿에 재적용하여 KPI 80/90% 달성 증명

---

## 2. 문제 정의

### 2.1 현재 상태 (As-Is)
- Decode-X 산출물은 Skill Package(.skill.json) 단일 포맷 — Business·Technical·Quality 구분 없음
- Tacit Knowledge(담당자 머릿속) 수집 경로 부재 — 코드·문서만 지원
- AI-Ready 6기준(기계판독/의미일관/테스트가능/추적가능/완결성/인간검토) 자동 검증 미구현
- 수행팀이 받는 Handoff 포맷 비표준 — 재작업 발생 가능성

### 2.2 목표 상태 (To-Be)
- 모든 Spec이 `business`, `technical`, `quality` 3종 섹션을 명시적으로 포함
- Tacit Interview Agent가 SME 1인당 30분 내 Spec 조각 10건+ 추출
- 모든 Skill 패키지 생성 직후 AI-Ready 6기준 채점(0~6점) 자동 기록
- Handoff 패키지 = Spec 3종 + KG 링크 + 검증 리포트 묶음, 수행팀이 즉시 Plan 작성 가능

### 2.3 시급성
- 경영진 보고 일정 기준. 현재 "방법론 자기증명" 단계(Foundry-X Phase 42)이므로 외부 고객 적용 전에 Deep Dive 완결성 확보 필요.

---

## 3. 사용자 및 이해관계자

### 3.1 주 사용자
| 구분 | 설명 | 주요 니즈 |
|------|------|-----------|
| 수행팀 PM/TA | AX사업1팀·AX사업2팀 | Spec 수령 → 즉시 Plan/Design 착수, 재작업 최소화 |
| AX컨설팅팀 | 도구·템플릿 제공자 | Harness 체크리스트·PRD/Prototype 템플릿 표준화 |
| 도메인 SME | HITL 리뷰어 (퇴직연금/공공/통신) | 인터뷰 답변이 Spec 조각으로 자동 변환, 용어 충돌 감지 |

### 3.2 이해관계자
| 구분 | 역할 | 영향도 |
|------|------|--------|
| AX BD팀장 | 소사장, AI-Ready 6기준 최종 승인 | 높음 |
| 경영진 (대표/임원) | 보고 수혜자, 예산 결정 | 중간 |
| Foundry-X 개발팀 | Handoff 패키지 소비자 | 높음 |

### 3.3 사용 환경
- 기기: PC (웹 SPA)
- 네트워크: Cloudflare Access(Zero Trust, KT DS SSO)
- 기술 수준: 혼합 (도메인 SME 비개발자 + 수행팀 개발자)

---

## 4. 기능 범위

### 4.1 핵심 기능 (Must Have)
| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | 3종 Spec Schema + 검증 | `packages/types/src/spec-{business,technical,quality}.ts` Zod 스키마 + AI-Ready 6기준 자동 채점기 (`packages/utils/src/spec-validator.ts`) | P0 |
| 2 | Tacit Interview Agent | svc-extraction에 `/tacit/interview` 엔드포인트 신설. LLM 기반 구조화 질문 생성 + HITL 응답 수집 + PII 마스킹 후 D1 저장 + Spec 조각 자동 추출 | P0 |
| 3 | Handoff 패키지 검증 | svc-skill 확장. POST /handoff/package → Spec 3종 + KG 링크 + 검증 리포트 ZIP. 6기준 90% 미만 시 생성 거부 | P0 |

### 4.2 부가 기능 (Should Have)
| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | Spec 완결성 대시보드 | app-web에 조직별 B/T/Q 3종 커버리지 차트 | P1 |
| 2 | AI-Ready 6기준 Gap 리포트 | 미달 항목별 보완 가이드 자동 제안 | P1 |

### 4.3 제외 범위 (Out of Scope)
- **KG Relationship Registry 표준화** → AIF-REQ-023 Pipeline Observability와 병합
- **Ontology MCP (Palantir 참조)** → '27 검토로 이연
- **Foundry-X Orchestrator 구현** → Foundry-X 레포 책임
- **외부 고객사 파일럿** → 이번 마일스톤은 검증까지, 상용 파일럿은 차기

### 4.4 외부 연동
| 시스템 | 연동 방식 | 필수 여부 |
|--------|-----------|-----------|
| svc-llm-router | HTTP REST (llm-client.ts) | 필수 (Tacit 질문 생성) |
| svc-security /mask | HTTP POST | 필수 (PII 마스킹) |
| Neo4j Aura | Query API v2 | 필수 (Spec 노드 저장) |
| Foundry-X 레포 | Handoff ZIP → R2 URL | 필수 (핸드오프 수신) |

---

## 5. 성공 기준

### 5.1 정량 지표 (KPI)
| 지표 | 현재값 | 목표값 | 측정 방법 |
|------|--------|--------|-----------|
| Spec 완결성 분포 | [미측정, 추정 <30%] | ≥ 80% | 2-org(퇴직연금+온누리) Skill 패키지 중 B+T+Q 3종 모두 채워진 비율 |
| AI-Ready 6기준 통과율 | [미측정] | ≥ 90% | Skill 패키지 생성 직후 자동 채점기 결과 avg(score/6) |
| Spec 생성 성능 | 현 extraction 평균 ~5분 | ≤ 5분/문서 | svc-extraction + Tacit 통합 end-to-end latency (p95) |
| Tacit Interview 효율 | N/A (신기능) | SME 30분당 Spec 조각 ≥ 10건 | 인터뷰 세션 로그 집계 |

### 5.2 MVP 최소 기준
- [ ] 3종 Spec Schema 확정 + Zod 검증 동작
- [ ] Tacit Interview Agent 1개 도메인(퇴직연금)에서 E2E 흐름 통과
- [ ] Handoff 패키지 생성기가 6기준 채점 결과를 포함하여 R2 ZIP 출력
- [ ] 파일럿 2-org 재처리로 KPI 80/90% 달성 리포트

### 5.3 실패/중단 조건
- AI-Ready 6기준 통과율이 파일럿 재처리 후 **70% 미만**이면 프로젝트 중단 + 재설계 검토
- 근거: 6기준이 "필요충분조건"인 만큼 70% 이하는 Foundry-X 자동 생산 불가 판정

---

## 6. 제약 조건

### 6.1 일정
- 목표 완료일: 경영진 보고 일정 기준 [정확일 미확정, BD팀장 확인 필요]
- 마일스톤: v0.8 (Pilot Core v0.7.0 이후 차기 단일 마일스톤)

### 6.2 기술 스택
- 프론트엔드: React + Vite SPA (`apps/app-web`) 기존 유지
- 백엔드: svc-skill + svc-extraction 확장 (**신규 Worker 최소화**)
- 인프라: Cloudflare Workers + D1 + R2 + Queue + Neo4j Aura 기존 유지
- LLM: llm-client.ts HTTP REST (외부 svc-llm-router), 4-provider fallback 유지
- 기존 시스템 의존: svc-security /mask (PII 마스킹), svc-ontology (KG upsert)

### 6.3 인력/예산
- 투입 가능 인원: [미확인 — BD팀장 확인 필요]
- 예산 규모: Anthropic 크레딧 기반, multi-provider fallback으로 비용 완화

### 6.4 컴플라이언스
- PII 5종(SSN/Phone/Email/Account/CorpID) 마스킹 후 D1 저장 — 기존 E-01 미들웨어 재사용
- 도메인 SME 인터뷰 동의서 등 금융 규제 5년 보관은 [추후 확인]

---

## 7. 오픈 이슈

| # | 이슈 | 담당 | 마감 |
|---|------|------|------|
| 1 | 경영진 보고 일정 정확일 | BD팀장 | R1 검토 전 |
| 2 | 투입 가능 인원·기간 | BD팀장 | R1 검토 전 |
| 3 | SME 인터뷰 동의서·5년 보관 규제 적용 여부 | 준법팀 | 구현 착수 전 |
| 4 | Spec 3종 Schema 기존 Skill Package와 호환성(역호환 유지 방식) | svc-skill 오너 | Design 단계 |
| 5 | "퇴직연금" 표기 통일 — 프로젝트 전체 오타 전수 점검 | 문서 오너 | PRD Final |

---

## 8. 검토 이력

| 라운드 | 날짜 | 주요 변경사항 | 스코어 |
|--------|------|--------------|--------|
| 초안 | 2026-04-16 | 인터뷰 5파트 기반 최초 작성 | - |

---

*이 문서는 /ax:req-interview 스킬에 의해 자동 생성 및 관리됩니다.*
