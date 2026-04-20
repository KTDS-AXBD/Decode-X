# ES-REFUND-002: 캐시백/할인보전 환불불가 시 대안 처리

**Empty Slot ID**: ES-REFUND-002
**유형**: E3 (Business Exception)
**우선순위**: Medium
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-026("캐시백/할인보전 금액은 현금 환불 불가")에서 대안으로 "[미정의 — 포인트 전환 등]"만 기재.
현금 환불 불가 시 사용자에게 어떤 대안을 제공하는지 정의되어 있지 않다.

**위험**: 사용자가 캐시백 상품권 환불 신청 시 단순 거부만 → 고객 불만, CS 폭주.

---

## 규칙 정의

### condition (When)
`voucher.type IN ('CASHBACK', 'DISCOUNT_COMPENSATION')`인 상품권에 대해 환불 신청이 접수된 경우.

### criteria (If)
환불 신청 금액이 캐시백/할인보전 금액에 해당하는지 확인.

### outcome (Then)
현금 환불 대신 아래 대안을 순서대로 제공:

1. **포인트 전환** (자동): 캐시백 잔액을 통합 포인트로 전환
   - 전환 비율: 1원 = 1포인트
   - 포인트 유효기간: 전환일로부터 1년
   - `voucher.balance → user.points` 이관 후 `voucher.status = 'CONVERTED'`

2. **포인트 전환 불가 시** (포인트 시스템 장애 등):
   - HTTP 422 + `CASHBACK_CASH_REFUND_NOT_ALLOWED` + 대안 안내 메시지:
     "캐시백 상품권은 현금 환불이 불가하며, 포인트로 전환하실 수 있습니다."

### exception (Else)
일반 상품권 (`voucher.type = 'STANDARD'`) → 이 규칙 적용 안 됨.

---

## 포인트 전환 API

```
POST /api/v1/vouchers/{voucherId}/convert-to-points
Response: { pointsAdded: number, expiresAt: string }
```
