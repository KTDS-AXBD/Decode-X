import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-TR (TR-001~TR-006): Travel 합성 도메인 — 21번째 도메인 (여행 산업, 10번째 신규 산업)
//   - travel spec-container rules.md 기반 PoC source
//   - 합성 schema: flights, itineraries, trips, disruption_log, refund_log
//   - 여행 lifecycle 패턴 — 항공예약/운임업그레이드/여정확정/상태전환/결항배치/취소환불
//   - withRuleId 재사용 21번째 도메인 (신규 detector 0개, 19 Sprint 연속 정점)
//   - TravelError code-in-message 패턴 (S275 표준)
//   - 10 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR)
// ---------------------------------------------------------------------------

export interface FlightRow {
  id: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_at: string;
  available_seats: number;
  status: string;           // scheduled | departed | cancelled | delayed
}

export interface ItineraryRow {
  id: string;
  passenger_id: string;
  flight_id: string;
  fare_class: string;       // economy | business | first
  seat_count: number;
  miles_used: number;
  pnr: string | null;
  status: string;           // pending | confirmed | cancelled
  paid_amount: number;
  created_at: string;
}

export interface TripRow {
  id: string;
  itinerary_id: string;
  passenger_id: string;
  status: string;           // pending | confirmed | checked_in | completed | cancelled
}

export interface DisruptionLogRow {
  id: string;
  trip_id: string;
  reason: string;
  disrupted_at: string;
}

export interface RefundLogRow {
  id: string;
  itinerary_id: string;
  refund_amount: number;
  miles_restored: number;
  refunded_at: string;
}

const MAX_SEATS_PER_BOOKING = 9;
const FARE_UPGRADE_MILES_LIMIT = 100000;

// ---------------------------------------------------------------------------
// TR-001: 항공 예약 좌석 가용성 + 운임 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookFlight(
  db: Database.Database,
  passengerId: string,
  flightId: string,
  fareClass: string,
  seatsRequested: number,
  availableSeats: number,
): { itineraryId: string; status: string } {
  if (seatsRequested <= 0) {
    throw new TravelError('E422-ST-MIN', `Seats requested must be positive (${seatsRequested})`, 422);
  }
  if (seatsRequested > MAX_SEATS_PER_BOOKING) {
    throw new TravelError('E422-ST-MAX', `Seats requested exceed limit (${seatsRequested} > ${MAX_SEATS_PER_BOOKING})`, 422);
  }
  if (seatsRequested > availableSeats) {
    throw new TravelError('E422-ST-AVAIL', `Insufficient available seats (${seatsRequested} > ${availableSeats})`, 422);
  }

  const itineraryId = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO itineraries (id, passenger_id, flight_id, fare_class, seat_count, miles_used, pnr, status, paid_amount, created_at)
    VALUES (?, ?, ?, ?, ?, 0, NULL, 'pending', 0, ?)
  `).run(itineraryId, passengerId, flightId, fareClass, seatsRequested, createdAt);

  return { itineraryId, status: 'pending' };
}

// ---------------------------------------------------------------------------
// TR-002: 운임 등급 업그레이드 — 마일리지 차감 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, requiredMilesLimit 'limit' keyword 매칭)
// ---------------------------------------------------------------------------
export function upgradeFareClass(
  db: Database.Database,
  itineraryId: string,
  targetFare: 'business' | 'first',
  availableMiles: number,
): { itineraryId: string; previousFare: string; newFare: string; milesDeducted: number } {
  const itinerary = db
    .prepare('SELECT fare_class, status, miles_used FROM itineraries WHERE id = ?')
    .get(itineraryId) as { fare_class: string; status: string; miles_used: number } | undefined;

  if (!itinerary) {
    throw new TravelError('E404-IT', 'Itinerary not found', 404);
  }
  if (itinerary.status !== 'pending' && itinerary.status !== 'confirmed') {
    throw new TravelError('E409-IT', `Cannot upgrade itinerary with status=${itinerary.status}`, 409);
  }

  const upgradeTable: Record<string, number> = {
    'economy-to-business': 30000,
    'economy-to-first': 60000,
    'business-to-first': 35000,
  };
  const upgradeKey = `${itinerary.fare_class}-to-${targetFare}`;
  const requiredMiles = upgradeTable[upgradeKey] ?? FARE_UPGRADE_MILES_LIMIT;

  // F445 Path B: var-vs-var, left=`requiredMilesLimit` (`limit` keyword 매칭)
  const requiredMilesLimit = requiredMiles;
  if (availableMiles < requiredMilesLimit) {
    throw new TravelError('E422-MILES', `Insufficient miles for upgrade (${availableMiles} < ${requiredMilesLimit} limit)`, 422);
  }

  const previousFare = itinerary.fare_class;
  db.prepare(`UPDATE itineraries SET fare_class = ?, miles_used = miles_used + ? WHERE id = ?`)
    .run(targetFare, requiredMilesLimit, itineraryId);

  return { itineraryId, previousFare, newFare: targetFare, milesDeducted: requiredMilesLimit };
}

// ---------------------------------------------------------------------------
// TR-003: 여정 확정 atomic (예약 + 결제 + PNR 발급)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmItinerary(
  db: Database.Database,
  itineraryId: string,
  paymentAmount: number,
): { itineraryId: string; pnr: string; confirmedAt: string } {
  const itinerary = db
    .prepare('SELECT status, passenger_id, flight_id FROM itineraries WHERE id = ?')
    .get(itineraryId) as { status: string; passenger_id: string; flight_id: string } | undefined;

  if (!itinerary) throw new TravelError('E404-IT', 'Itinerary not found', 404);
  if (itinerary.status !== 'pending') {
    throw new TravelError('E409-IT', `Itinerary not in pending status (status=${itinerary.status})`, 409);
  }

  const pnr = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  const confirmedAt = new Date().toISOString();
  const tripId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE itineraries SET status = 'confirmed', pnr = ?, paid_amount = ? WHERE id = ?`)
      .run(pnr, paymentAmount, itineraryId);
    db.prepare(`
      INSERT INTO trips (id, itinerary_id, passenger_id, status)
      VALUES (?, ?, ?, 'pending')
    `).run(tripId, itineraryId, itinerary.passenger_id);
  });
  tx();

  return { itineraryId, pnr, confirmedAt };
}

// ---------------------------------------------------------------------------
// TR-004: 여행 상태 전환 (pending → confirmed → checked_in → completed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionTripStatus(
  db: Database.Database,
  tripId: string,
  newStatus: 'confirmed' | 'checked_in' | 'completed',
): { tripId: string; previousStatus: string; newStatus: string } {
  const trip = db
    .prepare('SELECT status FROM trips WHERE id = ?')
    .get(tripId) as { status: string } | undefined;

  if (!trip) throw new TravelError('E404-TR', 'Trip not found', 404);

  const previousStatus = trip.status;
  const allowed =
    (previousStatus === 'pending' && newStatus === 'confirmed') ||
    (previousStatus === 'confirmed' && newStatus === 'checked_in') ||
    (previousStatus === 'checked_in' && newStatus === 'completed');

  if (!allowed) {
    throw new TravelError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  db.prepare(`UPDATE trips SET status = ? WHERE id = ?`).run(newStatus, tripId);

  return { tripId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// TR-005: 결항 여행 일괄 처리 (대량 재예약 batch)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC/ED/RE/LG/HO-005 동일 형태 10번째)
// ---------------------------------------------------------------------------
export function markDisruptedTrips(
  db: Database.Database,
  flightId: string,
  reason: string,
): { markedCount: number; disruptedTripIds: string[] } {
  const candidates = db
    .prepare(`SELECT id FROM trips WHERE status IN ('pending', 'confirmed') AND itinerary_id IN (SELECT id FROM itineraries WHERE flight_id = ?)`)
    .all(flightId) as Array<{ id: string }>;

  const disruptedTripIds: string[] = [];
  const disruptedAt = new Date().toISOString();

  for (const trip of candidates) {
    db.prepare(`UPDATE trips SET status = 'cancelled' WHERE id = ?`)
      .run(trip.id);
    db.prepare(`
      INSERT INTO disruption_log (id, trip_id, reason, disrupted_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), trip.id, reason, disruptedAt);
    disruptedTripIds.push(trip.id);
  }

  return { markedCount: disruptedTripIds.length, disruptedTripIds };
}

// ---------------------------------------------------------------------------
// TR-006: 취소 환불 + 마일리지 복구 atomic
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCancellationRefund(
  db: Database.Database,
  itineraryId: string,
): { refundLogId: string; refundAmount: number; milesRestored: number; cancelledAt: string } {
  const itinerary = db
    .prepare('SELECT status, paid_amount, miles_used FROM itineraries WHERE id = ?')
    .get(itineraryId) as { status: string; paid_amount: number; miles_used: number } | undefined;

  if (!itinerary) throw new TravelError('E404-IT', 'Itinerary not found', 404);
  if (itinerary.status !== 'confirmed' && itinerary.status !== 'pending') {
    throw new TravelError('E409-IT', `Cannot cancel itinerary with status=${itinerary.status}`, 409);
  }

  const refundLogId = randomUUID();
  const cancelledAt = new Date().toISOString();
  const refundAmount = itinerary.paid_amount;
  const milesRestored = itinerary.miles_used;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE itineraries SET status = 'cancelled' WHERE id = ?`)
      .run(itineraryId);
    db.prepare(`
      INSERT INTO refund_log (id, itinerary_id, refund_amount, miles_restored, refunded_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(refundLogId, itineraryId, refundAmount, milesRestored, cancelledAt);
  });
  tx();

  return { refundLogId, refundAmount, milesRestored, cancelledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class TravelError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'TravelError';
  }
}
