import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-TS (TS-001~TS-006): Public Transport 합성 도메인 — 33번째 도메인 (대중교통 산업, 22번째 신규 산업)
//   - transit spec-container rules.md 기반 PoC source
//   - 합성 schema: routes, trips, fare_zones, transfers, season_passes, suspension_refunds
//   - 대중교통 lifecycle 패턴 — 정원한도/요금한도/환승atomic/트립상태전환/정기권배치/운행중단atomic
//   - withRuleId 재사용 33번째 도메인 (신규 detector 0개, 31 Sprint 연속 정점)
//   - TransitError code-in-message 패턴 (S275 표준)
//   - 22 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS)
// ---------------------------------------------------------------------------

export interface RouteRow {
  id: string;
  name: string;
  line_type: string;         // bus | subway | tram | ferry
  max_capacity: number;
  current_passengers: number;
  status: string;            // active | suspended | maintenance
}

export interface TripRow {
  id: string;
  route_id: string;
  passenger_id: string;
  origin_stop: string;
  dest_stop: string;
  fare_zone: string;
  status: string;            // boarded | in_transit | transferred | completed | cancelled
  boarded_at: string;
  in_transit_at: string | null;
  transferred_at: string | null;
  completed_at: string | null;
}

export interface FareZoneRow {
  id: string;
  zone_code: string;
  base_fare: number;
  max_fare: number;
}

export interface SeasonPassRow {
  id: string;
  passenger_id: string;
  zone_coverage: string;
  valid_from: string;
  valid_until: string;
  renewed: number;           // 0 | 1
  renewed_at: string | null;
}

export interface SuspensionRefundRow {
  id: string;
  route_id: string;
  passenger_id: string;
  refund_amount: number;
  compensation_amount: number;
  status: string;            // initiated | processed | rejected
  processed_at: string | null;
}

const MAX_ROUTE_CAPACITY = 1_200; // TS-001: 최대 노선 정원 한도 (1,200 승객)

// ---------------------------------------------------------------------------
// TS-001: 노선 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function checkRouteCapacity(
  db: Database.Database,
  routeId: string,
  passengerId: string,
  originStop: string,
  destStop: string,
  fareZone: string,
): { tripId: string; routeId: string; passengerId: string; boardedAt: string } {
  const route = db
    .prepare('SELECT id, status, max_capacity, current_passengers FROM routes WHERE id = ?')
    .get(routeId) as { id: string; status: string; max_capacity: number; current_passengers: number } | undefined;

  if (!route) throw new TransitError('E404-ROUTE', 'Route not found', 404);
  if (route.status !== 'active') {
    throw new TransitError(
      'E409-ROUTE',
      `Cannot board route with status=${route.status}`,
      409,
    );
  }

  const passengerCount = route.current_passengers + 1;
  if (passengerCount >= MAX_ROUTE_CAPACITY) {
    throw new TransitError(
      'E422-CAPACITY-LIMIT',
      `Route capacity exceeded maximum limit (${passengerCount} >= ${MAX_ROUTE_CAPACITY} passengers)`,
      422,
    );
  }

  const tripId = randomUUID();
  const boardedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO trips (id, route_id, passenger_id, origin_stop, dest_stop, fare_zone, status, boarded_at,
      in_transit_at, transferred_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'boarded', ?, NULL, NULL, NULL)
  `).run(tripId, routeId, passengerId, originStop, destStop, fareZone, boardedAt);

  db.prepare(`UPDATE routes SET current_passengers = ? WHERE id = ?`).run(passengerCount, routeId);

  return { tripId, routeId, passengerId, boardedAt };
}

// ---------------------------------------------------------------------------
// TS-002: 요금 구간 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, fareZoneLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function computeFare(
  db: Database.Database,
  tripId: string,
  zoneFare: number,
): { tripId: string; zoneFare: number; fareZoneLimit: number; approved: boolean } {
  const trip = db
    .prepare('SELECT id, fare_zone FROM trips WHERE id = ?')
    .get(tripId) as { id: string; fare_zone: string } | undefined;

  if (!trip) throw new TransitError('E404-TRIP', 'Trip not found', 404);

  // 요금 구간별 최대 단일 요금 한도 (KRW)
  const fareLimitByZone: Record<string, number> = {
    zone_1:  1_500,  // 1구간 (기본)
    zone_2:  1_800,  // 2구간
    zone_3:  2_100,  // 3구간
    zone_4:  2_500,  // 4구간 (광역)
  };

  // F445 Path B: var-vs-var, left=`fareZoneLimit` (`limit` keyword 매칭)
  const fareZoneLimit = fareLimitByZone[trip.fare_zone] ?? 2_500;

  if (zoneFare > fareZoneLimit) {
    throw new TransitError(
      'E422-FARE-EXCEEDED',
      `Zone fare exceeded limit (${zoneFare} > ${fareZoneLimit} KRW)`,
      422,
    );
  }

  db.prepare(`
    INSERT INTO fare_records (id, trip_id, zone_fare, fare_zone_limit, computed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), tripId, zoneFare, fareZoneLimit, new Date().toISOString());

  return { tripId, zoneFare, fareZoneLimit, approved: true };
}

// ---------------------------------------------------------------------------
// TS-003: 환승 처리 atomic — 환승 등록 + 잔액 차감 + 통합권 발급 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTransfer(
  db: Database.Database,
  tripId: string,
  passengerId: string,
  toRouteId: string,
  transferFare: number,
): { transferId: string; integratedPassId: string; tripId: string; newTripId: string; processedAt: string } {
  const trip = db
    .prepare('SELECT id, status, passenger_id FROM trips WHERE id = ?')
    .get(tripId) as { id: string; status: string; passenger_id: string } | undefined;

  if (!trip) throw new TransitError('E404-TRIP', 'Trip not found', 404);
  if (trip.passenger_id !== passengerId) {
    throw new TransitError('E403-TRIP', 'Passenger mismatch', 403);
  }
  if (trip.status !== 'in_transit') {
    throw new TransitError(
      'E409-TRIP',
      `Cannot transfer from trip with status=${trip.status}`,
      409,
    );
  }

  const transferId = randomUUID();
  const integratedPassId = randomUUID();
  const newTripId = randomUUID();
  const processedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO transfers (id, from_trip_id, to_route_id, passenger_id, transfer_fare, status, transferred_at)
      VALUES (?, ?, ?, ?, ?, 'completed', ?)
    `).run(transferId, tripId, toRouteId, passengerId, transferFare, processedAt);
    db.prepare(`
      INSERT INTO integrated_passes (id, transfer_id, passenger_id, issued_at, valid_minutes)
      VALUES (?, ?, ?, ?, 30)
    `).run(integratedPassId, transferId, passengerId, processedAt);
    db.prepare(`UPDATE trips SET status = 'transferred', transferred_at = ? WHERE id = ?`)
      .run(processedAt, tripId);
    db.prepare(`
      INSERT INTO trips (id, route_id, passenger_id, origin_stop, dest_stop, fare_zone, status, boarded_at,
        in_transit_at, transferred_at, completed_at)
      VALUES (?, ?, ?, 'transfer', 'dest', 'zone_1', 'boarded', ?, NULL, NULL, NULL)
    `).run(newTripId, toRouteId, passengerId, processedAt);
  });
  tx();

  return { transferId, integratedPassId, tripId, newTripId, processedAt };
}

// ---------------------------------------------------------------------------
// TS-004: 트립 상태 전환 (boarded → in_transit → transferred → completed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionTripStatus(
  db: Database.Database,
  tripId: string,
  newStatus: 'in_transit' | 'transferred' | 'completed',
): { tripId: string; previousStatus: string; newStatus: string } {
  const trip = db
    .prepare('SELECT status FROM trips WHERE id = ?')
    .get(tripId) as { status: string } | undefined;

  if (!trip) throw new TransitError('E404-TRIP', 'Trip not found', 404);

  const previousStatus = trip.status;
  const allowed =
    (previousStatus === 'boarded' && newStatus === 'in_transit') ||
    (previousStatus === 'in_transit' && newStatus === 'transferred') ||
    (previousStatus === 'in_transit' && newStatus === 'completed') ||
    (previousStatus === 'transferred' && newStatus === 'completed');

  if (!allowed) {
    throw new TransitError(
      'E409-TRIP',
      `Cannot transition trip from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE trips SET status = ? WHERE id = ?`).run(newStatus, tripId);

  if (newStatus === 'in_transit') {
    db.prepare(`UPDATE trips SET in_transit_at = ? WHERE id = ?`).run(now, tripId);
  } else if (newStatus === 'transferred') {
    db.prepare(`UPDATE trips SET transferred_at = ? WHERE id = ?`).run(now, tripId);
  } else if (newStatus === 'completed') {
    db.prepare(`UPDATE trips SET completed_at = ? WHERE id = ?`).run(now, tripId);
  }

  return { tripId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// TS-005: 정기권 일괄 갱신 (batch season pass renewal)
// (StatusTransition detector — batch 패턴, CC-005 batch 22번째 재사용)
// ---------------------------------------------------------------------------
export function markSeasonPassRenewal(
  db: Database.Database,
  expiryBefore: string,
): { renewedCount: number; renewedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM season_passes
      WHERE valid_until <= ?
        AND renewed = 0
        AND status = 'active'
    `)
    .all(expiryBefore) as Array<{ id: string }>;

  const renewedIds: string[] = [];

  for (const pass of candidates) {
    db.prepare(`
      UPDATE season_passes
      SET renewed = 1, renewed_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), pass.id);
    renewedIds.push(pass.id);
  }

  return { renewedCount: renewedIds.length, renewedIds };
}

// ---------------------------------------------------------------------------
// TS-006: 운행 중단 환불 atomic — 중단 등록 + 환불 + 보상 처리 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSuspensionRefund(
  db: Database.Database,
  routeId: string,
  passengerId: string,
  refundAmount: number,
  compensationAmount: number,
  suspensionReason: string,
): { suspensionId: string; refundRecordId: string; routeId: string; passengerId: string; totalAmount: number; processedAt: string } {
  const route = db
    .prepare('SELECT id, status FROM routes WHERE id = ?')
    .get(routeId) as { id: string; status: string } | undefined;

  if (!route) throw new TransitError('E404-ROUTE', 'Route not found', 404);
  if (route.status !== 'suspended') {
    throw new TransitError(
      'E409-ROUTE',
      `Cannot process suspension refund for route with status=${route.status}`,
      409,
    );
  }

  const suspensionId = randomUUID();
  const refundRecordId = randomUUID();
  const processedAt = new Date().toISOString();
  const totalAmount = refundAmount + compensationAmount;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO suspension_refunds (id, route_id, passenger_id, refund_amount, compensation_amount, status, processed_at, suspension_reason)
      VALUES (?, ?, ?, ?, ?, 'processed', ?, ?)
    `).run(suspensionId, routeId, passengerId, refundAmount, compensationAmount, processedAt, suspensionReason);
    db.prepare(`
      INSERT INTO refund_records (id, suspension_id, passenger_id, total_amount, processed_at, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(refundRecordId, suspensionId, passengerId, totalAmount, processedAt, 'Suspension refund + compensation processed');
    db.prepare(`UPDATE routes SET suspension_refund_issued = 1 WHERE id = ?`).run(routeId);
  });
  tx();

  return { suspensionId, refundRecordId, routeId, passengerId, totalAmount, processedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class TransitError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'TransitError';
  }
}
