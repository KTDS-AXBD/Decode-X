# Sprint 216 Design — Working Prototype 데이터 동작 검증 하네스

**Sprint**: 216
**REQ**: AIF-REQ-035 Phase 2 F
**작성일**: 2026-04-20

---

## 1. 목표

`.decode-x/spec-containers/*/tests/contract/*.yaml`의 계약 시나리오를
Working Prototype 도메인 함수로 직접 실행해 round-trip 일치율을 측정한다.

## 2. 아키텍처

```
scripts/roundtrip-verify/
├── types.ts          — ContractFile, Scenario, RunResult 타입
├── fixtures.ts       — given 절 → SQLite in-memory DB 상태 세팅
├── runner.ts         — when 절 → 도메인 함수 호출 → actual 결과 반환
├── comparator.ts     — actual vs then 절 비교 → PASS/FAIL + 원인 코드
└── index.ts          — CLI: glob contract files → run → 리포트 출력
```

## 3. 타입 설계 (`types.ts`)

```typescript
interface ContractScenario {
  id: string;
  name: string;
  given: Record<string, unknown>;
  when: string;        // e.g. "payment_requested", "refund_requested"
  then: Record<string, unknown>[];
  ref?: string;
}

interface ContractFile {
  skillId: string;
  domain: string;
  scenarios: ContractScenario[];
}

type FailReason =
  | 'WRONG_OUTCOME'     // 성공/실패 방향 불일치
  | 'WRONG_VALUE'       // 수치/코드 불일치
  | 'UNEXPECTED_ERROR'  // 예외 발생 (기대 안 함)
  | 'EXPECTED_ERROR_MISSING';  // 예외 기대했으나 미발생

interface RunResult {
  contractFile: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  failReason?: FailReason;
  failDetail?: string;
}

interface Report {
  total: number;
  passed: number;
  failed: number;
  consistencyRate: number;
  results: RunResult[];
}
```

## 4. Fixture 매핑 (`fixtures.ts`)

`given` 절 필드를 SQLite 행 삽입으로 변환:

| given 필드 | DB 액션 |
|-----------|---------|
| `voucherBalance` | INSERT vouchers(balance=N, status='ACTIVE') |
| `merchantStatus` | INSERT merchants(status=given) |
| `paymentStatus` + `paymentId` | INSERT payments(id, status, amount) |
| `purchasedDaysAgo` | INSERT vouchers(purchased_at = now - N days) |
| `refundId` + `refundStatus` | INSERT refund_transactions(id, status) |

## 5. Runner 매핑 (`runner.ts`)

| `when` 값 | 도메인 함수 | 모듈 |
|-----------|------------|------|
| `payment_requested` | `processPayment(db, input)` | `domain/payment.ts` |
| `payment_cancel_requested` | `processPayment` + 취소 (cancel.ts) | `domain/cancel.ts` |
| `refund_requested` | `processRefundRequest(db, input)` | `domain/refund.ts` |
| `admin_approves_refund` | `approveRefund(db, input)` | `domain/refund.ts` |
| `admin_rejects_refund` | `rejectRefund(db, input)` | `domain/refund.ts` |
| `refund_approved` | `approveRefund(db, input)` | `domain/refund.ts` |

## 6. Comparator 로직 (`comparator.ts`)

`then` 배열의 각 key-value를 actual과 비교:

```
payment_completed: true  → actual.result !== null (성공)
payment_completed: false → actual.error !== null (실패)
balance_after: N         → actual.result.balanceAfter === N
error_code: X            → actual.error.code === X
balance_unchanged: true  → fixture 조회로 잔액 변동 없음 확인
sms_sent: true           → SMS mock 호출 여부 추적
```

## 7. Report Page 설계 (`poc-phase-2-report.tsx`)

### 레이아웃 섹션
1. **Hero Banner** — Phase 2 목표 + round-trip 일치율 대형 표시
2. **Track A KPI** — 6 서비스 Fill 진행률 (budget/charge/purchase/payment/refund/gift)
3. **Track B KPI** — round-trip 검증 결과 (전체/통과/실패/일치율)
4. **실패 케이스 분석** — 테이블: 시나리오ID / 이름 / 원인코드 / 상세
5. **Source-First 마커 분포** — SOURCE_MISSING / DOC_ONLY / DIVERGENCE 카운트

### 정적 데이터 (`poc-phase-2-report-data.ts`)
roundtrip-verify 실행 결과를 스냅샷으로 내장 (CI 없이 페이지 동작).

## 8. 라우트 등록

`/poc-phase-2` → `<PocPhase2ReportPage />`

## 9. Constraint

- `scripts/roundtrip-verify/`는 Node.js 독립 실행. pnpm workspace 참여 안 함.
- `better-sqlite3` 직접 의존 (pilot-lpon-cancel과 버전 공유).
- 계약 파일 경로 기준: 프로젝트 루트 기준 `.decode-x/spec-containers/`.
