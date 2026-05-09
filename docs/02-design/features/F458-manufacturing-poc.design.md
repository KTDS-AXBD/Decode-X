---
id: AIF-DSGN-090
sprint: 292
feature: F458
plan: AIF-PLAN-090
title: Manufacturing 22번째 도메인 설계 (제조 산업, 11번째 신규 산업)
status: active
created: 2026-05-09
---

# F458 Design — AIF-DSGN-090

## §1 개요

Travel(F457) 패턴을 복제하여 Manufacturing(제조) 합성 도메인을 22번째로 활성화.
신규 detector 0개, withRuleId 재사용 20 Sprint 연속 정점 (S264~S278+S283~S292).

## §2 BL → Detector 매핑

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| MF-001 | `explodeBom()` | ThresholdCheck | Path A — var-vs-UPPERCASE (`BOM_MAX_COMPONENTS`) |
| MF-002 | `placeProductionOrder()` | ThresholdCheck | Path B — var-vs-var (`capacityLimit` keyword) |
| MF-003 | `confirmProductionOrder()` | AtomicTransaction | `db.transaction()` |
| MF-004 | `transitionProductionStatus()` | StatusTransition | planned→in_progress→qc→released |
| MF-005 | `quarantineDefectiveLots()` | StatusTransition | batch 패턴 (CC-005 11번째 재사용) |
| MF-006 | `releaseForShipment()` | AtomicTransaction | `db.transaction()` |

## §3 파일 매핑

| 파일 | 역할 |
|------|------|
| `반제품-스펙/.../src/domain/manufacturing.ts` | 합성 source ~280 lines |
| `.decode-x/spec-containers/manufacturing/` | 15 sub-files |
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 22번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | MF prefix 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | MF-001~006 REGISTRY 추가 |
| `packages/utils/test/bl-detector.test.ts` | 111→117 detector count + 6 PRESENCE tests |

## §4 spec-container 구조 (15 files)

```
.decode-x/spec-containers/manufacturing/
  provenance.yaml
  rules/
    manufacturing-rules.md
    MF-001.md  MF-002.md  MF-003.md  MF-004.md  MF-005.md  MF-006.md
  runbooks/
    MF-001.md  MF-002.md  MF-003.md  MF-004.md  MF-005.md  MF-006.md
  tests/
    MF-001.yaml
```

## §5 스키마

```sql
CREATE TABLE boms (id TEXT PK, product_id TEXT, components TEXT, component_count INT, status TEXT);
CREATE TABLE production_orders (id TEXT PK, product_id TEXT, required_capacity INT, status TEXT, created_at TEXT);
CREATE TABLE production_lots (id TEXT PK, order_id TEXT, status TEXT, scheduled_at TEXT);
CREATE TABLE defect_quarantine_log (id TEXT PK, lot_id TEXT, reason TEXT, quarantined_at TEXT);
CREATE TABLE shipment_log (id TEXT PK, order_id TEXT, released_at TEXT);
```

## §6 상수

- `BOM_MAX_COMPONENTS = 500` (MF-001 BOM 최대 구성품 수)
- `MAX_ORDER_CAPACITY = 10000` (MF-002 최대 생산 용량)

## §7 상태 머신

```
production_orders: [placeProductionOrder] → pending
production_orders: pending → confirmed (MF-003 atomic confirm)
production_lots: [confirmProductionOrder] → planned
production_lots: planned → in_progress (MF-004)
production_lots: in_progress → qc (MF-004)
production_lots: qc → released (MF-004)
production_lots: in_progress/qc → quarantined (MF-005 batch)
```
