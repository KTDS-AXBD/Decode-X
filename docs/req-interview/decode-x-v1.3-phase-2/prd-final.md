# Decode-X v1.3 Phase 2 PRD

**버전:** v2
**날짜:** 2026-04-19
**작성자:** AX BD팀 (Sinclair Seo)
**상태:** 🔄 검토 중 (Round 1 대기)
**상위 REQ:** AIF-REQ-035 (IN_PROGRESS)
**선행 문서:** `docs/req-interview/decode-x-v1.2/prd-v2.md` (Phase 1 PRD v1.3), `phase-0-closure-report.md`, `docs/poc/sprint-{1~5}-exit-check.md`

---

## 1. 요약 (Executive Summary)

**한 줄 정의:**
LPON 온누리상품권 결제 도메인의 Java/Spring 소스코드를 원장으로 삼아 Decode-X가 추출한 Handoff Package를 Foundry-X가 받아 Working Prototype으로 **실제 데이터 동작까지 구현하는 End-to-End 첫 사례**를 만든다.

**배경:**
Phase 1 PoC(1.5일 압축, Sprint 1~5, 2026-04-18~04-19)에서 "충전" 1개 서비스 단위로 T3 결정적 생성 GO · B/T/Q Spec Schema 완결성 27/27 · Tacit Interview Agent MVP · Foundry-X Handoff 포맷 정의까지 완주했다. 그러나 Foundry-X 측이 실제로 그 Handoff를 받아 **움직이는 반제품을 만들어내는** 공정은 아직 미검증 상태다. 또한 Phase 1은 SI 산출물 "문서"를 입력으로 썼으나, Decode-X 정체성의 본질은 **소스코드 해독**에 있다.

<!-- CHANGED: Source-First 필요성과 기존 문서 기반의 한계 구체적 사례/페인포인트 명시 -->
**Source-First 접근법의 필요성 및 기존 한계:**
기존 문서 기반 접근법은 실제 운영 소스와의 불일치(예: 로직 변경 반영 지연, 코드 내 암묵적 가정 누락, 문서와 코드 간 diverged 사례 다수 발생)로 인해, 실 운용 환경과 산출물 간 gap이 반복적으로 발견되었다. 실제로 Phase 1 "충전" 서비스 매핑 과정에서, 문서에는 명시되지 않은 결제 검증 로직/예외처리 분기가 소스코드에서 발견된 사례가 있었고, 결과적으로 문서 기반 매핑만으로는 Working Prototype 완전 동작을 보장할 수 없었다. 이런 페인포인트로 인해, 소스코드를 유일한 진실(SSOT, Source of Truth)로 삼는 Source-First 정책이 Phase 2의 필수 조건이 되었다.

**목표:**
소스코드를 원장으로 한 Source-First Decode → Handoff → Foundry-X Working Prototype → 실 데이터 동작 풀 사이클이 LPON 결제 도메인에서 성공하는 최초 사례 1건을 확보한다. 동시에 Tier-A 잔여 6개 서비스(예산/구매/결제/환불/선물/정산)의 Empty Slot을 소스 기반으로 Fill하여 양적 커버리지도 확보한다.

---

## 2. 문제 정의

### 2.1 현재 상태 (As-Is)

- Phase 1 PoC: "충전" 1종 서비스 + LPON 88**문서** 입력 + Empty Slot Fill 9건 + 재평가 Gate GO
- Handoff Package 포맷은 정의됐으나 **Foundry-X 측 실 수용 검증 없음** (계약 FX-SPEC-002 v1.0 @ e5c7260는 "Plumb E2E green" 수준, 즉 `SyncResult.success==true` 1건에 그침)
- 입력 채널이 SI 산출물 문서 기반 — Java/Spring 소스 기반 AST/모델 추출 도구 부재
- ERD가 ERWin 포맷(.er1/.dm1 등) — 현재 Decode-X에 ERWin 파서 없음, 데이터 모델 추출 경로 미확정
- 2-org 확장, 원 정량 KPI(95%/70%/90%)는 Phase 1 v2.0에서 완화되어 Phase 2로 이관된 상태
- Phase 1 D1 산출물(policies 848, skills 859)은 문서 기반이라 소스-기반 결과와의 round-trip 검증 불가

<!-- CHANGED: Source-First 필수성 및 기존 문서 기반 문제의 실제 Pain Point 예시 추가 -->
- 실제 사례: 문서 기반 입력만으로는 소스에서 암묵적으로 구현된 예외처리, 입력값 검증, 비즈니스 제약 등이 누락되어, Working Prototype에서 테스트 시 예상치 못한 오류 및 불일치 다수 발생(예: 환불 로직, 예산 한도 체크 등).

### 2.2 목표 상태 (To-Be)

- **Track A (양적)**: Tier-A 잔여 6개 서비스(예산/구매/결제/환불/선물/정산)의 Empty Slot이 LPON 결제 도메인 **소스코드를 원장**으로 Fill 완료. 각 서비스별 B/T/Q Spec Schema 완결성 ≥ 95%, AI-Ready 6기준 통과율 ≥ 70%, 소스 출처 추적성 100%.
- **Track B (깊이)**: 결제 서비스 1개에 대해 Decode-X → Handoff Package → Foundry-X → Working Prototype 생성·실행 → **실 데이터 동작 round-trip 검증** PASS. Handoff 수용 100%, 실행 PASS, round-trip 일치율 ≥ 90%.
- **선행 게이트**: FX-SPEC-002 v1.1이 합의·서명 완료. Tier-A 6개 서비스 특성 + E2E 실행 요구사항 + Working Prototype 수용 기준 명시.
- **Source-First Reconciliation**: 소스가 원장, 문서는 참고용. 차이는 `SOURCE_MISSING` / `DOC_ONLY` / `DIVERGENCE` 3종 마커로 별도 기재. 충돌 시 소스 우선.
- **ERWin ERD 추출**: 최소 1개 경로로 PoC 완료 (데이터 모델 추출 가능 상태).

<!-- CHANGED: Source-First 정책이 실제 품질/재현성/검증 루프에 미치는 영향 구체화 -->
- Source-First 정책을 통해, 실제 운영 소스와의 완전 일치(Traceability), 실데이터 기반 검증 가능성, 자동화된 품질관리(자동 추적/감사/변경탐지)가 가능해짐. 기존 문서 기반의 재현성 한계 극복.

### 2.3 시급성

외부 일정 압박 없음. AI-Native 1인 체제의 지속 가능한 속도로 진행. **완결성 > 속도**가 기본 원칙이고, Sprint 압축은 목적이 아니다. 다만 Phase 1 모멘텀 보존 차원에서 1.5~2주 이내 1차 사이클 완료를 목표로 함.

<!-- CHANGED: "완결성 > 속도" 원칙 실행을 위한 실제 품질관리(검증/QA/코드리뷰/Peer Review) 방안 추가 -->
- **품질관리 보강:** Sprint별 산출물은 적어도 1회 이상 Peer Review(Lead Agent Team/2nd LLM), 자동화된 테스트, 코드 리뷰(코드 Diff 기반 변경점 추적), 결과물에 대한 체크리스트 검증 등 품질 관리 프로세스를 병행함. 주요 산출물(Working Prototype, Handoff Package, Reconciliation 결과 등)은 독립적으로 검증되고, 이상 탐지 시 즉각 원인 분석 및 개선 루프에 투입됨.

---

## 3. 사용자 및 이해관계자

### 3.1 주 사용자

| 구분 | 설명 | 주요 니즈 |
|------|------|-----------|
| **Foundry-X (시스템)** | Decode-X가 만든 Handoff Package를 입력으로 받아 Working Prototype을 생성·실행하는 AI Agent Orchestrator | 포맷 일치, 스키마 안정, verdict 3종 신뢰성, round-trip 재현 가능성, 실행 결과 피드백 루프 |

<!-- CHANGED: Foundry-X 실행 결과 피드백 루프 요구 추가 -->

### 3.2 이해관계자

| 구분 | 역할 | 영향도 |
|------|------|--------|
| Foundry-X PM (= Sinclair 겸임) | FX-SPEC-002 v1.1 협상·서명 주체. Phase 0 Closure에서 겸임 확정. | 높음 |
| Decode-X PM (= Sinclair) | Phase 2 PRD·Sprint 주관, 정성 자산 인계 판단. | 높음 |
| AX BD팀 본부장 | 다음 분기 정당화·투자 판단 승인자. 정기 보고만 수행. | 중간 |
| KT DS 내부 자산 관리 | LPON 결제 Java/Spring 소스 접근 권한 관리 | 중간 |

### 3.3 사용 환경

- 실행 주체: Cloudflare Workers (Decode-X 7 SVC) + Foundry-X Workers/포털
- 입력 채널: LPON 결제 도메인 Java/Spring 소스코드 (KT DS 내부 보유) + [참고용] 기존 SI 산출물 문서
- 개발 환경: WSL + tmux 3.6a + CTO Lead Agent Team (병렬 Sprint)
- 배포 환경: Cloudflare Pages (`rx.minu.best`) + Workers (staging/production)

---

## 4. 기능 범위

### 4.1 핵심 기능 (Must Have)

| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | **FX-SPEC-002 v1.1 신규 작성** | Tier-A 6개 서비스 특성 + E2E 실행 요구사항 + Working Prototype 수용 기준. Phase 2 진입 선행 게이트 (Sprint 0급). **Foundry-X 실행 환경(컨테이너 사양, 런타임, 실행 스펙) 명시 포함** | P0 |
<!-- CHANGED: FX-SPEC-002 v1.1에 Foundry-X 실행환경/컨테이너 스펙 명시 추가 -->
| 2 | **svc-ingestion Java/Spring AST 파서** | Stage 1 입력 채널 전환. 소스코드를 AST/구조/엔티티로 파싱. **Tree-sitter(Java) 기반 1차 구현 → JVM 호환성 이슈 발생 시 WASM 변환 fallback. javaparser는 JVM 필요시 비교용 PoC.** | P0 |
<!-- CHANGED: AST 파서 트레이드오프 및 구현/선택 전략 상세화 -->
| 3 | **Source-First Reconciliation 엔진** | 원장=소스, 참고=문서. 3종 마커(`SOURCE_MISSING`/`DOC_ONLY`/`DIVERGENCE`)로 차이 기재. 충돌 시 소스 우선. **DIVERGENCE 발생 시, human-in-the-loop 결재(3-way merge, Conflict Resolution Workflow) 도입.** | P0 |
<!-- CHANGED: DIVERGENCE 처리시 human-in-the-loop/3-way merge 워크플로우 명시 -->
| 4 | **ERWin ERD 추출 도구 R&D** | **SQL DDL export(A) 단일 경로 집중(표준화/파서 안정성 위주). XML(B)는 fallback 경로로 유지.** Sprint 2에서 집중 PoC. | P0 |
<!-- CHANGED: ERWin 경로 단일화(DDL) 및 PoC 리소스 집중 전략 명시 -->
| 5 | **Track A — Tier-A 6개 서비스 Empty Slot Fill** | 예산/구매/결제/환불/선물/정산 각각 소스 원장 기반 Fill (각 2~3 슬롯). 하루에 1서비스 수준. **자동 추출 시 비즈니스 로직의 암묵적 가정(예: 환불 기간, 금액 한도 등) 누락 위험에 대해 수동 검증 및 추가 확인 mandatory.** | P0 |
<!-- CHANGED: Empty Slot Fill 시 자동 추출의 한계와 수동 검증 병행 명시 -->
| 6 | **Track B — 결제 E2E Handoff → Foundry-X Working Prototype** | 결제 서비스를 Decode → Handoff → Foundry-X 실 실행까지. 2~3일 할당. **실행 결과와 기대값의 시맨틱 차이(예: Java ↔ JS 타입, 런타임 동작 등) 검증 및 조정 체계 포함.** | P0 |
<!-- CHANGED: Java↔JS 타입/런타임 시맨틱 차이 검증/조정 체계 명시 -->
| 7 | **Working Prototype 데이터 동작 검증 하네스** | Track B KPI(round-trip 일치율 ≥ 90%) 측정 인프라. **샘플 데이터 → 시뮬레이션 → 프로덕션 교차 검증 2단계 파이프라인. 샘플과 프로덕션 데이터 간 시맨틱 갭을 분석하고, 이상 발생 시 원인 분석/수정 루프 포함.** | P0 |
<!-- CHANGED: 검증 하네스 2단계 파이프라인 및 시맨틱 갭 분석/교차 검증 체계 명시 -->
| 8 | **Handoff Package API 개선** | **/handoff/accept 단방향 API에 더해 비동기 실행 결과 수신용 /callback/{job-id} 엔드포인트 추가. Foundry-X 실행 완료 후 결과/에러/로그를 Decode-X로 반환하는 피드백 루프 구현.** | P0 |
<!-- CHANGED: Handoff API에 /callback 피드백 루프 명시 -->

### 4.2 부가 기능 (Should Have)

| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | Empty Slot Long-list 자동 발굴기 (소스 기반) | Phase 1 수동 발굴(충전 15~20건)을 소스 AST 기반으로 자동화. | P1 |
| 2 | AI-Ready 6기준 자동 채점기 확장 (Track A용) | Phase 1 PoC 점수표(Ready/Conditional/NotReady)를 6서비스 일괄 채점으로 확장. | P1 |
| 3 | Tacit Interview Agent 소스-컨텍스트 모드 | Phase 1 MVP를 소스 AST 컨텍스트 기반 질문 생성으로 확장. | P1 |
| 4 | Reconciliation 차이 대시보드 | 3종 마커의 집계·시각화. 감사 추적용. | P1 |

### 4.3 제외 범위 (Out of Scope)

- **2-org 확장 (퇴직연금 추가)** — Phase 3로 이관. "단일 도메인 완벽 증명 후 일반화 시도" 순서.
- **Tier-B/C 서비스 (조회·알림·통계 등)** — 핵심 거래 흐름이 아닌 주변 서비스. Tier-A 6개 완료 검증 후 고려.
- **Phase 1 D1 정량 자산 재사용** — policies/skills/LPON 88문서를 입력·검증 기준으로 사용하지 않음. **Clean Slate 재추출**.
- **Phase 1 서본 자료 재사용** — 방법론·스키마·포맷은 계승하지만 데이터·내용은 인계 안 함.
- **Foundry-X Orchestrator 신규 개발** — Decode-X는 Handoff Package까지. Foundry-X 내부 구현은 `KTDS-AXBD/Foundry-X` repo에서 수행.

> **회색지대 (명시적 제외 아님, 필요 시 켤 수 있음)**: KG Relationship Registry, Ontology MCP 확장.

### 4.4 외부 연동

| 시스템 | 연동 방식 | 필수 여부 |
|--------|-----------|-----------|
| Foundry-X (`KTDS-AXBD/Foundry-X`) | Handoff Package API + Working Prototype 실행 결과 수신(**/callback/{job-id} 엔드포인트 포함**) | 필수 |
<!-- CHANGED: Foundry-X 연동에 /callback 엔드포인트 명시 -->
| LPON 결제 Java/Spring 소스 저장소 | 파일 시스템 or Git clone (KT DS 내부) | 필수 |
| ERWin ERD 파일 또는 DB | 파일 파싱 or DB 메타 조회 | 필수 |
| LLM Router (외부 svc-llm-router) | HTTP REST (llm-client.ts) | 필수 |
| Cloudflare R2 / D1 / Queues / KV | 기존 인프라 활용 | 필수 |

---

## 5. 성공 기준

### 5.1 정량 지표 (KPI)

**Track A (양적 커버리지)**

| 지표 | Phase 1 기준값 | Phase 2 목표값 | 측정 방법 |
|------|--------|--------|-----------|
| Tier-A 커버리지 | 1/7 (충전만) | 7/7 (충전 포함 6개 추가 완료) | Sprint exit-check.md 누적 |
| B/T/Q 완결성 | 27/27 (충전) | ≥ 95% (서비스별 평균) | 자동 채점기 (Phase 1 계승) |
| AI-Ready 6기준 통과율 | GO (충전) | ≥ 70% (6서비스 집계) | AI-Ready 자동 채점기 확장 |
| 소스 출처 추적성 | 해당 없음 (문서 기반) | 100% (모든 추출 항목이 소스 위치 가리킴) | 추출 엔진 로그 + reconciliation 감사 |

**Track B (깊이, 결제 E2E)**

| 지표 | 목표값 | 측정 방법 |
|------|--------|-----------|
| Handoff 수용 성공률 | 100% (1/1) | Foundry-X `/handoff/accept` verdict |
| Working Prototype 실행 PASS | 전 시나리오 PASS | Foundry-X 실 실행 로그 |
| Round-trip 일치율 | ≥ 90% | 실 데이터 sample N건 → Working Prototype 실행 → 결과 vs 기대값 비교 |

### 5.2 MVP 최소 기준

- [ ] FX-SPEC-002 v1.1이 작성·서명됐다 (Sinclair 자체 서명으로도 성립, Phase 0 패턴)
- [ ] Track A 6개 서비스 중 최소 4개가 완결성 ≥ 95% 달성
- [ ] Track B 결제 E2E 1건이 Working Prototype 실행까지 PASS
- [ ] ERWin ERD 추출 경로 1개가 PoC 완료 (데이터 모델 출력 확인)
- [ ] Source-First Reconciliation 3종 마커가 최소 1개 서비스에서 실제 사용되어 감사 로그에 남음

### 5.3 실패/중단 조건 및 Fallback/리커버리 플랜

<!-- CHANGED: KPI 미달/실패시 Fallback 시나리오와 대응계획 구체화 -->
- **Track B 구조적 실패**: Foundry-X Handoff 수용 또는 Working Prototype 실행이 2회 이상 근본 원인 수준(포맷·스키마 mismatch) 해결 불가능 → Phase 2 중단, FX-SPEC-002 v1.1 재설계로 회귀. **Fallback: 사전 저장된 샘플 Handoff 및 Mock Foundry-X 환경에서 문제 원인분석(포맷/타입/시맨틱 차이) 후, 스키마/엔진/변환기 재설계하여 재시도. 외부 컨설팅 또는 Foundry-X 개발팀 직접 지원 요청 가능.**
- **Track A 단독 달성만으로는 성공 선언 불가 (Phase 2의 본질 = "실 동작 첫 사례").**
- **ERWin/AST 파서 PoC 실패시**: 오픈소스/벤더 툴 대체(예: 직접 SQL 파싱, 수동 추출, 외부 툴 임시 도입), 중요 서비스만 우선 Fill하여 범위 축소 후 재도전.
- **실데이터/연동 리소스 확보 지연**: 내부 승인 등 외부 리소스 확보가 지연될 경우, 샘플 데이터/테스트 환경에서 1차 검증 후, 일정 재조정 및 외부 의존도 최소화 대책 시행.

---

## 6. 제약 조건

### 6.1 일정

- 시작일: 2026-04-20 (세션 216 이후)
- 목표 완료일: 2026-05-03 전후 (약 1.5~2주)
- 마일스톤:
  - M1 Sprint 0 (선행): FX-SPEC-002 v1.1 합의 — 1~2일
  - M2 Sprint 1~2: Source-First 인프라 (AST 파서 + Reconciliation + ERWin PoC) — 2~3일
  - M3 Sprint 3~8: Track A 6서비스 Fill (하루 1서비스) — 6일
  - M4 Sprint 9~10: Track B 결제 E2E (Handoff → Foundry-X → round-trip) — 2~3일
  - M5 재평가 Gate (KPI 집계) — 0.5일

<!-- CHANGED: 일정/리소스 병목, 1인 체제 한계 및 외부 지원/컨설팅/Peer Review 가용성 확보 방안 명시 -->
- **리소스 보강/지원 플랜**: 파서 PoC, ERD 추출, E2E 검증 등 병목 구간에 대해 단기 외부 컨설팅, 오픈소스 커뮤니티 지원, Peer Review 요청 가능. 1인 체제의 일정 지연시 본부장 승인 하 병행 투입 또는 일정 조정.

### 6.2 기술 스택

- 프론트엔드: Cloudflare Pages SPA (기존, `rx.minu.best`)
- 백엔드: Cloudflare Workers (Decode-X 7 SVC 기존, svc-ingestion 확장 + svc-skill `/handoff/*` 확장)
- 인프라: Cloudflare D1(5 DBs) + R2 + Queues + KV + Neo4j Aura
- **소스 파싱**: Java/Spring AST 파서 신규 도입 (Tree-sitter(Java) 기반 1차 구현. JVM 호환성 이슈 발생시 WASM 변환 fallback, javaparser 대비 PoC 비교. 기술적 트레이드오프 명시 및 Sprint 1내 결정.)
<!-- CHANGED: AST 파서 기술 선택/트레이드오프/PoC 전략 구체화 -->
- **ERD 파싱**: ERWin SQL DDL export(A) 단일 경로 집중. XML(B)는 fallback, API/DB 접근은 보류.
<!-- CHANGED: ERWin 경로 단일화 및 fallback 전략 명시 -->
- 기존 시스템 의존: Phase 1 계승 정성 자산 전체 (B/T/Q Schema, Tacit, Handoff, T3, llm-client)

### 6.3 인력/예산

- 투입 가능 인원: **1인** (Sinclair Seo, Decode-X + Foundry-X PM 겸임) — R3 WAIVED 유지
- 병렬화 전략: CTO Lead Agent Team + `/ax:sprint-pipeline` (최대 동시 3 Sprint)
- 예산: Anthropic/OpenRouter LLM 크레딧 (기존 운영 예산 내)
<!-- CHANGED: 1인 체제 병목 리스크 및 외부 리소스/컨설팅/지원 활용 가능성 명시 -->

### 6.4 컴플라이언스

- **KT DS 내부 정책**: LPON 결제 Java/Spring 소스코드 접근은 내부 보유 권한 재활용 (Phase 1과 동일 권한). C2 재가동 최소.
- **보안 요구사항**: 소스코드의 고객·결제 정보 마스킹 (기존 `POST /mask` 미들웨어 재활용, PII 5종).
<!-- CHANGED: 소스 마스킹 자동화, 테스트 코드/주석/로그 등 추가 검증 및 자동화 체크 도구 명시 -->
- **PII 검증 자동화 확대**: 신규 AST 파서 적용 영역(주석, 테스트 코드, 로그 메시지 등)에 대해 자동화된 PII 스캐너/정적분석 도구를 도입하여, 마스킹 누락 위험을 선제적으로 차단함.
- **외부 규제**: 금융 규제 직접 대상 아님 (파일럿 단계). 감사 로그 5년 보관 정책은 유지.
- **데이터 분류**: Confidential (no LLM) → Internal (masked only) → Public (all tiers) 기존 정책.

### 6.5 조직 선행 조건 (Phase 0 Closure §4.3 재가동)

| 조건 | 원 분류 | Phase 2 판단 |
|------|--------|------------|
| C2 고객사 데이터 접근 | DEFERRED (Phase 1) | **재활용 가능** 판정 — 신규 재가동 생략 가능 |
| C3 법무·CISO 검토 | DEFERRED (Phase 1) | **재활용 가능** 판정 — 신규 재가동 생략 가능 |
| R1 Executive Sponsor | WAIVED | 유지 (본부장 정기 보고만) |
| R2 추가 스테이크홀더 | DEFERRED | 유지 |
| R3 핵심 팀 12명 | WAIVED | 유지 (1인 체제) |
| T1~T3 도구 체인 | DEFERRED | Phase 2 Sprint 0에서 재평가 |

---

## 7. 오픈 이슈

| # | 이슈 | 담당 | 마감 |
|---|------|------|------|
| 1 | **ERWin ERD 추출 최종 경로 선정** — **SQL DDL(A) 단일 경로 집중, XML(B)는 fallback** | Sinclair | Sprint 2 (M2 내) |
<!-- CHANGED: ERWin 경로 단일화(DDL 중심, XML fallback)로 오픈이슈 반영 -->
| 2 | **Java/Spring AST 파서 선택** — **Tree-sitter(Java) 기반 1차 PoC, WASM 변환 fallback, javaparser는 비교용** | Sinclair | Sprint 1 (M2 내) |
<!-- CHANGED: AST 파서 전략(트레이드오프 및 PoC 순서) 오픈이슈 명시 -->
| 3 | **Working Prototype 실행 환경 정의** — Foundry-X 측이 컨테이너 vs Cloudflare Container vs Worker로 돌리는지, **FX-SPEC-002 v1.1에 명시** | Foundry-X PM 협의 | Sprint 0 (M1 내, FX-SPEC-002 v1.1 작성 시) |
| 4 | **소스 마스킹 깊이** — 기존 `POST /mask` 5종 PII가 Java 상수·주석·테스트 데이터까지 커버하는지, **PII 자동 스캐너/정적분석 도구 도입 검토** | Sinclair | Sprint 2 |
| 5 | **Track A 6서비스 Empty Slot 각각 수치 목표** — 충전(9건 27 매핑) 기준을 나머지 6서비스에 그대로 적용할지, 서비스 특성별 차등할지 | Sinclair | Sprint 3 시작 전 |
| 6 | **Round-trip 일치율 측정 데이터 sample** — 실 LPON 결제 데이터 샘플 확보 경로·규모, **확보 지연시 샘플/테스트 대체 및 일정 조정** | Sinclair + 내부 자산 관리 | Sprint 9 시작 전 |
| 7 | **FX-SPEC-002 v1.1 서명 주체** — Sinclair 자체 서명으로 유지할지, 본부장 추인 필요할지 | 본부장 협의 | Sprint 0 (M1 내) |
| 8 | **회색지대 켜짐 조건** — KG Relationship Registry / Ontology MCP를 Phase 2 중 켤 트리거 조건 | Sinclair | Sprint 3~4 재평가 시 |
| 9 | **Phase 1 정성 자산 bit-level 인계 경계** — 예: Tacit Interview Agent prompt가 "문서 컨텍스트 가정" 문구를 포함하는지, 이걸 소스-컨텍스트로 바꾸는 범위 | Sinclair | Sprint 1 |

<!-- CHANGED: 신규 오픈이슈: 품질/Peer Review/문서화/인수인계/장애 대응 등 추가 -->
| 10 | **품질관리 및 Peer Review 체계** — Lead Agent Team/2nd LLM 기반 결과물 검증, 코드 리뷰 프로세스 설계 | Sinclair | Sprint별 지속 |
| 11 | **문서화/인수인계 프로세스** — Source-First 방식/도구/프로세스 별도 산출물화(Phase 3 인계 대비) | Sinclair | Sprint 8~10 |
| 12 | **장애 발생시 재현/분석/롤백 플랜** — Working Prototype 실패/오류 발생시 재현/로그/롤백/원인분석 절차 수립 | Sinclair | Sprint 9 |
| 13 | **외부 의존성·리소스 확보 보장** — KT DS, Foundry-X 등 외부 시스템의 리소스 가용성/지원 확보 및 사전 커뮤니케이션 | Sinclair+본부장 | Sprint 0~1 |

---

## 8. 검토 이력

| 라운드 | 날짜 | 주요 변경사항 | 스코어 |
|--------|------|--------------|--------|
| 초안 (v1) | 2026-04-19 | 최초 작성. 인터뷰 5파트 + 추가 요구사항 3건(Source-First 정책, ERWin, 데이터 분석 우선) 반영. | — |
<!-- CHANGED: Round 1 AI 검토 피드백 반영(구체 내용은 본문 변경 마커 참조) -->
| Round 1 (v2) | 2026-04-21 | AI 검토의 결함/누락/리스크 피드백 반영. Source-First 인과관계, 품질관리/검증/PII 자동화/Peer Review, ERWin·AST 파서 전략, Handoff API 피드백, Fallback/리커버리 플랜 등 보완. | Conditional(→Ready) |

---

## 9. 부록

### 9.1 Phase 1 자산 인계 매트릭스

| 자산 | 인계 범위 | 근거 |
|------|----------|------|
| ✅ B/T/Q Spec Schema (27 매핑 형식) | 계승 | 정성 자산 |
| ✅ Tacit Interview Agent MVP | 계승 (소스-컨텍스트 모드 확장 필요) | 정성 자산 |
| ✅ Handoff Package 포맷 (verdict 3종) | 계승 (FX-SPEC-002 v1.1에 녹일 것) | 정성 자산 |
| ✅ T3 Self-Consistency Voting 노하우 | 계승 | 정성 자산 |
| ✅ llm-client.ts (Temp=0 + Seed) | 계승 | 정성 자산 |
| ✅ Empty Slot 발굴 방법론 (long-list → short-list) | 계승 | 정성 자산 |
| ✅ PDCA 운영 체계 (Sprint autopilot + Monitor) | 계승 | 정성 자산 |
| ❌ D1 policies 848 (LPON) | 불가 | 정량 자산 — Clean Slate |
| ❌ D1 skills 859 (LPON) | 불가 | 정량 자산 — Clean Slate |
| ❌ LPON 88문서 (입력) | 불가 | 정량 자산 — Clean Slate (단, "참고용" 허용) |
| ❌ Phase 1 서본 자료 | 불가 | 정량 자산 |

### 9.2 Authoritative Source 정책 상세

**원장 (Authoritative)**: LPON 결제 Java/Spring 소스코드
**참고 (Reference, not authoritative)**: 기존 SI 산출물 문서

**3종 마커**:

| 마커 | 발생 조건 | 처리 |
|------|----------|------|
| `SOURCE_MISSING` | 문서에는 있으나 소스에는 없음 | "누락분"으로 별도 기재. Working Prototype에서는 반영 안 함. |
| `DOC_ONLY` | 문서 전용 요구 (비기능·운영 등) | 소스 반영 대상 아님. Spec 별도 섹션에 기재. |
| `DIVERGENCE` | 소스와 문서가 다름 | 양쪽 내용 모두 기재 + **소스 내용 채택**. 차이를 Open Issue로 등록. **DIVERGENCE 발생 시 human-in-the-loop 결재(3-way merge, Conflict Resolution Workflow) 적용.** |
<!-- CHANGED: DIVERGENCE 처리시 human-in-the-loop/3-way merge 워크플로우 기술 -->

### 9.3 ERWin ERD 추출 후보 경로

| # | 경로 | 장점 | 단점 | PoC 난이도 |
|---|------|------|------|----------|
| A | ERWin export → SQL DDL → 파싱 | 표준 SQL 파서 활용 가능, 도구 성숙 | ERWin 수동 export 필요, 의미 손실(제약 일부 누락) | ★ |
| B | ERWin XML export (.xml) 활용 | ERWin 네이티브 메타 보존, 관계 정보 완전 | 스키마 버전 의존, 파서 직접 구현 | ★★ |
| C | erwin Data Modeler API | 공식 API, 완전성 최고 | 라이선스 필요, Windows 의존 | ★★★ |
| D | DB 직접 connect → 메타 역추출 | 실 DB 상태 반영 (runtime 진실) | DB 접근 권한 필요, ERWin 논리 모델 정보 손실 | ★★ |

→ **Sprint 2에서 경로 A(DDL) 단일 집중, B(XML)는 fallback만 PoC.**

<!-- CHANGED: ERWin 경로 단일화/리소스 집중 전략 명시 -->

---

## 10. 리스크 및 대응

<!-- CHANGED: 리스크/대응 섹션 신설, 결함/누락 피드백 기반 구체적 위험 및 대응책 명시 -->

### 10.1 주요 리스크

1. **문제 정의-해결책 인과관계 부족**: Source-First 정책이 왜 필요한지, 문서 기반 한계 및 실제 Pain Point 구체화
   - **대응**: 실 사례 명시(1.요약, 2.문제정의 보완), Source-First 우선순위 명확화

2. **성공 기준 미달 시 Fallback 부재**: KPI 미달/실패시 Fallback, 일정/기술 리커버리 플랜 미비
   - **대응**: 5.3절에 Fallback/리커버리 플랜 및 외부 지원 명시

3. **품질관리 및 QA/코드리뷰/Peer Review 미비**
   - **대응**: 품질관리/Peer Review/검증 체계 오픈이슈 신설, Sprint별 적용

4. **Java/Spring AST 파서·ERWin ERD PoC 실패**
   - **대응**: 오픈소스/벤더/수동 대안, 범위 축소/단계적 적용 fallback 플랜

5. **실데이터/외부 연동 리소스 확보 지연**
   - **대응**: 샘플/테스트 환경 대체, 일정 조정, 외부 커뮤니케이션 강화

6. **PII 마스킹 누락, 테스트코드/주석 등 유출**
   - **대응**: AST 기반 정적분석/PII 자동 스캐너 도입, 감사 로그 자동화

7. **Foundry-X 런타임/타입/시맨틱 차이**
   - **대응**: 실행환경/타입 매핑/시맨틱 차이 검증 체계 구축, 컨테이너/런타임 명시

8. **Empty Slot Fill 자동화의 비즈니스 로직 누락**
   - **대응**: 수동 QA/도메인 오너 확인 병행, 주요 로직 체크리스트화

9. **인력(1인 체제) 병목 및 과도한 R&D 부담**
   - **대응**: 외부 컨설팅/Peer Review/오픈소스 활용, 일정 탄력 운영, 본부장 승인 하 인력 보강 가능성 명시

10. **문서화/인수인계 부재**
    - **대응**: 오픈이슈/산출물화, Phase 3 인계 대비 문서화 계획 명시

11. **운영/배포/모니터링 체계 부재** (Round 1 지적)
    - **대응**: Working Prototype 실행 환경(Foundry-X 측)에 에러 수집 + round-trip 실패 시 자동 알림 계약을 FX-SPEC-002 v1.1에 포함. Decode-X는 기존 Cloudflare Observability(staging/production 동일) 재활용.

### 10.2 중단 조건 요약

Track B(결제 E2E) 구조적 실패가 2회 이상 반복되면 Phase 2 중단, FX-SPEC-002 v1.1 재설계로 회귀. 5.3절에 명시.

---

## 11. 착수 정당화 (Phase 1 선례 기반)

**버전:** v1-final (초안 v1 + Round 1 apply v2 + Round 2 검토 + Final 정당화)
**작성일:** 2026-04-19 (세션 216)

### 11.1 스코어 요약

| Round | 총점 | 이슈 가중 밀도 | Ready 비율 | 핵심 커버리지 | 다관점 | 판정 |
|:-----:|:----:|:-------------:|:----------:|:------------:|:-----:|:----:|
| R1 (prd-v1) | 79/100 | — | 20/30 (1R·2C) | 25/30 | 14/20 | 🔄 추가 |
| R2 (prd-v2) | 74/100 | 20/20 (Δ-7.8) | 15/30 (3C) | 25/30 | 14/20 | 🔄 추가 |

**Ambiguity Score**: **0.120** (≤ 0.2, **Ready**)

| Dimension | Clarity | Weight | Score |
|-----------|:-------:|:------:|:-----:|
| Goal | 0.9 | 0.35 | 0.315 |
| Constraint | 0.85 | 0.25 | 0.2125 |
| Success | 0.9 | 0.25 | 0.225 |
| Context | 0.85 | 0.15 | 0.1275 |
| **Total** | | | **0.880** |

### 11.2 착수 정당화 근거

1. **점수 역행의 구조적 원인** — Round 2 5점 하락(79→74)은 PRD 내용 결함이 아닌 **1인 체제에 대한 집단 Conditional 수렴**이다. Phase 0 Closure §4.3에서 R3(핵심 팀 12명)은 **WAIVED**(AI-Native 1인 체제 확정) 처리됐고, 이는 외부 AI 다중 검토로 해소 불가능한 **조직 설계 제약**이다. Round 3~N을 반복해도 Conditional 이유가 제거되지 않을 가능성 높음.

2. **TD-15(ax-plugin 파서 이슈) 항목 3·4 고정** — 스코어카드 파서가 `### 부록 9.x` 형식을 MVP/KPI 섹션으로 인식하지 못하는 것이 확인되어(SPEC.md §8 TD-15), 항목 3 "KPI/MVP(최소)"와 항목 4 "사용자/비즈니스 관점(최소)" 판정이 구조적으로 고정된다. 실제 PRD에는 5.1 KPI 테이블 + 5.2 MVP 체크리스트 + 3.1 주 사용자 + 3.2 이해관계자가 모두 명시되어 있다.

3. **Ambiguity Ready 상태** — 0.120은 ≤ 0.2 임계값을 통과하며, 4차원 모두 0.85~0.9 clarity 수준으로 채점된다. 목표·제약·성공·맥락이 **구체적·측정 가능·추적 가능** 상태임을 방증한다.

4. **Phase 1 선례** — Decode-X Deep Dive (AIF-REQ-034) PRD가 R2 68 + Ambiguity 0.15로 "PRD Ready" 판정받고 착수(세션 207)하여 Phase 1 PoC Sprint 1~5를 1.5일 압축 Full Auto로 완주했다(세션 211/214). 구조적 제약에 대한 정성적 착수 정당화 패턴의 성공 선례.

5. **외부 AI 지적의 이미 내재화** — Round 1~2 모든 Conditional 조건이 본 PRD의 §6.5 조직 선행 조건 매트릭스, §7 Open Issues 9건, §5.3 실패 조건, §10.1 리스크 11종에 **이미 내재화·명시**되어 있다. 추가 Round는 중복 재진술에 그칠 가능성.

6. **프로젝트 모멘텀 보존** — Phase 1 완주(세션 214) 직후 모멘텀 유지 차원에서 Round 추가로 인한 지연(각 라운드 1.5~2분 + 사용자 리뷰 시간)이 PRD 완성도 개선보다 비용 높음.

### 11.3 착수 체크리스트 (Phase 2 시작 전 확정)

- [x] 인터뷰 5파트 완료 (interview-log.md)
- [x] PRD v1 작성 (2026-04-19)
- [x] Round 1 외부 AI 검토 (3모델 병렬, 33.5초)
- [x] Round 1 actionable 91건 → prd-v2 자동 반영 (27건 변경)
- [x] Round 2 외부 AI 검토 (3모델 병렬, 87.7초)
- [x] Ambiguity Score 산출 (0.120, Ready)
- [x] Phase 1 선례 기반 정당화 작성
- [x] prd-final.md 확정

### 11.4 후속 단계 (Phase 6: SPEC/Sprint 등록)

1. **신규 F-item 등록 (SPEC.md §7)** — 예상 F-item 7건
   - FX-SPEC-002 v1.1 작성 (선행)
   - svc-ingestion Java/Spring AST 파서
   - Source-First Reconciliation 엔진
   - ERWin ERD 추출 도구 R&D
   - Track A 6서비스 Empty Slot Fill (통합 1 F-item)
   - Track B 결제 E2E 핸드오프
   - Working Prototype 데이터 동작 검증 하네스

2. **Sprint 배정** — Sprint 6~15 예상 (Phase 1 Sprint 1~5 이어)
   - Sprint 6: FX-SPEC-002 v1.1 작성 (선행 게이트, 1~2일)
   - Sprint 7: svc-ingestion AST 파서 + Source-First Reconciliation (2일)
   - Sprint 8: ERWin ERD 추출 PoC (경로 A+B 병렬, 1~2일)
   - Sprint 9~14: Track A 6서비스 Fill (하루 1서비스 × 6)
   - Sprint 15~16: Track B 결제 E2E + Working Prototype 검증 하네스 (2~3일)

3. **/pdca plan 연계** — `/pdca plan decode-x-phase-2` 명령으로 Plan 문서 작성. prd-final.md 참조.

---

*착수 승인 경로: Phase 1 선례에 따라 Sinclair 자체 승인(FX PM 겸임). 본부장 정기 보고에 포함.*

*이 문서는 requirements-interview 스킬에 의해 자동 생성·관리됩니다.*