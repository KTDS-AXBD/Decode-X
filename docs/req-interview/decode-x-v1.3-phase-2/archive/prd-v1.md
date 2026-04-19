# Decode-X v1.3 Phase 2 PRD

**버전:** v1
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

### 2.2 목표 상태 (To-Be)

- **Track A (양적)**: Tier-A 잔여 6개 서비스(예산/구매/결제/환불/선물/정산)의 Empty Slot이 LPON 결제 도메인 **소스코드를 원장**으로 Fill 완료. 각 서비스별 B/T/Q Spec Schema 완결성 ≥ 95%, AI-Ready 6기준 통과율 ≥ 70%, 소스 출처 추적성 100%.
- **Track B (깊이)**: 결제 서비스 1개에 대해 Decode-X → Handoff Package → Foundry-X → Working Prototype 생성·실행 → **실 데이터 동작 round-trip 검증** PASS. Handoff 수용 100%, 실행 PASS, round-trip 일치율 ≥ 90%.
- **선행 게이트**: FX-SPEC-002 v1.1이 합의·서명 완료. Tier-A 6개 서비스 특성 + E2E 실행 요구사항 + Working Prototype 수용 기준 명시.
- **Source-First Reconciliation**: 소스가 원장, 문서는 참고용. 차이는 `SOURCE_MISSING` / `DOC_ONLY` / `DIVERGENCE` 3종 마커로 별도 기재. 충돌 시 소스 우선.
- **ERWin ERD 추출**: 최소 1개 경로로 PoC 완료 (데이터 모델 추출 가능 상태).

### 2.3 시급성

외부 일정 압박 없음. AI-Native 1인 체제의 지속 가능한 속도로 진행. **완결성 > 속도**가 기본 원칙이고, Sprint 압축은 목적이 아니다. 다만 Phase 1 모멘텀 보존 차원에서 1.5~2주 이내 1차 사이클 완료를 목표로 함.

---

## 3. 사용자 및 이해관계자

### 3.1 주 사용자

| 구분 | 설명 | 주요 니즈 |
|------|------|-----------|
| **Foundry-X (시스템)** | Decode-X가 만든 Handoff Package를 입력으로 받아 Working Prototype을 생성·실행하는 AI Agent Orchestrator | 포맷 일치, 스키마 안정, verdict 3종 신뢰성, round-trip 재현 가능성 |

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
| 1 | **FX-SPEC-002 v1.1 신규 작성** | Tier-A 6개 서비스 특성 + E2E 실행 요구사항 + Working Prototype 수용 기준. Phase 2 진입 선행 게이트 (Sprint 0급). | P0 |
| 2 | **svc-ingestion Java/Spring AST 파서** | Stage 1 입력 채널 전환. 소스코드를 AST/구조/엔티티로 파싱. | P0 |
| 3 | **Source-First Reconciliation 엔진** | 원장=소스, 참고=문서. 3종 마커(`SOURCE_MISSING`/`DOC_ONLY`/`DIVERGENCE`)로 차이 기재. 충돌 시 소스 우선. | P0 |
| 4 | **ERWin ERD 추출 도구 R&D** | 최소 1개 경로 PoC. 후보: (a) ERWin export → SQL DDL 파싱, (b) ERWin XML export 활용, (c) erwin Data Modeler API, (d) DB 직접 connect 메타 역추출. | P0 |
| 5 | **Track A — Tier-A 6개 서비스 Empty Slot Fill** | 예산/구매/결제/환불/선물/정산 각각 소스 원장 기반 Fill (각 2~3 슬롯). 하루에 1서비스 수준. | P0 |
| 6 | **Track B — 결제 E2E Handoff → Foundry-X Working Prototype** | 결제 서비스를 Decode → Handoff → Foundry-X 실 실행까지. 2~3일 할당. | P0 |
| 7 | **Working Prototype 데이터 동작 검증 하네스** | Track B KPI(round-trip 일치율 ≥ 90%) 측정 인프라. 실 데이터 sample 로드 → Working Prototype 실행 → 결과 일치 검증. | P0 |

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
| Foundry-X (`KTDS-AXBD/Foundry-X`) | Handoff Package API + Working Prototype 실행 결과 수신 | 필수 |
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

### 5.3 실패/중단 조건

- **Track B 구조적 실패**: Foundry-X Handoff 수용 또는 Working Prototype 실행이 2회 이상 근본 원인 수준(포맷·스키마 mismatch) 해결 불가능 → Phase 2 중단, FX-SPEC-002 v1.1 재설계로 회귀.
- Track A 단독 달성만으로는 성공 선언 불가 (Phase 2의 본질 = "실 동작 첫 사례").

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

### 6.2 기술 스택

- 프론트엔드: Cloudflare Pages SPA (기존, `rx.minu.best`)
- 백엔드: Cloudflare Workers (Decode-X 7 SVC 기존, svc-ingestion 확장 + svc-skill `/handoff/*` 확장)
- 인프라: Cloudflare D1(5 DBs) + R2 + Queues + KV + Neo4j Aura
- **소스 파싱**: Java/Spring AST 파서 신규 도입 (후보: `javaparser`(JVM), Tree-sitter Java, TypeScript 포트, 또는 직접 구현)
- **ERD 파싱**: ERWin 전용 도구 R&D (후보 4종)
- 기존 시스템 의존: Phase 1 계승 정성 자산 전체 (B/T/Q Schema, Tacit, Handoff, T3, llm-client)

### 6.3 인력/예산

- 투입 가능 인원: **1인** (Sinclair Seo, Decode-X + Foundry-X PM 겸임) — R3 WAIVED 유지
- 병렬화 전략: CTO Lead Agent Team + `/ax:sprint-pipeline` (최대 동시 3 Sprint)
- 예산: Anthropic/OpenRouter LLM 크레딧 (기존 운영 예산 내)

### 6.4 컴플라이언스

- **KT DS 내부 정책**: LPON 결제 Java/Spring 소스코드 접근은 내부 보유 권한 재활용 (Phase 1과 동일 권한). C2 재가동 최소.
- **보안 요구사항**: 소스코드의 고객·결제 정보 마스킹 (기존 `POST /mask` 미들웨어 재활용, PII 5종).
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
| 1 | **ERWin ERD 추출 최종 경로 선정** — 4개 후보(SQL DDL / XML export / API / DB 역추출) 중 실현 가능성 평가 | Sinclair | Sprint 2 (M2 내) |
| 2 | **Java/Spring AST 파서 선택** — javaparser(JVM 의존) vs Tree-sitter Java vs TypeScript 직접 구현 | Sinclair | Sprint 1 (M2 내) |
| 3 | **Working Prototype 실행 환경 정의** — Foundry-X 측이 컨테이너 vs Cloudflare Container vs Worker로 돌리는지 | Foundry-X PM 협의 | Sprint 0 (M1 내, FX-SPEC-002 v1.1 작성 시) |
| 4 | **소스 마스킹 깊이** — 기존 `POST /mask` 5종 PII가 Java 상수·주석·테스트 데이터까지 커버하는지 | Sinclair | Sprint 2 |
| 5 | **Track A 6서비스 Empty Slot 각각 수치 목표** — 충전(9건 27 매핑) 기준을 나머지 6서비스에 그대로 적용할지, 서비스 특성별 차등할지 | Sinclair | Sprint 3 시작 전 |
| 6 | **Round-trip 일치율 측정 데이터 sample** — 실 LPON 결제 데이터 샘플 확보 경로·규모 | Sinclair + 내부 자산 관리 | Sprint 9 시작 전 |
| 7 | **FX-SPEC-002 v1.1 서명 주체** — Sinclair 자체 서명으로 유지할지, 본부장 추인 필요할지 | 본부장 협의 | Sprint 0 (M1 내) |
| 8 | **회색지대 켜짐 조건** — KG Relationship Registry / Ontology MCP를 Phase 2 중 켤 트리거 조건 | Sinclair | Sprint 3~4 재평가 시 |
| 9 | **Phase 1 정성 자산 bit-level 인계 경계** — 예: Tacit Interview Agent prompt가 "문서 컨텍스트 가정" 문구를 포함하는지, 이걸 소스-컨텍스트로 바꾸는 범위 | Sinclair | Sprint 1 |

---

## 8. 검토 이력

| 라운드 | 날짜 | 주요 변경사항 | 스코어 |
|--------|------|--------------|--------|
| 초안 (v1) | 2026-04-19 | 최초 작성. 인터뷰 5파트 + 추가 요구사항 3건(Source-First 정책, ERWin, 데이터 분석 우선) 반영. | — |

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
| `DIVERGENCE` | 소스와 문서가 다름 | 양쪽 내용 모두 기재 + **소스 내용 채택**. 차이를 Open Issue로 등록. |

### 9.3 ERWin ERD 추출 후보 경로

| # | 경로 | 장점 | 단점 | PoC 난이도 |
|---|------|------|------|----------|
| A | ERWin export → SQL DDL → 파싱 | 표준 SQL 파서 활용 가능, 도구 성숙 | ERWin 수동 export 필요, 의미 손실(제약 일부 누락) | ★ |
| B | ERWin XML export (.xml) 활용 | ERWin 네이티브 메타 보존, 관계 정보 완전 | 스키마 버전 의존, 파서 직접 구현 | ★★ |
| C | erwin Data Modeler API | 공식 API, 완전성 최고 | 라이선스 필요, Windows 의존 | ★★★ |
| D | DB 직접 connect → 메타 역추출 | 실 DB 상태 반영 (runtime 진실) | DB 접근 권한 필요, ERWin 논리 모델 정보 손실 | ★★ |

→ **Sprint 2에서 경로 A + B 병렬 PoC**, Sprint 3 시작 전 최종 선정.

---

*이 문서는 requirements-interview 스킬에 의해 자동 생성 및 관리됩니다. 다음 단계: Round 1 외부 AI 검토 → Phase 3 자동 반영 → Phase 4 충분도 평가 (≥ 80점 + Ambiguity ≤ 0.2).*
