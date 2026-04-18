# Sprint 1 Plan — T1 Foundry-X Plumb E2E + Tier-A(충전) Empty Slot 발굴

**문서 유형**: Sprint Plan (Phase 1 PoC 10주 중 Sprint 1)
**상위 REQ**: `AIF-REQ-035` (Decode-X v1.3 본 개발, IN_PROGRESS)
**기반 PRD**: `docs/req-interview/decode-x-v1.2/prd-v2.md` (v1.3)
**선행 Closure**: `docs/req-interview/decode-x-v1.2/phase-0-closure-report.md` (v1.0)
**작성일**: 2026-04-20 (Phase 0 Closure 직후, 세션 210 착수)
**작성자**: Sinclair (Decode-X Lead 겸 Foundry-X PM)
**상태**: ✅ **v1.1 확정** — Sprint 1 착수 준비 완료 (OD-1~3 Sinclair 확정)
**Sprint 기간**: 2026-04-21 (Week 1 Day 1) ~ 2026-05-04 (Week 2 Day 5), 2주 · 10영업일
**Sprint 번호**: 1 / 5 (Phase 1 PoC Sprint 시리즈)

---

## 0. Sprint 1 요약 (Executive Summary)

Phase 1 PoC 10주의 **첫 Sprint**로, **Mission Pivot 실증의 두 기둥** 중 각 하나씩을 최소 형태로 띄운다.

1. **T1 — Foundry-X Plumb E2E 1건 녹색**: Decode-X가 생산한 Spec Container를 Foundry-X Plumb에 투입하여 `SyncResult.success == true` 반환을 1건 이상 확보. Foundry-X 통합 실행가능성(Integration Readiness)의 최소 증명.
2. **B — Tier-A "충전" 서비스 Empty Slot 발굴 파일럿**: 전자온누리상품권 Tier-A 7개 중 **충전·충전취소** 서비스 1건을 대상으로 §2.5.5 Empty Slot 발굴 파이프라인을 1-cycle 완주. Sprint 1은 **발굴(Identify)+분류(Classify)**까지, Fill은 Sprint 2~3에 분배.

**Sprint 1 판정 기준**:
- T1: `SyncResult.success == true` 1회 이상 (green 5회 연속은 Sprint 3 말까지 목표, Sprint 1은 "최초 green" 확보)
- B: 충전 서비스에서 Empty Slot 후보 **최소 6건 이상 식별 + E1~E5 분류 + 우선순위(High/Med/Low) 부여**

---

## 1. Sprint 1 목표 (SMART)

| ID | 목표 | Measurable | Timebox |
|:--:|------|-----------|---------|
| S1-T1 | Foundry-X Plumb E2E "최초 green" | `SyncResult.success == true` 1건 확보, CI 로그에 `FX-SPEC-002 v1.0` 스키마 준수 증거 | Week 2 Day 3(2026-05-02)까지 |
| S1-B1 | 충전 서비스 Empty Slot 후보 발굴 | §2.5.4 택소노미 E1~E5 분류 완료된 후보 ≥6건, 각 건에 대해 "발견 근거(문서/인터뷰/로그)" 링크 | Week 2 Day 5(2026-05-04)까지 |
| S1-B2 | 충전 서비스 Input Completeness Score 측정 | §2.5.3 공식으로 S_input 산출, 0.75 미만이면 Deficiency Flag 부여 | Week 1 Day 4(2026-04-24)까지 |
| S1-M | Sprint 1 Retrospective + Sprint 2 착수안 | 회고 문서 1건 + Sprint 2 Backlog 초안 | 2026-05-04 EOD |

---

## 2. 스코프

### 2.1 In Scope
- **충전·충전취소** 서비스에 한정한 Empty Slot 발굴 (Tier-A 7개 중 1개)
- Decode-X 기존 자산(LPON 859 skills / 848 policies / 7,332 terms) 중 "충전" 도메인 부분집합 활용
- Foundry-X Plumb 계약 `FX-SPEC-002 v1.0 @ e5c7260` 스키마로 **1건의 Spec Container** 출력
- SyncResult 반환 로그 자동 수집(`.foundry-x/decisions.jsonl`) 경로 확보

### 2.2 Out of Scope (Sprint 2+ 이관)
- Empty Slot **Fill**(rules/ + tests/ + runbooks/ 3자 바인딩 완성) — Sprint 2~3
- T2 Prototype Shadow Mode 인프라 — Sprint 2
- T3 결정적 생성 PoC(3종 중 2종 이상) — Sprint 3
- LLM 예산 관측 체계(R2) — Sprint 2
- AgentResume stub 실구현 (AIF-REQ-026 잔여) — Sprint 1 미편입 결정 (세션 210)
- Tier-A 나머지 6개 서비스(예산/구매/결제/환불/선물/정산) Empty Slot 발굴

### 2.3 Non-Goals
- "충전" 전 범위 커버리지 달성 (Sprint 1은 **대표 Empty Slot 확인** 수준)
- Foundry-X Plumb 다회 green (Sprint 3 말까지 5연속 green 누적)
- Domain Archeologist 전담 FTE 확보 (1인 체제 — Sinclair 겸임)

---

## 3. 과업 A — T1 Foundry-X Plumb E2E

### 3.1 배경

**Foundry-X Plumb Output Contract** (`FX-SPEC-002 v1.0 @ e5c7260`)는 Decode-X가 Foundry-X로 Skill/Spec을 핸드오프할 때 준수해야 하는 스키마:

```
SyncResult {
  success: boolean,
  timestamp: ISO8601,
  duration: ms,
  triangle: { specToCode, codeToTest, specToTest },  // 3쌍 검증
  decisions: DecisionRecord[],                         // .foundry-x/decisions.jsonl
  errors: PlumbError[]                                 // FX-SPEC-003 병행
}
exit 0 = PASS, 2 = PARTIAL, 1/127 = FAIL
```

### 3.2 과업 분해

| 작업 | 산출물 | 기한 | 비고 |
|------|--------|------|------|
| A-1 대상 Skill 선정 | `sprint-1-selected-skill.md`: LPON 859 skills 중 충전 도메인 49건에서 1건 선정 + 선정 근거 | Week 2 Day 1 (04-28) | **선정 기준 가중치**: 문서 커버리지 **40%** + 테스트 가능성 **30%** + Plumb 호환성 **30%** (OD-1 확정). 3축 합계 상위 3건에서 최종 1건 선정 |
| A-2 Spec Container 조립 | 선정된 Skill의 Spec을 Decode-X `skill-packages/`에서 내보내 Foundry-X가 읽을 수 있는 디렉터리 구조(`rules/`, `tests/contract/`, `provenance.yaml`)로 정리 | Week 2 Day 2 (04-29) | §4.3 Spec Container 구조 기준 |
| A-3 Plumb 호출 파이프라인 구축 | Decode-X CI에서 Foundry-X Plumb CLI를 호출하고 SyncResult를 수집·저장하는 스크립트 1본 | Week 2 Day 2 (04-29) | 성공/실패 모두 로그 보존 |
| A-4 First Run 실행 + 결과 분석 | 첫 실행 결과가 green이 아니면 errors[] 분석 → Spec Container 조정 → 재실행 반복 | Week 2 Day 3 (05-02) | 목표 **최초 green 1회** |
| A-5 재현성 검증 | 동일 입력으로 2차 실행하여 SyncResult가 안정적인지 확인 (결정성 리플레이의 최초 버전) | Week 2 Day 4 (05-03) | Sprint 3의 "5연속 green"으로 이어지는 기반 |
| A-0 R-A1 Plumb CLI 버전 사전 조사 | Foundry-X 레포 `packages/plumb-cli` 버전·호출 인자 사전 조사 메모 | Week 1 Day 1 (04-21) | R-A1 완화의 선결 작업 |

### 3.3 성공 기준
- `SyncResult.success == true` 1건 이상 + `.foundry-x/decisions.jsonl` 생성 확인
- `errors[]` 비어있음 + `triangle.{specToCode,codeToTest,specToTest}` 모두 검증됨
- CI 재실행 시 동일한 결과 재현

### 3.4 리스크 & 대응
- **R-A1**: Foundry-X Plumb CLI의 Decode-X 측 호환 버전 미확인 → Foundry-X 레포 `packages/plumb-cli` 버전 사전 조사 (Week 1 Day 1)
- **R-A2**: Spec Container 구조가 Foundry-X 기대값과 어긋남 → `plumb-output-contract.md` §2.1 예시 입력을 Reference Case로 삼아 비교
- **R-A3**: 충전 도메인 테스트 데이터 부족으로 triangle 검증 실패 → A-1에서 테스트 데이터 최대 보유 skill 우선 선정

---

## 4. 과업 B — Tier-A(충전·충전취소) Empty Slot 발굴 파일럿

### 4.1 배경

PRD §2.5.6 Worked Example은 **선물** 서비스의 대표 Empty Slot 6건(ES-GIFT-001~006)을 예시로 제시. Sprint 1은 같은 방법론을 **충전·충전취소** 서비스에 적용하여 첫 도메인 실증을 생성.

**§2.5.4 Empty Slot 택소노미**:
- **E1 Surge**: 부하 급증 대응 규칙
- **E2 Fraud**: 부정 패턴 차단
- **E3 Reconcile**: 정산·회계 보정
- **E4 Exception**: 이벤트·한시 규칙
- **E5 Tacit**: 담당자 경험·심사 기준

### 4.2 과업 분해

| 작업 | 산출물 | 기한 | 비고 |
|------|--------|------|------|
| B-1 충전 서비스 범위 확정 | `sprint-1-charge-service-scope.md`: 충전·충전취소 범위의 세부 기능 목록 + LPON 기존 자산 매핑 | Week 1 Day 2 (04-22) | LPON 859 skills 중 "충전" 49건 카탈로그 재정리 |
| B-2 Input Completeness 측정 | S_input 스코어 (§2.5.3 공식: Σ(w_i × coverage_i) for i ∈ {code, doc, test, log, runbook}) | Week 1 Day 4 (04-24) | S_input < 0.75 시 Deficiency Flag |
| B-3 1차 Empty Slot 스크리닝 | 기존 LPON 정책 848건 + 용어 7,332건 + Gap 리포트 재독 → Empty Slot 후보 long-list 작성 | Week 1 Day 5 (04-25) | **목표 규모 15~20건** (OD-2 확정). E1~E5 5종 각 2~4건 분포 기대 |
| B-4 E1~E5 분류 + 우선순위 | long-list를 §2.5.4 택소노미로 분류, High/Med/Low 우선순위 부여, short-list ≥6건 확정 | Week 2 Day 3 (05-02) | ID 패턴 `ES-CHARGE-NNN`. short-list 추림 시 15~20건 → 6건 수렴 |
| B-5 Fill 후보 상세화 (샘플 1건) | short-list 중 우선순위 High 1건에 대해 "Filled 조건" 초안 작성 (Sprint 2 Fill 작업의 시드) | Week 2 Day 5 (05-04) | rules/ + tests/ + runbooks/ 중 최소 2개에 초안 작성 |

### 4.3 발굴 방법론 (§2.5.5 파이프라인 축약)

```
[기존 자산 재독]          [도메인 인터뷰 (1인 체제 — Tacit Agent 대체)]
LPON skills 49            Sinclair 자기 회고 + 과거 세션 로그 검색
LPON policies (charge)    → 암묵적 운영 규칙 추출
Gap Analysis 리포트        → E1~E5 라벨링
       │                            │
       └──────────┬────────────────┘
                  ▼
        Empty Slot Long-list (Week 2 Day 1)
                  ▼
        §2.5.4 택소노미 분류 + 우선순위
                  ▼
        Short-list ≥6건 (Week 2 Day 3)
                  ▼
        Sprint 2 Fill 후보 1건 상세화 (Week 2 Day 5)
```

### 4.4 성공 기준
- **Empty Slot 후보 ≥6건** 식별 + E1~E5 분류 완료
- 각 후보에 **발견 근거 링크** (source: skill/policy ID 또는 세션 번호)
- Input Completeness Score 산출 + Deficiency Flag 여부 판정
- Sprint 2 Fill 작업 시드 1건 (Filled 조건 초안)

### 4.5 리스크 & 대응
- **R-B1**: 1인 체제에서 Domain Archeologist 인터뷰 대체 수단 부재 → Sinclair 자기 회고 + LPON 과거 세션(세션 107~156 FactCheck) 로그 검색으로 대체. Tacit Interview Agent MVP(Sprint 5)는 이 공백을 체계화하는 후속 작업
- **R-B2**: 기존 자산(LPON)이 선물 중심이라 충전 도메인 Empty Slot이 부족할 수 있음 → B-2 S_input < 0.75이면 Sprint 1은 "Deficiency Flag + Sprint 2 보강 계획"으로 파이널라이즈 (실패 아님, 데이터로 기록)
- **R-B3**: §2.5.4 택소노미 해석 차이 → PRD §2.5.6 Worked Example의 라벨링 사례를 준거로 사용

---

## 5. 2주 타임라인 (OD-3: Week 1 B 중심 / Week 2 T1 중심)

### Week 1 (2026-04-21 ~ 04-25) — **B(Empty Slot) 중심**
| Day | 날짜 | 주요 과업 |
|:---:|:----:|----------|
| D1  | 04-21 (월) | 킥오프 + **A-0 R-A1 Plumb CLI 사전 조사** + B-1 충전 범위 확정 착수 |
| D2  | 04-22 (화) | B-1 완료 + B-2 Input Completeness 측정 착수 |
| D3  | 04-23 (수) | B-2 완료 (S_input 산출) + B-3 long-list 스크리닝 착수 |
| D4  | 04-24 (목) | B-3 스크리닝 계속 (LPON 자산 재독) |
| D5  | 04-25 (금) | B-3 long-list 15~20건 확정 + **Week 1 체크포인트** (T1 피봇 판단) |

### Week 2 (2026-04-28 ~ 05-04) — **T1(Plumb E2E) 중심 + B 마무리**
| Day | 날짜 | 주요 과업 |
|:---:|:----:|----------|
| D1  | 04-28 (월) | A-1 대상 Skill 선정 (3축 가중치 적용) + B-4 분류 착수 |
| D2  | 04-29 (화) | A-2 Spec Container 조립 + A-3 Plumb 호출 파이프라인 |
| D3  | 05-02 (금) | A-4 First Run + **최초 green 확보 목표** + B-4 short-list 확정 |
| D4  | 05-03 (토) | A-5 재현성 검증 + B-5 샘플 1건 Fill 조건 초안 |
| D5  | 05-04 (일) | B-5 완료 + Sprint 1 Retrospective + Sprint 2 Backlog 초안 |

**타임라인 설계 근거**: B-1/B-2는 Skill 선정(A-1) 입력 데이터이므로 Week 1 B 선행이 T1 Skill 선정 근거 품질을 높임. Week 1 말 체크포인트에서 R-A1이 🟠 이상 현실화되면 Week 2 전부를 T1로 투입하고 B-5(샘플 Fill)를 Sprint 2 착수로 이관.

---

## 6. 성공 기준 & 측정 방법

| KPI | 측정 | 임계값 |
|-----|------|-------|
| T1 최초 green | `SyncResult.success == true` 로그 건수 | ≥ 1 |
| Empty Slot 후보 수 | `ES-CHARGE-NNN` ID 부여된 후보 건수 | ≥ 6 |
| E1~E5 분류 완성도 | short-list 중 분류 라벨 부여 건수 / 전체 short-list | 100% |
| Input Completeness | §2.5.3 공식 S_input | 측정 완료 (값은 데이터로 기록) |
| Sprint 2 시드 | Fill 조건 초안 건수 | ≥ 1 |

**측정 타이밍**: Week 2 Day 5(05-04) EOD 기준.
**측정 방법**: 각 KPI 산출물에 대한 git commit + SPEC.md §7 AIF-REQ-035 Sprint 1 진행 상태 append.

---

## 7. 산출물 인벤토리

### 7.1 Sprint 1 내 생성
```
docs/poc/
├── sprint-1-plan.md (본 문서)
├── sprint-1-selected-skill.md (A-1)
├── sprint-1-spec-container.md (A-2 구조 설계)
├── sprint-1-plumb-first-run.md (A-4 결과 기록)
├── sprint-1-charge-service-scope.md (B-1)
├── sprint-1-input-completeness.md (B-2)
├── sprint-1-empty-slot-longlist.md (B-3)
├── sprint-1-empty-slot-shortlist.md (B-4)
├── sprint-1-fill-seed-01.md (B-5)
└── sprint-1-retrospective.md (M)

.foundry-x/
└── decisions.jsonl (A-4 런타임 생성)

docs/poc/
└── sprint-2-plan.md (Sprint 2 Backlog 초안, M 산출)
```

### 7.2 SPEC.md 반영
- §5 Current Status: Sprint 1 착수 + 완료 시점 반영
- §7 AIF-REQ-035 설명: Sprint 1 진행 로그 append

---

## 8. 리스크 보드 (Sprint 1 스냅샷)

| ID | 리스크 | 영향 | 완화 |
|----|--------|:---:|------|
| R-A1 | Foundry-X Plumb CLI 버전 스큐 | 🟡 | W1D1 사전 조사, FX-SPEC-002 v1.0 고정 |
| R-A2 | Spec Container 포맷 불일치 | 🟡 | Worked Example 준거 대조 |
| R-A3 | 충전 도메인 테스트 데이터 부족 | 🟠 | A-1 선정 시 테스트 풍부 skill 우선 |
| R-B1 | 1인 DA 부재로 Tacit 인터뷰 공백 | 🟡 | 자기 회고 + 세션 로그 검색, Sprint 5 Agent MVP로 체계화 |
| R-B2 | LPON이 선물 중심이라 충전 자산 빈약 | 🟠 | S_input 측정 결과로 Deficiency Flag, Sprint 2 보강 |
| R-B3 | 택소노미 해석 편향 | 🟢 | Worked Example 6건 라벨링 사례 준거 |

**판단 규칙**: 🟠 리스크 ≥2건 현실화 → Week 1 말(04-25) 중간 점검에서 Sprint 1 재범위 조정.

---

## 9. 의존 REQ & 후속 Sprint

| Sprint | 이관 선결 조건 | 비고 |
|:------:|---------------|------|
| Sprint 2 | Sprint 1 Empty Slot short-list + Input Completeness 데이터 | R2 LLM 예산·T2 Shadow Mode 중심, Fill 작업 본격 착수 |
| Sprint 3 | Plumb 안정 green 1건 이상 | T3 결정적 생성 PoC 2종 + AI-Ready 6기준 채점 |
| Sprint 4 | B/T/Q Spec Schema 완결성 | AIF-REQ-034 Deep Dive와 합류 |
| Sprint 5 | Handoff 패키지 후보 확보 | Tacit Interview Agent MVP + 최종 검증 |

**Phase 1 재평가 Gate**: Sprint 3 말(2026-06-01) — T1 녹색 + T3 2종 이상 PoC 성공 시 Phase 2 진입. 미달 시 Sprint 4~5 재계획.

---

## 10. Open Decisions — 확정 기록 (v1.1)

| ID | 질문 | 확정값 | 근거 |
|----|------|--------|------|
| OD-1 | A-1 Skill 선정 기준 3축 가중치 | **문서 40% / 테스트 30% / Plumb 30%** | 문서 커버리지 높은 Skill은 B-1 충전 범위 정리 시 재활용 가능. Sprint 1 이중 과업(T1+B) 효율성 우선 |
| OD-2 | B-3 long-list 목표 규모 | **15~20건** | E1~E5 5종 각 2~4건 분포가 자연스러운 규모. short-list 6건 추리기 여유 확보 |
| OD-3 | Week 1/Week 2 병행 강도 | **Week 1 B 중심 / Week 2 T1 중심** | B-1/B-2가 A-1 Skill 선정의 입력 데이터로 작동. Week 1 말 체크포인트로 T1 피봇 여유 확보 |
| OD-4 | 회고·Retrospective 포맷 | (Sprint 1 Week 2 Day 5 시점 결정) | 주간 체크포인트 실행 후 형태 확정 |

Sprint 1 Kickoff: 2026-04-21.

---

## 11. 변경 이력

- **v1.0 DRAFT (2026-04-20, 세션 210)**: 초안 작성. Closure Report §7.1 Sprint 1 Backlog 기반 상세화. OD-1~4 Sinclair 확정 대기.
- **v1.1 (2026-04-20, 세션 210)**: OD-1/2/3 Sinclair 확정 반영. 타임라인 Week 1 B 중심 / Week 2 T1 중심으로 재구성. A-0 (R-A1 사전 조사) Week 1 Day 1로 선행 배치.
