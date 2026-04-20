# ES-REFUND-005: 제외금액 산정 상세 공식

**Empty Slot ID**: ES-REFUND-005
**유형**: E1 (Core Business Logic Gap)
**우선순위**: Medium
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-028("입금액 = 환불요청액 − 제외금액")에서 제외금액의 구성 항목과 산정 공식이 정의되어 있지 않다.
PoC 구현(`refund.ts`)에서는 `exclusionAmount = 0`으로 하드코딩.

**위험**: 실제 환불 시 제외금액 미산정 → 과다 환불 → 재무 손실.

---

## 규칙 정의

### condition (When)
USED_BALANCE 유형 환불 신청 시 (`refund_type = 'USED_BALANCE'`).

### criteria (If)
제외금액 구성 항목 (해당 항목의 합산):

| 항목 | 산정 방식 | 비고 |
|------|-----------|------|
| 캐시백 사용액 | 사용된 캐시백 금액 | 캐시백은 현금 환불 불가 (BL-026) |
| 할인보전금 | 사용된 할인보전 금액 | 마찬가지로 환불 불가 |
| 환불 수수료 | 잔액의 1% (100원 미만 절사) | 기사용 상품권 환불 수수료 |
| 포인트 전환액 | 이미 포인트로 전환된 금액 | 이중 환불 방지 |

공식:
```
제외금액 = 캐시백사용액 + 할인보전금 + 환불수수료 + 포인트전환액
입금액   = 환불요청액 − 제외금액
```

### outcome (Then)
산정된 `exclusionAmount`로 `refund_transactions` INSERT:
```
refund_transactions.exclusion_amount = 제외금액
refund_transactions.deposit_amount   = 환불요청액 − 제외금액
```

제외금액 상세 내역을 환불 안내 문자에 포함:
```
환불금액: 50,000원
제외항목: 캐시백 사용 5,000원 + 수수료 450원
실입금액: 44,550원
```

### exception (Else)
UNUSED_FULL 유형 (미사용 전액 환불): 제외금액 = 0, 전액 환불.
제외금액 > 환불요청액: HTTP 422 + `EXCLUSION_EXCEEDS_REFUND_AMOUNT`

---

## 환불 수수료 면제 조건

- 구매 후 7일 이내 환불 (UNUSED_FULL): 수수료 면제
- 상품권 결함 사유 환불 (DEFECT): 수수료 면제
- 일반 기사용 잔액 환불: 수수료 1% 부과
