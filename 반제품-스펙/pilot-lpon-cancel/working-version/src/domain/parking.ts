import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PK (PK-001~PK-006): Parking 합성 도메인 — 47번째 도메인 (주차 관리 산업, 36번째 신규 산업)
//   - parking spec-container rules.md 기반 PoC source
//   - 합성 schema: lots, monthly_passes, slot_reservations, parking_sessions,
//                  parking_payments, operator_billing_records, operator_payouts
//   - 주차 관리 lifecycle 패턴 — 슬롯정원/월회원한도/입차atomic/예약상태전환/무단출차배치/운영자정산atomic
//   - withRuleId 재사용 47번째 도메인 (신규 detector 0개, 48 Sprint 연속 정점 도전)
//   - ParkingError code-in-message 패턴 (S275 표준)
//   - 36 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK)
//   - 36번째 신규 산업 마일스톤 (parking 추가, RE+PR+PK 부동산 3-클러스터 형성)
// ---------------------------------------------------------------------------

export interface LotRow {
  id: string;
  name: string;
  total_slots: number;
  occupied_slots: number;
  status: string; // active | maintenance | closed
}

export interface MonthlyPassRow {
  id: string;
  member_id: string;
  lot_id: string;
  tier_code: string; // basic | standard | premium | corporate
  slot_limit: number;
  slot_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface SlotReservationRow {
  id: string;
  lot_id: string;
  pass_id: string;
  payment_id: string | null;
  vehicle_plate: string;
  status: string; // pending | confirmed | checked_in | completed | cancelled
  reserved_at: string;
}

export interface ParkingSessionRow {
  id: string;
  lot_id: string;
  reservation_id: string;
  vehicle_plate: string;
  status: string; // active | completed | unauthorized
  entered_at: string;
}

export interface OperatorBillingRecordRow {
  id: string;
  operator_id: string;
  parking_session_id: string;
  revenue: number;
  billing_rate: number;
  billing_amount: number;
  status: string; // pending | calculated | settled
}

const MAX_PARKING_SLOTS = 500; // PK-001: 주차장 슬롯 정원 한도 (대, 기본값)

// ---------------------------------------------------------------------------
// PK-001: 주차장 슬롯 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveParkingSlot(
  db: Database.Database,
  lotId: string,
  passId: string,
  vehiclePlate: string,
): { reservationId: string; lotId: string; passId: string; reservedAt: string } {
  const lot = db
    .prepare('SELECT occupied_slots, total_slots FROM lots WHERE id = ?')
    .get(lotId) as { occupied_slots: number; total_slots: number } | undefined;

  if (!lot) throw new ParkingError('E404-LOT', 'Parking lot not found', 404);

  const limit = lot.total_slots ?? MAX_PARKING_SLOTS;

  if (lot.occupied_slots >= limit) {
    throw new ParkingError(
      'E422-LOT-CAPACITY-EXCEEDED',
      `Parking lot is full (${lot.occupied_slots} >= ${limit})`,
      422,
    );
  }

  const reservationId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO slot_reservations (id, lot_id, pass_id, payment_id, vehicle_plate, status, reserved_at)
    VALUES (?, ?, ?, NULL, ?, 'pending', ?)
  `).run(reservationId, lotId, passId, vehiclePlate, reservedAt);

  db.prepare(`
    UPDATE lots SET occupied_slots = occupied_slots + 1 WHERE id = ?
  `).run(lotId);

  return { reservationId, lotId, passId, reservedAt };
}

// ---------------------------------------------------------------------------
// PK-002: 월회원 슬롯 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, slotLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyMonthlyPassLimit(
  db: Database.Database,
  memberId: string,
  passId: string,
): { memberId: string; passId: string; slotLimit: number; approved: boolean } {
  const pass = db
    .prepare('SELECT slot_used, slot_limit FROM monthly_passes WHERE id = ? AND member_id = ? LIMIT 1')
    .get(passId, memberId) as { slot_used: number; slot_limit: number } | undefined;

  if (!pass) throw new ParkingError('E404-PASS', 'Monthly pass not found', 404);

  // F445 Path B: var-vs-var, left=`slotLimit` (`limit` keyword 매칭)
  const slotLimit = pass.slot_limit;

  if (pass.slot_used >= slotLimit) {
    throw new ParkingError(
      'E422-PASS-LIMIT-EXCEEDED',
      `Monthly pass slot quota exhausted (${pass.slot_used} >= ${slotLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE monthly_passes SET slot_used = slot_used + 1 WHERE id = ?
  `).run(passId);

  return { memberId, passId, slotLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PK-003: 입차 atomic — parking_sessions + slot_reservations 상태전환 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmEntry(
  db: Database.Database,
  lotId: string,
  reservationId: string,
  vehiclePlate: string,
  amount: number,
): { sessionId: string; paymentId: string; reservationId: string; lotId: string; enteredAt: string } {
  const reservation = db
    .prepare("SELECT status FROM slot_reservations WHERE id = ? AND status = 'confirmed'")
    .get(reservationId) as { status: string } | undefined;

  if (!reservation) throw new ParkingError('E404-RESERVATION', 'Confirmed reservation not found', 404);

  const sessionId = randomUUID();
  const paymentId = randomUUID();
  const enteredAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO parking_sessions (id, lot_id, reservation_id, vehicle_plate, status, entered_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(sessionId, lotId, reservationId, vehiclePlate, enteredAt);

    db.prepare(`
      UPDATE slot_reservations SET status = 'checked_in', payment_id = ? WHERE id = ?
    `).run(paymentId, reservationId);

    db.prepare(`
      INSERT INTO parking_payments (id, session_id, reservation_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, reservationId, amount, enteredAt);
  });
  tx();

  return { sessionId, paymentId, reservationId, lotId, enteredAt };
}

// ---------------------------------------------------------------------------
// PK-004: 예약 상태 전환 (pending → confirmed → checked_in → completed → cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionReservationStatus(
  db: Database.Database,
  reservationId: string,
  newStatus: 'confirmed' | 'checked_in' | 'completed' | 'cancelled',
): { reservationId: string; previousStatus: string; newStatus: string } {
  const reservation = db
    .prepare('SELECT status FROM slot_reservations WHERE id = ?')
    .get(reservationId) as { status: string } | undefined;

  if (!reservation) throw new ParkingError('E404-RESERVATION', 'Reservation not found', 404);

  const previousStatus = reservation.status;
  const allowed =
    (reservation.status === 'pending' && newStatus === 'confirmed') ||
    (reservation.status === 'confirmed' && newStatus === 'checked_in') ||
    (reservation.status === 'checked_in' && newStatus === 'completed') ||
    (reservation.status === 'pending' && newStatus === 'cancelled') ||
    (reservation.status === 'confirmed' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ParkingError(
      'E409-RESERVATION',
      `Cannot transition reservation from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE slot_reservations SET status = ? WHERE id = ?`).run(newStatus, reservationId);

  return { reservationId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PK-005: 무단 출차 일괄 처리 (batch unauthorized marking)
// (StatusTransition detector — batch 패턴, BT-005/TM-005/VT-005/GY-005 36번째 재사용)
// ---------------------------------------------------------------------------
export function markUnauthorizedExitBatch(
  db: Database.Database,
  now: string,
): { unauthorizedCount: number; unauthorizedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM parking_sessions
      WHERE status = 'active'
        AND entered_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const unauthorizedIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE parking_sessions
      SET status = 'unauthorized'
      WHERE id = ?
    `).run(item.id);
    unauthorizedIds.push(item.id);
  }

  return { unauthorizedCount: unauthorizedIds.length, unauthorizedIds };
}

// ---------------------------------------------------------------------------
// PK-006: 운영자 정산 atomic — 매출 + 수수료 + 정산 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processOperatorBilling(
  db: Database.Database,
  operatorId: string,
  parkingSessionId: string,
  revenue: number,
  billingRate: number,
): { billingId: string; payoutId: string; operatorId: string; billingAmount: number; settledAt: string } {
  const session = db
    .prepare("SELECT status FROM parking_sessions WHERE id = ? AND status = 'completed'")
    .get(parkingSessionId) as { status: string } | undefined;

  if (!session) throw new ParkingError('E404-COMPLETED-PARKING-SESSION', 'Completed parking session not found', 404);

  const billingId = randomUUID();
  const payoutId = randomUUID();
  const billingAmount = Math.round(revenue * billingRate * 100) / 100;
  const settledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO operator_billing_records (id, operator_id, parking_session_id, revenue, billing_rate, billing_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(billingId, operatorId, parkingSessionId, revenue, billingRate, billingAmount);

    db.prepare(`
      INSERT INTO operator_payouts (id, billing_id, operator_id, amount, status, settled_at)
      VALUES (?, ?, ?, ?, 'settled', ?)
    `).run(payoutId, billingId, operatorId, billingAmount, settledAt);

    db.prepare(`
      UPDATE operator_billing_records SET status = 'settled' WHERE id = ?
    `).run(billingId);
  });
  tx();

  return { billingId, payoutId, operatorId, billingAmount, settledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ParkingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ParkingError';
  }
}
