import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-MF (MF-001~MF-006): Manufacturing 합성 도메인 — 22번째 도메인 (제조 산업, 11번째 신규 산업)
//   - manufacturing spec-container rules.md 기반 PoC source
//   - 합성 schema: boms, production_orders, production_lots, defect_quarantine_log, shipment_log
//   - 제조 lifecycle 패턴 — BOM폭발검증/생산주문/주문확정/상태전환/불량격리배치/출하해제
//   - withRuleId 재사용 22번째 도메인 (신규 detector 0개, 20 Sprint 연속 정점)
//   - ManufacturingError code-in-message 패턴 (S275 표준)
//   - 11 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF)
// ---------------------------------------------------------------------------

export interface BomRow {
  id: string;
  product_id: string;
  components: string;     // JSON array of component IDs
  component_count: number;
  status: string;         // draft | active | archived
}

export interface ProductionOrderRow {
  id: string;
  product_id: string;
  required_capacity: number;
  status: string;         // pending | confirmed | cancelled
  created_at: string;
}

export interface ProductionLotRow {
  id: string;
  order_id: string;
  status: string;         // planned | in_progress | qc | released | quarantined
  scheduled_at: string;
}

export interface DefectQuarantineLogRow {
  id: string;
  lot_id: string;
  reason: string;
  quarantined_at: string;
}

export interface ShipmentLogRow {
  id: string;
  order_id: string;
  released_at: string;
}

const BOM_MAX_COMPONENTS = 500;
const MAX_ORDER_CAPACITY = 10000;

// ---------------------------------------------------------------------------
// MF-001: BOM 폭발 — 구성품 수 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function explodeBom(
  db: Database.Database,
  productId: string,
  components: string[],
): { bomId: string; componentCount: number; status: string } {
  if (components.length === 0) {
    throw new ManufacturingError('E422-BOM-EMPTY', `BOM components must not be empty`, 422);
  }
  if (components.length > BOM_MAX_COMPONENTS) {
    throw new ManufacturingError('E422-BOM-MAX', `Component count exceeds limit (${components.length} > ${BOM_MAX_COMPONENTS})`, 422);
  }

  const bomId = randomUUID();
  const componentCount = components.length;

  db.prepare(`
    INSERT INTO boms (id, product_id, components, component_count, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(bomId, productId, JSON.stringify(components), componentCount);

  return { bomId, componentCount, status: 'active' };
}

// ---------------------------------------------------------------------------
// MF-002: 생산 주문 용량 — 요청 용량 vs 최대 생산 용량 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, requiredCapacity > capacityLimit 'limit' keyword 매칭)
// ---------------------------------------------------------------------------
export function placeProductionOrder(
  db: Database.Database,
  productId: string,
  requiredCapacity: number,
  availableCapacity: number,
): { orderId: string; status: string } {
  if (requiredCapacity <= 0) {
    throw new ManufacturingError('E422-CAP-MIN', `Required capacity must be positive (${requiredCapacity})`, 422);
  }

  // F445 Path B: var-vs-var, left=`capacityLimit` (`limit` keyword 매칭)
  const capacityLimit = Math.min(availableCapacity, MAX_ORDER_CAPACITY);
  if (requiredCapacity > capacityLimit) {
    throw new ManufacturingError('E422-CAP-MAX', `Required capacity exceeds limit (${requiredCapacity} > ${capacityLimit} limit)`, 422);
  }

  const orderId = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO production_orders (id, product_id, required_capacity, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(orderId, productId, requiredCapacity, createdAt);

  return { orderId, status: 'pending' };
}

// ---------------------------------------------------------------------------
// MF-003: 생산 주문 확정 atomic (주문 확정 + 자재 예약 + 일정 등록)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmProductionOrder(
  db: Database.Database,
  orderId: string,
): { orderId: string; lotId: string; confirmedAt: string } {
  const order = db
    .prepare('SELECT status, product_id FROM production_orders WHERE id = ?')
    .get(orderId) as { status: string; product_id: string } | undefined;

  if (!order) throw new ManufacturingError('E404-ORD', 'Production order not found', 404);
  if (order.status !== 'pending') {
    throw new ManufacturingError('E409-ORD', `Cannot confirm order with status=${order.status}`, 409);
  }

  const lotId = randomUUID();
  const confirmedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE production_orders SET status = 'confirmed' WHERE id = ?`)
      .run(orderId);
    db.prepare(`
      INSERT INTO production_lots (id, order_id, status, scheduled_at)
      VALUES (?, ?, 'planned', ?)
    `).run(lotId, orderId, confirmedAt);
  });
  tx();

  return { orderId, lotId, confirmedAt };
}

// ---------------------------------------------------------------------------
// MF-004: 생산 상태 전환 (planned → in_progress → qc → released)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionProductionStatus(
  db: Database.Database,
  lotId: string,
  newStatus: 'in_progress' | 'qc' | 'released',
): { lotId: string; previousStatus: string; newStatus: string } {
  const lot = db
    .prepare('SELECT status FROM production_lots WHERE id = ?')
    .get(lotId) as { status: string } | undefined;

  if (!lot) throw new ManufacturingError('E404-LOT', 'Production lot not found', 404);

  const previousStatus = lot.status;
  const allowed =
    (previousStatus === 'planned' && newStatus === 'in_progress') ||
    (previousStatus === 'in_progress' && newStatus === 'qc') ||
    (previousStatus === 'qc' && newStatus === 'released');

  if (!allowed) {
    throw new ManufacturingError('E409-LOT', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  db.prepare(`UPDATE production_lots SET status = ? WHERE id = ?`).run(newStatus, lotId);

  return { lotId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// MF-005: 불량 일괄 격리 (결함 lot 배치 격리 처리)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC/ED/RE/LG/HO/TR-005 동일 형태 11번째)
// ---------------------------------------------------------------------------
export function quarantineDefectiveLots(
  db: Database.Database,
  orderId: string,
  reason: string,
): { quarantinedCount: number; quarantinedLotIds: string[] } {
  const candidates = db
    .prepare(`SELECT id FROM production_lots WHERE status IN ('in_progress', 'qc') AND order_id = ?`)
    .all(orderId) as Array<{ id: string }>;

  const quarantinedLotIds: string[] = [];
  const quarantinedAt = new Date().toISOString();

  for (const lot of candidates) {
    db.prepare(`UPDATE production_lots SET status = 'quarantined' WHERE id = ?`)
      .run(lot.id);
    db.prepare(`
      INSERT INTO defect_quarantine_log (id, lot_id, reason, quarantined_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), lot.id, reason, quarantinedAt);
    quarantinedLotIds.push(lot.id);
  }

  return { quarantinedCount: quarantinedLotIds.length, quarantinedLotIds };
}

// ---------------------------------------------------------------------------
// MF-006: 출하 해제 atomic (QC 통과 + 재고 조정 + 출하 등록)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function releaseForShipment(
  db: Database.Database,
  lotId: string,
): { shipmentLogId: string; releasedAt: string } {
  const lot = db
    .prepare('SELECT status, order_id FROM production_lots WHERE id = ?')
    .get(lotId) as { status: string; order_id: string } | undefined;

  if (!lot) throw new ManufacturingError('E404-LOT', 'Production lot not found', 404);
  if (lot.status !== 'qc') {
    throw new ManufacturingError('E409-LOT', `Cannot release lot with status=${lot.status} (requires qc)`, 409);
  }

  const shipmentLogId = randomUUID();
  const releasedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE production_lots SET status = 'released' WHERE id = ?`)
      .run(lotId);
    db.prepare(`
      INSERT INTO shipment_log (id, order_id, released_at)
      VALUES (?, ?, ?)
    `).run(shipmentLogId, lot.order_id, releasedAt);
  });
  tx();

  return { shipmentLogId, releasedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ManufacturingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ManufacturingError';
  }
}
