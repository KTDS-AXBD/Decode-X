---
code: AIF-REQI-prd-v1
title: "Decode-X: Reverse Engineering 기반 VibeCoding Spec 생성 시스템 개발기획서"
version: 1.0
status: active
category: req-interview
created: 2026-04-18
updated: 2026-04-18
author: Sinclair Seo
---

# Decode-X: Reverse Engineering 기반 VibeCoding Spec 생성 시스템 개발기획서

**문서 버전**: v1.2
**작성일**: 2026-04-18
**작성자**: Sinclair
**관련 문서**: AI Foundry OS Deep Dive v0.3 (2026-04-15), Decode-X 개발기획서 v1.0/v1.1 (2026-04-18), Foundry-X 레포 (KTDS-AXBD/Foundry-X @ master, Phase 46 Sprint 308)
**주요 변경점(v1.1 → v1.2)**:
- §1.5 **Mission Re-definition** 신설 — "100% 등가 Copy Machine" 프레임 폐기, ManMonth-기반 SI → AI-Centric 체질 전환 선언
- §2.2 KPI 재조정 — 행위 동등성을 Tier(핵심 ≥95% / 부차 ≥70%)로 분리, **Empty Slot Fill Rate** · **Tacit Knowledge Coverage** · **Foundry-X Integration Readiness** 3종 신설
- §2.5 **Core Service & Empty Slot Analysis** 신설 — 핵심 서비스 식별·입력 자료 완결성·암묵지 빈 슬롯 발굴 프레임워크 (전자온누리상품권 Worked Example 포함)
- §7 리스크 R12·R13 추가 — Input 불완전성·Foundry-X 버전 스큐
- §8 **Domain Archeologist** 역할 추가 — 암묵지 추출 전담
- §10 의사결정 9·10 추가 — Mission 재정의 승인, Foundry-X 역할 분담 승인
- §13 **Foundry-X Harness 비교 분석 및 통합 전략** 신설 — SDD Triangle / Plumb / O-G-D Loop / Skill Unification ↔ Decode-X v1.1 §4.5 LangGraph 하네스 비교, Decode-X = Input Plane Producer / Foundry-X = Process-Output Plane Orchestrator 역할 분담 제안
- 부록 H **Foundry-X 레퍼런스 카탈로그** 신설
**상태**: v1.2 검토용 (Review-ready)

---

## Executive Summary

본 문서는 **레거시 프로젝트(소스 코드 + 산출물 문서)로부터 AI 코드 생성("Vibe Coding")이 검증 가능한 방식으로 작동할 수 있도록 구조화된 Spec을 자동 추출하는 시스템 — Decode-X** 의 개발 계획을 정의한다.

**핵심 문제**: Vibe Coding은 동일한 프롬프트에도 매번 다른 결과를 생성하므로, 대규모 SI/ITO 현장 적용 시 품질·일관성·검증 가능성이 담보되지 않는다. 따라서 사람과 AI가 동일하게 해석 가능한 **구조화된 계약(Spec)** 이 필요하다.

**접근**: Chikofsky-Cross(1990) Design Recovery 프레임을 상위 구조로, **Code Property Graph(CPG)**를 내부 IR로 채택하고, **AutoSpec(CAV'24)·SpecGen(ICSE'25)** 방식의 "정적분석 → LLM → 검증기 → 변이복구" 루프로 Technical Spec을 추출한다. **Daikon(2007)** 동적 불변식으로 Quality Spec을 앵커링하고, **Csmith(2011) + Google Cloud Dual Run** 패턴의 Differential Testing으로 "원본 Working Site" vs "Spec 기반 Working Site"의 행위 동등성을 검증한다.

**v1.1 핵심 보강**: Spec의 1차 독자는 사람이 아니라 **VibeCoding 에이전트**임을 전제로, Spec 포맷을 **"기계 실행 가능 계층 + 기계 검증 가능 계층 + 사람 리뷰 가능 계층"의 3-Layer 컨테이너**로 재설계했다(§4.3). 또한 Spec 입력만으로 최종 Working Site가 자동 산출되도록 **LangGraph 기반 5-Node 상태기계·Claude Code Auto Mode 2-Layer Classifier·SWE-bench Verified 스타일 하네스**를 결합한 **VibeCoding Automation Harness**를 신설했다(§4.5). 현재 Decode-X 프로토타입은 Sprint 208까지 B/T/Q Spec 생성기를 Template+LLM Hybrid로 구현했으나 Technical Spec 점수 4.3%, AI-Ready passRate 23.6%에 머물러 있다(§12). 이를 Option C 기반 권장안으로 끌어올리기 위한 **점진적 마이그레이션 계획**도 함께 제시한다.

**검증 가능성**: 매 Spec 조항은 (a) CPG 노드 및 SCIP 심볼에 대한 트레이스 링크, (b) 자동 생성된 테스트, (c) Playwright 기반 UI 시나리오에 바인딩되어 **Spec ↔ Code ↔ Test 3자 Gap이 90% 이상 매칭**될 때만 합격으로 처리된다.

**범위**: 언어 무관(Language-agnostic) 방법론을 기본으로, PoC는 Java/Spring + Node/TypeScript 2개 스택을 우선 적용.

**v1.2 핵심 재정의 (Mission Pivot)**: 본 프로젝트의 목표는 레거시의 **"물리적 100% 등가 Copy Machine"이 아니다**(§1.5). 목표는 **기존 Asset을 AI-Ready Data/Spec으로 전환하여 ManMonth 중심의 SI 프로세스와 체질을 AI-Centric으로 전환**하는 것이다. 이제 분석·기획·설계·개발·테스트·운영의 주체는 AI이고, 사람·조직의 본령은 (a) 어떻게 일을 시킬 것인가, (b) 기대수준·Output 수준을 어떻게 극대화할 것인가, (c) 어떤 자료·디렉션으로 AI의 신뢰성·품질을 담보·관리할 것인가 — 이 3가지로 수렴한다. 따라서 Decode-X의 퀄리티 핵심은 "원본 전체를 복사하는 기술"이 아니라 **"핵심 서비스를 식별하는 일 + 입력 자료의 완결성·취약점을 분석하는 일 + 암묵지에 해당하는 빈 슬롯을 찾아 채우는 일"**(§2.5)이다.

**v1.2 Foundry-X 통합 전략 (§13)**: 한편 같은 조직(KT DS AXBD)의 **Foundry-X**가 Phase 46 Sprint 308까지 **SDD Triangle(Spec↔Code↔Test) + Plumb 동기화 엔진 + 6-에이전트 하네스 + Claude Squad 오케스트레이션**을 이미 가동 중이다. v1.2는 두 시스템의 **역할 분담**을 공식 결정한다 — Decode-X는 **Input Plane의 Spec 생산자**(레거시→AI-Ready Spec), Foundry-X는 **Process/Output Plane의 Spec 실행·검증자**(Spec→Working Site, Drift 감지). 공통 매개체는 **Git 저장소 + SPEC.md SSOT + Plumb decisions.jsonl** 이며, Decode-X가 산출하는 v1.1 §4.3 컨테이너는 Foundry-X가 그대로 소비 가능한 포맷으로 정렬된다.

**기대 효과**: Foundry-X의 "경험의 자산화 → 반제품화 → GTM" 전체 플로우에서 **Input Plane(Spec 생산)** 을 자동화하여 SI 개발 시간 30%+ 절감 + Foundry-X의 PoC/MVP 2~4주 → 3일 목표(FX PRD v8)의 전제 조건(양질의 Input Spec)을 공급한다.

---

## 1. 프로젝트 배경 및 문제 정의

### 1.1 배경: "Vibe Coding"의 기회와 한계

2025년을 기점으로 AI 에이전트 기반 코드 생성(Copilot Agent Mode, Claude Code, Cursor, Devin, Kiro 등)이 실무 적용 단계에 진입했다. 자연어 프롬프트만으로 수 시간 만에 동작하는 웹 애플리케이션을 구성하는 것이 가능해졌고, 이를 흔히 "Vibe Coding"이라 부른다 (Karpathy, 2025).

그러나 다음과 같은 **구조적 한계**가 실무 확산을 가로막고 있다:

1. **비결정성**: 같은 프롬프트·같은 모델이라도 세션마다 구현이 달라진다. 모델 버전 업그레이드 시 대규모 리그레션 위험.
2. **검증 불가능성**: "결과 코드가 요구사항을 충족하는가"를 판정할 Ground Truth가 없다.
3. **스케일 한계**: 수천 개 API, 수만 개 테이블을 가진 엔터프라이즈 시스템에는 단일 프롬프트로 대응 불가.
4. **지식 소실**: 레거시 코드에 축적된 20년+ 업무 지식이 AI가 해석 가능한 형태로 구조화되어 있지 않다.

### 1.2 전제: AI Foundry OS의 Spec 정의

본 프로젝트는 "AI Foundry OS Deep Dive v0.3"에서 정의한 **Spec의 세 가지 타입과 여섯 가지 기준**을 준수한다.

**Spec의 3가지 타입** (원문 §A-2):

| 타입 | 목적 | 핵심 구성 |
|------|------|-----------|
| 📘 **Business Spec** | "무엇을 왜" | 목적·KPI, 업무 규칙(if-then), 정책·승인, 도메인 용어집 |
| 📗 **Technical Spec** | "어떻게" | 아키텍처, 서비스 구성도, API 명세(OpenAPI/Zod), 데이터 모델(ERD/DDL) |
| 📙 **Quality Spec** | "얼마나 잘" | 성능 목표, 보안 요구, 테스트 계약, 운영 Runbook·SLA |

**AI-Ready Spec 6가지 기준** (원문 §A-3):

① 기계 판독 가능 · ② 의미 일관성 · ③ 테스트 가능 · ④ 추적 가능 · ⑤ 완결성 · ⑥ 사람 리뷰 가능

### 1.3 본 프로젝트의 목적

위 전제 위에서, 본 프로젝트 Decode-X는 다음을 수행한다.

> **레거시 프로젝트의 소스 코드(우선)와 산출물 문서(테이블정의서, API 설계서 등)로부터, 6가지 기준을 충족하는 구조화된 Spec을 (반)자동으로 추출하고, 해당 Spec으로부터 Vibe Coding을 통해 생성된 Working Site가 원본과 행위 동등성을 갖는지 검증한다.**

### 1.4 v1.1의 재정의: "Spec의 1차 독자는 VibeCoding 에이전트이다"

v1.0은 Spec을 "사람과 AI가 동일하게 해석 가능한 구조화된 계약"으로 정의했다. 그러나 VibeCoding 흐름에서의 실제 소비 주체를 분석한 결과, **Spec의 소비 순서는 "LLM 에이전트 → 정적 검증기 → 테스트 러너 → (마지막) 사람 리뷰어"** 이다. v1.1은 이 순서에 맞춰 Spec 포맷 설계를 **"기계 실행성 우선 · 사람 가독성은 파생물"** 로 재배열한다. 사람 가독성은 저하되지 않지만, 포맷의 1차 설계 목표는 더 이상 "사람이 바로 이해할 수 있는가"가 아니라 **"Vibe 에이전트가 Spec을 입력받았을 때 Working Site가 실제로 복원되는가"** 이다.

### 1.5 v1.2의 재정의: Mission Pivot — "Copy Machine"이 아니라 "AI-Centric 체질 전환"

v1.0/v1.1은 "두 Working Site의 행위 동등성 ≥95%"를 최상위 성공 기준으로 두었다. 현장 검토 결과 이 프레임은 **두 가지 치명적 위험**을 내재하고 있다.

**위험 1. "최초 입력 자료는 100% Working·무결점 서비스"라는 암묵 가정.**  
실제 레거시 자산은 대부분 (a) 원본 코드·문서가 버전 스큐 상태이고, (b) 운영 중 이미 수작업 우회·핫픽스·암묵지로 보정되고 있으며, (c) 산출물 문서는 과거 시점 스냅샷이다. 이 상태의 입력을 "정답지"로 놓고 출력을 그에 맞추려 하면, **불량 자산을 충실히 복제하는 Copy Machine이 될 뿐** 품질은 올라가지 않는다.

**위험 2. "100% 등가 재현"이라는 범위 설정의 비효율.**  
주변부 기능(관리자 통계, 잘 쓰지 않는 구-UI 등)까지 1:1 재현에 공수를 쓰는 것은 ROI가 없다. 기획의 본질은 "기존을 똑같이 다시 만드는 것"이 아니라 **기존 Asset을 AI-Ready Data / Spec으로 전환하여 ManMonth 중심의 SI 프로세스와 체질을 AI-Centric으로 변화시키는 것**이다.

**v1.2의 새로운 Mission 선언**:

> 이제는 AI가 **분석 · 기획 · 설계 · 개발 · 테스트 · 운영**의 주체가 된다. 사람·조직이 해야 할 일은 ① **어떻게 일을 시킬 것인가**, ② **기대수준과 Output 수준을 얼마나 극대화할 것인가**, ③ **어떤 자료와 디렉션을 주어야 AI의 신뢰성·품질을 담보하고 관리할 수 있을 것인가**, 이 세 가지로 수렴한다.

**따라서 Decode-X의 퀄리티 핵심은 아래 3단계**:

1. **핵심 서비스·기능 식별** — 도메인의 "정말 중요한 축"을 가려내는 일. 예: 전자온누리상품권 = {예산, 충전/충전취소, 구매/구매취소, 결제/결제취소, 환불/환불취소, 선물/선물취소}.
2. **입력 자료의 완결성·취약점 분석** — 핵심으로 구분된 기능들에 대해 원본 코드·문서·운영로그가 얼마나 완결적인지, 어디가 비어 있거나 모순되는지 정량 측정.
3. **Empty Slot(암묵지) 발굴·채움** — 문서화되지 않은 운영 노하우 · 수작업 · 이례 대응 로직을 탐지·인터뷰·재구성해 Spec에 주입. 예: "특정일 구매 요청 폭주 시 Side Car 발동·트래픽 분산 규칙", "부정구매 패턴 사전 차단", "정산 불일치 수작업 보정 노하우의 시스템화".

**결과로서의 기준 재정의**: 행위 동등성은 여전히 계측하되, **Tier로 분리**한다.
- **Tier-A 핵심 서비스**: 행위 동등성 ≥ 95% + Empty Slot Fill Rate ≥ 70%
- **Tier-B 주변 서비스**: 행위 동등성 ≥ 70% + Scope 축소 허용
- **Tier-C 사용 저조**: 재현 불필요, Sunset 권고

이 재정의는 §2.2 KPI, §2.5 Core Service & Empty Slot 프레임, §5 Phase 계획, §10 의사결정, §13 Foundry-X 역할분담 전반에 반영된다.

---

## 2. 목표 및 범위

### 2.1 정성적 목표

1. **Spec의 AI-Ready 6기준 충족**을 기계적으로 측정 가능한 지표로 치환
2. **언어/스택 무관 범용 방법론** 확립 (우선 Java/Spring + Node/TS 2종 PoC)
3. **Vibe Coding 결과물의 비결정성을 Spec으로 통제**하는 반복 가능한 프로세스 확립
4. **두 Working Site(원본 vs. Spec 기반)의 행위 동등성** 을 정량적으로 비교·검증

### 2.2 정량적 목표 (KPI)

v1.2에서는 **§1.5 Mission Pivot**에 따라 행위 동등성을 Tier별로 분리하고, 입력 품질·암묵지·Foundry-X 통합 준비도를 계측하는 3종 KPI를 신설한다.

| 지표 | 정의 | 목표 (Phase 2 말) |
|------|------|---------------------|
| **Spec Coverage** | CPG 노드 중 Spec이 참조하는 비율 | ≥ 85% |
| **Spec-Code Gap** | Spec 조항 ↔ Code 심볼 매핑 실패율 | ≤ 10% |
| **Test Derivability** | Spec에서 자동 도출된 테스트 케이스 비율 | ≥ 70% |
| **Behavioral Equivalence · Tier-A(핵심)** | 핵심 서비스 Differential Test 통과율 | **≥ 95%** |
| **Behavioral Equivalence · Tier-B(주변)** | 주변 서비스 Differential Test 통과율 | **≥ 70%** |
| **Tier-C Sunset Rate** | Tier-C 분류된 기능 중 Sunset 권고 처리 비율 | ≥ 80% |
| **Reviewer Efficiency** | 도메인 전문가 Spec 1조항 리뷰 시간 | ≤ 2분 |
| **Reproducibility (Vibe Run ×5)** | 같은 Spec으로 5회 재생성 시 행위 일치율 | ≥ 90% |
| **v1.1: Harness Autonomy** | Spec→Working Site 자동 실행 성공률(개입 없이) | ≥ 80% |
| **v1.1: AI-Ready PassRate** | 6기준 전 조항 패스율 | ≥ 75% |
| **v1.2 신규: Empty Slot Fill Rate** | §2.5 프레임으로 식별된 암묵지 슬롯 중 Spec·테스트·Runbook 3자 바인딩 완료 비율 (Tier-A 한정) | **≥ 70%** |
| **v1.2 신규: Tacit Knowledge Coverage** | 핵심 서비스별 "이례/장애/수작업" 시나리오 중 Spec `rules/`·`invariants/`·`tests/scenarios/`에 캡처된 비율 | ≥ 60% |
| **v1.2 신규: Input Completeness Score** | 핵심 서비스별 (a) 코드 ∩ (b) 문서 ∩ (c) 운영로그 3원 교집합 스코어 (0~1, §2.5 공식) | ≥ 0.75 |
| **v1.2 신규: Foundry-X Integration Readiness** | Foundry-X Plumb triangle (specToCode·codeToTest·specToTest) 전 3축 matched ≥ 90% 도달한 Spec 비율 | ≥ 80% |

### 2.3 범위 (Scope)

**In Scope**
- 소스 코드 정적 분석 기반 Spec 자동 추출
- 산출물 문서(테이블정의서, API 설계서 등) 파싱 및 교차 검증
- Business/Technical/Quality Spec 3종 YAML/JSON 스키마 정의
- Vibe Coding(Claude Code / Spec Kit 연계) 대상 입력 포맷 정의
- 두 Working Site 간 Differential Testing 하네스
- **v1.1 추가**: Spec→Working Site 자동화 Harness(LangGraph 기반 5-Node 상태기계)
- **v1.1 추가**: 현재 Decode-X 프로토타입 마이그레이션 계획

**Out of Scope (Phase 1~2)**
- 암묵지(담당자 인터뷰)의 자동 구조화 — HITL(Human-in-the-loop)로 수동 진행
- 완전한 Formal Verification(Dafny/Coq 증명) — 경험적 검증 우선(단, Quality Spec 일부에만 Dafny 오버레이)
- 자연어 요구사항으로부터의 신규 Spec 생성(forward engineering)
- 레거시 COBOL / PL/SQL (Phase 3 이후 검토)

### 2.4 가정 및 제약

- 대상 프로젝트는 소스 저장소 접근이 가능하며, 최소한의 테스트/Runbook/ERD가 존재한다.
- Decode-X 내부에서 LLM 호출은 외부 API(Claude, GPT) 또는 내부 프라이빗 모델 중 하나 선택 가능.
- 폐쇄망 고객사 적용 시 코드박스 Appliance에 오프라인 배포 가능해야 한다 (AI Foundry OS §B-1 "Agent Runtime" 참조).
- **v1.2 추가**: 최초 입력 자료(코드·문서·로그)는 100% Working·무결점이 **아님을 전제**한다. 입력의 완결성·취약점은 §2.5로 계측하고, 누락분은 Empty Slot으로 명시적으로 관리한다.
- **v1.2 추가**: Decode-X는 Foundry-X의 Input Plane 생산자로 포지셔닝되며, 산출 Spec은 Foundry-X Plumb 엔진이 직접 소비 가능한 §4.3 컨테이너 포맷으로 출력한다.

### 2.5 Core Service & Empty Slot Analysis (v1.2 신설)

#### 2.5.1 왜 이 섹션이 필요한가

§1.5 Mission Pivot에 따라 Decode-X의 첫 번째 공정은 **"무엇을 Spec화할 것인가"를 선별하는 일**이다. 전체 레거시를 무차별 역공학하면 ROI가 나빠지고, 입력 자료를 맹신하면 불량 자산을 복제한다. 따라서 **(a) Core Service 식별 → (b) Input Completeness 평가 → (c) Empty Slot 발굴·채움** 3-단계 Pre-Spec 공정을 Phase 0~1에 앞당겨 배치한다.

#### 2.5.2 Core Service 식별 프레임 (3축 스코어)

도메인별 기능 후보에 대해 3축 스코어를 합산하고 상위 20%를 Tier-A, 다음 40%를 Tier-B, 나머지 40%를 Tier-C로 분류한다.

| 축 | 산출 방법 | 가중치 |
|----|-----------|--------|
| **Business Criticality** | 매출·법적·감독 노출도 (도메인 SME 1~5점) | 0.4 |
| **Operational Load** | 트래픽·트랜잭션량·에러율·수작업 시간 (운영 로그 4주 샘플) | 0.4 |
| **Change Pressure** | 최근 12개월 커밋·이슈·장애 티켓 수 (`git log`/Jira) | 0.2 |

Tier-A 기능만 Decode-X의 **풀 파이프라인**(§4.5 Harness + §6 Differential Testing)을 탄다. Tier-B는 경량 파이프라인(Spec 추출 + Pact만), Tier-C는 Sunset 권고(§2.2 Tier-C Sunset Rate).

#### 2.5.3 Input Completeness Score 공식

핵심 서비스 하나당 다음 3원(源) 교집합으로 완결성을 측정한다.

```
InputCompleteness(svc) =
      0.40 · coverage(code  ∩ svc)     ← CPG 노드 중 svc 관련 비율
    + 0.30 · coverage(docs  ∩ svc)     ← 문서 섹션 중 svc 매칭 비율
    + 0.30 · coverage(ops   ∩ svc)     ← 운영 로그/티켓 중 svc 매칭 비율
```

결과 < 0.75인 서비스는 **"Input Deficiency Flag"** 가 자동 부여되어 §2.5.5 Empty Slot 공정으로 강제 진입된다. §2.2의 Input Completeness Score KPI 목표는 Phase 2 말 ≥ 0.75(Tier-A 평균).

#### 2.5.4 Empty Slot 분류 체계

Empty Slot은 "Spec화되지 않은 암묵지 또는 운영 전환 규칙"이다. 다음 5종으로 분류한다.

| 종류 | 정의 | 탐지 신호 | 채움 방식 |
|------|------|-----------|-----------|
| **E1. Surge Handling** | 트래픽·요청 폭주 시의 Side Car · 우회 경로 | 과거 장애 티켓의 "수동 Rerouting", LB 메트릭 스파이크 | Runbook 인터뷰 + Daikon invariant + Load 시나리오 |
| **E2. Fraud / Abuse** | 부정 사용·공격 패턴의 사전 차단 로직 | Security 로그, 벤 리스트, 운영자 매뉴얼 | Policy-as-Code + EARS Inverse(negative) 조항 |
| **E3. Reconciliation** | 정산 불일치 수작업 보정 노하우 | 월말 스프레드시트, 정정 트랜잭션, 손익 조정 JE | Invariant (`sum(debit)==sum(credit)`) + 보정 Runbook |
| **E4. Exception Paths** | 드물게 발생하는 이례 케이스 (휴일·정기점검·특별 이벤트) | 휴일 캘린더, CS 티켓, 임시 플래그 | Event-driven EARS + Feature Flag 모델 |
| **E5. Operator Tacit** | 담당자 경험에 의존하는 판단 (이 계정은 수기 심사 등) | 운영자 인터뷰, 댓글·코멘트, Slack 이력 | HITL 세션 녹취 → Spec 추출 → SME 승인 |

각 Empty Slot은 다음 3자 바인딩이 완료되어야 "Filled"로 인정된다 — (1) `rules/` 하위의 EARS 혹은 Policy-as-Code 조항, (2) `tests/scenarios/` 또는 `tests/contract/` 하위의 실행 가능 테스트, (3) `runbooks/` 또는 `invariants/` 하위의 운영 절차 또는 불변식.

#### 2.5.5 Empty Slot 발굴 파이프라인

```
[자동 감지]                         [HITL 세션]                     [Spec 편입]
Code hot-spot (CPG centrality)  ──▶ Domain Archeologist 인터뷰 ──▶ EARS/Policy 드래프트
Ops log anomaly (p99 스파이크)   ──▶ Runbook 역추출              ──▶ Invariant 추출
Ticket cluster (topic model)     ──▶ 운영자 녹취                 ──▶ Test 스텁 생성
Manual spreadsheet (정산)        ──▶ 스프레드시트 로직 재구성   ──▶ Reconciliation 규칙
                                                                  │
                                                                  ▼
                                                         Spec 조항 + 테스트 + Runbook
                                                         3자 바인딩 검증 → Filled
```

#### 2.5.6 Worked Example — 전자온누리상품권

**Core Service 식별 결과(Tier-A 7개)**:
예산 / 충전 · 충전취소 / 구매 · 구매취소 / 결제 · 결제취소 / 환불 · 환불취소 / 선물 · 선물취소 / 정산.

**대표 Empty Slot 6건 (v1.2 §2.5.4 기준 분류)**:

| ID | Slot 설명 | 종류 | 현재 상태 | Filled 조건 |
|----|-----------|------|-----------|-------------|
| ES-GIFT-001 | "명절 직전 구매 요청 폭주 시 Side Car 인스턴스 발동 + 예산 큐 분산" | E1 Surge | Runbook 단편, SRE 암묵지 | EARS `WHEN reqRate > X THEN enable(sideCar)` + Load 시나리오 + 스케일 불변식 |
| ES-GIFT-002 | "선물코드 무단 반복 수집 봇 패턴 사전 차단" | E2 Fraud | 보안팀 블랙리스트 | `POL-GIFT-FRAUD-001` Inverse EARS + 패턴 테스트 + Rate-limit 계약 |
| ES-GIFT-003 | "가맹점 결제·취소·재결제 사이클의 수작업 정산 노하우" | E3 Reconcile | 월말 엑셀 + CS 메모 | `sum(settle.in) == sum(settle.out) − sum(refund)` 불변식 + JE Runbook + 보정 시나리오 |
| ES-GIFT-004 | "설·추석·지자체 특별지원금 이벤트의 한시 할인·한도 룰" | E4 Exception | 이벤트 공지 PDF, 임시 플래그 | Feature-flag 모델 + Event-driven EARS + 캘린더 fixture |
| ES-GIFT-005 | "특정 가맹점의 수기 심사(등급 심사·부정 의심) 판단 기준" | E5 Tacit | 담당자 경험 | 인터뷰 녹취 → 판단 규칙 표 → `POL-MERCHANT-REVIEW-*` + 심사 시나리오 |
| ES-GIFT-006 | "구매취소·환불 연쇄 시 회계 정합성 보정" | E3 Reconcile | 회계팀 매뉴얼 | 트랜잭션 상태 다이어그램 + `invariant: sum(chargeback)==sum(reverse_settle)` + GWT 시나리오 |

**Fill 결과(목표)**: Tier-A 핵심 7개 서비스 × 평균 8~12개 Slot → **Empty Slot Fill Rate ≥ 70%** 도달 시 Phase 2 완료.

#### 2.5.7 §2.5 공정과 §4.5 Harness의 연결

§2.5의 산출물(Tier 분류·Completeness Score·Empty Slot 목록)은 각 Spec 디렉터리의 `provenance.yaml`에 기록되어 §4.5 Harness 실행 시 **Pre-Gate 조건**으로 작동한다. Tier-A Spec이면서 Empty Slot이 "Filled" 상태가 아닌 조항이 있으면 Harness는 Code Gen 단계에 진입하지 않고 **즉시 Domain Archeologist 에스컬레이션**을 일으킨다.

---

## 3. 리서치 요약 및 방법론 선정

### 3.1 학술 논문 리서치 (15편+α, 9개 영역)

본 프로젝트의 방법론을 뒷받침하는 핵심 문헌을 9개 영역으로 조사했다 (부록 A 참조). v1.1에서는 **Spec 포맷 설계**와 **Automation Harness** 관련 문헌 8편을 추가했다.

**핵심 발견(v1.0 유지)**:

1. **Spec 생성은 코드 생성과 별개의 능력** — CodeSpecBench(2026)에서 최신 코딩 LLM들도 Spec 생성에서는 코드 생성 대비 현저히 낮은 성능을 보였다. 별도 파이프라인 설계가 필요하다.
2. **정적분석 + LLM + 검증기 하이브리드가 승자** — AutoSpec(CAV'24)은 순수 LLM 대비 1.6배 성능. SpecGen(ICSE'25)의 Mutation-Repair 루프가 "의미 일관성" 기준에 핵심.
3. **동적 불변식(Daikon)은 여전히 필수** — LLM 단독은 환각 위험. 실제 실행 트레이스로 경험적 근거를 앵커링해야 "완결성·테스트가능성" 확보.
4. **Differential Testing은 동등성 증명의 표준** — Csmith(PLDI'11), DART(PLDI'05), Google Cloud Dual Run(2025)이 동일 패턴. 전체 공식 검증 없이도 충분한 신뢰성 확보 가능.
5. **트레이서빌리티는 이미 해결된 연구 문제** — Cleland-Huang(2024) NLP for Traceability 수법을 채택하면 됨.

**v1.1 추가 발견**:

6. **Spec Kit/Kiro/Tessl은 모두 "YAML/MD frontmatter + bundled resources" 구조로 수렴 중** — 포맷 전쟁이 아니라 **컨테이너 전쟁**이며, 컨테이너는 Claude Skills 모델(SKILL.md + scripts/ + references/)이 사실상 표준이 되어가고 있다.
7. **Dafny/JML 등 형식 검증은 toy-scale에서만 유효** — Lohn et al.(2025)은 합성 96% 성공률을 보였으나, 실제 엔터프라이즈 코드에서는 92%가 문법-의미 Gap으로 실패. **Quality Spec의 불변식에만 선택 적용**이 현실적.
8. **EARS(Easy Approach to Requirements Syntax)가 "기계 판독 가능 + 사람 리뷰 가능"을 동시 달성** — Amazon Kiro가 채택한 WHEN/IF/WHILE/WHERE + SHALL 구문은 LLM이 테스트 케이스로 직접 변환 가능하면서 사람도 즉시 이해 가능.
9. **LangGraph 상태기계가 에이전트 오케스트레이션의 de-facto 백본** — CrewAI/AutoGen은 대화 중심, OpenAI Agents SDK는 단일 루프. **다중 단계 · 정지 조건 · 재시도가 명확한 Decode-X 하네스**에는 LangGraph가 가장 적합.
10. **Replay-driven verification이 Dual Run의 OSS 대안**으로 자리매김 — Replay.io + Temporal Worker Versioning 조합으로 "결정성 리플레이 + 버전 간 diff"를 엔터프라이즈급으로 구현.

### 3.2 OSS / 도구 조사 (32개+)

카테고리별 핵심 후보 (부록 B 전체 매핑, v1.1 추가분 ★★ 표시):

- **코드 분석 IR**: Joern/CPG (★ 1순위), tree-sitter, CodeQL, SCIP ★★(심볼 ID의 사실상 표준)
- **Spec 추출 보조**: OpenAPI Generator, SchemaSpy, Spectral, Apple Pkl, **Smithy IDL 2.0 ★★**
- **Spec 컨테이너 포맷**: GitHub Spec Kit(constitution + spec + plan + tasks), Claude Skills(SKILL.md + bundled resources), Amazon Kiro(requirements.md + design.md + tasks.md + EARS)
- **SDD 프레임워크**: GitHub Spec Kit(MIT, 2025), Amazon Kiro, Tessl(Spec Registry 10k+)
- **Equivalence Testing**: Playwright+Percy, Pact, Diffblue Cover, Replay.io, Google Cloud Dual Run(blueprint), **Temporal Worker Versioning ★★**
- **Agent Harness**: **LangGraph ★★(백본)**, CrewAI, AutoGen, OpenAI Agents SDK, Aider(lint/test hook)
- **Drift Detection**: Spectral, **oasdiff ★★**, **PactFlow Drift ★★** (3-layer CI)
- **Eval Harness**: SWE-bench Verified(Docker + pinned toolchain + git diff + pass@1), MLE-bench

### 3.3 산업 사례

| 사례 | 핵심 패턴 | Decode-X 시사점 |
|------|-----------|------------------|
| Google Cloud Dual Run | live event replay, 양쪽 결과 diff | Phase 2 검증 하네스 직접 차용 |
| IBM watsonx CA for Z (v2.8, 2025) | Discover → Refactor → Transform → Validate 4단계 | Phase 구조와 거의 동일 — 프로세스 검증됨 |
| Amazon Q Code Transformation | Selective transformation + agent | 부분 적용 전략 참조 |
| Palantir Foundry Ontology | 운영 온톨로지 = 비즈니스 Spec | Business Spec + KG 연결 방식 모델 |
| FINOS Legend (Goldman Sachs) | PURE DSL = 타입드 데이터 모델 | 우리 Spec Schema의 DSL화 고려 |
| Temporal | Replay + Worker Versioning으로 결정성 | 비결정성 통제의 엔지니어링 패턴 |
| **Claude Code Auto Mode (v1.1)** | 2-Layer Classifier + Tier-1 allowlist | Harness Guardrail 직접 차용 |
| **Anthropic Skills (v1.1)** | SKILL.md + Progressive Disclosure | Spec Container 모델 채택 |
| **Aider + SWE-bench (v1.1)** | git-native + lint/test hook + pass@1 | Harness Inner-Loop 블루프린트 |

### 3.4 후보 방법론 비교

조사 결과를 바탕으로 실행 가능한 **방법론 후보 4가지**를 비교한다.

| 항목 | A. Pure LLM | B. AST+LLM | C. **CPG + AutoSpec + Differential** ★ | D. Formal (Dafny/JML) |
|------|-------------|------------|----------------------------------------|------------------------|
| **접근** | 소스코드를 LLM에 주입, Spec 직접 생성 | tree-sitter AST → LLM로 요약 | Joern CPG IR → 정적분석 후보 → LLM 생성 → 검증기 → 변이복구 | 형식 명세 언어로 직접 증명 |
| **범용성(언어 무관)** | 높음 | 중간 | **높음** (CPG 언어 프론트엔드 12+) | 낮음 (언어별 검증 인프라 필요) |
| **6기준 충족도** | 1/6 | 3/6 | **6/6** | 4/6 (사람 리뷰 어려움) |
| **비결정성 통제** | 매우 약함 | 약함 | **강함** (검증기+변이복구 루프) | 매우 강함 |
| **초기 투자** | 낮음 | 중간 | 중간~높음 | 매우 높음 |
| **검증 가능성** | 낮음 | 중간 | **높음** | 매우 높음 |
| **확장성(레거시)** | 보통 | 보통 | **높음** | 낮음 |
| **학술적 근거** | 약함 | 제한적 | **AutoSpec·SpecGen·Daikon·Csmith** | Meyer·Leavens |
| **산업 레퍼런스** | 없음 | 일부 | **IBM watsonx CA/Dual Run과 유사** | 드묾 |

### 3.5 최종 선정: **Option C** — Hybrid Static-Dynamic + LLM + Differential

**근거**:
- 언어 무관 범용 방법론 요구를 CPG가 충족
- 6가지 Spec 기준을 기계적으로 검증 가능한 유일한 조합
- 산업 레퍼런스(IBM, Google, Amazon) 존재로 리스크 낮음
- 필요 시 Option D(Dafny/JML) 를 Quality Spec 일부에 오버레이 가능

**Decode-X 공식 방법론 스택** (부록 E Mapping 참조):
1. **Chikofsky-Cross Design Recovery** (1990) — 상위 프레임
2. **Yamaguchi Code Property Graph / Joern** (2014~) — 내부 IR
3. **AutoSpec + SpecGen**(2024~2025) — Technical Spec 추출 코어 루프
4. **Daikon Dynamic Invariants** (Ernst 2007) — Quality Spec 경험적 앵커
5. **Csmith / DART / Dual Run** — Spec ↔ Working Site 동등성 oracle
6. **Cleland-Huang NLP Traceability + Meyer DbC** — human-reviewable 직렬화

---

## 4. Decode-X 시스템 아키텍처

### 4.1 개념 구조 (Foundry-X Input Plane 정합)

AI Foundry OS Deep Dive v0.3의 **Input Plane 3단계(Source → Process → Output)** 구조와 정확히 대응한다.

```
┌─────────────────────┐   ┌─────────────────────────┐   ┌────────────────────────┐
│   ① SOURCE          │   │  ② PROCESS (Decode-X)   │   │  ③ OUTPUT (Spec 3종)   │
├─────────────────────┤   ├─────────────────────────┤   ├────────────────────────┤
│ Source Code         │──▶│ 2-1 AST / CPG 추출       │──▶│ 📘 Business Spec       │
│ DDL / ERD           │   │ 2-2 문서 RAG 파싱        │   │ 📗 Technical Spec      │
│ API 설계서          │   │ 2-3 (HITL) 암묵지 캡처   │   │ 📙 Quality Spec        │
│ Runbook             │   │ 2-4 정적분석 + LLM       │   │                        │
│ KMS/Wiki            │   │ 2-5 동적 불변식 마이닝   │   │ ↓                      │
│ (선택) 담당자 인터뷰│   │ 2-6 정합성 검증 (SDD)    │   │ Knowledge Graph        │
└─────────────────────┘   └─────────────────────────┘   └────────────────────────┘

                    [Spec → Vibe Coding → Working Site B]
                                    ↕ Differential Testing
                    [원본 Code → Working Site A]
```

### 4.2 논리 컴포넌트

#### 4.2.1 Ingestion Layer
- **Code Importer**: Git 저장소 clone, 빌드 구성 복원, 의존성 해결
- **Document Loader**: 테이블정의서(XLSX), API 설계서(HTML/DOC), Runbook(MD/PDF), KMS 연계
- **Schema Extractor**: SchemaSpy/SchemaCrawler로 JDBC DB → ERD/DDL 재구성

#### 4.2.2 Intermediate Representation (IR) Layer
- **CPG Builder (Joern)**: AST+CFG+PDG 통합 그래프
- **Symbol Index (SCIP)**: 심볼 교차참조, 트레이서빌리티의 앵커
- **Doc Graph**: 문서 섹션 → 개념 노드로 구조화, 코드 심볼과 링크

#### 4.2.3 Spec Extraction Layer
- **Business Rule Extractor**: CPG의 조건분기·예외처리 패턴 + 문서 정책을 매칭하여 if-then 규칙 생성
- **Contract Extractor** (SpecGen/AutoSpec 포팅): 메서드/API 경계의 Pre/Post/Invariant 후보를 LLM이 생성 → 정적분석으로 필터 → 변이복구
- **Invariant Miner** (Daikon 포팅): 테스트 실행 trace에서 likely invariant 추출
- **Quality Constraint Extractor**: 성능 로그·보안 정책·테스트 커버리지에서 Quality Spec 조항 생성

#### 4.2.4 Validation Layer
- **Triangle Gap Checker**: Spec ↔ Code ↔ Test 3자 매핑 갭을 정량 측정 (AI Foundry §A-1 2-4 대응)
- **Completeness Oracle**: BR/TR/QR 섹션별 누락 탐지 (Spectral ruleset 기반)
- **Reviewer UI**: 조항별 CPG 노드 하이라이트, 코멘트·승인 워크플로우

#### 4.2.5 Output Layer
- **Spec Serializer**: §4.3 권장 컨테이너(YAML frontmatter + Markdown + bundled resources) 생성
- **KG Publisher**: shared/kg.ts(Foundry-X SSOT)에 Spec 노드 · 엣지 등록
- **Vibe Coding Adapter**: GitHub Spec Kit 포맷(`constitution.md` + `spec.md` + `plan.md` + `tasks.md`)으로 export

#### 4.2.6 Equivalence Harness (Phase 2+)
- **Legacy Runner**: 원본 코드로 Working Site A 구동
- **Regen Runner**: Spec으로 Vibe Coding → Working Site B 구동
- **Differential Tester**:
  - API 레벨: Pact/PactFlow 계약 비교, 동일 요청 응답 차이
  - UI 레벨: Playwright 시나리오 + Percy 시각 diff
  - 데이터 레벨: 테스트 DB 상태 스냅샷 비교
- **Gap Reporter**: 차이 항목을 Spec 조항 또는 Spec gap으로 역귀속

### 4.3 Spec Schema 재설계 (원점 · v1.1 신설)

#### 4.3.1 재설계의 원칙

v1.0의 스키마는 "사람이 이해하고 LLM도 해석할 수 있는 중립 포맷"을 목표로 했다. v1.1은 **Spec의 1차 소비자가 VibeCoding 에이전트임을 전제**로 다음 5가지 원칙을 적용한다.

1. **Machine-Executable-First** — 모든 조항은 실행 가능한 아티팩트(OpenAPI 연산, JSON Schema, EARS 문장, Pact 계약, 불변식 표현)로 **1차 표현**을 가진다. 자연어 서술은 1차 표현의 **파생물**이며 `description` 필드에만 존재한다.
2. **3-Layer Container** — 컨테이너(외피)는 "YAML frontmatter + Markdown 본문 + 번들 리소스 디렉터리"로 고정하고, 그 안에 ① Executable Layer(기계 실행), ② Verifiable Layer(기계 검증), ③ Reviewable Layer(사람 리뷰)가 **병치**된다.
3. **Policy-as-Code** — 정책(BR)은 **조건-기준-산출(Condition-Criteria-Outcome)** 구조의 `POL-{DOMAIN}-{TYPE}-{SEQ}` 코드를 부여받고, EARS 구문과 자동 테스트 스텁을 필수 동반한다.
4. **Bidirectional Traceability by ID** — 모든 조항은 (a) SCIP 심볼 ID, (b) Joern CPG 노드 ID 둘 다에 링크된다. 링크는 Spec→Code와 Code→Spec 양방향.
5. **AI-Ready Built-in Scoring** — 6기준 각각의 점수는 스키마 내 `aiReady` 블록에 기계 계산값으로 저장되고, 조항 단위 PASS/FAIL 게이트가 된다.

#### 4.3.2 컨테이너 구조 (디렉터리 레이아웃)

```
specs/
├─ SPEC-2026-0001/                     # 하나의 Spec = 하나의 디렉터리
│  ├─ spec.md                          # 진입점 (YAML frontmatter + MD 본문)
│  ├─ contracts/
│  │  ├─ api.openapi.yaml              # ① Executable: REST (OpenAPI 3.1)
│  │  ├─ api.smithy                    # ① Executable: 서비스 계약 (Smithy 2.0)
│  │  ├─ events.asyncapi.yaml          # ① Executable: 비동기 계약 (AsyncAPI 3.x)
│  │  └─ data.jsonschema.json          # ① Executable: 데이터 계약 (JSON Schema 2020-12)
│  ├─ rules/
│  │  ├─ BR-0001.ears.md               # ② Verifiable: EARS 규칙
│  │  ├─ BR-0001.test.ts               # ③ Reviewable/Executable: 대응 테스트 스텁
│  │  └─ POL-USER-AUTH-0001.yaml       # ② Verifiable: 정책-as-코드
│  ├─ invariants/
│  │  ├─ daikon.inv                    # ② Verifiable: 동적 불변식
│  │  └─ dafny/                        # ② Verifiable: (선택) 형식 증명
│  ├─ traceability/
│  │  ├─ scip.jsonl                    # ④ Trace: SCIP 심볼 바인딩
│  │  └─ cpg-edges.jsonl               # ④ Trace: CPG 노드 바인딩
│  ├─ tests/
│  │  ├─ contract/                     # Pact 계약 테스트
│  │  ├─ scenarios/                    # Playwright 시나리오 스텁
│  │  └─ fixtures/                     # 테스트 데이터
│  └─ provenance.yaml                  # 추출 이력 + AI-Ready 점수
```

**특징**: Claude Skills의 "SKILL.md + bundled resources + Progressive Disclosure" 패턴을 Spec에 이식했다. `spec.md`만 로드하면 개요가 잡히고, 각 하위 디렉터리는 필요 시점에 에이전트가 `Read`로 펼친다.

#### 4.3.3 `spec.md` (진입점) Frontmatter 스키마

```yaml
---
specId: "SPEC-2026-0001"
version: "1.0.0"
kind: "module"                         # system | module | service | feature
name: "User Authentication"
owner: "team-platform@kt.com"
domain: "identity"
trustLevel: "verified"                 # draft | reviewed | verified

scope:
  system: "internet-banking"
  module: "auth"
  boundedContext: "IAM"

types: [business, technical, quality]  # 3종 중 포함된 타입

dependencies:
  upstream:  ["SPEC-2026-0007"]
  downstream:["SPEC-2026-0012", "SPEC-2026-0015"]

traceability:
  sourceRepo: "github.com/acme/legacy-internet-banking@a1b2c3d"
  sourceCommits: ["a1b2c3d"]
  scipIndex:  "traceability/scip.jsonl"
  cpgIndex:   "traceability/cpg-edges.jsonl"

contracts:                             # ① Executable Layer 인덱스
  rest:       "contracts/api.openapi.yaml"
  service:    "contracts/api.smithy"
  events:     "contracts/events.asyncapi.yaml"
  data:       "contracts/data.jsonschema.json"

rules:                                 # ② Verifiable Layer 인덱스
  ears:       ["rules/BR-0001.ears.md", "rules/BR-0002.ears.md"]
  policies:   ["rules/POL-USER-AUTH-0001.yaml"]
  invariants: ["invariants/daikon.inv"]

tests:                                 # ③ Executable Tests
  contract:   "tests/contract/"
  scenarios:  "tests/scenarios/"

aiReady:                               # AI-Ready 6기준 자동 채점
  machineReadable: 1.00                # ① 컨테이너 구조상 자동 1.0
  semanticConsistent: 0.92             # ② 변이복구 후 LLM voting 일치율
  testable: 0.88                       # ③ 조항 대비 테스트 스텁 커버리지
  traceable: 0.95                      # ④ SCIP+CPG 바인딩 커버리지
  complete: 0.81                       # ⑤ Spectral+Oracle 누락 감지
  humanReviewable: 0.90                # ⑥ Reviewer UX 샘플 시간 측정
  passRate: 0.91                       # 전체 6기준 가중 평균
  thresholds: { passRate: 0.75 }       # PASS/FAIL 게이트

provenance:
  extractionTool: "decode-x@1.1.0"
  extractedAt:    "2026-04-18T10:00:00Z"
  methods:        [cpg, autospec, daikon, hitl]
  modelSignature: "claude-sonnet-4-6@2026-03-15"
  confidence:     0.91
  humanReviewedBy:"jane.kim@kt.com"
  reviewStatus:   "approved"
  reviewedAt:     "2026-04-18T14:32:00Z"

vibeCoding:
  targetStack:    "ts/next/cloudflare-workers"
  generatorHints:
    framework:    "hono@4"
    auth:         "jose JWT"
    dbDialect:    "sqlite (d1)"
  guardrails:     "harness/guardrails.yaml"
  stopRules:      "harness/stop-rules.yaml"
  maxAttempts:    5
---
```

#### 4.3.4 ① Executable Layer — 기계 실행 계층

**원칙**: "사람이 다시 쓸 필요가 없는, 런타임이 바로 먹는 포맷"

| 도메인 | 포맷 | 이유 |
|---------|------|------|
| REST API | **OpenAPI 3.1 + JSON Schema 2020-12** | 최신 표준 통합, 스키마 `$dynamicRef` 지원으로 조합 용이 |
| 서비스 계약 | **Smithy IDL 2.0** | AWS가 채택한 서비스 지향 IDL, 프로토콜-독립(REST/gRPC/GraphQL 모두 타깃) |
| 비동기/이벤트 | **AsyncAPI 3.x** | 이벤트 스키마·채널·바인딩을 단일 문서로, CloudEvents 호환 |
| 데이터 스키마 | **JSON Schema 2020-12** | 유니버설, DDL 생성기 풍부 |
| 계약 테스트 | **Pact v3** | Consumer-driven contracts, Pact Broker로 버전 관리 |
| 테스트 시나리오 | **Playwright codegen** | 실행 가능한 E2E 스텁 |

**왜 다중 포맷인가** — 단일 포맷으로 모든 엔터프라이즈 계약을 커버하는 것은 비현실적이다. 대신 **포맷 간 상호변환기(Smithy → OpenAPI / Smithy → GraphQL / JSON Schema → DDL)** 를 `contracts/`에 함께 빌드한다. 각 포맷은 자기 도메인에서 최강이고, 에이전트는 자기 태스크에 맞는 표현을 선택한다.

#### 4.3.5 ② Verifiable Layer — 기계 검증 계층

**원칙**: "LLM의 출력을 기계가 검증 가능한 형태로 고정"

**EARS 구문 (Amazon Kiro 채택 표준)**:

```
# rules/BR-0001.ears.md
---
id: BR-0001
policyCode: POL-AUTH-LOGIN-0001
priority: P1
tags: [business-rule, security, auth]
sourceRefs:
  - { kind: code, scip: "scip-java:kt.acme.auth/LoginService#authenticate",  line: "87-102" }
  - { kind: doc,  docId: "internet-banking-api-v3", section: "3.2.1" }
testRefs:
  - "tests/contract/auth.login.pact.json#scenario-wrong-password"
  - "tests/scenarios/login.spec.ts#case-3-lockout"
---

## Rule

**WHEN** a user submits invalid credentials 5 consecutive times **THE SYSTEM SHALL** lock the account for 15 minutes and emit an `auth.account.locked` event.

### Clarifications
- "invalid credentials" = wrong password OR wrong TOTP
- window = rolling 15 minutes
- lock is per-user (not per-IP)

### Inverse (negative case)
**IF** the 5 attempts are interleaved with ≥ 1 successful login, **THEN** the counter resets.
```

EARS 패턴 5가지를 모두 지원: `Ubiquitous / Event-driven (WHEN) / State-driven (WHILE) / Unwanted (IF…THEN) / Optional (WHERE)`.

**Policy-as-Code 구조 (v1.1 채택)**:

```yaml
# rules/POL-USER-AUTH-0001.yaml
policyCode: POL-USER-AUTH-0001
domain: auth
policyType: security
sequence: 1
condition:
  and:
    - { fact: "attempt.credential", op: "invalid" }
    - { fact: "attempt.windowCount", op: ">=", value: 5 }
criteria:
  slo:
    - "lockout applied within 500ms of 5th failure"
  constraints:
    - "counter reset on success"
outcome:
  actions:
    - "account.lock(user_id, duration=PT15M)"
    - "events.publish('auth.account.locked', {user_id})"
  observability:
    metric: "auth.lockouts.count"
    log:    "auth.failed"
trust:
  confidence: 0.93
  reviewedBy: "security-team"
provenance:
  sourceRefs: ["scip-java:kt.acme.auth/LoginService#authenticate"]
  extractedBy:"autospec"
```

**불변식 포맷**:

- **Daikon `.inv`**: 경험적 앵커, 테스트 트레이스에서 추출한 likely invariant.
- **Dafny (선택)**: Quality Spec의 critical invariant에만 적용. 예) `ensures balance >= 0`.

#### 4.3.6 ③ Reviewable Layer — 사람 리뷰 계층

**원칙**: "사람은 Executable/Verifiable Layer의 **요약**만 본다. 원본은 에이전트가 본다."

`spec.md` 본문은 자동 렌더링되는 요약이며, 다음 섹션으로 구성:

1. **TL;DR (≤ 3문장)** — Purpose · Scope · 핵심 KPI 한 줄씩
2. **Decision Log** — 주요 설계 결정 5개 이하, 각 1줄
3. **Rules at a Glance** — BR 조항 ID · 한 줄 설명 · 우선순위 테이블
4. **API Surface** — OpenAPI에서 자동 추출한 엔드포인트 표
5. **Known Gaps** — Completeness Oracle이 탐지한 누락/모순 리스트
6. **AI-Ready Scorecard** — 6기준 점수 시각화

Reviewer UI는 이 `spec.md`를 MDX로 렌더링하되, 각 조항 토큰을 클릭하면 **자동으로 관련 CPG 노드·테스트 스텁·SCIP 심볼을 사이드패널에서 펼친다**. 조항당 리뷰 시간 ≤ 2분(§2.2 KPI) 달성의 핵심 메커니즘.

#### 4.3.7 ④ Traceability — 양방향 트레이스

```jsonl
# traceability/scip.jsonl (예시)
{"specId":"SPEC-2026-0001","clause":"BR-0001","scipSymbol":"scip-java:kt.acme.auth/LoginService#authenticate(StringString).","kind":"primary"}
{"specId":"SPEC-2026-0001","clause":"BR-0001","scipSymbol":"scip-java:kt.acme.auth/LockoutPolicy#apply(Long).","kind":"co-binding"}

# traceability/cpg-edges.jsonl (예시)
{"specId":"SPEC-2026-0001","clause":"BR-0001","cpgNodeId":"n:4821","edgeKind":"IMPLEMENTS"}
{"specId":"SPEC-2026-0001","clause":"BR-0001","cpgNodeId":"n:4833","edgeKind":"DEPENDS_ON"}
```

**역방향 인덱스**는 `services/svc-spec-index/`에서 매 빌드 시 재구축된다. 덕분에 "이 함수가 어떤 Spec 조항에 연결되어 있는가?"를 O(1)에 조회할 수 있고, 리팩터링 시 영향 범위 분석(Impact Analysis)이 즉시 가능하다.

#### 4.3.8 Spec 간 구성(Composition) 규칙

- **Include**: 상위 Spec이 하위 Spec을 `dependencies.upstream`으로 선언. 하위 Spec의 Executable Layer가 상위에 자동 재귀적으로 포함됨.
- **Override**: 상위 Spec은 특정 조항에 한해 `overrides: { clauseId: "BR-0001", reason: "..." }`로 재정의 가능. 감사 로그 자동 기록.
- **Supersede/Contradict**: v1.0의 `supersedes/contradicts` 엣지를 유지. 신구 버전 혼재 시 `provenance.reviewStatus`가 우선.

#### 4.3.9 v1.0 → v1.1 스키마 변경 요약

| 항목 | v1.0 | v1.1 |
|------|------|------|
| 컨테이너 | 단일 YAML | 디렉터리 + spec.md + bundled resources |
| BR 표현 | `{ when, then }` 자연어 중심 | EARS 5-pattern + Policy-as-Code(`POL-*`) |
| API 스키마 | OpenAPI 참조만 | OpenAPI 3.1 + Smithy 2.0 + AsyncAPI 3.x 병렬 |
| 데이터 | DDL/ERD 참조 | JSON Schema 2020-12 네이티브 |
| Trace | 1방향 | **양방향(SCIP + CPG)** |
| AI-Ready 점수 | 별도 리포트 | **스키마 내장(`aiReady` 블록)** |
| Vibe 입력 | Spec Kit export | `vibeCoding` 블록 + guardrails/stop-rules 참조 |

### 4.4 Knowledge Graph 연결 (Foundry-X Ontology 정합)

AI Foundry OS §B-1 Ontology 영역의 shared/kg.ts SSOT에 다음과 같이 등록된다.

- **Node Types**: `Spec`, `Rule`, `Policy`, `API`, `Table`, `Test`, `Term`, `Actor`, `Document`, `Invariant`
- **Edge Types**: `implements`, `tests`, `depends_on`, `references`, `supersedes`, `contradicts`, `overrides`, `binds_to_symbol`, `binds_to_cpg_node`
- **Explainability(XAI)**: 결정 경로를 KG 경로로 자동 직렬화 (§B-1 XAI 요구)

### 4.5 VibeCoding Automation Harness (v1.1 신설)

#### 4.5.1 설계 원칙

"Spec을 입력하면 Working Site가 나온다"가 작동하려면 단순한 프롬프트 체인이 아니라 **상태기계 + 가드레일 + 정지 조건**을 갖춘 하네스가 필요하다. 본 하네스는 다음 3요소로 구성된다.

1. **Backbone**: LangGraph 기반 5-Node 상태기계 — Spec Load → Test Compile → Code Gen → Run & Diff → Decide
2. **Guardrail**: Claude Code Auto Mode 스타일 2-Layer Classifier + Tier-1 Allowlist
3. **Inner Loop**: Aider(lint/test hook) + SWE-bench Verified(Docker + pinned toolchain + git diff + pass@1) 블루프린트

#### 4.5.2 5-Node 상태기계 (LangGraph)

```
                ┌──────────────┐
                │ 1. Spec Load │  Spec 디렉터리 로드, AI-Ready 게이트 통과 확인
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │ 2. Test      │  OpenAPI/JSON Schema → Pact/Playwright 스텁 컴파일
                │    Compile   │  EARS → Given-When-Then 변환
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │ 3. Code Gen  │  Vibe 에이전트(Claude Code)가 Spec 읽고 코드 생성
                │  (Attempt N) │  git branch `vibe/run-{N}`에 커밋
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │ 4. Run &     │  Docker build → lint → unit → contract → scenario →
                │    Diff      │  Dual Run(원본 vs 신규) → 결과 수집
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │ 5. Decide    │  PASS → merge, FAIL → root cause 분류 → 
                │              │  (a) Spec gap? (b) Gen 문제? (c) 환경 문제?
                └──────┬───────┘
                       │
              ┌────────┴─────────┐
           PASS                FAIL
              │                  │
              ▼                  ▼
         [Publish]        [Repair Loop]
                            ├─ Spec 보강(AutoSpec 변이복구)
                            ├─ Re-generate(Attempt N+1)
                            └─ maxAttempts 초과 시 Escalate to Human
```

**상태 전이 규칙**:
- 모든 노드는 멱등(idempotent). 중간 실패 시 체크포인트로 재개 가능.
- 각 노드는 structured output(JSON)으로 다음 노드와 통신. 자유 텍스트는 금지.
- 전체 실행은 `harness/run-{timestamp}.jsonl`로 append-only 로깅 → Replay.io 스타일 결정성 재생.

#### 4.5.3 Guardrail: 2-Layer Classifier + Tier-1 Allowlist

Claude Code Auto Mode의 패턴을 차용하여, **에이전트의 모든 툴 호출 전에 2단계 필터**를 적용한다.

**Layer 1 — Coarse Classifier (Rule-based)**:
- **Tier-1 Allowlist**: 자동 승인 (git status, npm test, typecheck, lint, read files within repo)
- **Tier-2 Caution**: 요약 후 진행 (run tests with side effects, install packages)
- **Tier-3 Blocklist**: 자동 거부 (rm -rf, git push --force, network calls to non-allowlisted hosts, writes outside repo)

**Layer 2 — Fine Classifier (LLM-judged)**:
- Tier-2 요청에 대해 "Spec 맥락상 필요한가?" 판정.
- 3회 연속 Tier-2 발생 시 사람 에스컬레이션.

**Context Window 관리**:
- 에이전트가 읽을 수 있는 파일 수 상한: 기본 20, Spec 크기에 비례 증가.
- Spec `vibeCoding.maxAttempts` (기본 5) 초과 시 루프 종료.

#### 4.5.4 Inner Loop: Aider + SWE-bench 스타일 하네스

**Aider 패턴 차용**:
- **git-native**: 각 Code Gen Attempt는 별도 브랜치, 각 수정은 별도 커밋.
- **lint/test hook**: 코드 생성 직후 자동으로 lint+test 실행, 실패 시 에이전트가 자가 수정.
- **edit format**: `search/replace` 블록만 허용, 전체 파일 재생성 금지 (diff 최소화).

**SWE-bench Verified 패턴 차용**:
- **Pinned toolchain**: Docker 이미지에 Node/Java/Python 버전 고정, `pnpm-lock.yaml` 및 `package-lock.json` 필수.
- **Pass@1 metric**: 같은 Spec으로 5회 실행 후 행위 일치율 ≥ 90% (§2.2 Reproducibility 대응).
- **Deterministic test runner**: 난수 시드 고정, 시간 의존성(`Date.now`) mock, 네트워크 mock.

#### 4.5.5 Stop Rules (Spec 내장)

```yaml
# harness/stop-rules.yaml
stopOn:
  - reason: "maxAttempts reached"
    threshold: { attempts: 5 }
  - reason: "budget exhausted"
    threshold: { costUSD: 50 }
  - reason: "tier-3 violation"
    threshold: { count: 1 }
  - reason: "equivalence plateau"
    description: "3 consecutive attempts with same failing diff"
escalate:
  to: "human-reviewer@kt.com"
  bundle:
    - "harness/run-{ts}.jsonl"
    - "specs/{id}/spec.md"
    - "artifacts/last-attempt/"
```

#### 4.5.6 Drift Detection (CI 3-Layer)

Spec이 일단 검증되고 배포되면, 원본 코드가 변경될 때 Spec이 **자동으로 유효성을 잃는다**. 이를 감지하기 위해 3-Layer CI를 도입:

1. **Spectral**: Spec 내부 린트 (OpenAPI·JSON Schema 형식 오류).
2. **oasdiff**: OpenAPI 버전 간 Breaking Change 감지.
3. **PactFlow Drift**: 실제 호출 trace와 계약 사이의 drift 탐지.

3-Layer 모두 통과해야 Spec 버전이 상승한다.

#### 4.5.7 Observability & Replay

- 각 실행은 `harness/run-{timestamp}.jsonl`에 append-only로 로깅 (단계·프롬프트·응답·툴콜 전체).
- Replay.io 호환 포맷으로 저장하여 결정성 리플레이 가능.
- Temporal Worker Versioning 패턴으로 버전별 워커 격리 → 모델 업그레이드 시 리그레션 격리.

#### 4.5.8 KPI (Harness 전용)

| 지표 | 목표 |
|------|------|
| Autonomy | ≥ 80% (개입 없이 PASS) |
| Mean Attempts to PASS | ≤ 2.5 |
| Mean Cost per PASS | ≤ $5 |
| Tier-3 Violation Rate | 0 (0에 수렴) |
| Escalation Quality | 에스컬레이션 번들만으로 사람이 15분 내 판단 가능 |

---

## 5. 단계별 실행 계획

### Phase 0 · 준비 (4주)

- 기술 조사 정리 및 벤치마크 환경 구성(Joern, SchemaSpy, Spec Kit 튜토리얼)
- **v1.1 추가**: Spec Schema v1.0(§4.3) 확정, JSON Schema 2020-12 자동 검증기 구현
- 파일럿 대상 2개 선정 (Java/Spring 1개, Node/TS 1개)
- 성공/실패 판정 기준(§2.2 KPI) 승인

**산출물**: 기술조사 보고서, Spec Schema v1.0, 벤치마크 세트(소규모 20 API)

### Phase 1 · 단일 모듈 PoC (10주)

**1-1 Ingestion / IR (3주)** — Git clone 자동화, CPG 빌드, SchemaSpy 연계, tree-sitter fallback
**1-2 Business / Technical Spec Extractor (4주)** — 정적분석 → LLM(AutoSpec 스타일) → 검증기 루프, OpenAPI 자동 생성, BR 후보 생성(EARS 자동 변환)
**1-3 Validation + Reviewer UI (3주)** — Triangle Gap Checker, Spectral ruleset, Reviewer 웹 앱(Next.js) 최소 기능
**v1.1 추가**: Harness 5-Node 상태기계 스켈레톤 구현 (Attempt 1회만)

**완료 조건(Exit Criteria)**: 파일럿 1개 모듈에서 KPI 모두 Phase 1 목표치(예: Coverage ≥ 60%, Gap ≤ 20%) 충족, Harness Autonomy ≥ 50%

### Phase 2 · 파일럿 시스템 적용 + Equivalence Harness (12주)

- **2-1** 파일럿 시스템(50+ API, 100+ 테이블) 전체 Spec 추출
- **2-2** Spec → Vibe Coding (GitHub Spec Kit + Claude Code Skills 조합) 파이프라인 구성
- **2-3** **두 Working Site 구동**: (A) 원본 코드, (B) Spec 기반 재생성
- **2-4** Differential Testing 하네스: Playwright+Percy, Pact, 데이터 스냅샷
- **2-5** Vibe Run ×5 반복 재생산성 검증
- **v1.1 추가 2-6**: Harness 풀 5-Node + 2-Layer Guardrail + 3-Layer Drift CI 운영
- **v1.1 추가 2-7**: Drift Detection 파이프라인(Spectral + oasdiff + PactFlow) Green

**완료 조건**: 행위 동등성 ≥ 95%, 재생산성(×5) ≥ 90%, **Harness Autonomy ≥ 80%, AI-Ready PassRate ≥ 75%**

### Phase 3 · 도메인 확장 (16주)

- Quality Spec 고도화: Daikon 동적 불변식 + 성능/보안 조항 자동 생성
- 암묵지 HITL 파이프라인 정식 도입 (TA Agent · AI Makers 연계)
- 2개 스택 추가 확장 (Python/Django, C#/.NET) 또는 금융·공공 도메인 용어사전 탑재
- 폐쇄망 코드박스 Appliance 패키징
- **v1.1 추가**: Dafny 오버레이를 Quality Spec 핵심 불변식 일부에 선택 적용

### Phase 4 · GTM 준비 (8주)

- 대고객 오퍼링 자료, 요금/가격 모델
- 운영 Runbook, SLA 정의
- Foundry-X 메타 적용 결과 사례 공개 (§B-4 대응)

### 일정 개요 (간트 요약)

```
Phase 0 [████]                                   (W1-W4)
Phase 1      [██████████]                        (W5-W14)
Phase 2                 [████████████]           (W15-W26)
Phase 3                             [████████████████] (W27-W42)
Phase 4                                             [████████] (W43-W50)
```

총 50주(≈12개월) 기준. 병렬화 가능한 항목은 팀 구성에 따라 단축 가능.

---

## 6. 검증 전략 (상세)

### 6.1 "두 Working Site" 비교 프로토콜

1. **Seed 확보**: 파일럿 시스템의 스모크 시나리오 20~50개를 Playwright 스크립트로 녹화
2. **Working Site A**: 원본 코드를 동일 조건(Docker Compose, 테스트 DB fixture)에서 기동
3. **Working Site B**: 추출된 Spec을 Vibe Coding 입력으로 삼아 재생성한 구현을 동일 조건에서 기동
4. **동등성 측정**:
   - **HTTP 레벨**: 동일 요청 시퀀스에 대한 응답 JSON 구조·필드 동등성(허용 오차 설정)
   - **DB 레벨**: 트랜잭션 종료 후 스냅샷 diff
   - **UI 레벨**: Playwright + Percy 픽셀 diff (동적 영역 마스킹)
   - **성능 레벨**: p95 응답시간 차이 ±20% 이내
5. **재생산성(Reproducibility)**: 동일 Spec에 대해 Vibe Run을 5회 반복하여 각 Site B의 행위 상호 일치율 측정

### 6.2 Differential Test 구조

```
                 ┌─────────────┐
    Seed Traffic │ Test Runner │──┬──▶ Working Site A (원본)
    (N=200~)     └─────────────┘  │    ├─ API response
                                  │    ├─ DB snapshot
                                  │    └─ UI screenshot
                                  │
                                  └──▶ Working Site B (Spec 재생성)
                                       ├─ (동일)
                                       ├─ (동일)
                                       └─ (동일)

            [Divergence Report]
            ─ Spec 조항 역귀속
            ─ Gap 우선순위(P0~P3)
```

### 6.3 성공 판정 (Acceptance Criteria)

- **Go**: §2.2 KPI 전부 Phase 2 목표치 충족 + 최소 1개 파일럿에서 3회 연속 재생성 일치
- **Iterate**: Gap ≤ 20%일 경우 Spec 보완으로 루프
- **No-Go**: Spec-Code Gap > 30% 또는 동등성 < 80% → 전략 재검토

---

## 7. 리스크 및 대응

| ID | 리스크 | 확률 | 영향 | 대응 |
|----|--------|------|------|------|
| R1 | LLM 비용 급증 | 중 | 중 | 캐싱(semantic cache) + 프라이빗 모델 혼용, Spec별 호출 수 상한 |
| R2 | Joern CPG가 특정 레거시(JSP, MyBatis XML 등) 미지원 | 중 | 중 | tree-sitter/ANTLR 폴백, 커스텀 노드 타입 확장 |
| R3 | 문서 품질 편차 | 높음 | 중 | 문서 없을 때 CPG 우선, HITL 보강 |
| R4 | Vibe Coding 결과 비결정성 제어 실패 | 중 | 높음 | Seed 고정 + 샘플 K회 Self-Consistency 투표, Temperature 낮춤, Harness maxAttempts=5 |
| R5 | 도메인 전문가 Review 병목 | 높음 | 높음 | 조항별 ≤ 2분 Review UX, 우선순위 기반 샘플링 승인 |
| R6 | 폐쇄망 고객사 제약 | 중 | 높음 | 코드박스 Appliance 오프라인 패키지, 프라이빗 LLM 옵션 |
| R7 | 저작권/라이선스(원본 코드) | 중 | 높음 | 사전 계약 명시, Spec은 파생물로 처리 |
| R8 | AutoSpec/SpecGen 내부 검증기 스케일 | 중 | 중 | 샘플 단위 검증 + 커버리지 기반 부분 적용 |
| **R9(v1.1)** | Harness의 Tier-3 오판 → 프로덕션 영향 | 낮음 | 매우 높음 | 2-Layer Classifier + 격리된 Docker 환경 + 네트워크 allowlist, 프로덕션은 Approver 필수 |
| **R10(v1.1)** | Spec Schema v1.0의 하위 호환 파괴 | 중 | 중 | v0→v1 변환기 제공, 양 포맷 6개월 병행 지원 |
| **R11(v1.1)** | 프로토타입 마이그레이션 지연 | 중 | 높음 | §12 마이그레이션 로드맵 준수, 프로토타입은 "Shadow Mode"로 계속 운영하며 병행 검증 |
| **R12(v1.2)** | 최초 입력 자료 불완전 → 불량 자산을 충실히 복제 | **높음** | 매우 높음 | §2.5 Core Service & Empty Slot 공정 강제, Input Completeness < 0.75 서비스는 자동 Empty Slot 공정 투입, Tier-A는 Empty Slot "Filled" 전까지 Harness 진입 차단 |
| **R13(v1.2)** | Foundry-X 버전 스큐(Sprint-per-week 빠른 진화) → Spec 포맷 drift | 중 | 높음 | Foundry-X SPEC.md SSOT 및 Plumb Output Contract(FX-SPEC-002)의 major 버전에 고정, monthly sync 미팅, Decode-X 산출물은 Plumb triangle 자체 검증 후 제출 |
| **R14(v1.2)** | 암묵지 추출 과정에서 민감 업무 노하우 유출 | 중 | 높음 | Domain Archeologist 세션은 폐쇄망·녹취 제한, Empty Slot 번들에 민감도 태깅, SME 승인 없이 외부 반출 금지 |
| **R15(v1.2)** | Mission Pivot 오해 → 현업에서 "레거시를 대충 만들어도 된다"고 해석 | 중 | 중 | §1.5·§2.5 Tier 체계를 이해관계자에 1-page 요약 배포, Tier-A는 95%/70%/Fill 기준을 **강화**한 것임을 명시 |

---

## 8. 조직 / 역할 (R&R)

| 역할 | 인원(권장) | 주요 책임 |
|------|------------|-----------|
| **Project Manager** | 1 | 일정·리스크·이해관계자 관리 (Sinclair) |
| **Spec Architect** | 1 | Spec Schema, KG 설계, 방법론 오너 |
| **Code Analysis Lead** | 1 | Joern/CPG, SCIP, tree-sitter 파이프라인 |
| **LLM Engineer** | 2 | AutoSpec/SpecGen 포팅, RAG, Evaluator-Optimizer |
| **Verification Lead** | 1 | Differential Testing, Playwright/Pact 하네스 |
| **Harness Engineer (v1.1)** | 1 | LangGraph 상태기계, Guardrail, Drift CI |
| **Domain Archeologist (v1.2)** | 1 | §2.5 Core Service 식별·Input Completeness 측정·Empty Slot 발굴·Runbook 역추출 전담. SME 인터뷰·운영자 녹취·스프레드시트 로직 재구성 주도. |
| **Foundry-X Integration Liaison (v1.2)** | 0.5 | Foundry-X 팀 brance 매주 sync, Plumb Output Contract 정합 검증, 버전 스큐 관리(R13) |
| **Full-stack Engineer** | 2 | Reviewer UI, API, 배포 |
| **Domain SME (Part-time)** | 2~3 | 파일럿 도메인 전문가 (금융·공공) |
| **Tech Writer / QA** | 1 | 산출물 정리, 릴리즈 노트 |

총 약 13명 (풀타임 환산 12명 + 0.5 liaison), 12개월 기준.

---

## 9. 예산 / 자원 (개략)

- **인건비(내부)**: 12명 × 12개월 (현실 조직 기준 별도 추정)
- **인프라**:
  - CPG 분석용 클러스터(8~16 vCPU, 64GB+ RAM)
  - LLM 토큰 비용: Spec 1조항 평균 $0.02~0.08 추정, Phase 1 예상 ~$5k, Phase 2 ~$20k
  - Harness 실행 비용(v1.1): 파일럿 기준 $200/주 예상
  - Cloudflare Workers + D1 (Agent Runtime, §B-1 참조)
- **툴 라이선스**: Percy 또는 Applitools, Diffblue Cover(선택), Sourcegraph Enterprise(선택)
- **코드박스 Appliance**: 고객 현장 1기 기준 하드웨어 별도 (내부 보유품 활용)

※ 상세 예산은 조직 내부 단가 기준 별도 시트로 관리.

---

## 10. 의사결정 포인트 (Next Steps)

즉시 결정이 필요한 항목 (v1.1 업데이트):

1. **파일럿 대상 2개 확정** — 후보 시스템 리스트업 및 접근 권한 확보 (기존 LPON 연금 848정책·Miraeasset 2,827정책 → Decode-X 프로토타입이 이미 적용 중, **그대로 Option C 마이그레이션 파일럿으로 승계 권고**)
2. **LLM 벤더 선정** — Claude / OpenAI / 프라이빗 중 기본 모델과 예비 모델 (현재 프로토타입: OpenRouter→Haiku. **권고: 기본 Claude Sonnet 4.6, 예비 Haiku 4.5**)
3. **Spec Container 포맷 확정 (v1.1)** — v1.1 권장 디렉터리 구조 vs. 프로토타입 현행(JSON 블록) 병행 기간 결정
4. **Vibe Coding 플랫폼** — GitHub Spec Kit vs. Amazon Kiro vs. Claude Code Skills 커스텀 (**권고: 엔진은 Claude Code, 컨테이너는 Spec Kit 호환, 규칙 표기는 EARS**)
5. **검증 Testing 스택** — Playwright+Percy(유력) vs. Applitools vs. BackstopJS
6. **법무/라이선스 검토** — 원본 코드 사용 동의, Spec 파생물 귀속 계약
7. **v1.1 신규: Harness Backbone 선정** — LangGraph(권고) vs. Temporal vs. 자체 구현
8. **v1.1 신규: 프로토타입 마이그레이션 승인** — §12의 4-Phase Migration Plan 착수 여부 및 스폰서 합의
9. **v1.2 신규: Mission Pivot 승인** — §1.5의 "Copy Machine 프레임 폐기, AI-Centric 체질 전환" 공식 채택 + §2.2 KPI Tier(A/B/C) 재조정 + §2.5 Core Service 식별 공정 착수 시점 확정. **권고: 즉시 승인, Phase 0 4주 내 Tier 분류 완료**.
10. **v1.2 신규: Foundry-X 역할 분담 확정** — §13의 "Decode-X = Input Plane Producer / Foundry-X = Process·Output Plane Orchestrator" 공식화 + 공통 매개체(Git + SPEC.md SSOT + Plumb `decisions.jsonl`) + Foundry-X Integration Liaison 지정. **권고: KT DS AXBD 조직 차원의 2-team MoU 형태로 합의, Decode-X 산출은 Foundry-X Plumb triangle 통과를 PASS 조건에 포함**.

---

## 11. 메타 적용 (Foundry-X 자기증명)

AI Foundry OS §B-4는 "Foundry-X가 자기 자신을 개발하는 데 Spec/Harness/Engine/Ontology를 사용 중"이라고 기술한다. Decode-X 역시 **자체 개발 과정에 Decode-X를 적용**하여:

- Decode-X 코드베이스 → Decode-X Spec 추출 → Decode-X v.next 재생성
- Sprint 단위 재생산성 측정 (Reproducibility ≥ 90% 유지)
- "방법론 자기증명(Self-proving methodology)"의 첫 대외 사례로 포지셔닝

---

## 12. Prototype Gap Analysis (v1.1 신설)

### 12.1 분석 범위

- **대상**: 현재 운영 중인 Decode-X 프로토타입
  - GitHub: https://github.com/KTDS-AXBD/Decode-X
  - Live Spec Viewer: https://rx.minu.best/org-spec
- **접근 수단**: 공개 레포(GitHub SPEC.md, CLAUDE.md, PRD.md, 소스) + 렌더된 org-spec React 페이지 소스
- **기준선**: v1.1 §4.3 권장 Spec Schema + §4.5 권장 Harness + Option C 방법론 스택

### 12.2 현재 프로토타입 아키텍처 스냅샷

**전체 구성** (GitHub SPEC.md Phase 0~5, 2026-04-17 PoC 기준):

| 계층 | 구성 | 비고 |
|------|------|------|
| Compute | Cloudflare Workers 7개 (`svc-skill`, `svc-meta`, `svc-foundry`, `svc-ingest`, `svc-ontology`, `svc-report`, `svc-gateway`) | 5-Stage 파이프라인 |
| Storage | D1 5개 DB, R2, Neo4j Aura(KG), Cloudflare Queues | 메타/스킬/온톨로지 분리 |
| Frontend | Pages SPA (React + Vite), app-web | Reviewer UI 원형 |
| Gateway | AI Gateway(Cloudflare), MCP Streamable HTTP | 외부 연계 |
| Spec 생성 | **Template+LLM Hybrid** (Sprint 208) | `GET /skills/:id/spec/{business\|technical\|quality\|all}` |
| 데이터 | LPON(연금 848정책), Miraeasset(2,827정책) 적용 중 | 2-org 파일럿 |
| Skill Bundling | LPON 848→11, Miraeasset 3065→15 (AIF-REQ-025) | 반제품-스펙 디렉터리 |

**현재 Spec 생성 흐름**:
1. 레거시 소스 chunks + 문서 chunks → LLM(OpenRouter→Haiku)이 B/T/Q 3종 텍스트 생성
2. 각 스킬(=모듈)별로 `spec/business.md`, `spec/technical.md`, `spec/quality.md` 생성
3. 조직 단위 aggregation: `GET /org/:id/spec/{type}` (Sprint 209 DONE)
4. AI-Ready 6-criteria 스코어러 in-progress (Sprint 210)
5. org-spec React 뷰(https://rx.minu.best/org-spec): Skills count, policy count, avg trust, type scores + Markdown 렌더링

**현재 측정치**:
- Technical Spec 점수: **4.3%**
- AI-Ready passRate: **23.6%** (목표 ≥ 50%)

### 12.3 Gap Matrix: 프로토타입 ↔ Option C 권장안

| 영역 | 프로토타입 현재 | v1.1 권장안(§4.3·§4.5) | Gap 심각도 | 우선순위 |
|------|----------------|----------------------------|------|----------|
| **내부 IR** | chunks + LLM 추출 (IR 없음) | **Joern CPG + SCIP** 양방향 바인딩 | 🔴 Critical | P0 |
| **Spec 컨테이너** | 단일 MD 파일(`business.md`/`technical.md`/`quality.md`) | **디렉터리 + spec.md + bundled resources** | 🟠 High | P1 |
| **BR 표현** | 자연어 요약 | **EARS 5-pattern + POL-* Policy-as-Code** | 🟠 High | P1 |
| **API 스키마** | 서술적 Markdown | **OpenAPI 3.1 + Smithy 2.0 + AsyncAPI 3.x** | 🟠 High | P1 |
| **데이터 계약** | 서술적 요약 | **JSON Schema 2020-12 네이티브** | 🟡 Med | P2 |
| **Traceability** | 없음/약함 | **SCIP symbolId + CPG nodeId 양방향** | 🔴 Critical | P0 |
| **AI-Ready 스코어** | 별도 리포트 (passRate 23.6%) | **스키마 내장, 조항단위 PASS/FAIL 게이트** | 🟠 High | P1 |
| **Differential Testing** | 없음 | **Csmith/DART/Dual Run 패턴 + Playwright+Percy+Pact** | 🔴 Critical | P0 |
| **동적 불변식(Daikon)** | 없음 | **테스트 trace → likely invariant 자동 추출** | 🟡 Med | P2 |
| **Harness Backbone** | 요청-응답 API만 존재 | **LangGraph 5-Node 상태기계** | 🔴 Critical | P0 |
| **Guardrail** | 없음 | **2-Layer Classifier + Tier-1 Allowlist** | 🟠 High | P1 |
| **Inner Loop (Aider)** | 없음 | **git-native + lint/test hook + search/replace diff** | 🟠 High | P1 |
| **Drift Detection** | 없음 | **Spectral + oasdiff + PactFlow 3-Layer CI** | 🟡 Med | P2 |
| **Replay/Observability** | 기본 로깅 | **Replay.io 호환 결정성 리플레이** | 🟢 Low | P3 |
| **Reviewer UX** | org-spec React 뷰(탭: B/T/Q + Markdown) | **조항 클릭 → CPG/SCIP/Test 사이드 패널** | 🟡 Med | P2 |
| **Skill Bundling** | ✅ 이미 구현 (LPON 848→11, Miraeasset 3065→15) | 유지 | — | 유지 |
| **Foundry-X 통합** | ✅ AIF-REQ-026 진행 중 | 유지, §4.4 Ontology 추가 노드 등록 | 🟢 Low | 유지 |
| **Generative UI** | ✅ AIF-REQ-024 진행 중 | 유지, Reviewer UX에 통합 | 🟢 Low | 유지 |

**Gap 해석**:
- P0(Critical) 4개: **IR·Trace·Differential·Harness**. 프로토타입이 가장 약한 지점이며, Option C의 핵심 차별화 요소.
- P1(High) 5개: 포맷·표현·가드레일 — "Spec이 VibeCoding에 쓸모 있는 형태인가?"의 본질.
- P2(Med) 4개: 품질 레벨업 요소. Phase 2~3에 배치 권고.
- P3(Low) 1개: 고도화 단계에서 도입.

### 12.4 Migration Plan (4-Phase)

**Phase M0 · 병행(Shadow) 모드 진입 (3주)** — 프로토타입은 계속 운영하되, 신규 Spec 생성 결과를 **v1.1 권장 컨테이너로 동시 저장**.
- v0 → v1 변환기 구현(`services/svc-spec-migrate/`)
- R2에 `specs-v1/` 디렉터리 신규 개설
- 기존 경로 `/skills/:id/spec/*`는 유지, 신규 경로 `/skills/:id/spec-v1/*` 추가
- **Exit**: LPON 848정책·Miraeasset 2,827정책 모두 v1 포맷 병행 저장 성공

**Phase M1 · IR·Trace 구축 (6주)** — 가장 큰 Gap(P0) 해소.
- Joern을 Cloudflare Container로 포팅(또는 외부 러너 + 결과 동기화)
- SCIP 인덱서 TypeScript/Java 2종 통합
- 기존 Spec의 각 조항에 SCIP/CPG 바인딩 재귀적으로 주입 (HITL 일부 병행)
- **Exit**: Trace coverage ≥ 70%, Technical 점수 4.3% → 40%+

**Phase M2 · Harness·Differential 구축 (8주)** — Option C의 검증 레이어 도입.
- LangGraph 5-Node 상태기계 스캐폴드
- 2-Layer Guardrail + Tier-1 Allowlist
- Playwright+Percy+Pact Differential Harness
- **Exit**: Differential pass ≥ 85%, Harness Autonomy ≥ 60%, AI-Ready passRate 23.6% → 60%+

**Phase M3 · v0 Deprecation (3주)** — 레거시 포맷 단계적 은퇴.
- v1 경로를 기본 경로로 스위치
- org-spec React 뷰를 v1 렌더러로 업그레이드(탭 3종 + 조항 클릭 사이드 패널)
- v0는 감사용 read-only로만 유지, 6개월 후 완전 제거
- **Exit**: 프로덕션의 모든 신규 Vibe 실행이 v1 기반, AI-Ready ≥ 75%, Harness Autonomy ≥ 80%

총 M0~M3 = 20주. §5의 Phase 0~2와 시간적으로 겹치되 **별도 워크스트림**으로 병행. 이 방식은 Phase 1 PoC의 학습을 M0~M2에 즉시 피드백할 수 있는 이점이 있다.

### 12.5 "Keep / Evolve / Retire" 의사결정 매트릭스

| 프로토타입 자산 | 결정 | 이유 |
|----------------|------|------|
| Cloudflare Workers 7 서비스 | **Keep** | 배포·스케일·오프라인 번들 모두 만족, Joern만 외부 러너로 |
| D1 5-DB 구조 | **Keep** | 스킬/메타/온톨로지 분리 설계 탁월 |
| Template+LLM Hybrid Generator | **Evolve** | AutoSpec+SpecGen 루프로 확장, LLM은 유지 |
| Skill Bundling(848→11, 3065→15) | **Keep** | 이미 Option C 범주에서 강점 |
| Markdown-only Spec | **Retire** | v1 컨테이너로 단계적 치환 |
| OpenRouter→Haiku | **Evolve** | Sonnet 4.6 기본 + Haiku 폴백 |
| org-spec React 뷰 | **Evolve** | 조항-사이드패널 UX 추가, v1 렌더러 |
| AI-Ready 스코어러 (Sprint 210) | **Keep & Embed** | v1.1 aiReady 블록에 직접 연결 |
| Generative UI(AIF-REQ-024) | **Keep** | Reviewer UX 강화 수단으로 재포지션 |
| Foundry-X 통합(AIF-REQ-026) | **Keep** | §4.4 Ontology 결선에 맞춰 Edge 추가 |

### 12.6 12개월 정합성 요약

v1.0의 50주 로드맵과 §12 M0~M3 20주를 겹쳐 배치하면 다음과 같다.

```
W1-4   Phase 0 준비           ─┐ (기획 확정, Spec Schema v1.0 fix)
W1-3   Shadow Mode (M0)        ─┘  ← 즉시 착수 가능 항목
W5-14  Phase 1 PoC             ─┐ (IR·Trace 구축 M1 W5-W10과 동기)
W5-10  IR·Trace 구축 (M1)      ─┘
W15-26 Phase 2 파일럿+Equiv.    ─┐ (Harness·Diff M2 W15-W22 병행)
W15-22 Harness·Diff 구축 (M2)  ─┘
W23-25 v0 Deprecation (M3)
W27+   Phase 3~4
```

결론: **기획 일정은 v1.0 그대로 유지**되면서, 프로토타입 자산의 70%를 Keep, 20%를 Evolve, 10%를 Retire하는 선에서 자연스럽게 권장안으로 수렴한다.

---

## 13. Foundry-X Harness 비교 분석 및 통합 전략 (v1.2 신설)

### 13.1 조사 범위 및 기준일

- **대상**: `https://github.com/KTDS-AXBD/Foundry-X` (branch: `master`, 조사 시점 2026-04-18)
- **현황**: Phase 46 Sprint 308, commits ~1,590, tests ~3,473 (CHANGELOG/INDEX 기준)
- **핵심 레퍼런스(부록 H 카탈로그)**: BLUEPRINT v1.36, INDEX.md, FX-SPEC-PRD-V8(foundry-x), plumb-output-contract.md, plumb-error-contract.md, fx-harness-rules/evolution, fx-discovery-*(pipeline-v2/ui-v2/native/ux), FX-RESEARCH-014-external-repos
- **비교축**: Decode-X v1.1 §4.3 Spec Schema / §4.5 VibeCoding Harness / §6 Differential Testing / §12 Prototype Gap Analysis

### 13.2 Foundry-X 요점 정리

**North Star & 철학**:
> "AI 에이전트가 일하는 방식을 설계하는 곳"(PRD V8) / "Git이 진실, Foundry-X는 렌즈"(BLUEPRINT).

**아키텍처 (BLUEPRINT v1.36 / PRD V8)**:

| 영역 | 스택 | 역할 |
|------|------|------|
| CLI | TypeScript + Commander + Ink 5(TUI) | 개발자 직접 제어, 스크립팅 |
| API | Hono on Cloudflare Workers + D1(SQLite, 42 tables, 149 migrations) | 상태 지속·이벤트 라우팅 |
| Web | Vite 8 + React 18 + React Router 7 + Zustand | 오케스트레이션 대시보드 |
| Shared | Types · Agent logic · Plugin framework · SSO · Methodology · Discovery-X · AX-BD · Knowledge Graph | 교차관심사 |
| Auth | JWT + PBKDF2 + RBAC + Google OAuth | SSO 대응 |
| Agents | 6종 (Architect · Test · Security · QA · Infra · Reviewer) | 전문화된 에이전트 |
| AI Layer | Anthropic Claude + OpenRouter (300+ models) | LLM 라우팅 |
| Orchestration | Claude Squad v1.0.17 | 멀티 에이전트 조정 |

**SDD Triangle (Plumb 엔진으로 실현)**:
- Spec ↔ Code ↔ Test 삼중 동기화를 `plumb review` / `plumb status`가 실측·판정.
- 출력은 `.foundry-x/decisions.jsonl`(append-only) + `SyncResult` stdout.
- 합치 목표: **90% 이상 matched**.

**Plumb Output 스키마 요약 (FX-SPEC plumb-output-contract.md)**:
```
SyncResult {
  success, timestamp, duration,
  triangle: { specToCode, codeToTest, specToTest }  // 각 SyncStatus {matched, total, gaps[]}
  decisions: Decision[]                              // {id:"d-NNN", source:"agent|human", summary, status, commit}
  errors: PlumbError[]
}
GapItem.type ∈ { spec_only | code_only | test_missing | drift }
exit 0=PASS, 2=PARTIAL, 1/127=FAIL
```

**Plumb Error Contract 요약**: `FoundryXError` 5종 (PlumbNotInstalled / PlumbTimeout / PlumbExecution / PlumbOutput / NotInitialized|NotGitRepo). **명시적 재시도 없음** — pre-flight isAvailable() + user-guided escalation(타임아웃 2배 안내) + exit-code 의미(2=partial은 caller가 판정).

**O-G-D Loop (명시적 표기는 BLUEPRINT에 없으나 운영 흐름상 동형)**:
- Observe: 에이전트 실행·로그·실패·피드백 수집.
- Generate: 6 에이전트 파이프라인이 코드/테스트/문서/배포 생성.
- Decide: Human 승인 게이트 + 고위험 수동 승인 + 실패 시 롤백.

**Skill Unification (3-tier 인터페이스)**:
- CLI(개발자 · 스크립팅) / Web(PM·BD·에이전트 오케스트레이션) / Plugin(SI·고객 확장). "범위·책임·검증 없는 확장 불가" 원칙.

**Lifecycle (AX BD 통합)**: 사업기회 수집 → 검토 → PoC → MVP → 운영. Phase 5 = Customer Pilot + Revenue.

**PRD V8 핵심 KPI**:
- PoC/MVP 시간 2~4주 → < **3일**
- 6개월 내 1~2 고객 계약
- 내부 WAU 1 → 5+ (3개월)

### 13.3 Decode-X v1.1 ↔ Foundry-X 매핑 매트릭스

| 축 | Decode-X v1.1 | Foundry-X | 겹침 여부 | 통합 방식 |
|----|---------------|-----------|-----------|-----------|
| **목적** | 레거시 → AI-Ready Spec 추출 | Spec·Code·Test 동기화 + 에이전트 오케스트레이션 | **상보적** | Decode-X 출력 → Foundry-X 입력 |
| **Spec Container** | §4.3 `spec.md + contracts/ + rules/ + invariants/ + traceability/ + tests/` | SPEC.md SSOT + F-items(Phases/Sprints) + `docs/specs/` | 포맷 다름, 의미 일치 | Decode-X `spec.md` frontmatter에 `foundryX.fItemId` 필드 추가 |
| **Spec 언어** | OpenAPI 3.1 + Smithy 2.0 + AsyncAPI 3.x + JSON Schema 2020-12 + EARS + Policy-as-Code | (문서화된 명시 DSL 없음, Markdown 중심) | Decode-X가 표준화 강함 | Decode-X 스키마가 **de-facto 상위** |
| **Spec↔Code↔Test 동기화** | SCIP + CPG 양방향 인덱스 + Triangle Gap Checker | **Plumb 엔진 + SyncResult JSON + decisions.jsonl** | **둘 다 동일 문제 해결** | Decode-X Triangle Gap Checker를 Plumb 쿼리에 위임 가능, Decode-X는 CPG 엣지 생산에 집중 |
| **Harness 백본** | LangGraph 5-Node 상태기계 | 6-Agent 파이프라인 + Claude Squad | **경쟁 관계** | Decode-X의 LangGraph는 **Spec 생산(Analyze)** 에, Foundry-X 6-Agent는 **Spec 소비(Build)** 에 각각 특화 → 겹치지 않음 |
| **Guardrail** | 2-Layer Classifier + Tier-1 Allowlist | JWT+RBAC + Human-in-the-Loop 승인 게이트 | 레이어 다름 | Decode-X Guardrail = Tool-call level, Foundry-X = Workflow level → **중첩 적용** |
| **Differential Testing** | Playwright+Percy+Pact + Dual Run | (명시 없음, Test Agent 보유) | Decode-X 우세 | Decode-X Harness 결과를 Foundry-X `tests/` 계약으로 export |
| **Observability / Replay** | Replay.io 호환 + Temporal Worker Versioning | `decisions.jsonl` append-only + Work Management (Phase 33) | 병용 가능 | Decode-X Harness 실행 로그를 Foundry-X `decisions.jsonl`에 번들로 첨부 |
| **Drift CI** | Spectral + oasdiff + PactFlow(3-Layer) | Plumb `drift` gap type 탐지 | 상보적 | Decode-X 3-Layer가 Plumb의 `GapItem.type=drift`에 연결됨 |
| **Knowledge Graph** | shared/kg.ts Ontology 노드/엣지 | shared/ 패키지에 KG 도메인 존재 | **동일 자산 재사용** | **Decode-X KG = Foundry-X KG**, 동일 SSOT |
| **오케스트레이션 대시보드** | Reviewer UI(최소) | Web Dashboard (Vite/React/RR7/Zustand) | Foundry-X 우세 | Decode-X Reviewer는 Foundry-X Web 대시보드의 Plugin으로 이전 가능 |
| **배포 인프라** | Cloudflare Workers 7 서비스 + D1 5DB (프로토타입) | Cloudflare Workers + D1 + Pages | **동일** | 통합 Worker 클러스터 가능 |
| **Auth / SSO** | (명시 없음) | JWT + PBKDF2 + Google OAuth | Foundry-X 제공 | **Decode-X는 Foundry-X Auth에 편승** |
| **생애주기** | Phase 0~4 (W1-W50) | AX BD: 사업기회→검토→PoC→MVP→운영 | 교차 | Decode-X Phase 1~2 ≈ Foundry-X "검토~PoC" 단계의 Input 공급원 |

### 13.4 역할 분담 결정 (Role Division)

**원칙**: "한 번 만들 것은 한 번만 만든다(Don't re-invent), 가장 잘 맞는 팀이 맡는다(Best-fit), 매개는 Git + SPEC.md + Plumb이다(Single interface)."

> **Decode-X = Input Plane Producer**  
> — 레거시 자산(Code · Docs · Ops logs · Tacit) ⇒ AI-Ready Spec  
> — 책임: §2.5 Core Service 식별 · Empty Slot 채움 · §4.3 Spec Container 생산 · §4.4 KG 엣지 생성 · Input Completeness 보증.
>
> **Foundry-X = Process / Output Plane Orchestrator**  
> — Spec ⇒ Working Site ⇒ PoC/MVP ⇒ Customer  
> — 책임: SDD Triangle 동기화 (Plumb) · 6-Agent 실행 · 수동 승인 게이트 · 고객 대시보드 · GTM.
>
> **공통 매개체(Single Interface)**:  
> (a) Git 저장소 — 모든 Spec은 커밋으로 표현, (b) SPEC.md / F-items SSOT, (c) Plumb `decisions.jsonl` + `SyncResult` JSON, (d) shared/kg.ts Ontology.

### 13.5 통합 아키텍처 다이어그램

```
┌──────────────────────────────────────── Decode-X (Input Plane) ─────────────────────────────┐
│                                                                                              │
│  ① SOURCE ──▶ ② PROCESS ──▶ ③ SPEC OUTPUT                                                   │
│  (Code/Docs/Ops)  (§2.5 Core+EmptySlot → §4.5 LangGraph Harness)   spec.md + contracts/...  │
│                                                                              │               │
│                                                                              ▼               │
└──────────────────────────────────────────────────────────────────────────────┼───────────────┘
                                                                               │
                                                                 Git commit + SPEC.md + KG
                                                                               │
┌──────────────────────────────────────────────────────────────────────────────▼───────────────┐
│                           Foundry-X (Process / Output Plane)                                  │
│                                                                                               │
│  ④ INGEST Spec ──▶ ⑤ PLUMB Sync(triangle) ──▶ ⑥ 6-AGENT BUILD ──▶ ⑦ TEST/REVIEW ──▶ ⑧ GTM    │
│                            │                                                                  │
│                            └─▶ decisions.jsonl (append-only, Decode-X 리플레이와 병합)        │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                               ▲
                                                                               │
                                                                 drift 감지 → Decode-X 재추출
```

**핵심 엣지**:
- (↓) Decode-X가 Spec을 커밋하면 Foundry-X는 Plumb으로 triangle 동기화를 즉시 측정. `specToCode`/`specToTest`/`codeToTest` 각 축 matched ≥ 90%이면 PASS.
- (↑) Foundry-X가 Plumb drift를 감지하면 Decode-X의 해당 Spec을 Deficiency-flag 상태로 복귀시키고 Empty Slot 재점검을 트리거.

### 13.6 Decode-X 산출물이 Plumb을 통과하기 위한 정렬(Alignment) 규칙

v1.1 §4.3 컨테이너를 **무손실로 Plumb-compatible**하게 매핑한다.

| Plumb 필드 | Decode-X 대응 | 비고 |
|------------|----------------|------|
| `triangle.specToCode.matched/total` | SCIP/CPG 바인딩된 조항 수 / 전체 조항 수 | `traceability/scip.jsonl` 집계 |
| `triangle.codeToTest.matched` | `tests/contract` + `tests/scenarios`로 커버된 심볼 수 | Pact + Playwright 매핑 |
| `triangle.specToTest.matched` | `rules/*.ears.md` ↔ 매칭되는 `.test.ts`·`.pact.json` 수 | `testRefs` 필드 활용 |
| `GapItem.type="spec_only"` | Spec에는 있으나 Code 심볼 미발견 | `aiReady.traceable` 감점 |
| `GapItem.type="code_only"` | Code에는 있으나 Spec 조항 없음 | §2.5 Empty Slot 후보로 역류 |
| `GapItem.type="test_missing"` | Spec·Code 있으나 테스트 없음 | `aiReady.testable` 감점 |
| `GapItem.type="drift"` | Spec과 실제 실행 trace 차이 | §4.5.6 Drift CI로 위임 |
| `Decision.source="human"` | Reviewer UI 승인 로그 | `provenance.humanReviewedBy` 연결 |
| `exit=0/2/1` 의미 | §2.2 AI-Ready PassRate 게이트와 정합 | 0=PASS, 2=WARN(Empty Slot 미완), 1=FAIL |

**구현 편의**: Decode-X는 별도 triangle 재계산을 하지 않고 `plumb status --json`을 호출해 `SyncResult`를 그대로 `provenance.yaml`에 인라인 임베드한다. Decode-X UI는 Plumb 결과를 **1차 진실**로 표시한다.

### 13.7 Harness 엔진 중복 제거 의사결정

두 시스템 모두 "에이전트 루프"를 갖는다. 중복은 아래 기준으로 제거:

| 활동 | 주관 | 왜 |
|------|------|-----|
| 레거시→Spec 추출 루프 (AutoSpec·SpecGen·Daikon) | **Decode-X LangGraph** | 학술 레퍼런스·CPG·동적 불변식 등 전문 도메인 |
| Spec→Working Site 생성 루프 (Code-Gen·Test-Run·Review) | **Foundry-X 6-Agent + Claude Squad** | 이미 Phase 46 Sprint 308 누적, Auth·RBAC 완비 |
| Spec↔Code↔Test 동기화 판정 | **Foundry-X Plumb** | 전용 엔진·명확한 스키마·exit-code 계약 |
| Differential Testing (Dual Run) | **Decode-X** | Playwright+Percy+Pact+Replay 전문, Foundry-X 쪽 미명시 |
| Drift CI | **양측 협업** | Decode-X 3-Layer가 생산, Foundry-X가 소비·경보 |
| Guardrail | **양측 중첩** | Decode-X=tool-level, Foundry-X=workflow-level |

결과: **Harness 엔진은 하나가 아니라 두 개이되, 관심사 분리 완료.** Decode-X는 "Input 품질을 Plumb-통과 가능한 수준까지 끌어올리는" 책무에 집중하고, Foundry-X는 "Plumb을 통과한 Spec을 Working Site로 변환하는" 책무에 집중한다.

### 13.8 v1.2 통합 로드맵 (20주, §12 M0~M3와 동기)

| 주차 | 통합 마일스톤 | Owner |
|------|-------------|-------|
| W1-W2 | **MoU & 인터페이스 계약** — Decode-X→Foundry-X 입력 포맷 합의(§13.6), Git 저장소·Secret 접근 | Liaison + FX PM |
| W3-W6 | **Plumb 쉐이크아웃** — Decode-X 샘플 Spec 1~2건으로 `plumb status --json` 연동 PoC, `provenance.yaml` 인라인 | Harness Eng + FX Plumb 팀 |
| W7-W12 | **KG 통합** — shared/kg.ts를 단일 SSOT로 정합, Decode-X `kg-publisher`가 Foundry-X KG 노드/엣지를 직접 upsert | Spec Architect + FX KG 팀 |
| W13-W18 | **Workflow 병합** — Foundry-X 대시보드에 "Decode-X Run" 카드 + Reviewer UI 이관 | Full-stack + FX Web 팀 |
| W19-W20 | **Drift 양방향 연결** — Plumb drift 감지 → Decode-X Deficiency-flag → Empty Slot 재검사 트리거 | Harness Eng + FX Plumb |

### 13.9 기대 효과 & 경쟁우위

1. **2팀 동시진화**: Decode-X와 Foundry-X가 동일 인프라(CF Workers+D1+KG)와 동일 언어(Git+SPEC.md)로 움직이므로, **한 번 설계한 규약이 양쪽 조직에서 자산화**된다.
2. **Input 품질 가시화**: Plumb triangle이 Decode-X 산출물의 품질을 외부 측정기로 즉시 채점 → "Spec 만들었다고 우기는" 문제가 근절됨.
3. **Foundry-X PRD V8 KPI 가속**: PoC/MVP 3일 목표는 **양질의 Input Spec 공급**이 전제. Decode-X의 §2.5 공정이 이 전제를 자동화.
4. **단일 대시보드·단일 Auth**: SI 고객 현장에서 두 개 시스템을 설명할 필요가 없고, Foundry-X Web + RBAC가 Decode-X 자산을 그대로 보여준다.
5. **자기증명 강화**: §11 "Foundry-X 자기증명"이 두 시스템 동시 수행으로 확장 — Decode-X가 Foundry-X의 레거시를 Spec화하면 "메타-재귀" 시연이 가능.

### 13.10 의사결정 요약 (§10·13 연계)

- **§10-9 Mission Pivot 승인** → §2.5/§13 전제.
- **§10-10 Foundry-X 역할 분담 승인** → §13.4 Role Division + §13.8 로드맵 즉시 착수.
- Liaison(0.5 FTE) 배정 + KT DS AXBD 조직 차원 2-team MoU 권고.

---

## 부록

### 부록 A. 참고 문헌 (v1.1 확장)

**v1.0 핵심 15편 (유지)**
1. Ammons, Bodík, Larus. *Mining Specifications*. POPL 2002.
2. Whaley, Martin, Lam. *Automatic Extraction of Object-Oriented Component Interfaces*. ISSTA 2002.
3. Ernst et al. *The Daikon System for Dynamic Detection of Likely Invariants*. SCP 2007.
4. Pradel, Gross. *Leveraging Test Generation and Specification Mining*. ICSE 2012.
5. Chikofsky, Cross. *Reverse Engineering and Design Recovery: A Taxonomy*. IEEE Software 1990.
6. Ducasse, Pollet. *Software Architecture Reconstruction: A Process-Oriented Taxonomy*. IEEE TSE 2009.
7. Ma et al. *SpecGen: Automated Generation of Formal Program Specifications via LLMs*. arXiv 2401.08807 / ICSE 2025.
8. Wen et al. *AutoSpec: Enchanting Program Specification Synthesis via Static Analysis and Program Verification*. CAV 2024.
9. Lohn et al. *Towards Formal Verification of LLM-Generated Code from NL Prompts*. arXiv 2507.13290.
10. *CodeSpecBench: Benchmarking LLMs for Executable Behavioral Specification Generation*. arXiv 2604.12268, 2026.
11. Brambilla, Cabot, Wimmer. *Model-Driven Software Engineering in Practice*, 2nd ed., Springer 2017.
12. *Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants*. arXiv 2602.00180, 2026.
13. Godefroid, Klarlund, Sen. *DART: Directed Automated Random Testing*. PLDI 2005.
14. Yang et al. *Finding and Understanding Bugs in C Compilers (Csmith)*. PLDI 2011.
15. Yamaguchi et al. *Modeling and Discovering Vulnerabilities with Code Property Graphs*. IEEE S&P 2014.

**v1.1 추가 8편 (Spec 포맷·Harness·Eval)**
16. Mavin et al. *Easy Approach to Requirements Syntax (EARS)*. RE 2009 / Kiro 2025 채택 레퍼런스.
17. Meyer. *Applying "Design by Contract"*. IEEE Computer 1992.
18. Leavens, Cheon. *Design by Contract with JML*. Tutorial 2006.
19. Jimenez et al. *SWE-bench: Can Language Models Resolve Real-World GitHub Issues?* ICLR 2024.
20. Chase et al. *LangGraph: Building Stateful, Multi-Actor Applications with LLMs*. LangChain Docs 2024-2025.
21. Cleland-Huang et al. *Automated Traceability Link Recovery with LLMs*. IEEE TSE 2024.
22. Google Cloud. *Mainframe Dual Run: Event-Replay Validation*. White Paper 2025.
23. Anthropic. *Claude Code: Skills and Auto Mode (Technical Report)*. 2025-2026.

(Solar-Lezama 2008, Codex 2021 등 추가 문헌은 본문 §3.1, §3.5 각주 참조)

### 부록 B. OSS 도구 매핑표 (v1.1 확장)

| 컴포넌트 | 1차 선택 | 대안 |
|----------|----------|------|
| CPG IR | **Joern** | tree-sitter + 커스텀 |
| 심볼 인덱스 | **SCIP** (Sourcegraph) | LSIF |
| 정적 쿼리 | **CodeQL** | Semgrep |
| DB 스키마 추출 | **SchemaSpy** | SchemaCrawler |
| OpenAPI 추출 | **springdoc / FastAPI built-in** | OpenAPI Generator reverse |
| Spec 린트 | **Spectral** | 커스텀 Zod validator |
| 아키텍처 표현 | **Structurizr DSL / C4** | PlantUML |
| API IDL | **OpenAPI 3.1 + Smithy 2.0 + AsyncAPI 3.x** | Legend-PURE |
| 데이터 스키마 | **JSON Schema 2020-12** | Apple Pkl |
| SDD 플랫폼 | **GitHub Spec Kit** | Amazon Kiro, Tessl |
| Vibe Coding 엔진 | **Claude Code + Skills** | Copilot Agent, Cursor |
| Visual Diff | **Playwright + Percy** | Applitools, BackstopJS |
| Contract Test | **Pact / PactFlow** | — |
| Char. Test | **Diffblue Cover** | approvaltests |
| Event Replay | **Replay.io** | 자체 구현 |
| **Harness Backbone(v1.1)** | **LangGraph** | Temporal, 자체 |
| **Inner Loop(v1.1)** | **Aider 패턴** | Continue, Cursor |
| **Eval Harness(v1.1)** | **SWE-bench Verified 스타일** | MLE-bench |
| **Drift CI(v1.1)** | **Spectral + oasdiff + PactFlow Drift** | 자체 |
| **Requirements 구문(v1.1)** | **EARS** (Mavin 2009) | Gherkin, BDD |

### 부록 C. Spec Schema v1.0 (v1.1 채택)

(§4.3에 수록. 전체 JSON Schema는 별도 파일 `schemas/decode-x-spec-v1.schema.json`에서 관리.)

### 부록 D. 산업 사례 1-Page Matrix

| 사례 | Discover | Refactor/Transform | Validate | Decode-X 대응 |
|------|----------|---------------------|----------|----------------|
| IBM watsonx CA for Z | COBOL AST | Java refactor | Test generation | Phase 1~2 유사 |
| Amazon Q Transform | Java 8/11/17 버전 분석 | 21로 변환 | Selective + SBOM | 부분 적용 전략 |
| Google Dual Run | — | — | live event replay diff | §6.2 직접 차용 |
| Palantir Foundry | 데이터 소스 카탈로그 | Ontology 객체 정의 | Actions + Rules | Business Spec + KG |
| Goldman Legend | 엔터프라이즈 모델 | PURE → Java | Studio/SDLC | Spec DSL 참고 |
| Claude Code Auto Mode(v1.1) | — | 2-Layer Classifier | Tier-1 allowlist | §4.5.3 Guardrail |
| Anthropic Skills(v1.1) | — | SKILL.md + resources | Progressive Disclosure | §4.3.2 Container |

### 부록 E. 방법론 매핑 (6기준 ↔ 학술/OSS, v1.1 확장)

| 6 기준 | 학술 근거 | OSS/도구 | v1.1 Spec Layer |
|--------|-----------|----------|------------------|
| ① Machine-readable | MDE (Brambilla) | YAML frontmatter, OpenAPI 3.1, JSON Schema 2020-12, Smithy 2.0 | Executable Layer |
| ② Semantic-consistent | AutoSpec/SpecGen 변이복구 | Joern CPG, Spectral, oasdiff | Verifiable Layer |
| ③ Testable | Pradel-Gross, SWE-bench | Diffblue, Pact, Playwright, Aider | Executable Tests |
| ④ Traceable | Cleland-Huang | SCIP + CPG 양방향 인덱스 | Traceability (4) |
| ⑤ Complete | CodeSpecBench + Daikon | SchemaSpy, Completeness Oracle(자체), Daikon | Verifiable Layer |
| ⑥ Human-reviewable | Meyer DbC, JML, EARS | Reviewer UI(자체) + spec.md 자동 요약 + Structurizr | Reviewable Layer |

### 부록 F. Harness 실행 예 (v1.1 신설, 1-Page 시나리오)

```
[Attempt 1]
1. Spec Load: SPEC-2026-0001 (auth), aiReady.passRate=0.91 → PASS gate
2. Test Compile: OpenAPI → 7 Pact contracts, 3 Playwright scenarios, EARS → 12 GWT tests
3. Code Gen (Claude Sonnet 4.6): "hono + jose + d1" 템플릿 시작, 5 files 생성
4. Run & Diff: lint ✓ unit ✓ pact ✗(1/7 fail) scenario ✗(lockout missing) dual-run 차이 3건
5. Decide: Spec gap 아님, Gen 문제 → Repair Loop 진입

[Attempt 2]
3'. Re-Gen with failing context: lockout 로직 추가, event publish 추가
4'. Run & Diff: lint ✓ unit ✓ pact ✓ scenario ✓ dual-run equivalence 96%
5'. Decide: PASS → merge to main, publish
```

### 부록 G. v1.0 → v1.1 변경 이력

| 섹션 | 변경 | 사유 |
|------|------|------|
| Exec Summary | 재정의 문단 추가 | Spec의 1차 독자가 VibeCoding 에이전트임 명시 |
| 1.4 신설 | 재정의 선언 | 포맷 설계 원칙 공표 |
| 2.2 KPI | 2개 신규(Harness Autonomy, AI-Ready PassRate) | Harness 도입으로 추가 계측 필요 |
| 2.3 Scope | In Scope 2개 추가 | 하네스·마이그레이션 |
| 3.1/3.2 | 문헌 8편·도구 10개+ 추가 | Spec 포맷·Harness 리서치 반영 |
| **4.3 재작성** | 원점 재설계 | "VibeCoding 검증 가능" 우선 |
| **4.5 신설** | Harness 설계 | Spec→Working Site 자동화 필수 |
| 5 Phase 1/2 | v1.1 태그 항목 추가 | 신규 워크 아이템 |
| 7 리스크 | R9·R10·R11 추가 | Harness·마이그레이션 리스크 |
| 8 R&R | Harness Engineer 추가 | 신규 역량 |
| 10 의사결정 | 2개 추가, 2개 업데이트 | Harness 백본·마이그레이션 승인 |
| **12 신설** | Prototype Gap Analysis | 현행 프로토타입 수렴 경로 |
| 부록 A/B/E | 확장 | 신규 문헌·도구 |
| 부록 F/G 신설 | Harness 예시·변경 이력 | 가독성 |

### 부록 G-2. v1.1 → v1.2 변경 이력 (신규)

| 섹션 | 변경 | 사유 |
|------|------|------|
| Exec Summary | Mission Pivot + Foundry-X 통합 문단 2개 추가 | 두 가지 v1.2 핵심 축 선언 |
| **1.5 신설** | Mission Re-definition | "100% Copy Machine 가정 폐기"와 "AI-Ready 자산화" 선언, Tier-A/B/C 행위 동등성 재정의 |
| 2.2 KPI | Behavioral Equivalence 단일 지표 → Tier-A(≥95%)·Tier-B(≥70%)·Tier-C Sunset로 분해. 4종 추가(Empty Slot Fill Rate, Tacit Knowledge Coverage, Input Completeness, Foundry-X Integration Readiness) | Mission Pivot·Foundry-X 통합에 따른 KPI 정렬 |
| **2.5 신설** | Core Service & Empty Slot Analysis | 3축 스코어·InputCompleteness 공식·Empty Slot 택소노미(E1~E5)·전자온누리상품권 워크드 예제 |
| 7 리스크 | R12·R13·R14·R15 추가 | Input 불완전성, Foundry-X 버전 스큐, 암묵지 유출, Mission Pivot 오해 |
| 8 R&R | Domain Archeologist(1 FTE) + Foundry-X Integration Liaison(0.5 FTE) 추가 | Empty Slot 발굴·Foundry-X 정렬 전담 역할 신설 |
| 10 의사결정 | #9(Mission Pivot 승인) + #10(Foundry-X 역할 분담 확정) 추가 | v1.2 양대 축의 공식 의사결정화 |
| **13 신설** | Foundry-X Harness 비교 분석 및 통합 전략 | 13.1~13.10, 매핑 매트릭스·Role Division·Plumb 정렬·20주 로드맵 |
| **부록 H 신설** | Foundry-X 레퍼런스 카탈로그 | 조사 근거 문서 출처 관리 |

### 부록 H. Foundry-X 레퍼런스 카탈로그 (v1.2 신설)

Decode-X v1.2 §13 통합 분석의 근거 자료 목록. 기준일 2026-04-18, 원본 저장소 `github.com/KTDS-AXBD/Foundry-X`. Decode-X 프로젝트에서 이 문서들을 참조할 때는 아래 축약 코드를 사용한다 (예: `FX-BP-1.36`).

| 축약 코드 | 문서 | 위치 | 요점 |
|-----------|------|------|------|
| FX-BP-1.36 | BLUEPRINT v1.36 | `docs/architecture/BLUEPRINT.md` | "Git이 진실, Foundry-X는 렌즈" · SDD Triangle(Spec↔Code↔Test) · SPEC.md=SSOT · pnpm+Turborepo 모노레포 · Cloudflare Workers+D1 · Claude Squad v1.0.17 통합 |
| FX-PRD-V8 | Product Requirements V8 | `docs/product/FX-SPEC-PRD-V8_foundry-x.md` | North Star "AI 에이전트가 일하는 방식을 설계하는 곳" · 6 Agents(Architect/Test/Security/QA/Infra/Reviewer) · Anthropic+OpenRouter(300+ models) · KPI(PoC/MVP 2-4주→<3일, 1-2 contracts/6mo, WAU 1→5+) |
| FX-PLUMB-OUT | Plumb Output Contract | `docs/specs/plumb-output-contract.md` | `SyncResult{success,timestamp,duration,triangle:{specToCode,codeToTest,specToTest},decisions[],errors[]}` · `GapItem.type ∈ {spec_only\|code_only\|test_missing\|drift}` · `.foundry-x/decisions.jsonl` · exit 0=PASS, 2=PARTIAL, 1/127=FAIL |
| FX-PLUMB-ERR | Plumb Error Contract | `docs/specs/plumb-error-contract.md` | FoundryXError 5종(PlumbNotInstalled/PlumbTimeout/PlumbExecution/PlumbOutput/NotInitialized·NotGitRepo) · no retry · user-guided escalation · pre-flight `isAvailable()` |
| FX-INDEX | Specs Index | `docs/specs/INDEX.md` | 전체 FX-SPEC-* 카탈로그·버전·상태 |
| FX-HARNESS-RULES | Harness Rules (참조) | `docs/` (간접 참조) | Harness 범위·책임·검증 없는 확장 불가 원칙 |
| FX-DISCOVERY-V2 | Discovery Pipeline v2 (참조) | `docs/` (간접 참조) | O-G-D Loop (Observe→Generate→Decide) 진화 경로 |
| FX-SKILL-UNIFY | Skill Unification (참조) | `docs/` (간접 참조) | CLI(Commander+Ink) / Web(Vite+React+RR7+Zustand) / Plugin 공통 계약 |

**사용 규칙**:

- Decode-X 산출물이 Foundry-X 계약을 이야기할 때는 반드시 축약 코드를 병기한다 (예: "Plumb 계약(`FX-PLUMB-OUT`)에 따라 `SyncResult` 반환").
- 축약 코드 ↔ 커밋 SHA 매핑은 `/decode-x/references/foundry-x.yaml`에 별도 관리하여 버전 스큐(R13) 방지.
- 분기 주기(Quarterly) 동기화 미팅에서 카탈로그를 재확인 — `FX-INDEX`의 변경 이력을 기준으로 본 카탈로그를 갱신한다.

---

## 문서 메타

- **v1.2 (2026-04-18)** — Mission Pivot(§1.5), Core Service & Empty Slot(§2.5), Foundry-X 통합 전략(§13), 부록 G-2·H 신설, KPI/R&R/리스크/의사결정 정렬 (Sinclair)
- **v1.1 (2026-04-18)** — §4.3 재설계, §4.5·§12 신설, 부록 확장 (Sinclair)
- **v1.0 (2026-04-18)** — 초안 작성 (Sinclair)
- **v0.9 (내부)** — 리서치 요약 정리
- **다음 리뷰 대상**: (1) 전자온누리상품권 파일럿에서 Empty Slot ES-GIFT-001~006 중 최소 3건 실측 채움, (2) Foundry-X Plumb `SyncResult` 파이프라인 E2E 1건 녹색 달성 후 v1.3

*(끝)*
