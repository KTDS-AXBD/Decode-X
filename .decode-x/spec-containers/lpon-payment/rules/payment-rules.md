# Spec Container — POL-LPON-PAYMENT-001 (온누리상품권 결제 규칙)

**Skill ID**: POL-LPON-PAYMENT-001
**Domain**: LPON 결제/결제취소 (Payment/Cancel)
**Source**: AI Foundry 역공학 추출 — pilot-lpon-cancel/src/domain/payment.ts + functions.md §FN-003~004
**Version**: 1.0.0
**Status**: draft

---

## 비즈니스 룰 (BL-013 ~ BL-019)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BL-013 | 회사가 충전 환불을 요청하는 경우 | 환불 요청이 유효함 | 충전 환불 처리를 진행한다 | 유효하지 않은 요청 시 거부 |
| BL-014 | 결제가 정상적으로 완료된 경우 | 결제 완료 상태 확인 (status='PAID') | 결제취소가 가능하다 (부분취소, 망취소 포함) | 결제 미완료(PENDING/FAILED) 시 취소 불가 (E409) |
| BL-015 | 결제 금액이 50,000원 이상인 경우 | 결제 요청 금액 ≥ 50,000원 | SMS를 발송한다 | 50,000원 미만 시 SMS 미발송 |
| BL-016 | 결제 승인 취소 요청이 접수된 경우 | 취소 요청이 정상적으로 접수됨 | 카드사에 취소 요청을 전달하고 거래 기록을 업데이트한다 | 접수 실패 시 에러 반환 |
| BL-017 | 가맹점주가 온누리앱에서 결제내역 확인 후 취소버튼을 클릭한 경우 | 취소버튼 클릭 이벤트 발생 | BC카드 MPM으로 결제 취소전문을 전송한다 | 전송 실패 시 재시도 |
| BL-018 | QR 결제 취소 요청이 생성된 경우 | 가맹점주가 취소 승인 처리를 완료 | 취소 처리가 완료된다 | 가맹점주 미승인 시 취소 보류 |
| BL-019 | 탈퇴 후 결제 또는 매입 취소가 발생한 경우 | 탈퇴 회원의 취소 발생 | AP06(지급형 상품권 조회/지급) API를 통해 취소 처리한다 | API 실패 시 수기처리 |

---

## 데이터 영향

- **변경 테이블**: `payments`, `vouchers` (잔액 차감/복구), `cancel_transactions`, `payment_notifications`
- **이벤트 발행**: `PaymentCompleted`, `PaymentCanceled`, `PaymentNotification`, `CancelApprovalRequested`

## 결제 수단별 처리

| method | 처리 방식 | 외부 API |
|--------|-----------|---------|
| QR | 표준 결제 처리 (no external) | — |
| CARD | 카드사 승인 API 호출 | `CardApi.authorize()` |
| ONLINE | 온라인 결제 처리 | — |

## 결제취소 유형

| 유형 | 처리 | BL |
|------|------|-----|
| FULL | 전액 취소 → vouchers.balance 전액 복구 | BL-014 |
| PARTIAL | 부분 취소 → cancel_amount만큼 복구 | BL-014 |
| QR_MERCHANT | 가맹점 취소 → BC카드 MPM 전문 | BL-017 |
| WITHDRAW_MEMBER | 탈퇴회원 취소 → AP06 API | BL-019 |

## API 연동

- 결제: `POST /api/v1/vouchers/{id}/pay`
- 결제취소: `POST /api/v1/payments/{paymentId}/cancel`
- 카드사 승인: `CardApi.authorize(merchantId, amount)`
- AP06: 외부 지급형 상품권 조회/지급 API (BL-019)
