# Spec Container — LPON-CANCEL-001 (LPON Cancel sub-flow)

**Skill ID**: LPON-CANCEL-001
**Domain**: LPON Cancel (lpon-payment cancel sub-flow 분리)
**Source**: `반제품-스펙/.../src/domain/cancel.ts` (FN-004 결제 취소)
**Version**: 1.0.0
**Status**: active
**Sprint**: 277 (F443) — 11번째 도메인 활성화

---

## 비즈니스 룰

본 도메인은 lpon-payment의 cancel sub-flow를 분리한 11번째 도메인이다.
**신규 BL은 BL-042 1건**이며, BL-014/016/017은 lpon-payment 도메인에 정의된 ID를 reference로 사용한다 (ID 중복 정의 회피).

### Reference (lpon-payment에 정의됨)

본 도메인의 cancel 흐름은 다음 BL을 참조하며, detector 중복 카운트 회피를 위해 본 도메인 표에 포함하지 않는다.

- **BL-014** (lpon-payment): 결제가 정상적으로 완료된 경우 (`status = 'PAID'`) → 결제취소 가능. PAID 아님 시 `E409-ST` throw.
- **BL-016** (lpon-payment): 결제 승인 취소 요청 접수 시 → 카드사에 취소 요청 전달 + `payments.status='CANCELED'` + 잔액 복구. 실패 시 `E502`.
- **BL-017** (lpon-payment): 가맹점주 온누리앱에서 취소버튼 클릭 시 → BC카드 MPM으로 결제 취소전문 전송. 실패 시 재시도.

### 신규 BL (본 도메인)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BL-042 | 결제 망 취소 처리 시 (외부 결제망 이벤트 수신) | `status='PAID'` AND `idempotencyKey` 미사용 | `payments.status='NETWORK_CANCELED'` + cancel_transactions INSERT (`type='NETWORK'`) + vouchers.balance += amount (atomic transaction) | 이미 처리됨 → `ALREADY_PROCESSED` 멱등 응답, PAID 아님 → `E409` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `payments` | `status: PAID → CANCELED` (BL-016) 또는 `PAID → NETWORK_CANCELED` (BL-042) + `canceled_at` set | processCancel / processNetworkCancel |
| `cancel_transactions` | INSERT (cancel_type=`FULL`/`NETWORK`, status=`COMPLETED`) | processCancel / processNetworkCancel |
| `vouchers` | `balance += cancel_amount` (잔액 복구) | processCancel / processNetworkCancel atomic |

---

## 외부 API 의존성

- **CardCancelApi**: `requestCancel(paymentId, amount)` — 카드사 취소 전문 전송 (BL-016, BL-017). Mock 구현 제공 (`mockCardCancelApi`).

---

## 권한

- **본인** (`payment.user_id === userId`) 또는 **ADMIN** (`userRole === 'ADMIN'`) 만 processCancel 호출 가능 (`E403`).
- **processNetworkCancel**은 SYSTEM 호출 (사용자 권한 무관).

---

## 취소 가능 기간

- 결제일(`paid_at`)로부터 **7일 이내**만 processCancel 가능 (`CANCEL_PERIOD_DAYS = 7`).
- 7일 초과 시 `E422-PD` throw.
- BL-042 (network cancel)은 기간 제약 없음 (외부 망 이벤트 기반).

---

## 관련 문서

- `rules/BL-042.md` — 신규 BL detail
- `runbooks/BL-042.md` — operational runbook
- `tests/BL-042.yaml` — test scenarios
- `.decode-x/spec-containers/lpon-payment/rules/payment-rules.md` — BL-014/016/017 원본 정의
