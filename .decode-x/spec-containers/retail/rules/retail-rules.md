# Spec Container — RETAIL-001 (소매 산업 합성 도메인)

**Skill ID**: RETAIL-001
**Domain**: Retail (소매 산업 — SKU가격티어검증/프로모션자격/주문체크아웃/상태전환/재고동기화배치/반품환불)
**Source**: SYNTHETIC — Sprint 293 F459, withRuleId 재사용 23번째 도메인 PoC (Manufacturing 다음 산업, 12번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (RT-001 ~ RT-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| RT-001 | SKU 목록 조회 요청 시 | `requestedTier ≤ MAX_SKU_PRICE_TIER` AND `requestedTier > 0` | `sku_catalog` 조회 반환 | `E422-TIER-MAX`, `E422-TIER-MIN` |
| RT-002 | 프로모션 적용 요청 시 | `cartTotal ≥ minOrderLimit` AND `promotion.status='active'` | 할인 금액 계산 반환 | `E422-PROMO-MIN`, `E404-PROMO`, `E409-PROMO` |
| RT-003 | 주문 체크아웃 처리 시 | `cartItems.length > 0` AND `totalAmount > 0` | atomic: `orders` INSERT (status='placed') + `inventory_sync_log` INSERT | `E422-CART-EMPTY`, `E422-AMOUNT-MIN` |
| RT-004 | 주문 상태 전환 (placed → confirmed → shipped → delivered → completed) | 허용 매트릭스 충족 | `orders.status` UPDATE | `E404-ORD`, `E409-ORD` |
| RT-005 | 재고 일괄 동기화 처리 (시스템 배치) | `sku_catalog.stock_status = 'available'` AND 동기화 대상 확인 | `sku_catalog.stock_status='synced'` 일괄 UPDATE + `inventory_sync_log` INSERT | 대상 없으면 syncedCount=0 |
| RT-006 | 반품 + 환불 트랜잭션 | `order.status IN ('delivered','completed')` | atomic: `orders.status='returned'` + `return_log` INSERT | `E404-ORD`, `E409-ORD` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `sku_catalog` | 조회 (RT-001) / stock_status 전환 (RT-005) | listSku / markInventorySync |
| `promotions` | 조회 (RT-002) | applyPromotion |
| `orders` | INSERT (RT-003) / status 전환 (RT-004/006) | processCheckout / transitionOrderStatus / processReturnRefund |
| `inventory_sync_log` | INSERT (RT-003/005) | processCheckout / markInventorySync |
| `return_log` | INSERT (RT-006) | processReturnRefund |

---

## 임계값 / 상수

- `MAX_SKU_PRICE_TIER = 10` (RT-001 최대 가격 티어)
- `MIN_ORDER_AMOUNT = 10_000` (RT-002 기본 최소 주문액)

---

## 상태 머신

```
orders: [processCheckout] → placed
orders: placed → confirmed (RT-004 transition)
orders: confirmed → shipped (RT-004 transition)
orders: shipped → delivered (RT-004 transition)
orders: delivered → completed (RT-004 transition)
orders: delivered/completed → returned (RT-006 atomic)

sku_catalog.stock_status: [markInventorySync] available → synced (RT-005 batch)
```

---

## 권한

- **listSku**: 고객 (조회)
- **applyPromotion**: 고객 (주문 전)
- **processCheckout**: 고객 (주문 처리)
- **transitionOrderStatus**: 배송 SYSTEM
- **markInventorySync**: 재고 SYSTEM (배치)
- **processReturnRefund**: 고객 서비스 담당자

---

## 관련 문서

- `rules/RT-001.md` ~ `rules/RT-006.md` — 개별 BL detail
- `runbooks/RT-001.md` ~ `runbooks/RT-006.md` — operational runbooks
- `tests/RT-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/retail.ts` — 합성 source
