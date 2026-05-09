# Spec Container — MANUFACTURING-001 (제조 산업 합성 도메인)

**Skill ID**: MANUFACTURING-001
**Domain**: Manufacturing (제조 산업 — BOM폭발검증/생산주문/주문확정/상태전환/불량격리배치/출하해제)
**Source**: SYNTHETIC — Sprint 292 F458, withRuleId 재사용 22번째 도메인 PoC (Travel 다음 산업, 11번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (MF-001 ~ MF-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| MF-001 | BOM 폭발 요청 시 | `components.length ≤ BOM_MAX_COMPONENTS` AND `components.length > 0` | `boms` INSERT (status='active') | `E422-BOM-MAX`, `E422-BOM-EMPTY` |
| MF-002 | 생산 주문 요청 시 | `requiredCapacity ≤ capacityLimit` | `production_orders` INSERT (status='pending') | `E422-CAP-MAX`, `E422-CAP-MIN` |
| MF-003 | 생산 주문 확정 처리 시 | `order.status='pending'` | atomic: `production_orders.status='confirmed'` + `production_lots` INSERT | `E404-ORD`, `E409-ORD` |
| MF-004 | 생산 상태 전환 (planned → in_progress → qc → released) | 허용 매트릭스 충족 | `production_lots.status` UPDATE | `E404-LOT`, `E409-LOT` |
| MF-005 | 불량 lot 일괄 격리 처리 (시스템 배치) | `production_lots.status IN ('in_progress','qc')` AND 결함 확인 | `production_lots.status='quarantined'` 일괄 UPDATE + `defect_quarantine_log` INSERT | 대상 없으면 quarantinedCount=0 |
| MF-006 | 출하 해제 + 재고 조정 트랜잭션 | `lot.status='qc'` | atomic: `production_lots.status='released'` + `shipment_log` INSERT | `E404-LOT`, `E409-LOT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `boms` | INSERT (MF-001) | explodeBom |
| `production_orders` | INSERT (MF-002) / status 전환 (MF-003) | placeProductionOrder / confirmProductionOrder |
| `production_lots` | INSERT (MF-003) / status 전환 (MF-004/005/006) | confirmProductionOrder / transitionProductionStatus / quarantineDefectiveLots / releaseForShipment |
| `defect_quarantine_log` | INSERT (MF-005) | quarantineDefectiveLots |
| `shipment_log` | INSERT (MF-006) | releaseForShipment |

---

## 임계값 / 상수

- `BOM_MAX_COMPONENTS = 500` (MF-001 BOM 최대 구성품 수)
- `MAX_ORDER_CAPACITY = 10000` (MF-002 최대 생산 주문 용량)

---

## 상태 머신

```
production_orders: [placeProductionOrder] → pending
production_orders: pending → confirmed (MF-003 atomic confirm)
production_orders: pending → cancelled

production_lots: [confirmProductionOrder] → planned
production_lots: planned → in_progress (MF-004)
production_lots: in_progress → qc (MF-004)
production_lots: qc → released (MF-004 / MF-006 atomic)
production_lots: in_progress/qc → quarantined (MF-005 batch)
```

---

## 권한

- **explodeBom**: 생산 엔지니어
- **placeProductionOrder**: 생산 계획 담당자
- **confirmProductionOrder**: 생산 관리자
- **transitionProductionStatus**: 생산 SYSTEM
- **quarantineDefectiveLots**: QC SYSTEM (결함 감지)
- **releaseForShipment**: 출하 담당자

---

## 관련 문서

- `rules/MF-001.md` ~ `rules/MF-006.md` — 개별 BL detail
- `runbooks/MF-001.md` ~ `runbooks/MF-006.md` — operational runbooks
- `tests/MF-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/manufacturing.ts` — 합성 source
