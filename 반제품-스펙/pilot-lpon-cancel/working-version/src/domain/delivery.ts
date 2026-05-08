import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-DV (DV-001~DV-006): Delivery 합성 도메인 — 13번째 도메인 (배송 산업 다양성)
//   - delivery spec-container rules.md 기반 PoC source
//   - 합성 schema: deliveries, delivery_events, return_requests
//   - 배송 산업 패턴 — 요청/한도/시작/상태/지연/취소
//   - withRuleId 재사용 13번째 도메인 (신규 detector 0개, 11 Sprint 연속 정점)
//   - DeliveryError code-in-message 패턴 (S275 표준)
//   - Threshold detector Path A/B (S279 F445) + SUPPORTED auto-sync (S280 F446) +
//     resolvedBy/At audit trail (S281 F447) + byStatus auto-summary (S282 F448) 활용
// ---------------------------------------------------------------------------

export interface DeliveryRow {
  id: string;
  order_id: string;
  recipient_address: string;
  region_code: string;       // SEOUL | METRO | RURAL | OVERSEAS
  weight_kg: number;
  status: string;            // PENDING | SHIPPED | DELIVERED | DELAYED | CANCELLED | RETURNED
  expected_delivery_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  delayed_since: string | null;
}

export interface DeliveryEventRow {
  id: string;
  delivery_id: string;
  event_type: string;        // CREATED | SHIPPED | TRANSIT | DELIVERED | DELAYED | CANCELLED | RETURNED
  occurred_at: string;
}

const MAX_WEIGHT_KG = 30;
const MIN_WEIGHT_KG = 0.1;
const DELIVERY_DELAY_DAYS = 3;
const RURAL_MAX_WEIGHT_KG = 10;
const OVERSEAS_BLOCKED_WEIGHT_KG = 20;

// ---------------------------------------------------------------------------
// DV-001: 배송 요청 (무게 한도 검증 — 0.1kg ≤ weight ≤ 30kg)
// (ThresholdCheck detector — F445 Path A: var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function requestDelivery(
  db: Database.Database,
  orderId: string,
  recipientAddress: string,
  regionCode: string,
  weightKg: number,
): { deliveryId: string; expectedDeliveryAt: string } {
  if (weightKg < MIN_WEIGHT_KG) {
    throw new DeliveryError('E422-WT-MIN', `Weight below minimum (${weightKg} < ${MIN_WEIGHT_KG})`, 422);
  }
  if (weightKg > MAX_WEIGHT_KG) {
    throw new DeliveryError('E422-WT-MAX', `Weight above maximum (${weightKg} > ${MAX_WEIGHT_KG})`, 422);
  }

  const deliveryId = randomUUID();
  const now = new Date();
  const expectedDays = regionCode === 'OVERSEAS' ? 7 : regionCode === 'RURAL' ? 4 : 2;
  const expectedDeliveryAt = new Date(now.getTime() + expectedDays * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  db.prepare(`
    INSERT INTO deliveries (id, order_id, recipient_address, region_code, weight_kg, status, expected_delivery_at, shipped_at, delivered_at, cancelled_at, delayed_since)
    VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL, NULL, NULL, NULL)
  `).run(deliveryId, orderId, recipientAddress, regionCode, weightKg, expectedDeliveryAt);

  db.prepare(`
    INSERT INTO delivery_events (id, delivery_id, event_type, occurred_at)
    VALUES (?, ?, 'CREATED', ?)
  `).run(randomUUID(), deliveryId, nowIso);

  return { deliveryId, expectedDeliveryAt };
}

// ---------------------------------------------------------------------------
// DV-002: 지역별 배송 한도 검증 (RURAL ≤ 10kg, OVERSEAS ≤ 20kg)
// (ThresholdCheck detector — F445 Path B: var-vs-var with keyword)
// ---------------------------------------------------------------------------
export function checkRegionLimit(
  db: Database.Database,
  deliveryId: string,
): { canShip: boolean; regionLimit: number } {
  const delivery = db
    .prepare('SELECT region_code, weight_kg, status FROM deliveries WHERE id = ?')
    .get(deliveryId) as { region_code: string; weight_kg: number; status: string } | undefined;

  if (!delivery) {
    throw new DeliveryError('E404-DV', 'Delivery not found', 404);
  }
  if (delivery.status !== 'PENDING') {
    throw new DeliveryError('E409-ST', `Delivery not in PENDING (status=${delivery.status})`, 409);
  }

  const regionLimit = delivery.region_code === 'RURAL' ? RURAL_MAX_WEIGHT_KG
    : delivery.region_code === 'OVERSEAS' ? OVERSEAS_BLOCKED_WEIGHT_KG
    : MAX_WEIGHT_KG;

  // F445 Path B: var-vs-var (weight_kg has keyword `weight`-not in pattern, regionLimit has `limit`)
  if (regionLimit < delivery.weight_kg) {
    throw new DeliveryError('E422-RGN-LIMIT', `Region ${delivery.region_code} limit exceeded (${delivery.weight_kg}kg > ${regionLimit}kg)`, 422);
  }
  return { canShip: true, regionLimit };
}

// ---------------------------------------------------------------------------
// DV-003: 배송 시작 atomic (status PENDING → SHIPPED + event INSERT)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function startShipping(
  db: Database.Database,
  deliveryId: string,
): { deliveryId: string; status: string; shippedAt: string } {
  const delivery = db
    .prepare('SELECT status FROM deliveries WHERE id = ?')
    .get(deliveryId) as { status: string } | undefined;

  if (!delivery) throw new DeliveryError('E404-DV', 'Delivery not found', 404);
  if (delivery.status !== 'PENDING') {
    throw new DeliveryError('E409-ST', `Cannot ship from status=${delivery.status}`, 409);
  }

  const shippedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE deliveries SET status = 'SHIPPED', shipped_at = ? WHERE id = ?`)
      .run(shippedAt, deliveryId);
    db.prepare(`
      INSERT INTO delivery_events (id, delivery_id, event_type, occurred_at)
      VALUES (?, ?, 'SHIPPED', ?)
    `).run(randomUUID(), deliveryId, shippedAt);
  });
  tx();

  return { deliveryId, status: 'SHIPPED', shippedAt };
}

// ---------------------------------------------------------------------------
// DV-004: 배송 상태 전환 (SHIPPED → DELIVERED / CANCELLED / RETURNED)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionDeliveryStatus(
  db: Database.Database,
  deliveryId: string,
  newStatus: 'DELIVERED' | 'CANCELLED' | 'RETURNED',
): { deliveryId: string; previousStatus: string; newStatus: string } {
  const delivery = db
    .prepare('SELECT status FROM deliveries WHERE id = ?')
    .get(deliveryId) as { status: string } | undefined;

  if (!delivery) throw new DeliveryError('E404-DV', 'Delivery not found', 404);

  const previousStatus = delivery.status;
  // 허용 전환: SHIPPED → DELIVERED/CANCELLED/RETURNED, PENDING → CANCELLED
  const allowed =
    (previousStatus === 'SHIPPED' && ['DELIVERED', 'CANCELLED', 'RETURNED'].includes(newStatus)) ||
    (previousStatus === 'PENDING' && newStatus === 'CANCELLED');

  if (!allowed) {
    throw new DeliveryError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  const now = new Date().toISOString();
  const fieldMap: Record<string, string> = {
    DELIVERED: 'delivered_at',
    CANCELLED: 'cancelled_at',
    RETURNED: 'cancelled_at',
  };
  const field = fieldMap[newStatus] ?? 'delivered_at';

  db.prepare(`UPDATE deliveries SET status = ?, ${field} = ? WHERE id = ?`)
    .run(newStatus, now, deliveryId);

  return { deliveryId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// DV-005: 배송 지연 자동 마킹 (예상일 + 3일 초과 → status='DELAYED')
// (StatusTransition detector — batch 패턴, CC-005 동일 입증된 패턴)
// ---------------------------------------------------------------------------
export function markDelayedDeliveries(
  db: Database.Database,
  asOfDate: string = new Date().toISOString(),
): { markedCount: number; delayedDeliveryIds: string[] } {
  const cutoff = new Date(new Date(asOfDate).getTime() - DELIVERY_DELAY_DAYS * 86_400_000).toISOString();

  const candidates = db
    .prepare(`
      SELECT id FROM deliveries
      WHERE status = 'SHIPPED'
        AND expected_delivery_at < ?
    `)
    .all(cutoff) as Array<{ id: string }>;

  const delayedDeliveryIds: string[] = [];
  for (const d of candidates) {
    db.prepare(`UPDATE deliveries SET status = 'DELAYED', delayed_since = ? WHERE id = ?`)
      .run(asOfDate, d.id);
    delayedDeliveryIds.push(d.id);
  }

  return { markedCount: delayedDeliveryIds.length, delayedDeliveryIds };
}

// ---------------------------------------------------------------------------
// DV-006: 배송 취소 → 반품 atomic (deliveries.status='RETURNED' + return_requests INSERT)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function cancelAndReturn(
  db: Database.Database,
  deliveryId: string,
  reason: string,
): { returnRequestId: string; refundAmount: number; cancelledAt: string } {
  const delivery = db
    .prepare('SELECT order_id, weight_kg, status FROM deliveries WHERE id = ?')
    .get(deliveryId) as { order_id: string; weight_kg: number; status: string } | undefined;

  if (!delivery) throw new DeliveryError('E404-DV', 'Delivery not found', 404);
  if (!['SHIPPED', 'DELIVERED'].includes(delivery.status)) {
    throw new DeliveryError('E409-DV', `Cannot return from status=${delivery.status}`, 409);
  }

  const returnRequestId = randomUUID();
  const cancelledAt = new Date().toISOString();
  const refundAmount = Math.floor(delivery.weight_kg * 1000);  // 합성: kg당 1,000원 환불

  const tx = db.transaction(() => {
    db.prepare(`UPDATE deliveries SET status = 'RETURNED', cancelled_at = ? WHERE id = ?`)
      .run(cancelledAt, deliveryId);
    db.prepare(`
      INSERT INTO return_requests (id, delivery_id, order_id, reason, refund_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(returnRequestId, deliveryId, delivery.order_id, reason, refundAmount, cancelledAt);
  });
  tx();

  return { returnRequestId, refundAmount, cancelledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class DeliveryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'DeliveryError';
  }
}
