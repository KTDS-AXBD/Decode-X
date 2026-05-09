import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-HO (HO-001~HO-006): Hospitality 합성 도메인 — 20번째 도메인 (숙박 산업, 9번째 신규 산업)
//   - hospitality spec-container rules.md 기반 PoC source
//   - 합성 schema: bookings, rooms, overbooking_log
//   - 숙박 lifecycle 패턴 — 예약/취소환불/체크인/상태전환/하우스키핑/오버부킹
//   - withRuleId 재사용 20번째 도메인 (신규 detector 0개, 18 Sprint 연속 정점)
//   - HospitalityError code-in-message 패턴 (S275 표준)
//   - 9 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO)
// ---------------------------------------------------------------------------

export interface BookingRow {
  id: string;
  guest_id: string;
  room_id: string | null;
  check_in: string;
  check_out: string;
  requested_rooms: number;
  status: string;           // pending | confirmed | checked_in | checked_out | cancelled
  paid_amount: number;
  created_at: string;
}

export interface RoomRow {
  id: string;
  hotel_id: string;
  room_number: string;
  status: string;           // available | occupied | maintenance
  housekeeping_status: string; // clean | dirty
}

export interface OverbookingLogRow {
  id: string;
  booking_id: string;
  reason: string;
  compensated_at: string;
}

const MAX_ROOMS_PER_BOOKING = 10;
const CANCELLATION_WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------
// HO-001: 객실 예약 (requestedRooms ≤ availableRooms AND ≤ MAX_ROOMS_PER_BOOKING)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookRoom(
  db: Database.Database,
  guestId: string,
  checkIn: string,
  checkOut: string,
  requestedRooms: number,
  availableRooms: number,
): { bookingId: string; status: string } {
  if (requestedRooms <= 0) {
    throw new HospitalityError('E422-RM-MIN', `Requested rooms must be positive (${requestedRooms})`, 422);
  }
  if (requestedRooms > MAX_ROOMS_PER_BOOKING) {
    throw new HospitalityError('E422-RM-MAX', `Requested rooms exceed limit (${requestedRooms} > ${MAX_ROOMS_PER_BOOKING})`, 422);
  }
  if (requestedRooms > availableRooms) {
    throw new HospitalityError('E422-RM-AVAIL', `Insufficient available rooms (${requestedRooms} > ${availableRooms})`, 422);
  }

  const bookingId = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO bookings (id, guest_id, room_id, check_in, check_out, requested_rooms, status, paid_amount, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, 'pending', 0, ?)
  `).run(bookingId, guestId, checkIn, checkOut, requestedRooms, createdAt);

  return { bookingId, status: 'pending' };
}

// ---------------------------------------------------------------------------
// HO-002: 취소 환불 정책 (hoursUntilCheckIn > cancellationLimitHours)
// (ThresholdCheck detector — F445 Path B var-vs-var, cancellationLimitHours 'limit' keyword 매칭)
// ---------------------------------------------------------------------------
export function applyCancellationPolicy(
  db: Database.Database,
  bookingId: string,
  hoursUntilCheckIn: number,
): { bookingId: string; refundAmount: number; cancelled: boolean } {
  const booking = db
    .prepare('SELECT status, paid_amount FROM bookings WHERE id = ?')
    .get(bookingId) as { status: string; paid_amount: number } | undefined;

  if (!booking) {
    throw new HospitalityError('E404-BK', 'Booking not found', 404);
  }
  if (booking.status !== 'pending' && booking.status !== 'confirmed') {
    throw new HospitalityError('E409-BK', `Cannot cancel booking with status=${booking.status}`, 409);
  }

  const cancellationLimitHours = CANCELLATION_WINDOW_HOURS;
  // F445 Path B: var-vs-var, left=`cancellationLimitHours` (`limit` keyword 매칭)
  if (hoursUntilCheckIn <= cancellationLimitHours) {
    throw new HospitalityError('E422-CANCEL-EXP', `Cancellation window expired (${hoursUntilCheckIn}h ≤ ${cancellationLimitHours}h limit)`, 422);
  }

  const refundAmount = booking.paid_amount;
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(bookingId);

  return { bookingId, refundAmount, cancelled: true };
}

// ---------------------------------------------------------------------------
// HO-003: 체크인 atomic (bookings checked_in + rooms occupied)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCheckIn(
  db: Database.Database,
  bookingId: string,
  roomId: string,
): { bookingId: string; roomId: string; checkedInAt: string } {
  const booking = db
    .prepare('SELECT status FROM bookings WHERE id = ?')
    .get(bookingId) as { status: string } | undefined;

  if (!booking) throw new HospitalityError('E404-BK', 'Booking not found', 404);
  if (booking.status !== 'confirmed') {
    throw new HospitalityError('E409-BK', `Booking not in confirmed status (status=${booking.status})`, 409);
  }

  const room = db
    .prepare('SELECT status FROM rooms WHERE id = ?')
    .get(roomId) as { status: string } | undefined;

  if (!room) throw new HospitalityError('E404-BK', 'Room not found', 404);
  if (room.status !== 'available') {
    throw new HospitalityError('E409-RM', `Room not available (status=${room.status})`, 409);
  }

  const checkedInAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE bookings SET status = 'checked_in', room_id = ? WHERE id = ?`)
      .run(roomId, bookingId);
    db.prepare(`UPDATE rooms SET status = 'occupied' WHERE id = ?`)
      .run(roomId);
  });
  tx();

  return { bookingId, roomId, checkedInAt };
}

// ---------------------------------------------------------------------------
// HO-004: 예약 상태 전환 (pending → confirmed → checked_in → checked_out)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionBookingStatus(
  db: Database.Database,
  bookingId: string,
  newStatus: 'confirmed' | 'checked_in' | 'checked_out',
): { bookingId: string; previousStatus: string; newStatus: string } {
  const booking = db
    .prepare('SELECT status FROM bookings WHERE id = ?')
    .get(bookingId) as { status: string } | undefined;

  if (!booking) throw new HospitalityError('E404-BK', 'Booking not found', 404);

  const previousStatus = booking.status;
  const allowed =
    (previousStatus === 'pending' && newStatus === 'confirmed') ||
    (previousStatus === 'confirmed' && newStatus === 'checked_in') ||
    (previousStatus === 'checked_in' && newStatus === 'checked_out');

  if (!allowed) {
    throw new HospitalityError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  db.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).run(newStatus, bookingId);

  return { bookingId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// HO-005: 하우스키핑 일괄 완료 처리 (정기 batch)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC/ED/RE/LG-005 동일 형태 9번째)
// ---------------------------------------------------------------------------
export function markHousekeepingComplete(
  db: Database.Database,
): { markedCount: number; cleanedRoomIds: string[] } {
  const candidates = db
    .prepare(`SELECT id FROM rooms WHERE housekeeping_status = 'dirty'`)
    .all() as Array<{ id: string }>;

  const cleanedRoomIds: string[] = [];
  for (const room of candidates) {
    db.prepare(`UPDATE rooms SET housekeeping_status = 'clean' WHERE id = ?`)
      .run(room.id);
    cleanedRoomIds.push(room.id);
  }

  return { markedCount: cleanedRoomIds.length, cleanedRoomIds };
}

// ---------------------------------------------------------------------------
// HO-006: 오버부킹 보상 + 예약 취소 atomic
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function handleOverbookingCompensation(
  db: Database.Database,
  bookingId: string,
  reason: string,
): { logId: string; compensated: boolean; compensatedAt: string } {
  const booking = db
    .prepare('SELECT status FROM bookings WHERE id = ?')
    .get(bookingId) as { status: string } | undefined;

  if (!booking) throw new HospitalityError('E404-BK', 'Booking not found', 404);
  if (booking.status !== 'pending') {
    throw new HospitalityError('E409-OB', `Cannot compensate overbooking for status=${booking.status}`, 409);
  }

  const logId = randomUUID();
  const compensatedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO overbooking_log (id, booking_id, reason, compensated_at)
      VALUES (?, ?, ?, ?)
    `).run(logId, bookingId, reason, compensatedAt);
    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`)
      .run(bookingId);
  });
  tx();

  void reason;
  return { logId, compensated: true, compensatedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class HospitalityError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'HospitalityError';
  }
}
