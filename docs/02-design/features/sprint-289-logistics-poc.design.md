---
id: AIF-DSGN-087
sprint: 289
feature: F455
plan: AIF-PLAN-087
title: Logistics 19번째 도메인 신규 — 물류 산업 합성 도메인 Design
status: active
created: 2026-05-09
---

# F455 Design — AIF-DSGN-087

## §1 목표

Sprint 288 F454 (Real Estate) 패턴 복제 → Logistics 19번째 도메인 신규.
8번째 신규 산업 (CC + DV + SB + IN + HC + ED + RE + **LG**).

## §2 BL 설계 (LG-001 ~ LG-006)

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| LG-001 | `checkShipmentLimits()` | ThresholdCheck | weight/volume 상한 (var-vs-UPPERCASE) |
| LG-002 | `optimizeRoute()` | ThresholdCheck | routeDistanceKm > maxRouteLimit (Path B, `limit` keyword) |
| LG-003 | `clearCustoms()` | AtomicTransaction | 세관 신고 + 승인 transaction |
| LG-004 | `transitionDeliveryStatus()` | StatusTransition | pending → in_transit → delivered |
| LG-005 | `markStaleInventory()` | StatusTransition | batch stale → archived (CC-005 8번째 재사용) |
| LG-006 | `processReturnRma()` | AtomicTransaction | RMA 생성 + 재고 복구 transaction |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (9번째 정착)

## §3 데이터 스키마 (합성)

```sql
-- shipments: 화물 발송
CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  shipper_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  volume_m3 REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_transit | delivered | returned
  route_distance_km REAL,
  dispatched_at TEXT,
  delivered_at TEXT
);

-- customs_records: 세관 기록
CREATE TABLE customs_records (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  declared_value_usd REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | cleared | rejected
  cleared_at TEXT
);

-- warehouse_inventory: 창고 재고
CREATE TABLE warehouse_inventory (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active | stale | archived
  last_updated TEXT NOT NULL
);

-- rma_records: 반품 RMA
CREATE TABLE rma_records (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  initiated_at TEXT NOT NULL
);
```

## §4 파일 목록

### 신규 생성

| 파일 | 크기 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/logistics.ts` | ~280 lines |
| `.decode-x/spec-containers/logistics/provenance.yaml` | |
| `.decode-x/spec-containers/logistics/rules/logistics-rules.md` | |
| `.decode-x/spec-containers/logistics/rules/LG-001.md` ~ `LG-006.md` | 6 files |
| `.decode-x/spec-containers/logistics/runbooks/LG-001.md` ~ `LG-006.md` | 6 files |
| `.decode-x/spec-containers/logistics/tests/LG-001.yaml` | |

### 수정

| 파일 | 변경 |
|------|------|
| `scripts/divergence/domain-source-map.ts` | logistics entry 추가 (DOMAIN_MAP 19번째) |
| `packages/utils/src/divergence/rules-parser.ts` | LG prefix 추가 (BL_ID_PATTERN) |
| `packages/utils/src/divergence/bl-detector.ts` | LG-001~006 REGISTRY 추가 + 주석 |
| `packages/utils/test/bl-detector.test.ts` | 93→99 detector count + LG-001~006 expected list |

## §5 Worker 파일 매핑 (단일 구현)

모든 파일을 순차 구현 (Agent 병렬 없음 — 의존 관계 직렬).

## §6 임계값 / 상수

```typescript
const MAX_WEIGHT_KG = 30_000;         // LG-001: 화물 최대 무게
const MAX_VOLUME_M3 = 100;            // LG-001: 화물 최대 부피
const MAX_ROUTE_DISTANCE_KM = 20_000; // LG-002: 최대 경로 거리
const REFUND_WINDOW_DAYS = 30;        // LG-006: 반품 가능 기간
```

## §7 상태 머신

```
shipment: pending → in_transit (LG-004)
shipment: in_transit → delivered (LG-004)
shipment: in_transit → returned (LG-006)

inventory: active → stale → archived (LG-005 batch)

customs_record: pending → cleared / rejected (LG-003)
```

## §8 Gap 분석 기준

| 항목 | 기준 |
|------|------|
| logistics.ts | 6 함수 + LogisticsError 구현 |
| spec-container | 15 sub-files 생성 |
| DOMAIN_MAP | logistics 19번째 entry |
| BL_ID_PATTERN | LG prefix 추가 |
| BL_DETECTOR_REGISTRY | LG-001~006 6건 추가 |
| 단위 테스트 | 93→99 (6건 추가) |
| detect-bl | 19 containers, 0 ABSENCE |
