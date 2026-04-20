# ES-REFUND-005: 제외금액 산정 오류 — 운영 가이드

**Empty Slot ID**: ES-REFUND-005
**대상**: 운영팀 / 정산팀

---

## 제외금액 오산정 발생 시 대응

### 감지 조건
- 고객 CS: "환불 금액이 예상과 다름"
- 정산팀: 환불 입금액 집계 불일치

### 조회

```sql
SELECT rt.id, rt.amount as requestedAmount,
       rt.exclusion_amount, rt.deposit_amount,
       v.balance, v.cashback_used, v.discount_compensation
FROM refund_transactions rt
JOIN vouchers v ON v.id = rt.voucher_id
WHERE rt.id = '<refundId>';
```

### 검증 공식 (수동 계산)

```
제외금액 계산:
  캐시백사용액 = vouchers.cashback_used
  할인보전금   = vouchers.discount_compensation
  환불수수료   = floor(요청금액 * 0.01 / 100) * 100  # 100원 단위 절사
  포인트전환액 = vouchers.converted_to_points_amount

제외금액 = 캐시백사용액 + 할인보전금 + 환불수수료 + 포인트전환액
입금액   = 요청금액 − 제외금액
```

### 과다 환불 발생 시

1. 차액 확인 (`deposit_amount - 올바른_입금액`)
2. 사용자에게 양해 요청 후 차액 환수 또는 추가 차감 처리
3. 정산팀 보고 (`REFUND-RECONCILE-{YYYYMMDD}-{SEQ}`)

### 과소 환불 발생 시

1. 차액 추가 입금 처리 (수동 DepositApi 호출)
2. `refund_transactions.deposit_amount` 수정 + 수정 감사 로그
