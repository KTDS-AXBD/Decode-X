---
title: "Sprint 4 Design — B/T/Q Spec Schema 완결성 + T3 Self-Consistency Voting PoC"
requirement: AIF-REQ-035
sprint: 4
created: 2026-04-19
status: DRAFT
---

# Sprint 4 Design — B/T/Q Spec Schema 완결성

## 1. 목표

Sprint 3 이관 항목 완료:
1. **T3 Self-Consistency Voting PoC** — T3 3번째 결정적 생성 기법 검증
2. **ES-CHARGE-006/007/009 Fill** — 3자 바인딩(rules + tests + runbooks) 9파일
3. **llm-client.ts seed 파라미터 추가** — `LlmCallOptions.seed?: number` 필드
4. **Sprint 4 Exit Check** — B/T/Q Spec Schema 완결성 검증 문서

---

## 2. 산출물 목록

### 2.1 신규 파일 (9파일 3자 바인딩)

```
.decode-x/spec-containers/lpon-charge/
├── rules/
│   ├── ES-CHARGE-006.md    # 대량 충전 Rate Limiting 정책
│   ├── ES-CHARGE-007.md    # 외부 API 장애 시 재시도 정책
│   └── ES-CHARGE-009.md    # 잔액 조회 캐시 무효화 기준
├── tests/
│   ├── ES-CHARGE-006.yaml
│   ├── ES-CHARGE-007.yaml
│   └── ES-CHARGE-009.yaml
└── runbooks/
    ├── ES-CHARGE-006.md
    ├── ES-CHARGE-007.md
    └── ES-CHARGE-009.md
```

### 2.2 수정 파일

```
packages/utils/src/llm-client.ts    # seed 파라미터 추가
```

### 2.3 신규 문서 (PoC + Exit Check)

```
docs/poc/
├── sprint-4-t3-self-consistency-poc.md   # T3 3번째 기법 설계+검증 기록
└── sprint-4-exit-check.md                 # Sprint 4 출구 점검
```

---

## 3. 설계 상세

### 3.1 ES-CHARGE-006 — 대량 충전 Rate Limiting

**유형**: E1 (Surge), 우선순위: High
**발견 근거**: 초당 N건 초과 충전 요청 시 처리 방법 미정의

| 항목 | 정의 |
|------|------|
| condition | 단일 회사 또는 전체 시스템에서 충전 요청이 임계치를 초과할 때 |
| criteria | 회사당: 10 req/s 초과 또는 배치: 100건/분 초과 |
| outcome | 초과분 → 429 + Retry-After 헤더 / 대기열 삽입 |
| exception | 시스템 전체 threshold(1000 req/min) 초과 시 Circuit Breaker Open |

### 3.2 ES-CHARGE-007 — 외부 API 장애 시 재시도 정책

**유형**: E4 (Exception), 우선순위: Med
**발견 근거**: BL-003 "에러 반환 후 중단"만 있고 재시도 횟수/인터벌 미정의

| 항목 | 정의 |
|------|------|
| condition | 외부 머니플랫폼 출금 API 호출 실패 시 (5xx, timeout) |
| criteria | 재시도 가능: 5xx, timeout / 재시도 불가: 4xx (요청 오류) |
| outcome | Exponential Backoff: 1s → 2s → 4s, 최대 3회, 실패 시 PENDING 상태 전환 |
| exception | 3회 모두 실패 시 charge_transactions.status = 'FAILED_RETRY_EXHAUSTED' + 알림 |

### 3.3 ES-CHARGE-009 — 잔액 조회 캐시 무효화 기준

**유형**: E3 (Reconcile), 우선순위: Med
**발견 근거**: 잔액 조회가 실시간인지 캐시인지, 무효화 트리거 미정의

| 항목 | 정의 |
|------|------|
| condition | 출금계좌 잔액 조회 시 (충전 사전 검증) |
| criteria | 캐시 TTL: 60초 / 무효화 트리거: 충전 성공/실패/취소 이벤트 발생 시 |
| outcome | TTL 내: 캐시 반환 (KV 조회) / 무효화 시: 외부 잔액 API 재호출 후 캐시 갱신 |
| exception | 외부 API 장애 시 캐시 stale 허용 (최대 5분) + stale 플래그 응답 포함 |

### 3.4 llm-client.ts seed 파라미터

```typescript
// LlmCallOptions에 추가
seed?: number;  // 결정적 생성 시 고정 seed

// callLlmRouterWithMeta 내부 body 생성에 추가
if (options?.seed !== undefined) body["seed"] = options.seed;
```

### 3.5 T3 Self-Consistency Voting PoC

**개념**: 동일 프롬프트를 N회(권장 3~5회) 실행 → 가장 많이 등장한 답변 선택 (다수결)
- temperature=0.3~0.7 (다양성 확보) + N회 호출
- JSON 구조 비교: condition/criteria/outcome 키별로 가장 일관된 값 선택
- Phase 2에서는 고신뢰도 Policy 생성 시 적용 예정

**검증 방법**: ES-CHARGE-001 프롬프트를 temperature=0.5, N=3회 실행
→ 3개 결과의 주요 필드 일치율 계산 → ≥80% 일치를 "결정적"으로 판정

---

## 4. 검증 기준 (완결성 체크)

| 항목 | 기준 | 판정 방법 |
|------|------|-----------|
| 3자 바인딩 완결 | 9파일 모두 존재 | `ls` 확인 |
| llm-client.ts | `seed` 파라미터 추가 + typecheck PASS | `pnpm typecheck` |
| T3 PoC | 3기법 모두 문서화 | `sprint-4-t3-self-consistency-poc.md` |
| Plumb E2E | success=true, specToCode ≥ 9/9 | `foundry-x plumb` |
| typecheck + lint | PASS | `pnpm typecheck && pnpm lint` |

---

## 5. Worker 파일 매핑

| # | Worker | 담당 파일 |
|---|--------|-----------|
| W1 | rules Fill | ES-CHARGE-006/007/009 rules 3파일 |
| W2 | tests+runbooks Fill | ES-CHARGE-006/007/009 tests+runbooks 6파일 |
| W3 | llm-client + PoC doc | llm-client.ts + sprint-4-t3-self-consistency-poc.md |

---

## 6. KPI

| KPI | 기준 | 목표 |
|-----|------|------|
| 3자 바인딩 완성 | 9파일 생성 | 9/9 |
| T3 PoC 3기법 | Self-Consistency Voting 문서화 | ✅ |
| typecheck | PASS | 0 errors |
| Plumb Match Rate | ≥ 90% | 100% |
