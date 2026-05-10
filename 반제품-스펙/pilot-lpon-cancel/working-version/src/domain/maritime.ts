import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-MR (MR-001~MR-006): Maritime 합성 도메인 — 32번째 도메인 (해운 산업, 21번째 신규 산업)
//   - maritime spec-container rules.md 기반 PoC source
//   - 합성 schema: vessels, shipments, freight_rates, customs_declarations, port_handlings, damage_claims
//   - 해운 lifecycle 패턴 — 화물한도/운임한도/통관atomic/선적상태전환/항구처리배치/손상신고atomic
//   - withRuleId 재사용 32번째 도메인 (신규 detector 0개, 30 Sprint 연속 정점)
//   - MaritimeError code-in-message 패턴 (S275 표준)
//   - 21 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR)
//   - 🎯 AIF-PLAN-100 마일스톤 — Plan 100번째 산출물
// ---------------------------------------------------------------------------

export interface VesselRow {
  id: string;
  name: string;
  owner_id: string;
  max_capacity_tons: number;
  current_load_tons: number;
  status: string;             // available | loading | at_sea | arrived | maintenance
}

export interface ShipmentRow {
  id: string;
  vessel_id: string;
  shipper_id: string;
  cargo_tons: number;
  origin_port: string;
  dest_port: string;
  status: string;             // booked | loaded | at_sea | arrived | delivered
  booked_at: string;
  loaded_at: string | null;
  departed_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
}

export interface FreightRateRow {
  id: string;
  shipment_id: string;
  base_rate: number;
  quoted_rate: number;
  computed_at: string;
}

export interface CustomsDeclarationRow {
  id: string;
  shipment_id: string;
  declared_value: number;
  tariff_amount: number;
  status: string;             // pending | cleared | rejected
  declared_at: string;
  cleared_at: string | null;
}

export interface DamageClaimRow {
  id: string;
  shipment_id: string;
  claimant_id: string;
  damage_description: string;
  compensation_amount: number;
  status: string;             // submitted | verified | compensated | rejected
  submitted_at: string;
}

const MAX_CARGO_CAPACITY_TONS = 200_000; // MR-001: 최대 화물 적재 한도 (200,000 tons)

// ---------------------------------------------------------------------------
// MR-001: 화물 적재 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function loadCargo(
  db: Database.Database,
  vesselId: string,
  shipperId: string,
  cargoTons: number,
  originPort: string,
  destPort: string,
): { shipmentId: string; vesselId: string; shipperId: string; cargoTons: number; bookedAt: string } {
  const vessel = db
    .prepare('SELECT id, status, max_capacity_tons, current_load_tons FROM vessels WHERE id = ?')
    .get(vesselId) as { id: string; status: string; max_capacity_tons: number; current_load_tons: number } | undefined;

  if (!vessel) throw new MaritimeError('E404-VESSEL', 'Vessel not found', 404);
  if (vessel.status !== 'available' && vessel.status !== 'loading') {
    throw new MaritimeError(
      'E409-VESSEL',
      `Cannot load cargo onto vessel with status=${vessel.status}`,
      409,
    );
  }

  if (cargoTons >= MAX_CARGO_CAPACITY_TONS) {
    throw new MaritimeError(
      'E422-CARGO-LIMIT',
      `Cargo tonnage exceeded maximum capacity (${cargoTons} >= ${MAX_CARGO_CAPACITY_TONS} tons)`,
      422,
    );
  }

  const newLoad = vessel.current_load_tons + cargoTons;
  if (newLoad > vessel.max_capacity_tons) {
    throw new MaritimeError(
      'E422-VESSEL-CAPACITY',
      `Vessel capacity exceeded (${newLoad} > ${vessel.max_capacity_tons} tons)`,
      422,
    );
  }

  const shipmentId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO shipments (id, vessel_id, shipper_id, cargo_tons, origin_port, dest_port, status, booked_at,
      loaded_at, departed_at, arrived_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, 'booked', ?, NULL, NULL, NULL, NULL)
  `).run(shipmentId, vesselId, shipperId, cargoTons, originPort, destPort, bookedAt);

  db.prepare(`UPDATE vessels SET current_load_tons = ? WHERE id = ?`).run(newLoad, vesselId);

  return { shipmentId, vesselId, shipperId, cargoTons, bookedAt };
}

// ---------------------------------------------------------------------------
// MR-002: 운임 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, freightRateLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function computeFreightRate(
  db: Database.Database,
  shipmentId: string,
  quotedRate: number,
): { shipmentId: string; quotedRate: number; freightRateLimit: number; approved: boolean } {
  const shipment = db
    .prepare('SELECT id, cargo_tons, origin_port, dest_port FROM shipments WHERE id = ?')
    .get(shipmentId) as { id: string; cargo_tons: number; origin_port: string; dest_port: string } | undefined;

  if (!shipment) throw new MaritimeError('E404-SHIPMENT', 'Shipment not found', 404);

  // 항로 유형별 최대 운임 한도 (USD/ton)
  const rateLimitByRoute: Record<string, number> = {
    intra_asia:    15,  // 아시아 역내
    asia_europe:   35,  // 아시아-유럽
    transpacific:  40,  // 태평양 횡단
    transatlantic: 45,  // 대서양 횡단
  };

  const isIntraAsia =
    ['KR', 'CN', 'JP', 'SG'].some((c) => shipment.origin_port.startsWith(c)) &&
    ['KR', 'CN', 'JP', 'SG'].some((c) => shipment.dest_port.startsWith(c));
  const isEurope = ['DE', 'NL', 'GB', 'FR'].some(
    (c) => shipment.dest_port.startsWith(c) || shipment.origin_port.startsWith(c),
  );

  const routeType = isIntraAsia
    ? 'intra_asia'
    : isEurope
      ? 'asia_europe'
      : 'transpacific';

  // F445 Path B: var-vs-var, left=`freightRateLimit` (`limit` keyword 매칭)
  const freightRateLimit = rateLimitByRoute[routeType] ?? 40;

  if (quotedRate > freightRateLimit) {
    throw new MaritimeError(
      'E422-FREIGHT-RATE-EXCEEDED',
      `Freight rate exceeded limit (${quotedRate} > ${freightRateLimit} USD/ton)`,
      422,
    );
  }

  db.prepare(`
    INSERT INTO freight_rates (id, shipment_id, base_rate, quoted_rate, computed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), shipmentId, freightRateLimit * 0.8, quotedRate, new Date().toISOString());

  return { shipmentId, quotedRate, freightRateLimit, approved: true };
}

// ---------------------------------------------------------------------------
// MR-003: 통관 처리 atomic — 신고 + 관세 계산 + 통관 승인 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCustoms(
  db: Database.Database,
  shipmentId: string,
  declaredValue: number,
  tariffRate: number,
  inspectorId: string,
): { declarationId: string; customsApprovalId: string; shipmentId: string; tariffAmount: number; clearedAt: string } {
  const shipment = db
    .prepare('SELECT id, status FROM shipments WHERE id = ?')
    .get(shipmentId) as { id: string; status: string } | undefined;

  if (!shipment) throw new MaritimeError('E404-SHIPMENT', 'Shipment not found', 404);
  if (shipment.status !== 'arrived') {
    throw new MaritimeError(
      'E409-SHIPMENT',
      `Cannot process customs for shipment with status=${shipment.status}`,
      409,
    );
  }

  const declarationId = randomUUID();
  const customsApprovalId = randomUUID();
  const clearedAt = new Date().toISOString();
  const tariffAmount = Math.round(declaredValue * tariffRate);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO customs_declarations (id, shipment_id, declared_value, tariff_amount, status, declared_at, cleared_at)
      VALUES (?, ?, ?, ?, 'cleared', ?, ?)
    `).run(declarationId, shipmentId, declaredValue, tariffAmount, clearedAt, clearedAt);
    db.prepare(`
      INSERT INTO customs_approvals (id, declaration_id, inspector_id, approved_at, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(customsApprovalId, declarationId, inspectorId, clearedAt, 'Customs clearance approved');
    db.prepare(`
      UPDATE shipments SET customs_cleared = 1, customs_cleared_at = ? WHERE id = ?
    `).run(clearedAt, shipmentId);
  });
  tx();

  return { declarationId, customsApprovalId, shipmentId, tariffAmount, clearedAt };
}

// ---------------------------------------------------------------------------
// MR-004: 선적 상태 전환 (booked → loaded → at_sea → arrived → delivered)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionShipmentStatus(
  db: Database.Database,
  shipmentId: string,
  newStatus: 'loaded' | 'at_sea' | 'arrived' | 'delivered',
): { shipmentId: string; previousStatus: string; newStatus: string } {
  const shipment = db
    .prepare('SELECT status FROM shipments WHERE id = ?')
    .get(shipmentId) as { status: string } | undefined;

  if (!shipment) throw new MaritimeError('E404-SHIPMENT', 'Shipment not found', 404);

  const previousStatus = shipment.status;
  const allowed =
    (previousStatus === 'booked' && newStatus === 'loaded') ||
    (previousStatus === 'loaded' && newStatus === 'at_sea') ||
    (previousStatus === 'at_sea' && newStatus === 'arrived') ||
    (previousStatus === 'arrived' && newStatus === 'delivered');

  if (!allowed) {
    throw new MaritimeError(
      'E409-SHIPMENT',
      `Cannot transition shipment from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE shipments SET status = ? WHERE id = ?`).run(newStatus, shipmentId);

  if (newStatus === 'loaded') {
    db.prepare(`UPDATE shipments SET loaded_at = ? WHERE id = ?`).run(now, shipmentId);
  } else if (newStatus === 'at_sea') {
    db.prepare(`UPDATE shipments SET departed_at = ? WHERE id = ?`).run(now, shipmentId);
  } else if (newStatus === 'arrived') {
    db.prepare(`UPDATE shipments SET arrived_at = ? WHERE id = ?`).run(now, shipmentId);
  } else if (newStatus === 'delivered') {
    db.prepare(`UPDATE shipments SET delivered_at = ? WHERE id = ?`).run(now, shipmentId);
  }

  return { shipmentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// MR-005: 항구 처리 일괄 갱신 (batch port handling)
// (StatusTransition detector — batch 패턴, CC-005 batch 21번째 재사용)
// ---------------------------------------------------------------------------
export function markPortHandled(
  db: Database.Database,
  arrivalCutoff: string,
): { handledCount: number; handledIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM shipments
      WHERE status = 'arrived'
        AND arrived_at <= ?
        AND port_handled = 0
    `)
    .all(arrivalCutoff) as Array<{ id: string }>;

  const handledIds: string[] = [];

  for (const shipment of candidates) {
    db.prepare(`
      UPDATE shipments
      SET port_handled = 1, port_handled_at = ?, status = 'port_cleared'
      WHERE id = ?
    `).run(new Date().toISOString(), shipment.id);
    handledIds.push(shipment.id);
  }

  return { handledCount: handledIds.length, handledIds };
}

// ---------------------------------------------------------------------------
// MR-006: 손상 신고 atomic — 손상 신고 + 검증 + 보상 처리 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processDamageClaim(
  db: Database.Database,
  shipmentId: string,
  claimantId: string,
  damageDescription: string,
  compensationAmount: number,
): { claimId: string; compensationRecordId: string; shipmentId: string; claimantId: string; compensationAmount: number; processedAt: string } {
  const shipment = db
    .prepare('SELECT id, status FROM shipments WHERE id = ?')
    .get(shipmentId) as { id: string; status: string } | undefined;

  if (!shipment) throw new MaritimeError('E404-SHIPMENT', 'Shipment not found', 404);
  if (shipment.status !== 'delivered' && shipment.status !== 'arrived') {
    throw new MaritimeError(
      'E409-SHIPMENT',
      `Cannot process damage claim for shipment with status=${shipment.status}`,
      409,
    );
  }

  const claimId = randomUUID();
  const compensationRecordId = randomUUID();
  const processedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO damage_claims (id, shipment_id, claimant_id, damage_description, compensation_amount, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'compensated', ?)
    `).run(claimId, shipmentId, claimantId, damageDescription, compensationAmount, processedAt);
    db.prepare(`
      INSERT INTO compensation_records (id, claim_id, shipment_id, amount, processed_at, processed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(compensationRecordId, claimId, shipmentId, compensationAmount, processedAt, claimantId);
    db.prepare(`
      UPDATE shipments SET damage_claim_filed = 1 WHERE id = ?
    `).run(shipmentId);
  });
  tx();

  return { claimId, compensationRecordId, shipmentId, claimantId, compensationAmount, processedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class MaritimeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'MaritimeError';
  }
}
