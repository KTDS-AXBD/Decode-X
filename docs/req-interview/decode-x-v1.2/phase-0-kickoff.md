---
code: AIF-REQI-phase-0-kickoff
title: "Decode-X Phase 0 Kick-off 설계서"
version: 1.0
status: active
category: req-interview
created: 2026-04-18
updated: 2026-04-18
author: Sinclair Seo
---

# Decode-X Phase 0 Kick-off 설계서

**문서 유형**: 메타 문서 (Phase 0 착수 승인 근거)
**기반 PRD**: `docs/req-interview/decode-x-v1.2/prd-v2.md` (v1.3)
**작성일**: 2026-04-18
**작성자**: Sinclair + Claude (Round 1~2 AI 검토 반영)
**상태**: ✅ **Closure 완료 (v1.4)** — 1인 겸임 체제 재정의 후 조기 종료 (2026-04-20 세션 209). 상세 근거: `phase-0-closure-report.md` v1.0
**Phase 0 Day 1**: 2026-04-18 (즉시 착수, 초기 계획 2026-04-25 대비 1주 앞당김)
**Phase 0 종료일**: 2026-04-20 (Day 3, 조기 종료 — 원계획 Day 28 대비 25일 단축)
**~~Gate Review (Day 28)~~**: ~~2026-05-15 (±3일 Buffer)~~ → **Phase 1 Sprint 3 말 기술 점검으로 성격 변경** (세션 209)
**Phase 1 착수일**: 2026-04-21 (~~2026-05-16~~에서 3.5주 단축)

---

## 0. 배경

Decode-X 개발기획서 v1.2 (및 v1.3 부록 반영판)의 3-AI 외부 검토 결과:

- **Ambiguity Score 0.15 (Ready)** — PRD 모호성 낮음, 문서 성숙도 충족
- **3-AI 공통 판정 Conditional** — 그러나 조건들은 모두 **Phase 0 실행 영역** (MoU·FTE·LLM 예산 등 조직 의사결정)
- **결론**: PRD로 해결되는 범위는 완결. Phase 1 본 개발 착수 전 **4주 Phase 0 Kick-off 수행으로 Conditional 조건 해소**

본 문서는 그 4주간의 **실행 계획·판단 기준·산출물·책임자**를 정의한다. SPEC.md F-item 등록(AIF-REQ-035)은 본 Phase 0 산출물(Kick-off Closure Report)이 Executive Sponsor 승인을 받은 후 수행한다.

---

## 1. Phase 0 목표

> 4주 안에 Phase 1(단일 모듈 PoC 10주) 착수를 위한 **9개 필수 전제 조건**을 All-Green 상태로 만들고, 본부장의 Phase Gate 승인을 받는다.

**Non-goals (Phase 0에서 하지 않는 것)**:
- 실제 코드 구현 (Phase 1 이후)
- Tier-A 6 서비스 전체 Empty Slot 발굴 (파일럿 1개만)
- Tier-B/C 범위 정의 (Phase 1 초반)
- 고객사 전체 LA 팀 교육 (Phase 1 첫 주)

---

## 2. 9개 전제 조건 (PRD 부록 D-3 상세화)

### 2.1 계약/거버넌스 트랙 (3건, Owner: 본부장 + Decode-X Lead)

| # | 조건 | 산출물 | 책임자 | 완료 기준 | 기한 |
|---|------|--------|--------|----------|------|
| C1 | **Foundry-X MoU 체결** | `/contracts/foundry-x-mou.v1.md` (서명판) | Decode-X Lead × Foundry-X PM | Plumb `FX-PLUMB-OUT` major 버전 고정 (v8 기준) + 월간 Sync Meeting 일정 6회분 확정 | Week 1 |
| C2 | **고객사 데이터 접근 권한 서명** | `/contracts/customer-data-access.v1.md` (LPON + 퇴직연금 2건) | Executive Sponsor + 고객사 CISO | 코드·테스트·운영로그 범위 명시 + 폐쇄망 Appliance 배포 조건 + 기간(24개월) + 종료 시 데이터 폐기 조항 | Week 2 |
| C3 | **법무·CISO 검토 완료** | `/contracts/security-legal-review.v1.md` | KT DS InfoSec + 고객사 법무 + Decode-X Lead | PRD 부록 E 보안 정책 준수 증빙 + DA 세션 NDA 템플릿 + 녹취 Retention 규정(90일) 서명 | Week 2 |

**리스크 완화**: C1 지연 시 → Foundry-X 레포의 `FX-INDEX` 현재 값으로 임시 고정 + 격주 Sync로 대체. C2 지연 시 → 합성 데이터(기존 LPON 859 skills·848 policies 자산)로 Phase 1 시작 후 Phase 2 전 실데이터 전환.

---

### 2.2 리소스 트랙 (3건, Owner: 본부장 + HR)

| # | 조건 | 산출물 | 책임자 | 완료 기준 | 기한 |
|---|------|--------|--------|----------|------|
| R1 | **Domain Archeologist 1 FTE 확보** | `/hr/da-recruitment.md` (내부 공모 + 외부 자문 2개 경로) | HR + 본부장 | LPON 도메인 SME 15년차+ 1명, 주 10h 이상 가용, 온보딩 1주 완료 | Week 3 |
| R2 | **LLM 예산 승인 + 프라이빗 모델 옵션 PoC** | `/budget/llm-budget.v1.md` | 재무 + Decode-X Lead | 월간 상한 $X + Claude Opus/Sonnet/Haiku 티어별 사용 예상 + Qwen 72B or Llama 3.1 70B 중 1종 자가호스트 PoC 완료 (cold start → 첫 프롬프트 응답 검증) | Week 3 |
| R3 | **핵심 팀 12명 확정** | `/hr/decode-x-team-roster.v1.md` | 본부장 + HR | PRD §8 R&R 기반 — Decode-X Lead + LA 3 + DA 1 + Platform 2 + Harness 2 + QA 2 + Design 1. 시작일 확정 + 전임/겸임 구분 표기 | Week 4 |

**리스크 완화**: R1 실패 시 → 외부 자문 계약(주 6h)으로 축소. R2 프라이빗 모델 PoC 실패 시 → 공개 API 의존 심화를 리스크 문서에 격상 기록(R1 심화). R3 인원 미충원 시 → 결원 채워질 때까지 Phase 1 스코프 축소(LA 2명 시작 가능).

---

### 2.3 기술 트랙 (3건, Owner: Decode-X Lead + Platform)

| # | 조건 | 산출물 | 책임자 | 완료 기준 | 기한 |
|---|------|--------|--------|----------|------|
| T1 | **Foundry-X Plumb E2E 1건 녹색** | `/poc/foundry-x-syncresult-demo.md` + 실행 로그 | Platform + Foundry-X VCO | 기존 AIF-REQ-026 Phase 1-3 MCP 통합 상태에서, 샘플 Skill 1건을 Foundry-X에 투입하여 `SyncResult.status == "green"` 응답 수신 | Week 2 |
| T2 | **프로토타입 마이그레이션 Shadow 모드 인프라** | `/poc/prototype-shadow-mode.md` | Platform | 현재 Sprint 208 프로토타입과 v1.1 신규 컨테이너 포맷을 동시 실행할 수 있는 CI 파이프라인 1개 라인 가동 | Week 3 |
| T3 | **결정적 생성 3종 PoC** | `/poc/deterministic-generation.md` | Harness + LA 1 | (a) Temperature=0 + Seed 고정, (b) Self-Consistency Voting (n=3), (c) Constrained Decoding (JSON Schema) — 3종 중 2종 이상에서 동일 Spec 기반 5회 재생성 시 95% 일치율 달성 (R4 대응) | Week 4 |

**리스크 완화**: T1 실패 시 → Foundry-X 팀과 합동 디버깅 세션 (최대 2일). T2 지연 시 → Phase 1 첫 주에 병렬 처리. T3에서 3종 모두 90% 미달 시 → R4를 Blocker 승격 + 완화 방안(앙상블, Retrieval-grounded) 재설계 후 Phase 1 2주 지연 감수.

---

## 3. 타임라인 (4주)

```
Week 1 (04-18~04-24) │ C1 MoU ░░████ │ T1 Plumb ░░░░░░░░████ │
Week 2 (04-25~05-01) │ C2 Data ░░░░████ │ C3 Legal ░░░░████ │ T1 완료 │
Week 3 (05-02~05-08) │ R1 DA ░░░████ │ R2 LLM ░░░████ │ T2 Shadow ░░████ │
Week 4 (05-09~05-15) │ R3 Team ░░░████ │ T3 Determinism ░░░░████ │ Gate Review │
───────┴───────────────────────────────────────────────────────────────────
Day 28 (2026-05-15) │ Executive Sponsor Kick-off Gate Review + Phase 1 Go/No-Go │
```

**Gate Review 의제 (Week 4 Day 5, 2h)**:
1. 9개 조건 All-Green 증빙 walkthrough (10분/건 × 9 = 90분)
2. 리스크 보드 업데이트 — R1/R4/R9/R12/R13/R14 현 상태
3. Phase 1 Sprint Backlog 초안 확정
4. Phase 0 Closure Report 서명

---

## 4. 판단 기준 (Phase Gate Criteria)

**GO (Phase 1 착수)**:
- 9개 조건 중 8건 이상 ✅ 그리고 결손 1건은 Phase 1 첫 주 내 해소 가능 (명시적 완화 플랜 승인)
- Ambiguity Score 재계측 ≤ 0.15 유지
- Foundry-X `SyncResult green` 로그 제출
- Executive Sponsor + Foundry-X PM + 고객사 대표(1인) 3자 서명

**CONDITIONAL GO (Phase 1 2주 지연)**:
- 6~7건 ✅ 그리고 미완료 건이 "R1 채용" 또는 "T3 결정적 생성"인 경우에 한함
- 명시적 Catch-up 플랜 + 주간 재검증

**NO GO (Phase 0 연장 또는 중단)**:
- 5건 이하 ✅
- C1 Foundry-X MoU 또는 C2 고객사 데이터 접근 미체결
- T1 Foundry-X E2E 실패로 R13(Foundry-X 버전 스큐) Blocker 승격

### 4.1 1인 체제 Gate 재정의 (v1.4, 2026-04-20)

> 원설계 GO 기준은 12인 팀 체제 전제. Closure 시점(세션 209)에 1인 겸임 체제로 재정의:

**GO (Phase 1 착수)** — Closure 시점 판정:
- ✅ 실행 체제 확정 (Sinclair 1인 겸임, FX PM 동일인)
- ✅ 기 확보 자산(LPON/퇴직연금)으로 PoC 데이터 충분
- ✅ 기술 기반(AIF-REQ-026 MCP + AIF-REQ-034 Deep Dive) Phase 1 착수 전 준비 완료
- ✅ DEFERRED 6건 각각 Phase 1/2 내 재가동 시점 명시 (Closure Report §2)
- ✅ Mission Pivot 리스크(R4 결정적 생성) T3를 Phase 1 필수 PoC로 편입

**재평가 Gate (Phase 1 중간)** — 원 Day 28 Gate의 대체:
- **Phase 1 Sprint 3 말** (2026-06-01): T1 녹색 + T3 2종 이상 PoC 성공 여부 평가
- 미달 시 Phase 2 진입 전 추가 Gate 트리거

---

## 5. 산출물 인벤토리 (Phase 0 Closure Report 동봉)

```
/contracts/
├── foundry-x-mou.v1.md (C1)
├── customer-data-access.v1.md (C2)
└── security-legal-review.v1.md (C3)

/hr/
├── da-recruitment.md (R1)
└── decode-x-team-roster.v1.md (R3)

/budget/
└── llm-budget.v1.md (R2)

/poc/
├── foundry-x-syncresult-demo.md (T1)
├── prototype-shadow-mode.md (T2)
└── deterministic-generation.md (T3)

/review/
├── round-1/ (기 생성)
├── round-2/ (기 생성)
└── gate-review-minutes.md (신규, Day 28)
```

**최종 산출물**: `/phase-0-closure-report.md` — 9개 조건 증빙 요약 + Gate Review 결과 + 리스크 보드 스냅샷 + Phase 1 Sprint Backlog 초안 (3~5개 Sprint)

---

## 6. 리스크 & 완화 (Phase 0 내부 리스크)

| ID | 리스크 | 영향 | 완화 |
|----|--------|------|------|
| P0-R1 | 고객사 법무 검토 지연 (평균 2~3주) | C2/C3 타임라인 파탄 | Week 0에 법무 접촉 선행 + 합성 데이터로 Phase 1 시작 가능하도록 이중화 |
| P0-R2 | DA 후보 부재 (15년차+ SME 희소) | R1 미달 → HITL 품질 저하 | 외부 자문 계약(주 6h) 경로 사전 확보 + 보상 구조 경쟁력 강화 |
| P0-R3 | Foundry-X Sprint 308+ 진행 중 API 변경 | T1 실패 | 월간 Sync로 완화, Major 버전 고정(MoU 조항) |
| P0-R4 | 프라이빗 모델 자가호스트 인프라 비용 과대 | R2 예산 오버 | PoC 결과 따라 3-tier 조건부 예산 (public only / hybrid / private dominant) |
| P0-R5 | Week 4 Gate Review 일정 조정 불가 | Phase 1 착수 지연 | Week 2 Day 1까지 확정 통보, Buffer 하루 |

---

## 6.5. Progress Tracker (v1.2 신설)

> Week 단위 갱신. 9개 조건 현황 한눈에 파악.

### 9개 조건 상태 현황판 (Closure 시점, 2026-04-20)

> **1인 겸임 체제 재정의 반영**. 상세 근거: `phase-0-closure-report.md` §2.
> 원설계는 12인 팀 전제 → 현실(Sinclair 1인)에 맞춰 DONE/WAIVED/DEFERRED로 재분류.

| # | 조건 | 담당 | 상태 | 근거 / 재가동 시점 |
|---|------|------|:----:|---------------------|
| C1 | Foundry-X MoU 체결 | Decode-X Lead × FX PM | ✅ **DONE** | FX PM = Sinclair(sinclairseo@gmail.com) 겸임 확정. MoU v0.2 내부 기준 문서로 유지, self-sign. Plumb 계약 `FX-SPEC-002 v1.0 @ e5c7260` 고정 |
| C2 | 고객사 데이터 접근 권한 서명 | 본부장 + 고객사 CISO | ⏭️ **DEFERRED** | Phase 2 착수 2주 전 재가동. 현 자산(LPON 859 skills + 퇴직연금)으로 Phase 1 PoC 충분 |
| C3 | 법무·CISO 검토 완료 | InfoSec + 고객사 법무 | ⏭️ **DEFERRED** | C2와 동기화 (Phase 2 진입 전) |
| R1 | Domain Archeologist 1 FTE 확보 | HR + 본부장 | ❎ **WAIVED** | 1인 체제 — Sinclair가 DA 역할 겸임. Tacit Interview Agent(AIF-REQ-034)로 SME 의존도 완화 |
| R2 | LLM 예산·프라이빗 모델 PoC | 재무 + Decode-X Lead | ⏭️ **DEFERRED** | Phase 1 Sprint 2. 현 OpenRouter + 4-provider fallback 운영 중, 예산 상한은 사용량 누적 후 조정 |
| R3 | 핵심 팀 12명 확정 | 본부장 + HR | ❎ **WAIVED** | 1인 체제 유지. Phase 2 확장 시 재산정 |
| T1 | Foundry-X Plumb E2E 1건 녹색 | Platform × FX VCO | ⏭️ **DEFERRED** | Phase 1 Sprint 1 첫 과업. AIF-REQ-026 Phase 1-3 MCP 통합 완료 기반 |
| T2 | 프로토타입 Shadow Mode 인프라 | Platform | ⏭️ **DEFERRED** | Phase 1 Sprint 2~3 |
| T3 | 결정적 생성 3종 PoC | Harness + LA | ⏭️ **DEFERRED** | Phase 1 Sprint 3~4 필수 PoC (Mission Pivot 리스크 R4 대응 핵심) |

**범례**: ⬜ TODO / 🔄 IN_PROGRESS / ✅ DONE / ❎ WAIVED (1인 체제 전제 불요) / ⏭️ DEFERRED (Phase 1/2 중 재가동) / ❌ BLOCKED

**충족 분포**: DONE 1 + WAIVED 2 + DEFERRED 6 + OPEN 0 → **1인 체제 Gate 기준 GO**

### Day 1 (2026-04-18, 세션 207) 수행 내역

**PRD & 메타 문서**:
- ✅ Decode-X 개발기획서 v1.2 Round 1 검토 (3-AI 39.5초, Scorecard 76/100, Ambiguity 0.15)
- ✅ v1.3 부록 C/D/E 반영 (사용자 페르소나·MVP·운영보안) — `prd-v2.md` 1,621줄
- ✅ Round 2 검토 (3-AI 43.1초, Scorecard 68 하락 *파서 한계*, 실질 판정 Conditional)
- ✅ Phase 0 Kick-off 설계서 v1.0 작성 → 본부장 "진행" 결정 → v1.1 승인·착수 반영

**SPEC 등록**:
- ✅ AIF-REQ-035 **PLANNED** 상태로 SPEC.md §7 사전 등록 (drift 방지)
- ✅ SPEC.md §8 TD-13/14/15 ax-marketplace 업스트림 버그 3건 등록

**인프라 점검**:
- ✅ `/ax:infra-selfcheck` 9/9 PASS (Plugin v1.1.0, drift=0)
- ✅ `/ax:req-integrity` 3-way 정합성 검증 (§6.5 후속 시행)

**Week 1 Actions (2026-04-19 ~ 04-24)**:
- ✅ C1 MoU 초안 v0.1 작성 — `docs/contracts/foundry-x-mou.v0.1-draft.md` (Open Questions 7건 포함)
- ✅ **Day 2 (2026-04-19, 세션 208)**: Q1 Plumb 버전 확정 조사 — Foundry-X 레포 조사로 실제 계약 문서(`FX-SPEC-002 plumb-output-contract.md v1.0` @ commit `e5c7260`, 2026-03-16) 확인. v0.1의 "v8 기준" 표기는 Foundry-X PRD(`FX-SPEC-PRD-V8`)와의 혼동이었음을 정정. MoU v0.2 내부 정리판 작성 → `docs/contracts/foundry-x-mou.v0.2-draft.md` (Q1 해소, §3.1 상세화, §4.2 Frozen Baseline에 commit SHA 병기, §6.3 No-Go 조건 정정)
- ✅ **Day 3 (2026-04-20, 세션 209)**: **Phase 0 Closure 선언** — Foundry-X PM 지정 완료(Sinclair 겸임, `sinclairseo@gmail.com`)로 C1 Blocker 최종 해소. 1인 겸임 체제 현실에 맞춰 9조건을 DONE 1 + WAIVED 2 + DEFERRED 6으로 재정의. Gate 기준을 "조직 승인 Gate"에서 "Phase 1 Sprint 3 말 기술 점검 Gate"로 전환. Closure Report v1.0 작성 → `phase-0-closure-report.md`. AIF-REQ-035 PLANNED → **IN_PROGRESS** 전환. Phase 1 착수일 2026-05-16 → **2026-04-21** (3.5주 단축)

### 리스크 보드 (Phase 0 내부)

| ID | 상태 | 비고 |
|----|:----:|------|
| P0-R1 법무 검토 지연 | 🟡 Watch | C2/C3 Week 0 선행 접촉 권고 |
| P0-R2 DA 후보 부재 | 🟡 Watch | 외부 자문 경로 사전 확보 중 |
| P0-R3 Foundry-X API 변경 | 🟢 OK | AIF-REQ-026 Phase 1-3 완료, MoU 미체결 |
| P0-R4 프라이빗 모델 비용 | 🟢 OK | PoC 결과 후 3-tier 조건부 예산 |
| P0-R5 Week 4 일정 | 🟢 OK | 2026-05-15 확정 |

---

## 7. 의존성 & 선행 작업

**선행 완료 필요 (Phase 0 시작 조건)**:
- ✅ AIF-REQ-034 Decode-X Deep Dive IN_PROGRESS (Tacit Interview Agent 설계)
- ✅ AIF-REQ-026 Foundry-X MCP Phase 1-3 (MCP 2서버 + meta-tool 3종 완료)
- ⬜ 본부장 Phase 0 착수 승인
- ⬜ 예산 Q3 확보

**병렬 진행 가능**:
- Phase 0와 무관하게 진행 — `phase-6-seo-security`, `code-verify`, 기존 운영 체계 유지

---

## 8. 다음 단계

1. ~~**본부장 검토**: 본 문서 + PRD v1.3 (prd-v2.md) Walk-through 세션 (1h)~~ ✅ **완료 (2026-04-18, 세션 207)** — 결정: 진행
2. ~~**Go 결정**: 서명 + Phase 0 Kick-off 공식 착수~~ ✅ **완료 (2026-04-18)** — Day 1 개시
3. **SPEC.md 사전 등록** ✅ — `AIF-REQ-035` PLANNED 상태로 SPEC.md §7 등록 (drift 방지)
4. **Week 1 Actions**: C1 Foundry-X MoU 초안 + T1 Plumb PoC 준비 착수
5. **Day 28 Gate Review (2026-05-15)**: 9개 조건 검증 + Phase 1 Sprint Backlog + AIF-REQ-035 IN_PROGRESS 전환
6. **Phase 1 Sprint 구성** (Gate GO 후): PoC 10주 = Sprint 3~7 (5 Sprint × 2주) 배정

---

## 9. 부록 — AIF-REQ 연계 맵

| Phase 0 조건 | 연관 기존 REQ | 새 REQ 예정 |
|-------------|-------------|-----------|
| C1 Foundry-X MoU | AIF-REQ-026 (IN_PROGRESS) | AIF-REQ-035 서브태스크로 편입 |
| C2 고객사 데이터 | AIF-REQ-007~011 (LPON 파일럿 DONE) | 데이터 접근권 연장 |
| R2 LLM 예산 | AIF-REQ-034 (PoC LPON 859 채점) | 예산 상한 편성 |
| T1 Foundry-X E2E | AIF-REQ-026 Phase 2 Sprint 1 (완료) | Plumb SyncResult 통합 E2E |
| T3 결정적 생성 | - | 신규 AIF-REQ — Deterministic Generation Research |

---

## 문서 이력

- **v1.4 (2026-04-20, 세션 209 Day 3)**: **Phase 0 Closure 반영** — 상태 "Closure 완료"로 전환, 1인 겸임 체제 재정의로 9조건 DONE 1 / WAIVED 2 / DEFERRED 6 분류. §4.1 1인 체제 Gate 재정의 섹션 추가. §6.5 Progress Tracker에 Day 3 수행 내역(PM 지정 Sinclair 겸임, Closure Report v1.0 작성, REQ-035 IN_PROGRESS 전환) 반영. 관련 신규 문서: `phase-0-closure-report.md` v1.0 (Sinclair + Claude)
- **v1.3 (2026-04-19, 세션 208 Day 2)**: §6.5 Progress Tracker에 Day 2 수행 내역 반영 — C1 Q1 Plumb 버전 확정 조사 완료 (`FX-SPEC-002 v1.0 @ e5c7260`), MoU v0.2 내부 정리판 작성. C1 Blocker에서 Plumb 버전 항목 제거 (Foundry-X PM 지정만 잔여) (Sinclair + Claude)
- **v1.2 (2026-04-18, 세션 207 Day 1)**: §6.5 Progress Tracker 신설 — 9개 조건 상태 현황판, Day 1 수행 내역(PRD v1.3 + 검토 2라운드 + SPEC REQ-035 + TD-13~15 + infra-selfcheck 9/9), Week 1 Actions, 리스크 보드(P0-R1~R5) (Sinclair + Claude)
- **v1.1 (2026-04-18, 세션 207)**: 본부장 "진행" 결정 반영 — 상태 "승인·착수", Day 1=2026-04-18, Gate Review 2026-05-15 확정. SPEC AIF-REQ-035 PLANNED 사전 등록 연계 (Sinclair + Claude)
- **v1.0 (2026-04-18)**: 초안 — Round 1~2 AI 검토 Conditional 조건을 Phase 0 실행 체크리스트로 구체화 (Sinclair + Claude)
- **다음 갱신**: Phase 1 Sprint 1 착수 후 (2026-04-21~) — 세션별 진척 대신 `phase-0-closure-report.md` + Sprint Backlog 문서로 이관
