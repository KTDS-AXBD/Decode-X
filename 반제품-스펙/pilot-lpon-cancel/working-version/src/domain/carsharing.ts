import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-CS (CS-001~CS-006): Car Sharing 합성 도메인 — 48번째 도메인 (카쉐어링 산업, 37번째 신규 산업)
//   - carsharing spec-container rules.md 기반 PoC source
//   - 합성 schema: vehicle_pool, vehicle_reservations, member_passes, rental_sessions,
//                  vehicles, rental_payments, overdue_records, operator_billing_records, operator_payouts
//   - 카쉐어링 lifecycle 패턴 — fleet정원/거리한도/픽업atomic/예약상태전환/연체배치/운영자정산atomic
//   - withRuleId 재사용 48번째 도메인 (신규 detector 0개, 49 Sprint 연속 정점 도전)
//   - CarSharingError code-in-message 패턴 (S275 표준)
//   - 37 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS)
//   - 37번째 신규 산업 마일스톤 (carsharing 추가, TR+AV+CS 운송 3-클러스터 형성)
// ---------------------------------------------------------------------------

export interface VehiclePoolRow {
  id: string;
  name: string;
  total_vehicles: number;
  active_vehicles: number;
  status: string; // active | maintenance | closed
}

export interface MemberPassRow {
  id: string;
  member_id: string;
  pool_id: string;
  tier_code: string; // basic | standard | premium | corporate
  distance_limit: number;
  distance_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface VehicleReservationRow {
  id: string;
  pool_id: string;
  pass_id: string;
  vehicle_id: string | null;
  payment_id: string | null;
  status: string; // pending | confirmed | picked_up | returned | cancelled
  reserved_at: string;
}

export interface RentalSessionRow {
  id: string;
  pool_id: string;
  reservation_id: string;
  vehicle_id: string;
  status: string; // active | returned | overdue
  picked_up_at: string;
}

export interface OperatorBillingRecordRow {
  id: string;
  operator_id: string;
  rental_session_id: string;
  revenue: number;
  billing_rate: number;
  billing_amount: number;
  status: string; // pending | calculated | settled
}

const MAX_FLEET_VEHICLES = 200; // CS-001: 카쉐어링 fleet 차량 정원 한도 (대, 기본값)

// ---------------------------------------------------------------------------
// CS-001: 카쉐어링 fleet 차량 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveSharingVehicle(
  db: Database.Database,
  poolId: string,
  passId: string,
): { reservationId: string; poolId: string; passId: string; reservedAt: string } {
  const pool = db
    .prepare('SELECT active_vehicles, total_vehicles FROM vehicle_pool WHERE id = ?')
    .get(poolId) as { active_vehicles: number; total_vehicles: number } | undefined;

  if (!pool) throw new CarSharingError('E404-POOL', 'Vehicle pool not found', 404);

  const limit = pool.total_vehicles ?? MAX_FLEET_VEHICLES;

  if (pool.active_vehicles >= limit) {
    throw new CarSharingError(
      'E422-FLEET-CAPACITY-EXCEEDED',
      `Fleet is at full capacity (${pool.active_vehicles} >= ${limit})`,
      422,
    );
  }

  const reservationId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO vehicle_reservations (id, pool_id, pass_id, vehicle_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, 'pending', ?)
  `).run(reservationId, poolId, passId, reservedAt);

  db.prepare(`
    UPDATE vehicle_pool SET active_vehicles = active_vehicles + 1 WHERE id = ?
  `).run(poolId);

  return { reservationId, poolId, passId, reservedAt };
}

// ---------------------------------------------------------------------------
// CS-002: 회원 거리 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, distanceLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyDistanceLimit(
  db: Database.Database,
  memberId: string,
  passId: string,
  distance: number,
): { memberId: string; passId: string; distanceLimit: number; approved: boolean } {
  const pass = db
    .prepare('SELECT distance_used, distance_limit FROM member_passes WHERE id = ? AND member_id = ? LIMIT 1')
    .get(passId, memberId) as { distance_used: number; distance_limit: number } | undefined;

  if (!pass) throw new CarSharingError('E404-PASS', 'Member pass not found', 404);

  // F445 Path B: var-vs-var, left=`distanceLimit` (`limit` keyword 매칭)
  const distanceLimit = pass.distance_limit;

  if (pass.distance_used + distance >= distanceLimit) {
    throw new CarSharingError(
      'E422-DISTANCE-LIMIT-EXCEEDED',
      `Distance quota exhausted (${pass.distance_used + distance} >= ${distanceLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE member_passes SET distance_used = distance_used + ? WHERE id = ?
  `).run(distance, passId);

  return { memberId, passId, distanceLimit, approved: true };
}

// ---------------------------------------------------------------------------
// CS-003: 차량 픽업 atomic — rental_sessions + vehicle_reservations 상태전환 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmPickup(
  db: Database.Database,
  poolId: string,
  reservationId: string,
  vehicleId: string,
  amount: number,
): { sessionId: string; paymentId: string; reservationId: string; poolId: string; pickedUpAt: string } {
  const reservation = db
    .prepare("SELECT status FROM vehicle_reservations WHERE id = ? AND status = 'confirmed'")
    .get(reservationId) as { status: string } | undefined;

  if (!reservation) throw new CarSharingError('E404-RESERVATION', 'Confirmed reservation not found', 404);

  const sessionId = randomUUID();
  const paymentId = randomUUID();
  const pickedUpAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO rental_sessions (id, pool_id, reservation_id, vehicle_id, status, picked_up_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(sessionId, poolId, reservationId, vehicleId, pickedUpAt);

    db.prepare(`
      UPDATE vehicle_reservations SET status = 'picked_up', vehicle_id = ?, payment_id = ? WHERE id = ?
    `).run(vehicleId, paymentId, reservationId);

    db.prepare(`
      INSERT INTO rental_payments (id, session_id, reservation_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, reservationId, amount, pickedUpAt);
  });
  tx();

  return { sessionId, paymentId, reservationId, poolId, pickedUpAt };
}

// ---------------------------------------------------------------------------
// CS-004: 예약 상태 전환 (pending → confirmed → picked_up → returned → cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionRentalStatus(
  db: Database.Database,
  reservationId: string,
  newStatus: 'confirmed' | 'picked_up' | 'returned' | 'cancelled',
): { reservationId: string; previousStatus: string; newStatus: string } {
  const reservation = db
    .prepare('SELECT status FROM vehicle_reservations WHERE id = ?')
    .get(reservationId) as { status: string } | undefined;

  if (!reservation) throw new CarSharingError('E404-RESERVATION', 'Reservation not found', 404);

  const previousStatus = reservation.status;
  const allowed =
    (reservation.status === 'pending' && newStatus === 'confirmed') ||
    (reservation.status === 'confirmed' && newStatus === 'picked_up') ||
    (reservation.status === 'picked_up' && newStatus === 'returned') ||
    (reservation.status === 'pending' && newStatus === 'cancelled') ||
    (reservation.status === 'confirmed' && newStatus === 'cancelled');

  if (!allowed) {
    throw new CarSharingError(
      'E409-RESERVATION',
      `Cannot transition reservation from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE vehicle_reservations SET status = ? WHERE id = ?`).run(newStatus, reservationId);

  return { reservationId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// CS-005: 연체 반납 일괄 처리 (batch overdue marking)
// (StatusTransition detector — batch 패턴, BT-005/TM-005/VT-005/GY-005/PK-005 37번째 재사용)
// ---------------------------------------------------------------------------
export function markOverdueReturnBatch(
  db: Database.Database,
  now: string,
): { overdueCount: number; overdueIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM rental_sessions
      WHERE status = 'active'
        AND picked_up_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const overdueIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE rental_sessions
      SET status = 'overdue'
      WHERE id = ?
    `).run(item.id);
    overdueIds.push(item.id);
  }

  return { overdueCount: overdueIds.length, overdueIds };
}

// ---------------------------------------------------------------------------
// CS-006: 운영자 정산 atomic — 매출 + 수수료 + 정산 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processOperatorBilling(
  db: Database.Database,
  operatorId: string,
  rentalSessionId: string,
  revenue: number,
  billingRate: number,
): { billingId: string; payoutId: string; operatorId: string; billingAmount: number; settledAt: string } {
  const session = db
    .prepare("SELECT status FROM rental_sessions WHERE id = ? AND status = 'returned'")
    .get(rentalSessionId) as { status: string } | undefined;

  if (!session) throw new CarSharingError('E404-RETURNED-RENTAL-SESSION', 'Returned rental session not found', 404);

  const billingId = randomUUID();
  const payoutId = randomUUID();
  const billingAmount = Math.round(revenue * billingRate * 100) / 100;
  const settledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO operator_billing_records (id, operator_id, rental_session_id, revenue, billing_rate, billing_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(billingId, operatorId, rentalSessionId, revenue, billingRate, billingAmount);

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
export class CarSharingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'CarSharingError';
  }
}
