---
id: AIF-DSGN-091
sprint: 293
feature: F459
plan: AIF-PLAN-091
title: Retail 23번째 도메인 설계 (소매 산업, 12번째 신규 산업)
status: active
created: 2026-05-10
---

# F459 Design — AIF-DSGN-091

## §1 개요

Manufacturing(F458) 패턴을 복제하여 Retail(소매) 합성 도메인을 23번째로 활성화.
신규 detector 0개, withRuleId 재사용 21 Sprint 연속 정점 (S264~S278+S283~S293).

## §2 BL → Detector 매핑

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| RT-001 | `listSku()` | ThresholdCheck | Path A — var-vs-UPPERCASE (`MAX_SKU_PRICE_TIER`) |
| RT-002 | `applyPromotion()` | ThresholdCheck | Path B — var-vs-var (`minOrderLimit` keyword) |
| RT-003 | `processCheckout()` | AtomicTransaction | `db.transaction()` |
| RT-004 | `transitionOrderStatus()` | StatusTransition | placed→confirmed→shipped→delivered→completed |
| RT-005 | `markInventorySync()` | StatusTransition | batch 패턴 (CC-005 12번째 재사용) |
| RT-006 | `processReturnRefund()` | AtomicTransaction | `db.transaction()` |

## §3 파일 매핑

| 파일 | 역할 |
|------|------|
| `반제품-스펙/.../src/domain/retail.ts` | 합성 source ~280 lines |
| `.decode-x/spec-containers/retail/` | 15 sub-files |
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 23번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | RT prefix 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | RT-001~006 REGISTRY 추가 |
| `packages/utils/test/bl-detector.test.ts` | 117→123 detector count + 6 PRESENCE tests |

## §4 spec-container 구조 (15 files)

```
.decode-x/spec-containers/retail/
  provenance.yaml
  rules/
    retail-rules.md
    RT-001.md  RT-002.md  RT-003.md  RT-004.md  RT-005.md  RT-006.md
  runbooks/
    RT-001.md  RT-002.md  RT-003.md  RT-004.md  RT-005.md  RT-006.md
  tests/
    RT-001.yaml
```

## §5 스키마

```sql
CREATE TABLE sku_catalog (id TEXT PK, product_id TEXT, price_tier INT, price INT, stock_status TEXT);
CREATE TABLE promotions (id TEXT PK, product_id TEXT, min_order_amount INT, status TEXT);
CREATE TABLE orders (id TEXT PK, customer_id TEXT, cart_items TEXT, total_amount INT, status TEXT, created_at TEXT);
CREATE TABLE inventory_sync_log (id TEXT PK, sku_id TEXT, synced_at TEXT);
CREATE TABLE return_log (id TEXT PK, order_id TEXT, reason TEXT, refund_amount INT, returned_at TEXT);
```

## §6 상수

- `MAX_SKU_PRICE_TIER = 10` (RT-001 최대 가격 티어)
- `MIN_ORDER_AMOUNT = 10_000` (RT-002 기본 최소 주문액)

## §7 상태 머신

```
orders: [processCheckout] → placed
orders: placed → confirmed (RT-004)
orders: confirmed → shipped (RT-004)
orders: shipped → delivered (RT-004)
orders: delivered → completed (RT-004)
sku_catalog.stock_status: [markInventorySync] → synced (RT-005 batch)
orders: delivered/completed + return → returned (RT-006 atomic)
```
