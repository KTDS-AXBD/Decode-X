# Decode-X v1.3 Phase 2 — 인터뷰 로그

- **프로젝트 코드네임**: decode-x-v1.3-phase-2
- **인터뷰 일자**: 2026-04-19
- **인터뷰 대상**: Sinclair Seo (KT DS AX BD팀, Decode-X PM + Foundry-X PM 겸임)
- **인터뷰 진행**: Claude (req-interview 스킬, ax v1.1.0)
- **상위 REQ**: AIF-REQ-035 (Decode-X v1.3 본 개발, IN_PROGRESS)
- **Phase 1 PoC 종료 시점**: 세션 211 (1.5일 압축 Full Auto), 세션 214 이어받음
- **세션**: 216

---

## Part 1 — 왜 (목적/문제)

### Q1 (핵심) — 어떤 문제 / 어떤 기회를 잡으려 하는가?

**A**: "Foundry-X 핸드오프가 실제 1개 도메인에서 End-to-End로 동작하는 첫 사례를 만든다"

→ PRD v1.3의 명목 목표(Tier-A 잔여 6개 서비스 양적 확장 + 2-org 확장)를 양적 frame이 아닌 **검증 깊이 frame**으로 재정의함. Phase 1 PoC가 "충전 1개 서비스 + Empty Slot Fill 9건 + Handoff 포맷"까지였다면, Phase 2는 그 다음 단계인 **"Foundry-X가 받아서 실제로 돌아가는"** 첫 입증 사례를 만드는 것.

### Q2 (후속) — 만들지 못하면 어떻게 되는가? (시급성)

**A (선택)**: "압박 없음 — 호흡 우선" (외부 일정 고정 없음, AI-Native 1인 체제의 지속 가능한 속도, 완결성 > 속도)

→ Sprint 압축도 우선순위 낮음. 검증 깊이 우선. v2.0 완화 KPI 그대로 가도 정당화 가능, 오히려 Phase 2에서는 "1개 사례의 결손 없는 완결성"이 핵심 지표.

---

## Part 2 — 누구를 위해 (사용자/이해관계자)

### Q1 (핵심) — 누가 사용하거나 영향을 받는가?

**A (선택)**: "Foundry-X (시스템 수용자)" — Decode-X가 만든 Handoff Package를 입력으로 받아 Working Prototype을 생성·실행하는 AI Agent Orchestrator. 이 쪽이 "실제 동작" 입증의 주체.

함의:
- KPI 측정권이 Foundry-X 측에 있음
- 포맷·스키마 일치성이 핵심
- "End-to-End" 정의 = "Decode-X 출력 → Foundry-X 입력 → Working Prototype 생성·실행" 풀 사이클

### Q2 (후속) — Foundry-X 측 요구의 SSOT는 어디?

**A (선택)**: "Phase 2 진입 시 신규 계약 v1.1 작성"

→ FX-SPEC-002를 v1.1로 바이관 확장. Tier-A 6개 서비스 특성 + E2E 실행 요구사항 + Working Prototype 수용 기준을 명시. **Phase 2 본격 Sprint 전에 FX-SPEC-002 v1.1 작성·합의 Sprint(=Sprint 0급)**가 선행 단계로 들어감.

---

## Part 3 — 무엇을 (범위/기능)

### Q1 (핵심) — Must Have 핵심 기능의 양/깊이 배합은?

**A (선택)**: "하이브리드: 1도메인 × 6서비스 + 1서비스 E2E"

- **Track A (양적)**: LPON 온누리상품권 단일 도메인에서 Tier-A 잔여 6개 서비스(예산/구매/결제/환불/선물/정산) Empty Slot Fill (각 ~2~3 슬롯)
- **Track B (깊이)**: 그 중 1개 서비스(Critical Path)는 Decode → Handoff → Foundry-X 실 실행까지

### Q2 (후속) — Track B Critical Path는?

**A (선택)**: "결제" — 핵심 거래 흐름, 외부 PG/계좌 연계 로직, 트랜잭션 명확, 도메인 가치 가장 큼. Handoff 스키마의 대부분 edge를 결제에서 만남. Working Prototype 입증 파급 최대.

### Q3 (후속) — Out-of-scope?

**A (선택, 복수)**: 
- "2-org 확장 (퇴직연금 추가)" — Phase 3 이관, "단일 도메인 완벽 증명 후 일반화 시도" 순서
- "Tier-B/C 서비스" — 핵심이 아닌 주변 서비스(조회/알림/통계)

→ Foundry-X Orchestrator 신규 개발과 KG Relationship Registry / Ontology MCP는 Phase 2에서 명시적 제외하지 않음 (회색지대로 두어 필요 시 켤 수 있음).

### Q4 (후속) — 입력 자산은 어디서?

**A (자유 텍스트)**:
> "1. 기존 자료 참고 금지. 2. 문서가 아니라 소스를 기반으로 추출"

→ **Source-First 결정** (큰 전환):
- Stage 1 입력 = LPON 결제 도메인 **Java/Spring 소스코드** (문서 X)
- Phase 1에서 처리한 LPON 88문서·D1 데이터(policies 848 / skills 859)를 입력으로 재사용하지 않음 (Clean Slate)
- Decode-X 정체성("기존 자산 해독" 중 "소스코드" 측면)을 본격 활성화
- PRD v1.3 §2.5 "Java/Spring 스택"과 정확히 일치

### Q5 (후속) — "기존 자료 참고 금지"의 정확한 범위?

**A (선택)**: "정량 자산은 금지 / 정성 자산은 계승"
- ❌ **금지**: D1 policies/skills 데이터, LPON 88문서, Phase 1 서본 자료
- ✅ **계승**: B/T/Q Schema, Tacit Interview 틀, Handoff 포맷, T3 Self-Consistency 노하우, llm-client 코드, Empty Slot 발굴 방법론

### Q6 (Part 3 요약 후 추가 자유 입력)

**A (자유 텍스트)**:
> "소스를 제1 우선순위로 진행. 맥락 정보 확인을 위해서 기존 산출물(문서)를 참고하는 것은 가능 — 하지만, 어디까지나 원장은 소스, 문서는 참고용, 소스에는 없는데 문서에 있다면 누락분으로 별도 기재, 소스 내용이 우선, 소스와 문서가 다르다면 차이점을 별도 기재.
>
> 그 외 중요한 추출 요소가 ERD (현재 ERWin)으로 되어 있음. 어떻게든 ERD를 추출해낼 수 있는 방법 조사. 소스를 보는 목적은 최종 추출된 spec으로 VibeCoding을 할 때, 실제 데이터가 동작하는 것을 보기 위함. 그런 의미에서 데이터 분석이 가장 중요."

→ **3대 추가 결정**:
1. **Authoritative Source 정책**: 원장=소스, 문서=참고용. 충돌 시 소스 우선. 차이는 3종 마커로 별도 기재 — `SOURCE_MISSING` / `DOC_ONLY` / `DIVERGENCE`
2. **ERD = ERWin 포맷** (.er1/.er2/.dm1/.xml 등): 추출 도구 R&D 별도 F-item. 후보 경로 — (a) ERWin export → SQL DDL → 파싱, (b) ERWin XML export 활용, (c) erwin Data Modeler API, (d) DB 직접 connect 메타 역추출
3. **데이터 분석 최우선**: 소스를 보는 목적 = 추출된 spec으로 VibeCoding 시 **실 데이터 동작 검증**. 즉 데이터 모델/데이터 흐름/실 데이터 sample이 핵심 산출물. SI 산출물(설계서/API 명세) 추출보다 **데이터 모델 + 데이터 동작**이 가장 중요.

---

## Part 4 — 어떻게 판단할 것인가 (성공 기준)

### Q1 (핵심) — 성공 기준 KPI 세트는?

**A (선택)**: "Track별 분리 KPI"

- **Track A (양적)**:
  - 6서비스 완결성 ≥ 95%
  - AI-Ready 6기준 통과율 ≥ 70%
  - 소스 출처 추적성 100% (모든 추출 항목이 소스 위치를 가리킴)
- **Track B (깊이, 결제 E2E)**:
  - Handoff 수용 성공률 100% (1/1)
  - Working Prototype 실행 PASS
  - round-trip 일치율 ≥ 90% (소스 ↔ Decode-X spec ↔ Working Prototype 동작 결과)

### Q2 (후속) — 실패 / 중단 조건?

**A (선택)**: "Track B(결제 E2E) 구조적 실패 시 중단"

→ Foundry-X Handoff 수용 또는 Working Prototype 실행이 2회 이상 해결 불가능(포맷·스키마 mismatch 근본 원인)이면 Phase 2 중단하고 FX-SPEC-002 v1.1 재설계로 회귀. "첫 사례" frame의 근거 소멸 시 Phase 2 의미 상실.

---

## Part 5 — 제약과 리소스

### Q1 (핵심) — 가장 큰 제약/리소스 이슈는?

**A (선택, 복수)**:
- **LPON 결제 Java/Spring 소스 확보** — "소스 기반 추출" 결정으로 임계 추가
- **Cloudflare Workers 30초 CPU 제약** (C-01) — 대규모 소스 파싱·AST 추출·T3 multi-call 시간 제약

(선택 안 함: Anthropic API 크레딧, 1인 체제 — 기존 제약으로 이미 관리 중)

### Q2 (후속) — LPON 결제 Java/Spring 소스 확보 경로?

**A (선택)**: "내부 보유 소스 재활용 (KT DS 내부 권한)"

→ Phase 1에서 LPON 88문서 접근 권한이 있었으므로 동일 권한 내 소스코드도 접근 가능 추정. C2(고객 데이터 권한) 재가동 최소. P1-R1(법무 지연) 리스크 회피.

### Q3 (후속) — Sprint 단위 감각?

**A (선택)**: "Sprint 1~2일 단위"

→ Phase 1의 60~90분보다 호흡 길게. 하루에 1서비스 완료 수준. Track A 6서비스×하루 + Track B 결제 E2E 2~3일 구조. 전체 대략 1.5주 이내.

---

## 인터뷰 종료 — 진행 합의

**Q (핵심)**: 이 요약으로 PRD v1 작성으로 넘어가도 될까?

**A (자유 텍스트)**: 위 Part 3 Q6 추가 요구사항 (Authoritative Source 정책, ERWin ERD 추출, 데이터 분석 우선)을 반영한 PRD v1 작성 진행.

---

## 인터뷰 종료 후 식별된 신규 F-item 후보

1. **FX-SPEC-002 v1.1 신규 작성** (선행 Sprint 0급, Phase 2 진입 게이트)
2. **svc-ingestion Java/Spring AST 파서 추가** (Source-First 입력 채널)
3. **Source-First Reconciliation 엔진** (소스 ↔ 문서 차이 마커 — `SOURCE_MISSING` / `DOC_ONLY` / `DIVERGENCE`)
4. **ERWin ERD 추출 도구 R&D** (조사 + PoC, 4가지 경로 후보 평가)
5. **Track A — Tier-A 6개 서비스 Empty Slot Fill** (서비스당 1 F-item × 6 = 예산/구매/결제/환불/선물/정산)
6. **Track B — 결제 E2E 핸드오프** (분할: handoff 패키지 → Foundry-X 실 실행 → round-trip 데이터 동작 검증)
7. **Working Prototype 데이터 동작 검증 하네스** (Track B KPI 측정 인프라)

---

*Generated by req-interview skill (ax v1.1.0). 인터뷰 약 30분 소요. AskUserQuestion 단일 질문 단위 진행.*
