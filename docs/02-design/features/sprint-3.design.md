---
sprint: 3
title: Sprint 3 Design — T3 결정적 생성 PoC 2종 + 재평가 Gate + ES-CHARGE-004/005/008 Fill
req: AIF-REQ-035
created: 2026-04-19
status: confirmed
---

# Sprint 3 Design

---

## §1 T3 결정적 생성 PoC 설계

**목표**: LLM 출력 비결정성을 제어하여 Spec 재현성을 보장하는 2종 기법 검증.

PRD §D 요건: "Temperature=0 + Seed 고정 + Self-Consistency Voting 3종 기법 PoC"
Sprint 3 범위: **Temperature=0** + **Seed 고정** (Self-Consistency Voting은 Sprint 4)

### 1.1 Temperature=0 전략

```
입력: ES-CHARGE-001 rules 생성 프롬프트 (고정)
실행: temperature=0 으로 2회 실행
검증: 출력 텍스트 diff → 동일하면 결정성 확인
기록: sprint-3-t3-deterministic-poc.md §1
```

**적용 대상**: Stage 3 Policy Inference (Claude Opus/Sonnet 호출 시)
**보장 범위**: 동일 프롬프트 + 동일 모델 버전 → 동일 출력

### 1.2 Seed 고정 전략

```
입력: 동일 프롬프트
실행: seed=42 고정하여 2회 실행 (Anthropic API seed 파라미터)
검증: 출력 diff → 동일하면 결정성 확인
기록: sprint-3-t3-deterministic-poc.md §2
```

**적용 대상**: Stage 2~5 전반 (모든 LLM 호출)
**보장 범위**: seed 파라미터가 지원되는 모델에서 재현성 강화

### 1.3 산출물

```
docs/poc/sprint-3-t3-deterministic-poc.md
  §1 Temperature=0 검증 결과
  §2 Seed 고정 검증 결과
  §3 결론 및 Phase 2 적용 계획
```

---

## §2 Empty Slot Fill 3자 바인딩 구조

Sprint 2와 동일 구조 (`rules/` + `tests/` + `runbooks/`):

```
.decode-x/spec-containers/lpon-charge/
├── rules/
│   ├── ES-CHARGE-004.md   (자동충전 중복 락)
│   ├── ES-CHARGE-005.md   (명절 한도 증량)
│   └── ES-CHARGE-008.md   (이중 출금 감지)
├── tests/
│   ├── ES-CHARGE-004.yaml
│   ├── ES-CHARGE-005.yaml
│   └── ES-CHARGE-008.yaml
└── runbooks/
    ├── ES-CHARGE-004.md
    ├── ES-CHARGE-005.md
    └── ES-CHARGE-008.md
```

### ES-CHARGE-004: 자동충전 중복 실행 방지 (분산 락)

**규칙 핵심**:
- condition: 동일 자동충전 스케줄(jobId + targetDate)이 분산 환경에서 중복 실행될 때
- criteria: D1 `auto_charge_locks` 테이블의 락 상태 확인 (LOCKED / UNLOCKED)
- outcome: 락 획득 성공 → 충전 실행 / 실패 → SKIP (이미 처리 중)

**테스트 시나리오**:
- TC-LOCK-001: 단일 실행 성공
- TC-LOCK-002: 중복 실행 — 두 번째 SKIP
- TC-LOCK-003: 락 만료(TTL) 후 재실행 허용
- TC-LOCK-004: 실행 완료 후 락 해제 확인

### ES-CHARGE-005: 명절/이벤트 기간 충전 한도 일시 증량

**규칙 핵심**:
- condition: 관리자가 이벤트 기간(startDate~endDate)과 증량 한도를 사전 등록
- criteria: 현재 시각이 이벤트 기간 내 + 사용자 요청 금액이 증량 한도 이내
- outcome: 일반 한도 대신 이벤트 한도 적용 + 이벤트 적용 로그 기록

**테스트 시나리오**:
- TC-EVT-001: 이벤트 기간 내 증량 한도 내 충전 허용
- TC-EVT-002: 이벤트 기간 외 일반 한도 적용
- TC-EVT-003: 이벤트 한도 초과 거부
- TC-EVT-004: 이벤트 기간 경계값 (시작/종료 일시)

### ES-CHARGE-008: 이중 출금 감지 (타임아웃 후 재호출)

**규칙 핵심**:
- condition: 출금 API 타임아웃 후 재호출 시 외부 은행에서 이미 출금 처리된 경우
- criteria: `withdrawal_transactions` + 외부 API 상태 조회 → 이중 출금 여부 판정
- outcome: 이중 출금 확인 → 신규 출금 차단 + 에스컬레이션 / 미확인 → 신규 시도 허용

**테스트 시나리오**:
- TC-DW-001: 타임아웃 후 재호출 — 외부 이미 처리됨 → 차단
- TC-DW-002: 타임아웃 후 재호출 — 외부 미처리 → 신규 시도
- TC-DW-003: 정상 재시도 (첫 실패 후) — 정상 처리
- TC-DW-004: 이중 출금 에스컬레이션 티켓 생성 확인

---

## §3 재평가 Gate 판정 기준

**Gate 조건 (T1 + T3 기준)**:

| 조건 | 기준 | Sprint 3 기대값 |
|------|------|----------------|
| T1 green 누적 | ≥1건 (Sprint 3 Gate) | 2건 (Sprint 1 2회 + 추가) |
| T3 결정적 생성 | 2종 최소 동작 | Temperature=0 + Seed 고정 각 1건 검증 |

**판정**:
- `GO`: 양 조건 충족 → Sprint 4~5 진행
- `CONDITIONAL-GO`: T1 충족 + T3 부분 동작 → Sprint 4 진행, T3 재검토
- `NO-GO`: T1 미충족 → Sprint 1~3 재검토 후 재계획

---

## §4 테스트 계약

파일 기반 산출물 중심 Sprint:
- 9개 파일 존재 확인 (ES-CHARGE-004/005/008 × 3자)
- T3 PoC 문서 생성 확인 (2섹션 이상)
- sprint-3-exit-check.md Gate 판정 기록

---

## §5 Worker 파일 매핑

| 파일 | 내용 |
|------|------|
| `docs/01-plan/features/sprint-3.plan.md` | Sprint 3 계획 |
| `docs/02-design/features/sprint-3.design.md` | Sprint 3 설계 (본 문서) |
| `docs/poc/sprint-3-t3-deterministic-poc.md` | T3 결정적 생성 PoC 결과 |
| `.decode-x/spec-containers/lpon-charge/rules/ES-CHARGE-004.md` | 자동충전 중복 락 규칙 |
| `.decode-x/spec-containers/lpon-charge/tests/ES-CHARGE-004.yaml` | 자동충전 중복 락 테스트 |
| `.decode-x/spec-containers/lpon-charge/runbooks/ES-CHARGE-004.md` | 자동충전 중복 락 운영 가이드 |
| `.decode-x/spec-containers/lpon-charge/rules/ES-CHARGE-005.md` | 명절 한도 증량 규칙 |
| `.decode-x/spec-containers/lpon-charge/tests/ES-CHARGE-005.yaml` | 명절 한도 증량 테스트 |
| `.decode-x/spec-containers/lpon-charge/runbooks/ES-CHARGE-005.md` | 명절 한도 증량 운영 가이드 |
| `.decode-x/spec-containers/lpon-charge/rules/ES-CHARGE-008.md` | 이중 출금 감지 규칙 |
| `.decode-x/spec-containers/lpon-charge/tests/ES-CHARGE-008.yaml` | 이중 출금 감지 테스트 |
| `.decode-x/spec-containers/lpon-charge/runbooks/ES-CHARGE-008.md` | 이중 출금 감지 운영 가이드 |
| `docs/poc/sprint-3-exit-check.md` | Sprint 3 출구 점검 + Gate 판정 |
