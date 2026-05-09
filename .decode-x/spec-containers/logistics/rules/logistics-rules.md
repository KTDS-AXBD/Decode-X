# Spec Container — LOGISTICS-001 (물류 산업 합성 도메인)

**Skill ID**: LOGISTICS-001
**Domain**: Logistics (물류 산업 — 화물/세관/배송/창고/반품)
**Source**: SYNTHETIC — Sprint 289 F455, withRuleId 재사용 19번째 도메인 PoC (Real Estate 다음 산업, 8번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (LG-001 ~ LG-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| LG-001 | 화물 발송 등록 시 | `weightKg ≤ MAX_WEIGHT_KG(30,000)` AND `volumeM3 ≤ MAX_VOLUME_M3(100)` AND 양수 | `shipments` INSERT (status='pending') | `E422-WT-MAX`, `E422-VL-MAX`, `E422-DIM-MIN` |
| LG-002 | 경로 거리 검증 | `shipment.status='pending'` AND `routeDistanceKm ≤ maxRouteLimit(20,000)` | `route_distance_km` UPDATE, `withinLimit=true` | `E404-SH`, `E409-ST`, `E422-LIMIT` |
| LG-003 | 세관 통관 | `shipment.status='pending'`, `declaredValueUsd ≥ 0` | atomic transaction (`customs_records` INSERT status='cleared' + `shipments.status='in_transit'`) | `E404-SH`, `E409-SH`, `E422-VAL` |
| LG-004 | 배송 상태 전환 (pending → in_transit → delivered/returned) | 허용 매트릭스 충족 | `shipments.status` UPDATE + delivered_at 조건부 | `E409-TR` |
| LG-005 | 재고 stale 자동 처리 (정기 batch) | `status='active'` AND `last_updated < cutoffDate` | `status='stale'`, 마킹된 inventoryIds 반환 | cutoff 미도달 시 skip |
| LG-006 | 반품 RMA + 재고 복구 | `shipment.status='delivered' or 'in_transit'` AND 발송 30일 이내 | atomic transaction (`rma_records` INSERT status='initiated' + `shipments.status='returned'`) | `E404-SH`, `E409-SH`, `E422-RMA-EXP` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `shipments` | INSERT (LG-001) / status 전환 (LG-003/004/006) / route_distance_km UPDATE (LG-002) | checkShipmentLimits / optimizeRoute / clearCustoms / transitionDeliveryStatus / processReturnRma |
| `customs_records` | INSERT status='cleared' (LG-003) | clearCustoms |
| `warehouse_inventory` | status 'active'→'stale' batch (LG-005) | markStaleInventory |
| `rma_records` | INSERT status='initiated' (LG-006) | processReturnRma |

---

## 임계값 / 상수

- `MAX_WEIGHT_KG = 30,000` (LG-001 최대 화물 무게)
- `MAX_VOLUME_M3 = 100` (LG-001 최대 화물 부피)
- `MAX_ROUTE_DISTANCE_KM = 20,000` (LG-002 최대 경로 거리)
- `REFUND_WINDOW_DAYS = 30` (LG-006 반품 가능 기간)

---

## 상태 머신

```
shipment: [checkShipmentLimits] → pending
shipment: pending → in_transit (LG-003 세관 통관)
shipment: pending → in_transit (LG-004 직접 전환)
shipment: in_transit → delivered (LG-004)
shipment: in_transit → returned (LG-006 RMA)

inventory: active → stale (LG-005 batch)

customs_record: [clearCustoms] → cleared
```

---

## 권한

- **checkShipmentLimits**: 발송인 본인 또는 물류 운영자
- **optimizeRoute**: 물류 운영자 또는 SYSTEM
- **clearCustoms**: 물류 운영자 또는 세관 시스템
- **transitionDeliveryStatus**: 물류 운영자 또는 배송 시스템
- **markStaleInventory**: SYSTEM (정기 batch)
- **processReturnRma**: 수취인 또는 물류 운영자

---

## 관련 문서

- `rules/LG-001.md` ~ `rules/LG-006.md` — 개별 BL detail
- `runbooks/LG-001.md` ~ `runbooks/LG-006.md` — operational runbooks
- `tests/LG-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/logistics.ts` — 합성 source
