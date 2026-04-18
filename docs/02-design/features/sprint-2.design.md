---
sprint: 2
title: Sprint 2 Design — R2 LLM 예산 + T2 Shadow Mode + Empty Slot Fill 첫 3건
req: AIF-REQ-035
created: 2026-04-19
status: confirmed
---

# Sprint 2 Design

---

## §1 R2 LLM 예산 관측 스키마

### 파일 경로
```
docs/poc/sprint-2-llm-budget-schema.md   ← 스키마 설명
docs/poc/sprint-2-llm-budget-log.jsonl   ← 샘플 로그
```

### LlmBudgetEntry 스키마
```json
{
  "ts": "ISO8601",
  "callerService": "string",
  "tier": "1|2|3",
  "model": "string",
  "promptTokens": "number",
  "completionTokens": "number",
  "latencyMs": "number",
  "estimatedCostUsd": "number",
  "sprintNum": "number",
  "tags": ["string"]
}
```

R2 키: `llm-budget/{year}/{month}/{date}/sprint-{N}.jsonl`

---

## §2 T2 Shadow Mode 설계

### 개념
Shadow Mode = Plumb E2E를 실제 요청 경로와 **병렬로** 실행하되,
출력을 decisions.jsonl에만 기록하고 응답에 영향을 주지 않는 모드.
Sprint 2에서는 "1 라인" — decisions.jsonl에 mode 필드만 추가.

### decisions.jsonl Shadow 엔트리 포맷
```json
{
  "ts": "ISO8601",
  "decisionId": "DEC-S2-001",
  "mode": "shadow",
  "source": "sprint-2-shadow-marker",
  "description": "T2 Shadow Mode 프로토타입 — 1라인 마커",
  "sprintNum": 2
}
```

### 파일
```
.foundry-x/decisions.jsonl   ← shadow 엔트리 추가
docs/poc/sprint-2-shadow-mode.md   ← 설계 기록
```

---

## §3 Empty Slot Fill 3자 바인딩 구조

각 ES-CHARGE-NNN에 대해 세 파일 생성:

```
.decode-x/spec-containers/lpon-charge/
├── rules/
│   ├── ES-CHARGE-001.md
│   ├── ES-CHARGE-002.md
│   └── ES-CHARGE-003.md
├── tests/
│   ├── ES-CHARGE-001.yaml
│   ├── ES-CHARGE-002.yaml
│   └── ES-CHARGE-003.yaml
└── runbooks/
    ├── ES-CHARGE-001.md
    ├── ES-CHARGE-002.md
    └── ES-CHARGE-003.md
```

### ES-CHARGE-001: 충전 멱등성

**rules**: condition=동일 chargeRequestId 재수신 / criteria=charge_transactions 상태 확인 / outcome=기존 결과 반환
**tests**: TC-IDEM-001(중복 완료), TC-IDEM-002(실패 재시도), TC-IDEM-003(타임아웃 재시도), TC-IDEM-004(신규 요청)
**runbooks**: 이중 충전 발생 시 수동 조치 4단계

### ES-CHARGE-002: 출금 타임아웃 에스컬레이션 기준

**rules**: condition=출금 API timeout(>30s) / criteria=금액 기준(≥50만원 즉시 에스컬레이션, <50만원 2회 재시도 후) / outcome=에스컬레이션 티켓 생성
**tests**: TC-ESC-001(소액 재시도), TC-ESC-002(고액 즉시 에스컬레이션), TC-ESC-003(재시도 후 성공)
**runbooks**: 에스컬레이션 티켓 처리 절차 + SLA 기준

### ES-CHARGE-003: 충전 한도 초과 분할 충전 가이드

**rules**: condition=요청 금액 > 일일 한도 / criteria=잔여 한도 계산 / outcome=분할 충전 가능 금액 안내 + 사용자 확인
**tests**: TC-SPLIT-001(한도 초과), TC-SPLIT-002(잔여 한도 내), TC-SPLIT-003(한도 정확히 일치)
**runbooks**: 고객센터 분할 충전 안내 스크립트

---

## §4 테스트 계약 (TDD Red Target)

파일 기반 산출물 중심 Sprint — 코드 테스트 없음.
검증: 9개 파일 존재 확인 + decisions.jsonl shadow 엔트리 확인 + llm-budget-log.jsonl 엔트리 확인.

---

## §5 Worker 파일 매핑

| 파일 | 내용 |
|------|------|
| `docs/poc/sprint-2-llm-budget-schema.md` | R2 스키마 설명 |
| `docs/poc/sprint-2-llm-budget-log.jsonl` | 샘플 로그 엔트리 |
| `docs/poc/sprint-2-shadow-mode.md` | T2 Shadow Mode 설계 |
| `.foundry-x/decisions.jsonl` | shadow 엔트리 추가 |
| `.decode-x/spec-containers/lpon-charge/rules/ES-CHARGE-001.md` | 멱등성 규칙 |
| `.decode-x/spec-containers/lpon-charge/tests/ES-CHARGE-001.yaml` | 멱등성 테스트 |
| `.decode-x/spec-containers/lpon-charge/runbooks/ES-CHARGE-001.md` | 멱등성 운영 가이드 |
| `.decode-x/spec-containers/lpon-charge/rules/ES-CHARGE-002.md` | 에스컬레이션 규칙 |
| `.decode-x/spec-containers/lpon-charge/tests/ES-CHARGE-002.yaml` | 에스컬레이션 테스트 |
| `.decode-x/spec-containers/lpon-charge/runbooks/ES-CHARGE-002.md` | 에스컬레이션 운영 가이드 |
| `.decode-x/spec-containers/lpon-charge/rules/ES-CHARGE-003.md` | 분할 충전 규칙 |
| `.decode-x/spec-containers/lpon-charge/tests/ES-CHARGE-003.yaml` | 분할 충전 테스트 |
| `.decode-x/spec-containers/lpon-charge/runbooks/ES-CHARGE-003.md` | 분할 충전 운영 가이드 |
