# Spec Container — DELIVERY-001 (배송 산업 합성 도메인)

**Skill ID**: DELIVERY-001
**Domain**: Delivery (배송 산업 — 요청/한도/시작/상태/지연/반품)
**Source**: SYNTHETIC — Sprint 283 F449, withRuleId 재사용 13번째 도메인 PoC (Credit Card 다음 산업)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (DV-001 ~ DV-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| DV-001 | 배송 요청 시 | `MIN_WEIGHT_KG ≤ weightKg ≤ MAX_WEIGHT_KG` (0.1~30kg) | `deliveries` INSERT (status='PENDING') + `delivery_events` CREATED, expectedDeliveryAt 자동 산정 | `E422-WT-MIN` (미달) 또는 `E422-WT-MAX` (초과) |
| DV-002 | 배송 시작 전 지역별 한도 검증 | `regionLimit ≥ weight_kg` (RURAL ≤ 10kg, OVERSEAS ≤ 20kg, 기타 ≤ 30kg) | `canShip=true`, regionLimit 반환 | `E404-DV`, `E409-ST` (PENDING 아님), `E422-RGN-LIMIT` (지역 한도 초과) |
| DV-003 | 배송 시작 시 | `delivery.status = 'PENDING'` | atomic transaction (`status='SHIPPED'` + `shipped_at=now` + `delivery_events` SHIPPED INSERT) | `E404-DV` 또는 `E409-ST` |
| DV-004 | 상태 전환 (SHIPPED → DELIVERED/CANCELLED/RETURNED, PENDING → CANCELLED) | 허용된 상태 전환 매트릭스 충족 | `deliveries.status` UPDATE + `delivered_at`/`cancelled_at` 설정 | `E409-TR` (불허 전환) |
| DV-005 | 배송 지연 자동 마킹 (정기 batch) | `status='SHIPPED'` AND `expected_delivery_at < now - 3days` | `status='DELAYED'`, `delayed_since=now`, 마킹된 deliveryIds 반환 | 정상 배송은 marking 제외 |
| DV-006 | 배송 취소 + 반품 처리 | `status ∈ {SHIPPED, DELIVERED}` | atomic transaction (`status='RETURNED'` + `cancelled_at=now` + `return_requests` INSERT, refund=weight × 1,000원) | `E404-DV`, `E409-DV` (PENDING/CANCELLED/RETURNED 상태) |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `deliveries` | INSERT (DV-001) / status 전환 (DV-003/004/005/006) + 시점 필드 | requestDelivery / startShipping / transitionDeliveryStatus / markDelayedDeliveries / cancelAndReturn |
| `delivery_events` | INSERT (DV-001 CREATED, DV-003 SHIPPED, ...) | 모든 lifecycle 변경 시 |
| `return_requests` | INSERT (DV-006) | cancelAndReturn |

---

## 임계값 / 상수

- `MIN_WEIGHT_KG = 0.1` (DV-001 최소 무게)
- `MAX_WEIGHT_KG = 30` (DV-001 최대 무게)
- `RURAL_MAX_WEIGHT_KG = 10` (DV-002 RURAL 한도)
- `OVERSEAS_BLOCKED_WEIGHT_KG = 20` (DV-002 OVERSEAS 한도)
- `DELIVERY_DELAY_DAYS = 3` (DV-005 지연 마킹 기준)
- expectedDeliveryAt 산정: OVERSEAS 7일 / RURAL 4일 / 기타 2일

---

## 상태 머신

```
[requestDelivery] → PENDING
PENDING → CANCELLED (DV-004, 사용자 취소 전)
PENDING → SHIPPED (DV-003, startShipping)
SHIPPED → DELIVERED (DV-004, 정상 완료)
SHIPPED → CANCELLED (DV-004, 배송 중 취소)
SHIPPED → RETURNED (DV-004 또는 DV-006, 반품)
SHIPPED → DELAYED (DV-005, 3일 지연 batch)
DELIVERED → RETURNED (DV-006, 수령 후 반품)
```

---

## 권한

- **requestDelivery**: 주문 시스템 (orderId 검증된 호출자)
- **transitionDeliveryStatus**: 배송 시스템 또는 ADMIN
- **markDelayedDeliveries**: SYSTEM (정기 batch)
- **cancelAndReturn**: 본인 (`order.user_id = userId`) 또는 ADMIN

---

## 관련 문서

- `rules/DV-001.md` ~ `rules/DV-006.md` — 개별 BL detail
- `runbooks/DV-001.md` ~ `runbooks/DV-006.md` — operational runbooks
- `tests/DV-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/delivery.ts` — 합성 source
