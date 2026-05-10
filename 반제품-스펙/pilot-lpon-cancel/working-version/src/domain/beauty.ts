import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-BT (BT-001~BT-006): Beauty Salon 합성 도메인 — 43번째 도메인 (미용실 산업, 32번째 신규 산업)
//   - beauty spec-container rules.md 기반 PoC source
//   - 합성 schema: beauty_seats, seat_bookings, loyalty_memberships,
//                  appointments, stylists, appointment_payments,
//                  inventory_items, commission_records, settlements
//   - 미용실 lifecycle 패턴 — 좌석정원/로열티한도/예약atomic/상태전환/재고배치/수수료atomic
//   - withRuleId 재사용 43번째 도메인 (신규 detector 0개, 41 Sprint 연속 정점)
//   - BeautyError code-in-message 패턴 (S275 표준)
//   - 32 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT)
//   - 32번째 신규 산업 마일스톤 (beauty 추가, WL+SP+FT+BT 서비스 4-클러스터 완성)
// ---------------------------------------------------------------------------

export interface BeautySeatRow {
  id: string;
  salon_id: string;
  seat_name: string;
  capacity: number;
  booked_count: number;
  status: string;   // available | reserved | in_use | maintenance
}

export interface SeatBookingRow {
  id: string;
  customer_id: string;
  seat_id: string;
  status: string;       // booked | confirmed | in_service | completed | cancelled
  booked_at: string;
}

export interface LoyaltyMembershipRow {
  id: string;
  customer_id: string;
  tier_code: string;        // bronze | silver | gold | platinum
  loyalty_tier_limit: number;
  loyalty_usage: number;
  valid_until: string;
}

export interface AppointmentRow {
  id: string;
  customer_id: string;
  stylist_id: string;
  service_type: string;
  payment_id: string | null;
  status: string;           // booked | confirmed | in_service | completed | reviewed
  booked_at: string;
}

export interface InventoryItemRow {
  id: string;
  item_name: string;
  item_type: string;
  quantity: number;
  status: string;   // sufficient | low | depleted | restocked
}

export interface CommissionRecordRow {
  id: string;
  stylist_id: string;
  appointment_id: string;
  revenue: number;
  commission_rate: number;
  commission_amount: number;
  status: string;   // pending | calculated | settled
}

const MAX_SEAT_CAPACITY = 20; // BT-001: 좌석 정원 한도 (인원, 기본값)

// ---------------------------------------------------------------------------
// BT-001: 좌석 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookSeat(
  db: Database.Database,
  seatId: string,
  customerId: string,
): { bookingId: string; seatId: string; customerId: string; bookedAt: string } {
  const seat = db
    .prepare('SELECT booked_count, capacity FROM beauty_seats WHERE id = ?')
    .get(seatId) as { booked_count: number; capacity: number } | undefined;

  if (!seat) throw new BeautyError('E404-SEAT', 'Beauty seat not found', 404);

  const limit = seat.capacity ?? MAX_SEAT_CAPACITY;

  if (seat.booked_count >= limit) {
    throw new BeautyError(
      'E422-SEAT-CAPACITY-EXCEEDED',
      `Seat is fully booked (${seat.booked_count} >= ${limit})`,
      422,
    );
  }

  const bookingId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO seat_bookings (id, customer_id, seat_id, status, booked_at)
    VALUES (?, ?, ?, 'booked', ?)
  `).run(bookingId, customerId, seatId, bookedAt);

  db.prepare(`
    UPDATE beauty_seats SET booked_count = booked_count + 1 WHERE id = ?
  `).run(seatId);

  return { bookingId, seatId, customerId, bookedAt };
}

// ---------------------------------------------------------------------------
// BT-002: 로열티 멤버십 할인 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, loyaltyTierLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyLoyaltyDiscount(
  db: Database.Database,
  customerId: string,
  membershipId: string,
): { customerId: string; membershipId: string; loyaltyTierLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT loyalty_usage, loyalty_tier_limit FROM loyalty_memberships WHERE id = ? AND customer_id = ? LIMIT 1')
    .get(membershipId, customerId) as { loyalty_usage: number; loyalty_tier_limit: number } | undefined;

  if (!membership) throw new BeautyError('E404-MEMBERSHIP', 'Loyalty membership not found', 404);

  // F445 Path B: var-vs-var, left=`loyaltyTierLimit` (`limit` keyword 매칭)
  const loyaltyTierLimit = membership.loyalty_tier_limit;

  if (membership.loyalty_usage >= loyaltyTierLimit) {
    throw new BeautyError(
      'E422-LOYALTY-TIER-LIMIT-EXCEEDED',
      `Loyalty discount limit exhausted (${membership.loyalty_usage} >= ${loyaltyTierLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE loyalty_memberships SET loyalty_usage = loyalty_usage + 1 WHERE id = ?
  `).run(membershipId);

  return { customerId, membershipId, loyaltyTierLimit, approved: true };
}

// ---------------------------------------------------------------------------
// BT-003: 미용실 예약 atomic — 예약 + 스타일리스트 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmAppointment(
  db: Database.Database,
  customerId: string,
  stylistId: string,
  serviceType: string,
  amount: number,
): { appointmentId: string; paymentId: string; stylistId: string; customerId: string; bookedAt: string } {
  const stylist = db
    .prepare("SELECT status FROM stylists WHERE id = ? AND status = 'available'")
    .get(stylistId) as { status: string } | undefined;

  if (!stylist) throw new BeautyError('E404-STYLIST', 'Stylist not available', 404);

  const appointmentId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO appointments (id, customer_id, stylist_id, service_type, payment_id, status, booked_at)
      VALUES (?, ?, ?, ?, ?, 'booked', ?)
    `).run(appointmentId, customerId, stylistId, serviceType, paymentId, bookedAt);

    db.prepare(`
      UPDATE stylists SET status = 'booked', booked_customer_id = ? WHERE id = ?
    `).run(customerId, stylistId);

    db.prepare(`
      INSERT INTO appointment_payments (id, appointment_id, customer_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, appointmentId, customerId, amount, bookedAt);
  });
  tx();

  return { appointmentId, paymentId, stylistId, customerId, bookedAt };
}

// ---------------------------------------------------------------------------
// BT-004: 예약 상태 전환 (booked → confirmed → in_service → completed → reviewed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionAppointmentStatus(
  db: Database.Database,
  appointmentId: string,
  newStatus: 'confirmed' | 'in_service' | 'completed' | 'reviewed',
): { appointmentId: string; previousStatus: string; newStatus: string } {
  const appointment = db
    .prepare('SELECT status FROM appointments WHERE id = ?')
    .get(appointmentId) as { status: string } | undefined;

  if (!appointment) throw new BeautyError('E404-APPOINTMENT', 'Appointment record not found', 404);

  const previousStatus = appointment.status;
  const allowed =
    (appointment.status === 'booked' && newStatus === 'confirmed') ||
    (appointment.status === 'confirmed' && newStatus === 'in_service') ||
    (appointment.status === 'in_service' && newStatus === 'completed') ||
    (appointment.status === 'completed' && newStatus === 'reviewed');

  if (!allowed) {
    throw new BeautyError(
      'E409-APPOINTMENT',
      `Cannot transition appointment from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE appointments SET status = ? WHERE id = ?`).run(newStatus, appointmentId);

  return { appointmentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// BT-005: 재고 재입고 일괄 처리 (batch inventory restock marking)
// (StatusTransition detector — batch 패턴, CC-005 32번째 재사용)
// ---------------------------------------------------------------------------
export function markInventoryRestockBatch(
  db: Database.Database,
  restockedBefore: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM inventory_items
      WHERE status = 'depleted'
        AND restocked_at <= ?
    `)
    .all(restockedBefore) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE inventory_items
      SET status = 'restocked'
      WHERE id = ?
    `).run(item.id);
    markedIds.push(item.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// BT-006: 수수료 정산 atomic — 매출 + 수수료 분배 + 정산 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCommission(
  db: Database.Database,
  stylistId: string,
  appointmentId: string,
  revenue: number,
  commissionRate: number,
): { commissionId: string; settlementId: string; stylistId: string; commissionAmount: number; settledAt: string } {
  const appointment = db
    .prepare("SELECT status FROM appointments WHERE id = ? AND status = 'completed'")
    .get(appointmentId) as { status: string } | undefined;

  if (!appointment) throw new BeautyError('E404-COMPLETED-APPOINTMENT', 'Completed appointment not found', 404);

  const commissionId = randomUUID();
  const settlementId = randomUUID();
  const commissionAmount = Math.round(revenue * commissionRate * 100) / 100;
  const settledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO commission_records (id, stylist_id, appointment_id, revenue, commission_rate, commission_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(commissionId, stylistId, appointmentId, revenue, commissionRate, commissionAmount);

    db.prepare(`
      INSERT INTO settlements (id, commission_id, stylist_id, amount, status, settled_at)
      VALUES (?, ?, ?, ?, 'settled', ?)
    `).run(settlementId, commissionId, stylistId, commissionAmount, settledAt);

    db.prepare(`
      UPDATE commission_records SET status = 'settled' WHERE id = ?
    `).run(commissionId);
  });
  tx();

  return { commissionId, settlementId, stylistId, commissionAmount, settledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class BeautyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BeautyError';
  }
}
