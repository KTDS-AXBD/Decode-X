---
code: AIF-REQI-prd-final
title: "Decode-X Deep Dive PRD"
version: 1.0
status: active
category: req-interview
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
---

# Decode-X Deep Dive PRD

**버전:** v2
<!-- CHANGED: 검토 의견 반영으로 버전 증가 -->
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
<!-- CHANGED: KPI/파일럿 목표의 대표성 한계 명시 및 단계별 목표 재조정 기초 추가 -->
- 파일럿(2-org)은 전체 범위 대표성 확보를 위한 초기 샘플로 활용되며, 추후 추가 도메인에서의 재평가 및 KPI 목표값 조정 계획 포함

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
<!-- CHANGED: Tacit Interview Agent 성능 목표의 근거와 현실적 한계, 예외 상황(예: SME 응답 난이도)에 대한 검증 및 보완/대체 플랜 언급 -->
  - *참고: SME 인터뷰 다양성 및 난이도에 따라 10건 기준 미달 가능성 있으므로, PoC로 실측 후 목표 재조정 및 수동 입력 백업 경로 마련*
- 모든 Skill 패키지 생성 직후 AI-Ready 6기준 채점(0~6점) 자동 기록
  <!-- CHANGED: AI-Ready 6기준 자동 채점의 방식, 객관성 확보 방안, Validation Loop 연계 검증 계획 추가 -->
  - *채점기는 룰 기반+LLM 보조 혼합 방식 사용, SME HITL 이의제기 및 피드백 루프 통해 객관성 개선*
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
<!-- CHANGED: 스키마 버저닝 및 역호환성 정책 필요성 명시, 마이그레이션 플랜 필요성 반영 -->
|   |      | *스키마는 명시적 버저닝 및 역호환성 정책에 따라 관리, 기존 Skill Package에서 3종 Spec으로의 마이그레이션 지원* |    |
| 2 | Tacit Interview Agent | svc-extraction에 `/tacit/interview` 엔드포인트 신설. LLM 기반 구조화 질문 생성 + HITL 응답 수집 + PII 마스킹 후 D1 저장 + Spec 조각 자동 추출 | P0 |
<!-- CHANGED: Tacit Interview Agent의 PoC 및 성능 검증, 수동 입력 Fallback, SME HITL Validation Loop 명시 -->
|   |      | *PoC로 30분/10건 목표 검증, 실패 시 수동 입력 백업 제공, SME HITL Validation Loop 내장* |    |
| 3 | Handoff 패키지 검증 | svc-skill 확장. POST /handoff/package → Spec 3종 + KG 링크 + 검증 리포트 ZIP. 6기준 90% 미만 시 생성 거부 | P0 |
<!-- CHANGED: ZIP 패키지 생성 원자성(Atomicity) 및 롤백 메커니즘 필요성 명시 -->
|   |      | *패키지 생성 중단 시 부분적 파일 롤백 보장, 로그 자동 기록* |    |

### 4.2 부가 기능 (Should Have)
| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | Spec 완결성 대시보드 | app-web에 조직별 B/T/Q 3종 커버리지 차트 | P1 |
| 2 | AI-Ready 6기준 Gap 리포트 | 미달 항목별 보완 가이드 자동 제안 | P1 |
<!-- CHANGED: KPI, 채점, Spec 추출 등 핵심 파이프라인별 운영 모니터링/알림(시계열 데이터, 장애 감지, Alert) 계획 추가 -->
| 3 | 운영 모니터링 및 Alert | 주요 파이프라인(Interview, 채점, Handoff)별 상태/성능/장애 시계열 데이터, Alert 시스템 구현 | P1 |

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
<!-- CHANGED: 외부 연동 보안 정책(예: 인증/권한/임시 데이터 관리) 및 장애 시 대체 흐름(Fallback) 명시 -->
| 기타 | 연동 API 인증·권한·임시 파일 삭제 정책, 장애 시 Fallback 경로 명시 | 필수 |

---

## 5. 성공 기준

### 5.1 정량 지표 (KPI)
| 지표 | 현재값 | 목표값 | 측정 방법 |
|------|--------|--------|-----------|
| Spec 완결성 분포 | [미측정, 추정 <30%] | ≥ 80% | 2-org(퇴직연금+온누리) Skill 패키지 중 B+T+Q 3종 모두 채워진 비율 |
| AI-Ready 6기준 통과율 | [미측정] | ≥ 90% | Skill 패키지 생성 직후 자동 채점기 결과 avg(score/6) |
| Spec 생성 성능 | 현 extraction 평균 ~5분 | ≤ 5분/문서 | svc-extraction + Tacit 통합 end-to-end latency (p95) |
| Tacit Interview 효율 | N/A (신기능) | SME 30분당 Spec 조각 ≥ 10건 | 인터뷰 세션 로그 집계 |
<!-- CHANGED: KPI 목표값의 도전성, 미측정 현실, 단계별 목표(파일럿→확장) 및 목표치 재조정 플랜 언급 -->
- *참고: KPI 목표값(80%/90%)은 파일럿(2-org) 단계에서 실측 후, 추가 도메인 적용 시 점진적 목표 재설정/검증 계획 포함*

### 5.2 MVP 최소 기준
- [ ] 3종 Spec Schema 확정 + Zod 검증 동작
- [ ] Tacit Interview Agent 1개 도메인(퇴직연금)에서 E2E 흐름 통과
- [ ] Handoff 패키지 생성기가 6기준 채점 결과를 포함하여 R2 ZIP 출력
- [ ] 파일럿 2-org 재처리로 KPI 80/90% 달성 리포트
<!-- CHANGED: Validation Plan 및 SME HITL 품질 검증 루프, 오분류 대응 방안 추가 -->
- [ ] SME HITL 검토–수정–승인 Validation 루프 및 오류/오분류 리포트 체계 반영

### 5.3 실패/중단 조건
- AI-Ready 6기준 통과율이 파일럿 재처리 후 **70% 미만**이면 프로젝트 중단 + 재설계 검토
- 근거: 6기준이 "필요충분조건"인 만큼 70% 이하는 Foundry-X 자동 생산 불가 판정
<!-- CHANGED: KPI 측정 신뢰성 부족 지적에 대응, 자동 채점의 객관성·테스트 케이스·SME HITL 보완 루프 명시 -->
- *KPI 측정 신뢰성 강화를 위해: 자동 채점기 객관성 테스트, False Negative율 15% 이하 목표, SME HITL 피드백 지속 반영*

---

## 6. 제약 조건

### 6.1 일정
- **보고 마감**: 2026-04-17 (금) 10:00 — PoC 시연 포함
- **작업 윈도우**: 2026-04-16 저녁 ~ 2026-04-17 09:30 (약 18시간)
- **마일스톤**: v0.8 (Pilot Core v0.7.0 이후 차기 단일 마일스톤). 보고 시점에는 **PoC 단계**로 제시하고, 정식 구현은 보고 승인 후 착수

### 6.2 기술 스택
- 프론트엔드: React + Vite SPA (`apps/app-web`) 기존 유지
- 백엔드: svc-skill + svc-extraction 확장 (**신규 Worker 최소화**)
- 인프라: Cloudflare Workers + D1 + R2 + Queue + Neo4j Aura 기존 유지
- LLM: llm-client.ts HTTP REST (외부 svc-llm-router), 4-provider fallback 유지
- 기존 시스템 의존: svc-security /mask (PII 마스킹), svc-ontology (KG upsert)
<!-- CHANGED: Event-Driven 아키텍처(Queue 기반), Neo4j 스키마 변경 관리, 스키마 버저닝 등 기술적 제약/리스크 명기 -->
- Tacit Interview 데이터는 Queue 기반 비동기 처리(Cloudflare Queue)로 성능/내결함성 확보
- Neo4j 스키마 변경 시 Migration Script 자동화, spec 스키마는 명시적 버저닝 적용

### 6.3 인력/예산
- **투입 인원**: 1명 (PoC 단계)
- 예산 규모: OpenRouter + Anthropic 크레딧, 기존 multi-provider fallback 그대로 활용

### 6.4 컴플라이언스
- PII 5종(SSN/Phone/Email/Account/CorpID) 마스킹 후 D1 저장 — 기존 E-01 미들웨어 재사용
- **SME 인터뷰 동의서/금융 규제 5년 보관**: 본 프로젝트는 **내부 PoC**로 외부 SME 미접촉 → 적용 불요

---

## 7. 오픈 이슈

| # | 이슈 | 상태 | 결정 |
|---|------|:----:|------|
| 1 | 경영진 보고 일정 정확일 | ✅ 확정 | 2026-04-17 (금) 10:00 |
| 2 | 투입 가능 인원·기간 | ✅ 확정 | 1명, 18h 윈도우 (PoC 한정) |
| 3 | SME 인터뷰 동의서·5년 보관 규제 | ✅ 해결 | 내부 PoC, 외부 SME 미접촉 → 불요 |
| 4 | Spec 3종 Schema 역호환 방식 | ⏸ 보류 | **기존 Skill 사용자 없으면 포기** 기준. Plan 단계에서 외부 MCP 사용 여부 조사 후 결정 |
| 5 | "퇴직연금" 표기 오타 전수 점검 | ✅ 완료 | grep 전수 점검, 오타 없음 (2026-04-16) |
| 6 | KPI 측정 신뢰성(PoC 한정) | 🔄 PoC | 859개 LPON skill 대상 일괄 채점기로 객관성 담보 |
| 7 | 데이터 마이그레이션 | ⏸ 보류 | 역호환 결정에 종속 (이슈 #4) |
| 8 | 운영 모니터링 | ⏸ 보류 | PoC 범위 외, 정식 착수 시 |
| 9 | HITL Validation 프로세스 | ⏸ 보류 | PoC 범위 외 (SME 미접촉) |
| 10 | 보안/접근통제 | ⏸ 보류 | PoC 범위 외, 기존 Cloudflare Access 상속 |

---

## 7-B. PoC 범위 (2026-04-17 보고용)

전체 Must Have 3종은 정식 착수 후 구현. 이번 18h PoC에서는 **제일 시연 가능한 1건**에 집중.

### PoC 목표
**기존 LPON 온누리상품권 859개 skill 패키지를 AI-Ready 6기준으로 일괄 채점한 결과를 리포트로 제시** — "현재 Decode-X 산출물이 Foundry-X 입력으로 쓸 수 있는가?"라는 질문에 숫자로 답한다.

### PoC 산출물
1. **6기준 채점 스크립트** (`scripts/score-ai-ready.mjs`): R2에서 859개 skill 패키지 fetch → 6기준별 0~1 채점 → 통과율 집계
2. **결과 리포트** (`docs/poc/ai-ready-score-lpon.md`): 전체 통과율, 기준별 분포, top 10 미달 사례, 개선 제안
3. **Spec 3종 분류 매핑** (샘플 20건): 기존 skill의 policies[] / metadata / trust 필드를 B/T/Q 3종 섹션으로 매핑한 예시
4. **간이 대시보드** (선택, 시간 여유 시): app-web에 /poc/ai-ready 페이지 — 채점 결과 차트 1개

### PoC 제외
- Tacit Interview Agent 구현 (**프롬프트 설계만**)
- Handoff 패키지 ZIP 생성기 구현 (**포맷 명세만**)
- Neo4j/KG upsert, 역호환 마이그레이션
- HITL UI, 모니터링, Alert

### PoC 성공 기준
- 859건 전부 채점 완료
- 통과율(avg score ≥ 0.8) 수치 산출
- 시연 가능한 리포트 1건 + 코드 커밋

---

## 8. 검토 이력

| 라운드 | 날짜 | 주요 변경사항 | 스코어 |
|--------|------|--------------|--------|
| 초안 | 2026-04-16 | 인터뷰 5파트 기반 최초 작성 | - |
<!-- CHANGED: v2 변경사항 요약 추가 -->
| v2 | 2026-04-17 | AI 검토 의견 반영: KPI/Validation/마이그레이션/모니터링/보안/컴플라이언스/운영 등 구조 보완 | Conditional |

---

<!-- CHANGED: Gaps/누락, 품질 보증, 마이그레이션, Validation, 운영/보안 등 보완사항 섹션 신설 -->

## 9. 변경관리 및 마이그레이션 계획

- 기존 Skill Package (.skill.json)에서 3종 Spec(B/T/Q) 구조로의 데이터 이관 Migration Script 개발
- 마이그레이션 중 장애 발생 시 롤백 시나리오 수립, 운영 전환(점진적 롤아웃) 및 Smoke Test 2주간 실시
- 스키마 버저닝 정책 수립, Neo4j 및 Zod 타입 동시 버전 관리
- 신규 Spec 구조 미적용 도메인에 대해 수동 입력/변환 Fallback 경로 제공

---

## 10. 품질보증 및 Validation Plan

- Tacit Interview Agent 추출 Spec은 SME HITL Validation(검토–수정–승인) 필수
- 오분류/오추출 발생 시 리포트 자동 생성 및 개선 피드백 루프 적용
- AI-Ready 6기준 채점기 False Negative율 15% 이하, SME 이의제기 시 수동 평가 병행
- Validation 이력 및 SME 만족도(간단한 설문 등) 기록

---

## 11. 사용자 교육·온보딩 및 지원

- 신규 Agent/Schema 도입 시 SME 및 수행팀 대상 온보딩 세션, FAQ, 가이드 문서 제공
- Tacit Agent 및 Spec 입력 웹 폼에 실시간 가이드·에러헬프 등 사용자 지원 기능 내장
- 현장 지원 담당자 지정, 주요 FAQ/이슈는 운영 대시보드에 피드백 루프화

---

## 12. 성능 및 운영 Monitoring & Alert

- Tacit Interview, Spec 채점, Handoff 패키지 등 자동화 파이프라인별 성능(지연, 에러율) 실시간 모니터링
- 장애·성능 하락 시 Alert 및 자동 조치 플랜(재시도, Fallback 등) 수립
- 주요 KPI, 채점 결과, Spec 추출 성공률 등 시계열 데이터 DB/Analytics 연계

---

## 13. 보안 및 접근통제 정책

- PII 마스킹 후 저장·가공, 임시 데이터/인터뷰 로그는 최소 권한·만료 정책 적용
- 외부 연동(REST/DB) API 인증·권한 관리, 로그 접근감사 및 삭제 플로우 내장
- SME 인터뷰/Spec 검토 로그 등 민감정보 암호화 저장, 필요시 자동 삭제

---

## 14. 주요 리스크 및 대응전략

| # | 리스크 | 대응 전략 |
|---|--------|-----------|
| 1 | 인력/일정 산정 미확정 → 일정 지연 위험 | 오픈 이슈 #1, #2 해결 전 착수 제한, Pilot 후 점진 확대 |
| 2 | Tacit Agent SME 자동화 실패 → 목표 미달 위험 | SME HITL Validation, 수동 Spec 입력 Fallback 제공 |
| 3 | 금융/PII 규제 미준수 → 프로젝트 중단 우려 | 준법팀 사전 승인, 도메인 특화 PII 룰 추가 |
| 4 | 레거시 호환성/마이그레이션 실패 | Migration Script, 점진적 롤아웃, 롤백 플랜 |
| 5 | KPI 측정 신뢰성 부족 | 자동 채점기 검증/테스트 케이스 확보, SME HITL 루프 내장 |
| 6 | LLM/Anthropic API 의존도 높음 | 4-provider Fallback, Agent PoC 후 확장 결정 |
| 7 | Neo4j 스키마 변경 잦음 → 무결성 훼손 | 스키마 버저닝, Migration 자동화, Smoke Test |
| 8 | 5분 SLA 미달로 경영진 신뢰 하락 | 현행 성능 측정 후 개선, Queue 기반 아키텍처 |
| 9 | Zod 런타임 검증 성능 저하 | 대용량 Spec 파일 분할 검증·최적화 |
| 10 | 운영 장애/에러 감지 미흡 | 운영 모니터링·Alert 체계 구축 |
| 11 | SME HITL Validation Loop 미정의 | QA Owner 주관 Validation 프로세스 설계·운영 |
| 12 | 보안/접근통제 정책 미흡 | 보안 Owner 주관 정책 수립 및 점검 |

---

## 15. Out-of-scope

<!-- CHANGED: 검토 대상 범위 밖 요청 명확히 명시 -->
- 외부 고객사 대규모 상용 파일럿(이번 마일스톤 범위 아님)
- KG Relationship Registry 표준화(AIF-REQ-023 병합)
- Ontology MCP (‘27년 이후 검토)
- Foundry-X Orchestrator 직접 구현
- SME 인터뷰 자동화 기술의 비-AI 활용(완전 수동 방식 전환 등)

---

*이 문서는 /ax:req-interview 스킬에 의해 자동 생성 및 관리됩니다.*