# ES-PAYMENT-003: MIXED 결제 부분 실패 보상 처리

**Empty Slot ID**: ES-PAYMENT-003
**유형**: E3 (Business Exception)
**우선순위**: High
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-016/017은 결제취소의 MIXED(카드+현금) 처리를 언급하지만,
최초 결제 시 MIXED 방식에서 카드 승인은 성공했으나 현금 처리가 실패한 경우의
보상 트랜잭션(Saga 패턴) 규칙이 정의되어 있지 않다.

**위험**: 카드 승인 완료 + 현금 처리 실패 → 카드 승인 취소 없이 결제 불완전 상태 방치.

---

## 규칙 정의

### condition (When)
method=MIXED 결제에서:
1. CARD 파트 (`CardApi.authorize()`) 성공
2. 이후 현금/상품권 파트 처리 실패 (잔액 부족, DB 오류 등)

### criteria (If)
CARD 승인이 `approvalId`를 반환했고, 상품권 잔액 차감이 에러로 실패한 경우.

### outcome (Then)
보상 트랜잭션 실행:
1. `CardApi.cancelAuthorization(approvalId)` 호출하여 카드 승인 취소
2. 취소 성공 시: `payments` INSERT with `status='MIXED_PARTIAL_FAILED'`
3. 사용자에게 HTTP 500 + `MIXED_PAYMENT_ROLLBACK` 에러 반환
4. 잔액 차감 없음

카드 취소도 실패 시:
- `incident_type: MIXED_PAYMENT_CARD_DANGLING` 에스컬레이션 티켓 생성
- `priority: P1` (카드사 청구 위험)

### exception (Else)
두 파트 모두 성공 → 정상 완료 처리.

---

## 상태 다이어그램

```
CARD_AUTH_SUCCESS + CASH_FAIL
  │
  ├─→ CardApi.cancelAuthorization()
  │     ├─ SUCCESS → status=MIXED_PARTIAL_FAILED (롤백 완료)
  │     └─ FAIL → 에스컬레이션 P1 (MIXED_PAYMENT_CARD_DANGLING)
  └─→ HTTP 500 반환
```
