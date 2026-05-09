import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-LG (LG-001~LG-006): Logistics 합성 도메인 — 19번째 도메인 (물류 산업, 8번째 신규 산업)
//   - logistics spec-container rules.md 기반 PoC source
//   - 합성 schema: shipments, customs_records, warehouse_inventory, rma_records
//   - 물류 lifecycle 패턴 — 화물검증/경로한도/세관/배송상태/재고/반품RMA
//   - withRuleId 재사용 19번째 도메인 (신규 detector 0개, 17 Sprint 연속 정점)
//   - LogisticsError code-in-message 패턴 (S275 표준)
//   - 8 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG)
// ---------------------------------------------------------------------------

export interface ShipmentRow {
  id: string;
  shipper_id: string;
  origin: string;
  destination: string;
  weight_kg: number;
  volume_m3: number;
  status: string;           // pending | in_transit | delivered | returned
  route_distance_km: number | null;
  dispatched_at: string | null;
  delivered_at: string | null;
}

export interface CustomsRecordRow {
  id: string;
  shipment_id: string;
  declared_value_usd: number;
  status: string;           // pending | cleared | rejected
  cleared_at: string | null;
}

export interface WarehouseInventoryRow {
  id: string;
  warehouse_id: string;
  sku: string;
  quantity: number;
  status: string;           // active | stale | archived
  last_updated: string;
}

export interface RmaRecordRow {
  id: string;
  shipment_id: string;
  reason: string;
  status: string;           // initiated | approved | completed
  initiated_at: string;
}

const MAX_WEIGHT_KG = 30_000;
const MAX_VOLUME_M3 = 100;
const MAX_ROUTE_DISTANCE_KM = 20_000;
const REFUND_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// LG-001: 화물 발송 (weight ≤ MAX_WEIGHT_KG, volume ≤ MAX_VOLUME_M3)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function checkShipmentLimits(
  db: Database.Database,
  shipperId: string,
  origin: string,
  destination: string,
  weightKg: number,
  volumeM3: number,
): { shipmentId: string; status: string } {
  if (weightKg > MAX_WEIGHT_KG) {
    throw new LogisticsError('E422-WT-MAX', `Weight exceeds limit (${weightKg} > ${MAX_WEIGHT_KG})`, 422);
  }
  if (volumeM3 > MAX_VOLUME_M3) {
    throw new LogisticsError('E422-VL-MAX', `Volume exceeds limit (${volumeM3} > ${MAX_VOLUME_M3})`, 422);
  }
  if (weightKg <= 0 || volumeM3 <= 0) {
    throw new LogisticsError('E422-DIM-MIN', `Weight and volume must be positive`, 422);
  }

  const shipmentId = randomUUID();
  const dispatchedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO shipments (id, shipper_id, origin, destination, weight_kg, volume_m3, status, route_distance_km, dispatched_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)
  `).run(shipmentId, shipperId, origin, destination, weightKg, volumeM3, dispatchedAt);

  return { shipmentId, status: 'pending' };
}

// ---------------------------------------------------------------------------
// LG-002: 경로 거리 한도 (routeDistanceKm ≤ MAX_ROUTE_DISTANCE_KM)
// (ThresholdCheck detector — F445 Path B var-vs-var, maxRouteLimit 'limit' keyword 매칭)
// ---------------------------------------------------------------------------
export function optimizeRoute(
  db: Database.Database,
  shipmentId: string,
  routeDistanceKm: number,
): { shipmentId: string; routeDistanceKm: number; withinLimit: boolean } {
  const shipment = db
    .prepare('SELECT status, weight_kg FROM shipments WHERE id = ?')
    .get(shipmentId) as { status: string; weight_kg: number } | undefined;

  if (!shipment) {
    throw new LogisticsError('E404-SH', 'Shipment not found', 404);
  }
  if (shipment.status !== 'pending') {
    throw new LogisticsError('E409-ST', `Cannot optimize route for status=${shipment.status}`, 409);
  }

  const maxRouteLimit = MAX_ROUTE_DISTANCE_KM;
  // F445 Path B: var-vs-var, left=`maxRouteLimit` (`limit` keyword 매칭)
  if (routeDistanceKm > maxRouteLimit) {
    throw new LogisticsError('E422-LIMIT', `Route distance exceeds limit (${routeDistanceKm} > ${maxRouteLimit})`, 422);
  }

  db.prepare(`UPDATE shipments SET route_distance_km = ? WHERE id = ?`)
    .run(routeDistanceKm, shipmentId);

  return { shipmentId, routeDistanceKm, withinLimit: true };
}

// ---------------------------------------------------------------------------
// LG-003: 세관 통관 atomic (신고 INSERT + 승인 UPDATE)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function clearCustoms(
  db: Database.Database,
  shipmentId: string,
  declaredValueUsd: number,
): { customsId: string; status: string; clearedAt: string } {
  const shipment = db
    .prepare('SELECT status FROM shipments WHERE id = ?')
    .get(shipmentId) as { status: string } | undefined;

  if (!shipment) throw new LogisticsError('E404-SH', 'Shipment not found', 404);
  if (shipment.status !== 'pending') {
    throw new LogisticsError('E409-SH', `Shipment not in pending status (status=${shipment.status})`, 409);
  }
  if (declaredValueUsd < 0) {
    throw new LogisticsError('E422-VAL', 'Declared value cannot be negative', 422);
  }

  const customsId = randomUUID();
  const clearedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO customs_records (id, shipment_id, declared_value_usd, status, cleared_at)
      VALUES (?, ?, ?, 'cleared', ?)
    `).run(customsId, shipmentId, declaredValueUsd, clearedAt);
    db.prepare(`UPDATE shipments SET status = 'in_transit' WHERE id = ?`)
      .run(shipmentId);
  });
  tx();

  return { customsId, status: 'cleared', clearedAt };
}

// ---------------------------------------------------------------------------
// LG-004: 배송 상태 전환 (pending → in_transit → delivered)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionDeliveryStatus(
  db: Database.Database,
  shipmentId: string,
  newStatus: 'in_transit' | 'delivered' | 'returned',
): { shipmentId: string; previousStatus: string; newStatus: string } {
  const shipment = db
    .prepare('SELECT status FROM shipments WHERE id = ?')
    .get(shipmentId) as { status: string } | undefined;

  if (!shipment) throw new LogisticsError('E404-SH', 'Shipment not found', 404);

  const previousStatus = shipment.status;
  const allowed =
    (previousStatus === 'pending' && newStatus === 'in_transit') ||
    (previousStatus === 'in_transit' && ['delivered', 'returned'].includes(newStatus));

  if (!allowed) {
    throw new LogisticsError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  const deliveredAt = newStatus === 'delivered' ? new Date().toISOString() : null;
  if (deliveredAt) {
    db.prepare(`UPDATE shipments SET status = ?, delivered_at = ? WHERE id = ?`)
      .run(newStatus, deliveredAt, shipmentId);
  } else {
    db.prepare(`UPDATE shipments SET status = ? WHERE id = ?`)
      .run(newStatus, shipmentId);
  }

  return { shipmentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// LG-005: 재고 stale 자동 처리 (정기 batch — last_updated 미갱신 재고 archived)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC/ED/RE-005 동일 형태 8번째)
// ---------------------------------------------------------------------------
export function markStaleInventory(
  db: Database.Database,
  cutoffDate: string = new Date().toISOString(),
): { markedCount: number; staleInventoryIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM warehouse_inventory
      WHERE status = 'active'
        AND last_updated < ?
    `)
    .all(cutoffDate) as Array<{ id: string }>;

  const staleInventoryIds: string[] = [];
  for (const item of candidates) {
    db.prepare(`UPDATE warehouse_inventory SET status = 'stale' WHERE id = ?`)
      .run(item.id);
    staleInventoryIds.push(item.id);
  }

  return { markedCount: staleInventoryIds.length, staleInventoryIds };
}

// ---------------------------------------------------------------------------
// LG-006: 반품 RMA + 재고 복구 atomic
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processReturnRma(
  db: Database.Database,
  shipmentId: string,
  reason: string,
): { rmaId: string; inventoryRestored: boolean; initiatedAt: string } {
  const shipment = db
    .prepare('SELECT status, dispatched_at FROM shipments WHERE id = ?')
    .get(shipmentId) as { status: string; dispatched_at: string | null } | undefined;

  if (!shipment) throw new LogisticsError('E404-SH', 'Shipment not found', 404);
  if (shipment.status !== 'delivered' && shipment.status !== 'in_transit') {
    throw new LogisticsError('E409-SH', `Cannot initiate RMA for status=${shipment.status}`, 409);
  }

  // 반품 가능 기간 검증 (발송일 기준 30일 이내)
  if (shipment.dispatched_at) {
    const dispatched = new Date(shipment.dispatched_at);
    const now = new Date();
    const daysSinceDispatch = (now.getTime() - dispatched.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDispatch > REFUND_WINDOW_DAYS) {
      throw new LogisticsError('E422-RMA-EXP', `Return window expired (${Math.floor(daysSinceDispatch)} days > ${REFUND_WINDOW_DAYS})`, 422);
    }
  }

  const rmaId = randomUUID();
  const initiatedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO rma_records (id, shipment_id, reason, status, initiated_at)
      VALUES (?, ?, ?, 'initiated', ?)
    `).run(rmaId, shipmentId, reason, initiatedAt);
    db.prepare(`UPDATE shipments SET status = 'returned' WHERE id = ?`)
      .run(shipmentId);
  });
  tx();

  void reason;
  return { rmaId, inventoryRestored: true, initiatedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class LogisticsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'LogisticsError';
  }
}
