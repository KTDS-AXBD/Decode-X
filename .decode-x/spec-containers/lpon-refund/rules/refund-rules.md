# Spec Container — POL-LPON-REFUND-001 (온누리상품권 환불 규칙)

**Skill ID**: POL-LPON-REFUND-001
**Domain**: LPON 환불 (Refund)
**Source**: AI Foundry 역공학 추출 — pilot-lpon-cancel/src/domain/refund.ts + functions.md §FN-005~006
**Version**: 1.0.0
**Status**: draft

---

## 비즈니스 룰 (BL-020 ~ BL-030)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BL-020 | 거래 환불 요청이 접수될 때 | 거래의 환불 가능 여부(rfndPsbltyYn) = 'Y' | 환불 처리를 진행한다 | rfndPsbltyYn = 'N'이면 환불 거부 |
| BL-021 | 환불 가능 여부 체크를 통과한 경우 | 환불 가능 조건 충족 | 입금 처리를 진행한다 | 조건 미충족 시 환불 거부 |
| BL-022 | 입금이 정상적으로 완료된 경우 | 입금 프로세스가 에러 없이 종료됨 | 환불 완료 처리한다 | [미정의] |
| BL-023 | 입금이 실패한 경우 | 입금 프로세스에서 오류 발생 | 에러를 반환한다 | [미정의] |
| BL-024 | 미사용 상품권 환불 요청 시 | 구매 후 7일 이내 환불 요청 | 전액 환불 처리한다 | 7일 초과 시 환불 불가 |
| BL-025 | 기 사용 상품권 잔액 환불 요청 시 | 전체 금액의 60% 이상 사용 | 잔액 환불이 가능하다 | 60% 미만 사용 시 잔액 환불 불가 |
| BL-026 | 캐시백 또는 할인보전 금액 환불 요청 시 | 캐시백 및 할인보전 금액에 해당 | 현금 환불 불가 | [미정의 — 포인트 전환 등 대안 검토 필요] |
| BL-027 | 계좌 오류로 환불 실패 시 | 환불계좌 오류 발생 | 소비자가 환불계좌 재등록 또는 고객센터 수기 접수로 환불 처리한다 | [미정의] |
| BL-028 | 환불 요청 시 제외금액 산정이 필요할 때 | 환불요청액에서 제외금액을 차감 | 입금액 = 환불요청액 − 제외금액으로 계산한다 | 제외금액이 0이면 전액 환불 |
| BL-029 | 유효기간 만료 상품권 환불 요청 시 | 원칙적으로 환불 불가 | 환불을 거부한다. 단, 강성 민원 시 강제환불 기능을 활용한다 | [미정의] |
| BL-030 | 상품권 유효기간 연장 요청 시 | 소진공 요청사항에 해당 | 유효기간 연장 불가 | [미정의] |

---

## 데이터 영향

- **변경 테이블**: `refund_transactions`, `vouchers` (잔액 차감), `deposit_transactions`, `refund_accounts`
- **이벤트 발행**: `RefundRequested`, `RefundCompleted`, `RefundFailed`, `DepositCompleted`, `RefundApproved`, `RefundRejected`

## 환불 유형 분류

| 유형 | 조건 | 처리 | BL |
|------|------|------|-----|
| UNUSED_FULL | 미사용 + 구매 후 7일 이내 | 전액 환불 | BL-024 |
| USED_BALANCE | 기사용 + 60% 이상 사용 | 잔액 환불 | BL-025 |
| EXPIRED | 유효기간 만료 | 원칙 거부 (강제환불 예외) | BL-029 |

## 환불 프로세스 (2단계)

```
1단계: 환불 신청 (FN-005)
  사용자 → POST /api/v1/refunds
  결과: refund_transactions.status='PENDING'
  대기: ADMIN 승인

2단계: 환불 승인/거절 (FN-006)
  ADMIN → POST /api/v1/refunds/{id}/approve or /reject
  승인: DepositApi.requestDeposit() 호출 → 입금
  거절: refund_transactions.status='REJECTED'
```

## API 연동

- 환불 신청: `POST /api/v1/refunds`
- 환불 승인: `POST /api/v1/refunds/{refundId}/approve`
- 환불 거절: `POST /api/v1/refunds/{refundId}/reject`
- 입금 API: `DepositApi.requestDeposit(accountId, amount)`
