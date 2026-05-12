import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-SH (SH-001~SH-006): Shipping 합성 도메인 — 52번째 도메인 (해운/선적 산업, 41번째 신규 산업)
//   - shipping spec-container rules.md 기반 PoC source
//   - 합성 schema: vessels, freight_contracts, voyage_bookings, cargo_loads,
//                  freight_payments, demurrage_refund_records, demurrage_refunds
//   - 해운 lifecycle 패턴 — 컨테이너슬롯한도/운임수수료한도/화물적재atomic/항해예약상태전환/만료화물일괄/체선료환불atomic
//   - withRuleId 재사용 52번째 도메인 (신규 detector 0개, 53 Sprint 연속 정점 도전)
//   - ShippingError code-in-message 패턴 (S275 표준)
//   - 41 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH)
//   - 41번째 신규 산업 마일스톤 (shipping 추가, 국제무역 클러스터 신규: LG+SH 분리)
//   - 거울 변환 5회차 (carsharing → fastfood → aerospace → music → shipping)
// ---------------------------------------------------------------------------

export interface VesselRow {
  id: string;
  name: string;
  total_capacity: number;
  active_bookings: number;
  status: string; // active | maintenance | retired
}

export interface FreightContractRow {
  id: string;
  shipper_id: string;
  vessel_id: string;
  tier_code: string; // standard | priority | premium | reefer
  fee_limit: number;
  fee_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface VoyageBookingRow {
  id: string;
  vessel_id: string;
  contract_id: string;
  cargo_load_id: string | null;
  freight_payment_id: string | null;
  status: string; // booked | confirmed | loading | departed | arrived | aborted
  scheduled_at: string;
}

export interface CargoLoadRow {
  id: string;
  vessel_id: string;
  booking_id: string;
  container_no: string;
  status: string; // loading | departed | arrived | expired
  loaded_at: string;
}

export interface DemurrageRefundRecordRow {
  id: string;
  shipper_id: string;
  cargo_load_id: string;
  freight_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_BOOKINGS_PER_VESSEL = 200; // SH-001: 선박별 동시 컨테이너 슬롯 한도 (TEU, 기본값)

// ---------------------------------------------------------------------------
// SH-001: 선박 컨테이너 슬롯 동시 예약 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookVoyage(
  db: Database.Database,
  vesselId: string,
  contractId: string,
): { bookingId: string; vesselId: string; contractId: string; scheduledAt: string } {
  const vessel = db
    .prepare('SELECT active_bookings, total_capacity FROM vessels WHERE id = ?')
    .get(vesselId) as { active_bookings: number; total_capacity: number } | undefined;

  if (!vessel) throw new ShippingError('E404-VESSEL', 'Vessel not found', 404);

  const limit = vessel.total_capacity ?? MAX_CONCURRENT_BOOKINGS_PER_VESSEL;

  if (vessel.active_bookings >= limit) {
    throw new ShippingError(
      'E422-VESSEL-CAPACITY-EXCEEDED',
      `Vessel is at full capacity (${vessel.active_bookings} >= ${limit})`,
      422,
    );
  }

  const bookingId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO voyage_bookings (id, vessel_id, contract_id, cargo_load_id, freight_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'booked', ?)
  `).run(bookingId, vesselId, contractId, scheduledAt);

  db.prepare(`
    UPDATE vessels SET active_bookings = active_bookings + 1 WHERE id = ?
  `).run(vesselId);

  return { bookingId, vesselId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// SH-002: 화주 운임 수수료 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, freightPaymentLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyFreightTier(
  db: Database.Database,
  shipperId: string,
  contractId: string,
  fee: number,
): { shipperId: string; contractId: string; freightPaymentLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT fee_used, fee_limit FROM freight_contracts WHERE id = ? AND shipper_id = ? LIMIT 1')
    .get(contractId, shipperId) as { fee_used: number; fee_limit: number } | undefined;

  if (!contract) throw new ShippingError('E404-CONTRACT', 'Freight contract not found', 404);

  // F445 Path B: var-vs-var, left=`freightPaymentLimit` (`limit` keyword 매칭)
  const freightPaymentLimit = contract.fee_limit;

  if (contract.fee_used + fee >= freightPaymentLimit) {
    throw new ShippingError(
      'E422-FREIGHT-PAYMENT-LIMIT-EXCEEDED',
      `Freight payment quota exhausted (${contract.fee_used + fee} >= ${freightPaymentLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE freight_contracts SET fee_used = fee_used + ? WHERE id = ?
  `).run(fee, contractId);

  return { shipperId, contractId, freightPaymentLimit, approved: true };
}

// ---------------------------------------------------------------------------
// SH-003: 화물 적재 atomic — cargo_loads + voyage_bookings 상태전환 + freight_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function loadCargo(
  db: Database.Database,
  vesselId: string,
  bookingId: string,
  containerNo: string,
  amount: number,
): { cargoLoadId: string; freightPaymentId: string; bookingId: string; vesselId: string; loadedAt: string } {
  const booking = db
    .prepare("SELECT status FROM voyage_bookings WHERE id = ? AND status = 'confirmed'")
    .get(bookingId) as { status: string } | undefined;

  if (!booking) throw new ShippingError('E404-BOOKING', 'Confirmed voyage booking not found', 404);

  const cargoLoadId = randomUUID();
  const freightPaymentId = randomUUID();
  const loadedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cargo_loads (id, vessel_id, booking_id, container_no, status, loaded_at)
      VALUES (?, ?, ?, ?, 'loading', ?)
    `).run(cargoLoadId, vesselId, bookingId, containerNo, loadedAt);

    db.prepare(`
      UPDATE voyage_bookings SET status = 'loading', cargo_load_id = ?, freight_payment_id = ? WHERE id = ?
    `).run(cargoLoadId, freightPaymentId, bookingId);

    db.prepare(`
      INSERT INTO freight_payments (id, booking_id, cargo_load_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(freightPaymentId, bookingId, cargoLoadId, amount, loadedAt);
  });
  tx();

  return { cargoLoadId, freightPaymentId, bookingId, vesselId, loadedAt };
}

// ---------------------------------------------------------------------------
// SH-004: 항해 예약 상태 전환 (booked → confirmed → loading → departed → arrived/aborted)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionBookingStatus(
  db: Database.Database,
  bookingId: string,
  newStatus: 'confirmed' | 'loading' | 'departed' | 'arrived' | 'aborted',
): { bookingId: string; previousStatus: string; newStatus: string } {
  const booking = db
    .prepare('SELECT status FROM voyage_bookings WHERE id = ?')
    .get(bookingId) as { status: string } | undefined;

  if (!booking) throw new ShippingError('E404-BOOKING', 'Voyage booking not found', 404);

  const previousStatus = booking.status;
  const allowed =
    (booking.status === 'booked' && newStatus === 'confirmed') ||
    (booking.status === 'confirmed' && newStatus === 'loading') ||
    (booking.status === 'loading' && newStatus === 'departed') ||
    (booking.status === 'departed' && newStatus === 'arrived') ||
    (booking.status === 'loading' && newStatus === 'aborted') ||
    (booking.status === 'booked' && newStatus === 'aborted') ||
    (booking.status === 'confirmed' && newStatus === 'aborted');

  if (!allowed) {
    throw new ShippingError(
      'E409-BOOKING',
      `Cannot transition voyage booking from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE voyage_bookings SET status = ? WHERE id = ?`).run(newStatus, bookingId);

  return { bookingId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// SH-005: 만료 화물 적재 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, MU-005/AS-005/FS-005/CS-005 41번째 재사용)
// ---------------------------------------------------------------------------
export function expireCargoLoadBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM cargo_loads
      WHERE status = 'arrived'
        AND loaded_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE cargo_loads
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// SH-006: 체선료 환불 atomic — 운임 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processDemurrageRefund(
  db: Database.Database,
  shipperId: string,
  cargoLoadId: string,
  freightCost: number,
  refundRate: number,
): { demurrageRefundId: string; refundId: string; shipperId: string; refundAmount: number; refundedAt: string } {
  const cargoLoad = db
    .prepare("SELECT status FROM cargo_loads WHERE id = ? AND status = 'arrived'")
    .get(cargoLoadId) as { status: string } | undefined;

  if (!cargoLoad) throw new ShippingError('E404-ARRIVED-CARGO', 'Arrived cargo load not found', 404);

  const demurrageRefundId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(freightCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO demurrage_refund_records (id, shipper_id, cargo_load_id, freight_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(demurrageRefundId, shipperId, cargoLoadId, freightCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO demurrage_refunds (id, demurrage_refund_id, shipper_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, demurrageRefundId, shipperId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE demurrage_refund_records SET status = 'refunded' WHERE id = ?
    `).run(demurrageRefundId);
  });
  tx();

  return { demurrageRefundId, refundId, shipperId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ShippingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ShippingError';
  }
}
