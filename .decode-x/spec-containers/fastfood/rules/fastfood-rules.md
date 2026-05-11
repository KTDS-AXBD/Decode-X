# Spec Container — FFD-001 (패스트푸드 합성 도메인)

**Skill ID**: FFD-001
**Domain**: Fast Food (패스트푸드 산업 — 키오스크주문정원/콤보할인한도/결제atomic/주문상태전환/stale배치/가맹점정산atomic)
**Source**: SYNTHETIC — 세션 298 F502, withRuleId 재사용 49번째 도메인 PoC (Car Sharing 다음 산업, 38번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (FS-001 ~ FS-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| FS-001 | 신규 주문 요청 시 | `kiosk.active_orders < total_capacity` (UPPERCASE fallback MAX_DAILY_ORDERS_PER_KIOSK) | 주문 허용 + kiosk.active_orders 증가 | `E422-KIOSK-CAPACITY-EXCEEDED` (키오스크 일일 정원 초과) |
| FS-002 | 콤보 할인 요청 시 | `membership.discount_used + discount < discountLimit` (var-vs-var, `limit` keyword 매칭) | 할인 적용 + discount_used 증가 | `E422-COMBO-DISCOUNT-LIMIT-EXCEEDED` (콤보 할인 한도 초과) |
| FS-003 | 결제 atomic 요청 시 | `orders.status = 'confirmed'` | atomic: kitchen_tickets INSERT + orders UPDATE + order_payments INSERT | `E404-ORDER` |
| FS-004 | 주문 상태 전환 (pending → confirmed → preparing → ready → cancelled) | 허용 매트릭스 충족 | `orders.status` UPDATE | `E404-ORDER`, `E409-ORDER` |
| FS-005 | stale 주방 티켓 일괄 처리 | `kitchen_tickets.status = 'preparing'` AND `accepted_at <= now` | `status='stale'` 일괄 UPDATE | 대상 없으면 staleCount=0 |
| FS-006 | 가맹점 일일 정산 요청 시 | `kitchen_tickets.status = 'ready'` | atomic: franchise_billing_records INSERT + franchise_payouts INSERT + franchise_billing_records UPDATE | `E404-READY-KITCHEN-TICKET` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `kiosk_pool` | active_orders 증가 (FS-001) | placeOrder |
| `orders` | INSERT (FS-001), status 갱신 (FS-003/FS-004) | placeOrder / processPayment / transitionOrderStatus |
| `customer_memberships` | discount_used 증가 (FS-002) | applyComboDiscount |
| `kitchen_tickets` | INSERT (FS-003), batch stale (FS-005) | processPayment / markStaleOrderBatch |
| `order_payments` | INSERT (FS-003) | processPayment |
| `franchise_billing_records` | INSERT + status='settled' (FS-006) | settleDailyRevenue |
| `franchise_payouts` | INSERT (FS-006) | settleDailyRevenue |

---

## 임계값 / 상수

- `MAX_DAILY_ORDERS_PER_KIOSK = 300` (FS-001 패스트푸드 키오스크 일일 주문 정원 기본 한도, 건)
- `discountLimit = customer_memberships.discount_limit` (FS-002 회원 등급별 콤보 할인 한도, 원)

---

## 상태 머신

```
orders: pending → confirmed (FS-004 transition)
orders: confirmed → preparing (FS-003 atomic)
orders: preparing → ready (FS-004 transition)
orders: pending|confirmed → cancelled (FS-004 transition)

kitchen_tickets: preparing → ready (정상 서빙)
kitchen_tickets: preparing → stale (FS-005 batch)

franchise_billing_records: pending → calculated → settled (FS-006 atomic)
```

---

## 의존 함수 (fastfood.ts)

| BL | 함수 | detector |
|----|------|----------|
| FS-001 | `placeOrder` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| FS-002 | `applyComboDiscount` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| FS-003 | `processPayment` | AtomicTransaction (`db.transaction(...)`) |
| FS-004 | `transitionOrderStatus` | StatusTransition (matrix) |
| FS-005 | `markStaleOrderBatch` | StatusTransition (batch) |
| FS-006 | `settleDailyRevenue` | AtomicTransaction (`db.transaction(...)`) |
