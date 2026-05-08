---
code: AIF-POC-S1
title: "Sprint 1 Plan — T1 Foundry-X Plumb E2E + Tier-A(충전) Empty Slot 발굴 (v2.0 / 1.5일 압축판)"
version: 1.0
status: active
category: poc
created: 2026-04-18
updated: 2026-04-19
author: Sinclair Seo
---

# Sprint 1 Plan — T1 Foundry-X Plumb E2E + Tier-A(충전) Empty Slot 발굴 (v2.0 / 1.5일 압축판)

**문서 유형**: Sprint Plan (Phase 1 PoC 5 Sprint 시간 블록 중 Sprint 1)
**상위 REQ**: `AIF-REQ-035` (Decode-X v1.3 본 개발, IN_PROGRESS)
**기반 PRD**: `docs/req-interview/decode-x-v1.2/prd-v2.md` (v1.3)
**선행 Closure**: `docs/req-interview/decode-x-v1.2/phase-0-closure-report.md` (v1.0, §7.1 재조정 대상)
**작성일**: 2026-04-18 (v1.0) / **2026-04-19 재작성 (v2.0)**
**작성자**: Sinclair (Decode-X Lead 겸 Foundry-X PM)
**상태**: ✅ **v2.0 확정** — 1.5일 압축판. Sprint 1~5 전체 2026-04-19 오후 완료 목표
**Sprint 기간**: **2026-04-19 (일) 착수 시점 ~ +90분** (기존 2주 → 시간 블록으로 재정의)
**Sprint 번호**: 1 / 5 (Phase 1 PoC Sprint 시리즈)

---

## 0. 재조정 배경 (v1.1 → v2.0)

v1.1은 Sprint 당 2주(10영업일) 기준 계획이었으나, **AI-Native 1인 체제**에서 원 Plan의 대기·동기화 비용이 제거되어 **실질 개발 시간만 추출하면 Sprint 당 1~3시간 블록**이 현실 리듬. Phase 1 전체(Sprint 1~5)를 2026-04-19 오후까지 단일 work session 안에 완료한다.

**v1.1 → v2.0 핵심 변화**:
- Sprint 기간 단위: 2주 → **분 단위 시간 블록**
- Phase 1 전체 기간: 10주 → **1.5일** (2026-04-18 ~ 04-19 오후)
- Sprint 1 범위: v1.1 유지 (T1 Plumb E2E + Tier-A "충전" Empty Slot 발굴) — 축소 없음
- KPI: 원 정량 목표 → **"실증 성공 + 측정 가능성 증명 + 성장 경로 문서화"** 3단계 완화 기준
- Sprint 3 재평가 Gate: 원 2026-06-01 → **오늘 Sprint 3 종료 시점** (T1 green + T3 2종 최소 동작 버전 확인)

---

## 1. Sprint 1 목표 (SMART, v2.0)

| ID | 목표 | Measurable | Timebox |
|:--:|------|-----------|---------|
| S1-T1 | Foundry-X Plumb E2E "최초 green" | `SyncResult.success == true` 1건 확보, `FX-SPEC-002 v1.0` 스키마 준수 | Sprint 1 내 (약 60분) |
| S1-B1 | 충전 서비스 Empty Slot 후보 발굴 | §2.5.4 택소노미 E1~E5 분류 완료된 후보 ≥6건 + "발견 근거" 링크 | Sprint 1 내 (약 30분) |
| S1-B2 | 충전 서비스 Input Completeness Score | §2.5.3 공식 S_input 값 산출 + Deficiency Flag 판정 | Sprint 1 내 (B1 병행) |
| S1-M | Sprint 1 출구 점검 | T1 green 1건 + Empty Slot short-list ≥6 + Sprint 2 착수 시점 확인 | Sprint 1 종료 시점 |

**Sprint 1 시간 예산**: 약 **90분** (착수 시점부터 연속). 세부 분배는 §5.

---

## 2. 스코프

### 2.1 In Scope
- **충전·충전취소** 서비스에 한정한 Empty Slot 발굴 (Tier-A 7개 중 1개)
- Decode-X 기존 자산(LPON 859 skills / 848 policies / 7,332 terms) 중 "충전" 도메인 부분집합 활용
- Foundry-X Plumb 계약 `FX-SPEC-002 v1.0 @ e5c7260` 스키마로 **1건의 Spec Container** 출력
- SyncResult 반환 로그 수집(`.foundry-x/decisions.jsonl`) 경로 확보

### 2.2 Out of Scope (Sprint 2~5로 이관)
- Empty Slot **Fill**(rules/ + tests/ + runbooks/ 3자 바인딩 완성) — Sprint 2
- T2 Prototype Shadow Mode 인프라 — Sprint 2
- T3 결정적 생성 PoC(3종 중 2종 이상) — Sprint 3
- LLM 예산 관측 체계(R2) — Sprint 2
- AgentResume stub 실구현 (AIF-REQ-026 잔여) — 별도 Sprint
- Tier-A 나머지 6개 서비스(예산/구매/결제/환불/선물/정산) — Phase 2 이관

### 2.3 Non-Goals
- 충전 전 범위 커버리지 (Sprint 1은 **대표 Empty Slot 확인** 수준)
- Foundry-X Plumb 5연속 green (Sprint 3 Gate 판정 시점에 누적 회차 확인)
- 각 Empty Slot의 Fill 완성 (Sprint 2~3 분산)

---

## 3. 과업 A — T1 Foundry-X Plumb E2E

### 3.1 배경
**Foundry-X Plumb Output Contract** (`FX-SPEC-002 v1.0 @ e5c7260`) 스키마 준수:
```
SyncResult {
  success: boolean,
  timestamp: ISO8601,
  duration: ms,
  triangle: { specToCode, codeToTest, specToTest },
  decisions: DecisionRecord[],   // .foundry-x/decisions.jsonl
  errors: PlumbError[]            // FX-SPEC-003 병행
}
exit 0 = PASS, 2 = PARTIAL, 1/127 = FAIL
```

### 3.2 과업 분해 (시간 블록)

| 작업 | 산출물 | 블록 | 비고 |
|------|--------|:----:|------|
| A-0 Plumb CLI 사전 조사 | Foundry-X 레포 `packages/plumb-cli` 버전·호출 인자 메모 | 10분 | R-A1 선결 |
| A-1 대상 Skill 선정 | `sprint-1-selected-skill.md`: LPON 859 skills 중 충전 도메인 49건에서 1건 선정 | 10분 | 가중치 문서40/테스트30/Plumb30 (OD-1) 적용 |
| A-2 Spec Container 조립 | `rules/`, `tests/contract/`, `provenance.yaml` 구조로 패키징 | 15분 | §4.3 Spec Container 기준 |
| A-3 Plumb 호출 파이프라인 | Decode-X에서 Plumb CLI 호출 + SyncResult 수집·저장 스크립트 1본 | 10분 | 성공/실패 모두 로그 보존 |
| A-4 First Run + 분석 | 첫 실행 결과 green이 아니면 errors[] 분석 → Spec 조정 → 재실행 | 10분 | 목표 **최초 green 1회** |
| A-5 재현성 검증 | 동일 입력으로 2차 실행하여 결정성 확인 | 5분 | Sprint 3 "5연속 green"의 시드 |

**소계**: 60분 (과업 A)

### 3.3 성공 기준
- `SyncResult.success == true` 1건 이상 + `.foundry-x/decisions.jsonl` 생성 확인
- `errors[]` 비어있음 + `triangle.{specToCode,codeToTest,specToTest}` 모두 검증됨
- 2차 실행 시 결과 재현

### 3.4 리스크 & 대응
- **R-A1**: Plumb CLI 호환 버전 미확인 → A-0에서 선제 조사, 버전 mismatch 시 Foundry-X 레포 내 최근 호환 태그로 snap
- **R-A2**: Spec Container 포맷 불일치 → `plumb-output-contract.md` §2.1 예시 입력 참조
- **R-A3**: 충전 도메인 테스트 데이터 부족 → A-1에서 테스트 풍부 skill 우선 선정

---

## 4. 과업 B — Tier-A(충전·충전취소) Empty Slot 발굴 파일럿

### 4.1 배경
PRD §2.5.6 Worked Example(선물 서비스, ES-GIFT-001~006)을 **충전·충전취소**에 동일 방법론 적용.

**§2.5.4 택소노미**: E1 Surge / E2 Fraud / E3 Reconcile / E4 Exception / E5 Tacit

### 4.2 과업 분해 (시간 블록)

| 작업 | 산출물 | 블록 | 비고 |
|------|--------|:----:|------|
| B-1 충전 서비스 범위 확정 | `sprint-1-charge-service-scope.md`: 충전·충전취소 기능 목록 + LPON 자산 매핑 | 5분 | LPON "충전" 49건 카탈로그 재정리 |
| B-2 Input Completeness 측정 | S_input 스코어(§2.5.3) + Deficiency Flag 판정 | 5분 | S_input < 0.75 시 Flag |
| B-3 Empty Slot long-list | LPON 정책 848건·용어 7,332건·Gap 리포트 재독 → 후보 long-list | 10분 | 목표 15~20건 (OD-2) |
| B-4 E1~E5 분류 + 우선순위 | §2.5.4 택소노미로 분류, High/Med/Low 부여, short-list ≥6건 | 5분 | ID `ES-CHARGE-NNN` |
| B-5 Fill 시드 상세화 | short-list High 1건의 Filled 조건 초안 (rules/tests/runbooks 중 ≥2) | 5분 | Sprint 2 Fill 작업의 시드 |

**소계**: 30분 (과업 B)

### 4.3 발굴 방법론 (§2.5.5 축약)

```
[기존 자산 재독]                   [암묵적 운영 규칙 회고]
LPON skills 49 (충전)              Sinclair 자기 회고 + 세션 107~156 로그 검색
LPON policies (charge)
Gap Analysis 리포트
       │                                   │
       └──────────────┬───────────────────┘
                      ▼
            Empty Slot Long-list (15~20건)
                      ▼
            §2.5.4 분류 + 우선순위
                      ▼
            Short-list ≥6건 → Fill 시드 1건
```

### 4.4 성공 기준
- Empty Slot 후보 ≥6건 식별 + E1~E5 분류 완료
- 각 후보에 발견 근거 링크
- Input Completeness Score 산출 + Deficiency Flag 판정
- Fill 시드 1건 (rules/tests/runbooks 중 ≥2)

### 4.5 리스크 & 대응
- **R-B1**: 1인 DA 부재 → Sinclair 자기 회고 + 세션 로그 검색으로 대체. Sprint 5 Tacit Agent MVP로 체계화
- **R-B2**: LPON 선물 중심이라 충전 자산 빈약 → S_input < 0.75이면 Deficiency Flag + Sprint 2 보강 계획
- **R-B3**: 택소노미 해석 편향 → Worked Example 라벨링 준거

---

## 5. Sprint 1 시간 블록 (90분 연속)

| 블록 | 범위 | 분 | 누적 |
|:----:|------|:--:|:----:|
| 0 | A-0 Plumb CLI 사전 조사 | 10 | 10 |
| 1 | B-1 + B-2 충전 범위·Input Completeness | 10 | 20 |
| 2 | A-1 Skill 선정 + B-3 Empty Slot long-list (병행) | 15 | 35 |
| 3 | A-2 Spec Container 조립 | 15 | 50 |
| 4 | A-3 + A-4 Plumb 호출 + First Run | 15 | 65 |
| 5 | B-4 분류·short-list + A-5 재현성 | 15 | 80 |
| 6 | B-5 Fill 시드 + Sprint 1 출구 점검 | 10 | 90 |

**판단 규칙**:
- 블록 4에서 First Run 실패 + errors[] 해석이 10분 초과 → 블록 5에서 T1을 하나 더 시도, B-4는 5분 축약
- 블록 3에서 Spec Container 포맷 차이 발견 → R-A2 경로로 Plumb Reference Case 대조 우선, B-3 long-list는 사전 자산에만 의존하므로 병행 가능

---

## 6. 성공 기준 & 측정 (v2.0 완화 기준)

**v2.0 KPI 3단계 구조** (정량 95%/70% 충족이 아닌, 측정 가능성 + 성장 경로 증명):

| KPI | 원 목표 | v2.0 Sprint 1 기준 |
|-----|---------|-------------------|
| T1 최초 green | 5연속 green | **1건 green 확보** (5연속은 Sprint 3 Gate 시점 누적 체크) |
| Empty Slot 후보 수 | Fill Rate 70% | **후보 ≥6건 + 분류 100%** (Fill은 Sprint 2) |
| Input Completeness | ≥0.75 | **측정 완료 + 값 기록** (달성 값 자체는 데이터로 기록, Flag 시 보강 계획) |
| Sprint 2 시드 | — | **Fill 조건 초안 ≥1건** |

**측정 타이밍**: Sprint 1 종료 시점 (블록 6 출구 점검).
**측정 기록처**: 각 산출물 커밋 + SPEC.md §7 REQ-035 Sprint 1 진행 상태 append.

---

## 7. 산출물 인벤토리

### 7.1 Sprint 1 내 생성
```
docs/poc/
├── sprint-1-plan.md (본 문서, v2.0)
├── sprint-1-selected-skill.md (A-1)
├── sprint-1-spec-container.md (A-2 구조 설계)
├── sprint-1-plumb-first-run.md (A-4 결과 기록)
├── sprint-1-charge-service-scope.md (B-1)
├── sprint-1-input-completeness.md (B-2)
├── sprint-1-empty-slot-longlist.md (B-3)
├── sprint-1-empty-slot-shortlist.md (B-4)
├── sprint-1-fill-seed-01.md (B-5)
└── sprint-1-exit-check.md (출구 점검 요약)

.foundry-x/
└── decisions.jsonl (A-4 런타임 생성)
```

### 7.2 SPEC.md 반영
- §1 Current Phase: Sprint 1 착수·완료 시점 반영
- §7 AIF-REQ-035 설명: Sprint 1 진행 로그 append

---

## 8. 리스크 보드 (Sprint 1 스냅샷)

| ID | 리스크 | 영향 | 완화 |
|----|--------|:---:|------|
| R-A1 | Foundry-X Plumb CLI 버전 스큐 | 🟡 | A-0 선제 조사, FX-SPEC-002 v1.0 고정 |
| R-A2 | Spec Container 포맷 불일치 | 🟡 | Reference Case 대조 |
| R-A3 | 충전 도메인 테스트 데이터 부족 | 🟠 | A-1 선정 시 테스트 풍부 skill 우선 |
| R-B1 | 1인 DA 부재 | 🟡 | 자기 회고 + 세션 로그 검색, Sprint 5로 체계화 |
| R-B2 | LPON 선물 중심 → 충전 자산 빈약 | 🟠 | S_input Deficiency Flag, Sprint 2 보강 |
| R-B3 | 택소노미 해석 편향 | 🟢 | Worked Example 준거 |
| **R-V2** | **1.5일 압축에 따른 Sprint 2+ 슬립 연쇄** | 🟠 | Sprint 1 90분 타임박스 엄수, 블록 4 First Run 지연 시 판단 규칙 적용 |

**판단 규칙**: 🟠 리스크 ≥2건 현실화 → Sprint 1 출구 점검 시 Sprint 2 착수 전 재계획 5분 블록 추가.

---

## 9. 의존 Sprint & 후속 Sprint

| Sprint | 시간 블록 | 핵심 목표 | Sprint 1 이관 |
|:------:|:---------:|----------|---------------|
| Sprint 2 | ~60분 | R2 LLM 예산 + T2 Shadow Mode 1 라인 + Empty Slot Fill 첫 3건 | Sprint 1 short-list + Fill 시드 |
| Sprint 3 | ~90분 | T3 결정적 생성 PoC 2종 + **재평가 Gate 판정** | T1 green 누적 회차 + short-list 전량 |
| Sprint 4 | ~60분 | B/T/Q Spec Schema 완결성 | Empty Slot 3자 바인딩 데이터 |
| Sprint 5 | ~60분 | Tacit Interview Agent MVP + Handoff 1건 | DA 공백 체계화 대상 슬롯 |

**Phase 1 재평가 Gate**: Sprint 3 종료 시점 (오늘 내). T1 green 1건 + T3 2종 최소 동작 버전 확인 시 Sprint 4~5 진행. 미달 시 Sprint 4~5 범위 축소 or 재계획.

---

## 10. Open Decisions 확정 기록

| ID | 질문 | 확정값 | 근거 |
|----|------|--------|------|
| OD-1 | A-1 Skill 선정 기준 3축 가중치 | 문서 40% / 테스트 30% / Plumb 30% | 이중 과업 효율성 우선 |
| OD-2 | B-3 long-list 규모 | 15~20건 | E1~E5 5종 각 2~4건 분포 |
| OD-3 | ~~Week 1/Week 2 병행 강도~~ | **폐기 (v2.0)** — 1.5일 압축으로 Week 개념 소멸, 시간 블록으로 대체 |
| OD-4 | Retrospective 포맷 | Sprint 1 출구 점검 마크다운 (sprint-1-exit-check.md) | 1.5일 압축에서 경량화 |
| OD-5 | Phase 1 압축 구조 | 5 Sprint 유지 + 시간 블록화 | AI-Native 체제 리듬 보존 |
| OD-6 | Sprint 1 착수 시점 | 지금 즉시 (2026-04-19 중) | 하루 안에 Phase 1 완료 목표 |

---

## 11. 변경 이력

- **v1.0 DRAFT (2026-04-18)**: 초안 작성. Closure Report §7.1 Sprint 1 Backlog 기반 상세화. OD-1~4 대기.
- **v1.1 (2026-04-18)**: OD-1/2/3 확정 반영. 타임라인 Week 1 B 중심 / Week 2 T1 중심으로 재구성. A-0 Week 1 Day 1 선행.
- **v2.0 (2026-04-19)**: **1.5일 압축 재작성**. Sprint 기간 단위를 2주 → 분 단위 시간 블록. Phase 1 전체(Sprint 1~5)를 2026-04-19 오후 완료 목표. KPI 3단계 완화 기준 도입. OD-3 폐기, OD-5/OD-6 신설. Sprint 3 재평가 Gate 오늘 내로 당김.
