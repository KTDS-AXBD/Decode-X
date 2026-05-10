import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AV (AV-001~AV-006): Aviation 합성 도메인 — 34번째 도메인 (항공 산업, 23번째 신규 산업)
//   - aviation spec-container rules.md 기반 PoC source
//   - 합성 schema: flights, passengers, crew_schedules, fuel_allocations, flight_clearances, baggage_claims
//   - 항공 운용 lifecycle 패턴 — 탑승한도/연료한도/운항atomic/비행상태전환/승무원배치/수하물atomic
//   - withRuleId 재사용 34번째 도메인 (신규 detector 0개, 32 Sprint 연속 정점)
//   - AviationError code-in-message 패턴 (S275 표준)
//   - 23 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV)
// ---------------------------------------------------------------------------

export interface FlightRow {
  id: string;
  flight_number: string;
  origin: string;
  destination: string;
  aircraft_type: string;
  max_capacity: number;
  current_passengers: number;
  status: string;            // scheduled | boarding | departed | in_flight | landed | completed | cancelled
  scheduled_at: string;
  boarded_at: string | null;
  departed_at: string | null;
  in_flight_at: string | null;
  landed_at: string | null;
  completed_at: string | null;
}

export interface PassengerRow {
  id: string;
  flight_id: string;
  name: string;
  seat_number: string;
  baggage_weight: number;
  status: string;            // checked_in | boarded | deplaned
}

export interface CrewScheduleRow {
  id: string;
  flight_id: string;
  crew_member_id: string;
  role: string;              // captain | first_officer | flight_attendant
  status: string;            // assigned | on_duty | rotated | off_duty
  assigned_at: string;
  rotated_at: string | null;
}

export interface FuelAllocationRow {
  id: string;
  flight_id: string;
  required_fuel: number;     // kg
  fuel_quota_limit: number;  // kg (항공기 종류별 최대 연료 할당)
  allocated_fuel: number;
  allocated_at: string | null;
}

export interface BaggageClaimRow {
  id: string;
  passenger_id: string;
  flight_id: string;
  baggage_tag: string;
  damage_status: string;     // intact | damaged | lost
  claim_amount: number;
  status: string;            // initiated | assessed | compensated | rejected
  processed_at: string | null;
}

const MAX_PASSENGER_CAPACITY = 400; // AV-001: 최대 항공기 탑승 한도 (400 승객)

// ---------------------------------------------------------------------------
// AV-001: 승객 탑승 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function boardPassenger(
  db: Database.Database,
  flightId: string,
  passengerId: string,
  seatNumber: string,
  baggageWeight: number,
): { boardingId: string; flightId: string; passengerId: string; boardedAt: string } {
  const flight = db
    .prepare('SELECT id, status, max_capacity, current_passengers FROM flights WHERE id = ?')
    .get(flightId) as { id: string; status: string; max_capacity: number; current_passengers: number } | undefined;

  if (!flight) throw new AviationError('E404-FLIGHT', 'Flight not found', 404);
  if (flight.status !== 'boarding') {
    throw new AviationError(
      'E409-FLIGHT',
      `Cannot board flight with status=${flight.status}`,
      409,
    );
  }

  const passengerCount = flight.current_passengers + 1;
  if (passengerCount >= MAX_PASSENGER_CAPACITY) {
    throw new AviationError(
      'E422-CAPACITY-LIMIT',
      `Passenger capacity exceeded maximum limit (${passengerCount} >= ${MAX_PASSENGER_CAPACITY} passengers)`,
      422,
    );
  }

  const boardingId = randomUUID();
  const boardedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO passengers (id, flight_id, name, seat_number, baggage_weight, status)
    VALUES (?, ?, ?, ?, ?, 'boarded')
  `).run(boardingId, flightId, passengerId, seatNumber, baggageWeight);

  db.prepare(`UPDATE flights SET current_passengers = ? WHERE id = ?`).run(passengerCount, flightId);

  return { boardingId, flightId, passengerId, boardedAt };
}

// ---------------------------------------------------------------------------
// AV-002: 연료 할당 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, fuelQuotaLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function allocateFuel(
  db: Database.Database,
  flightId: string,
  requiredFuel: number,
): { flightId: string; requiredFuel: number; fuelQuotaLimit: number; approved: boolean } {
  const flight = db
    .prepare('SELECT id, aircraft_type FROM flights WHERE id = ?')
    .get(flightId) as { id: string; aircraft_type: string } | undefined;

  if (!flight) throw new AviationError('E404-FLIGHT', 'Flight not found', 404);

  // 항공기 종류별 최대 연료 할당 (kg)
  const fuelLimitByAircraft: Record<string, number> = {
    narrow_body:  25_000,  // 협동체 (B737/A320급)
    wide_body:    80_000,  // 광동체 (B777/A350급)
    regional:      8_000,  // 지역 항공기
    turboprop:     2_500,  // 터보프롭
  };

  // F445 Path B: var-vs-var, left=`fuelQuotaLimit` (`limit` keyword 매칭)
  const fuelQuotaLimit = fuelLimitByAircraft[flight.aircraft_type] ?? 80_000;

  if (requiredFuel > fuelQuotaLimit) {
    throw new AviationError(
      'E422-FUEL-EXCEEDED',
      `Required fuel exceeded quota limit (${requiredFuel} > ${fuelQuotaLimit} kg)`,
      422,
    );
  }

  db.prepare(`
    INSERT INTO fuel_allocations (id, flight_id, required_fuel, fuel_quota_limit, allocated_fuel, allocated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), flightId, requiredFuel, fuelQuotaLimit, requiredFuel, new Date().toISOString());

  return { flightId, requiredFuel, fuelQuotaLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AV-003: 비행 운항 dispatch atomic — 스케줄+승무원+연료+이륙 허가 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function dispatchFlight(
  db: Database.Database,
  flightId: string,
  captainId: string,
  fuelLoaded: number,
  clearanceCode: string,
): { dispatchId: string; clearanceId: string; flightId: string; departedAt: string } {
  const flight = db
    .prepare('SELECT id, status FROM flights WHERE id = ?')
    .get(flightId) as { id: string; status: string } | undefined;

  if (!flight) throw new AviationError('E404-FLIGHT', 'Flight not found', 404);
  if (flight.status !== 'boarding') {
    throw new AviationError(
      'E409-FLIGHT',
      `Cannot dispatch flight with status=${flight.status}`,
      409,
    );
  }

  const dispatchId = randomUUID();
  const clearanceId = randomUUID();
  const departedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO dispatch_records (id, flight_id, captain_id, fuel_loaded, dispatched_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(dispatchId, flightId, captainId, fuelLoaded, departedAt);
    db.prepare(`
      INSERT INTO flight_clearances (id, flight_id, clearance_code, issued_at, status)
      VALUES (?, ?, ?, ?, 'approved')
    `).run(clearanceId, flightId, clearanceCode, departedAt);
    db.prepare(`UPDATE flights SET status = 'departed', departed_at = ? WHERE id = ?`)
      .run(departedAt, flightId);
    db.prepare(`UPDATE crew_schedules SET status = 'on_duty' WHERE flight_id = ?`)
      .run(flightId);
  });
  tx();

  return { dispatchId, clearanceId, flightId, departedAt };
}

// ---------------------------------------------------------------------------
// AV-004: 비행 상태 전환 (scheduled → boarding → departed → in_flight → landed → completed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionFlightStatus(
  db: Database.Database,
  flightId: string,
  newStatus: 'boarding' | 'departed' | 'in_flight' | 'landed' | 'completed',
): { flightId: string; previousStatus: string; newStatus: string } {
  const flight = db
    .prepare('SELECT status FROM flights WHERE id = ?')
    .get(flightId) as { status: string } | undefined;

  if (!flight) throw new AviationError('E404-FLIGHT', 'Flight not found', 404);

  const previousStatus = flight.status;
  const allowed =
    (previousStatus === 'scheduled' && newStatus === 'boarding') ||
    (previousStatus === 'boarding' && newStatus === 'departed') ||
    (previousStatus === 'departed' && newStatus === 'in_flight') ||
    (previousStatus === 'in_flight' && newStatus === 'landed') ||
    (previousStatus === 'landed' && newStatus === 'completed');

  if (!allowed) {
    throw new AviationError(
      'E409-FLIGHT',
      `Cannot transition flight from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE flights SET status = ? WHERE id = ?`).run(newStatus, flightId);

  if (newStatus === 'boarding') {
    db.prepare(`UPDATE flights SET boarded_at = ? WHERE id = ?`).run(now, flightId);
  } else if (newStatus === 'departed') {
    db.prepare(`UPDATE flights SET departed_at = ? WHERE id = ?`).run(now, flightId);
  } else if (newStatus === 'in_flight') {
    db.prepare(`UPDATE flights SET in_flight_at = ? WHERE id = ?`).run(now, flightId);
  } else if (newStatus === 'landed') {
    db.prepare(`UPDATE flights SET landed_at = ? WHERE id = ?`).run(now, flightId);
  } else if (newStatus === 'completed') {
    db.prepare(`UPDATE flights SET completed_at = ? WHERE id = ?`).run(now, flightId);
  }

  return { flightId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AV-005: 승무원 일괄 교대 갱신 (batch crew rotation)
// (StatusTransition detector — batch 패턴, CC-005 batch 23번째 재사용)
// ---------------------------------------------------------------------------
export function rotateCrewSchedule(
  db: Database.Database,
  rotationBefore: string,
): { rotatedCount: number; rotatedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM crew_schedules
      WHERE assigned_at <= ?
        AND status = 'on_duty'
        AND rotation_due = 1
    `)
    .all(rotationBefore) as Array<{ id: string }>;

  const rotatedIds: string[] = [];

  for (const schedule of candidates) {
    db.prepare(`
      UPDATE crew_schedules
      SET status = 'rotated', rotated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), schedule.id);
    rotatedIds.push(schedule.id);
  }

  return { rotatedCount: rotatedIds.length, rotatedIds };
}

// ---------------------------------------------------------------------------
// AV-006: 수하물 클레임 atomic — 수하물 매칭 + 손상 검증 + 보상 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBaggageClaim(
  db: Database.Database,
  passengerId: string,
  flightId: string,
  baggageTag: string,
  damageAmount: number,
  damageDescription: string,
): { claimId: string; assessmentId: string; compensationId: string; passengerId: string; totalCompensation: number; processedAt: string } {
  const baggage = db
    .prepare('SELECT id, damage_status FROM baggage_claims WHERE baggage_tag = ? AND flight_id = ?')
    .get(baggageTag, flightId) as { id: string; damage_status: string } | undefined;

  if (!baggage) throw new AviationError('E404-BAGGAGE', 'Baggage not found', 404);
  if (baggage.damage_status === 'intact') {
    throw new AviationError(
      'E409-BAGGAGE',
      `Cannot process claim for intact baggage`,
      409,
    );
  }

  const claimId = randomUUID();
  const assessmentId = randomUUID();
  const compensationId = randomUUID();
  const processedAt = new Date().toISOString();
  const totalCompensation = damageAmount;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO baggage_claims (id, passenger_id, flight_id, baggage_tag, damage_status, claim_amount, status, processed_at)
      VALUES (?, ?, ?, ?, 'damaged', ?, 'compensated', ?)
    `).run(claimId, passengerId, flightId, baggageTag, damageAmount, processedAt);
    db.prepare(`
      INSERT INTO damage_assessments (id, claim_id, description, assessed_amount, assessed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(assessmentId, claimId, damageDescription, damageAmount, processedAt);
    db.prepare(`
      INSERT INTO compensation_records (id, claim_id, passenger_id, total_amount, processed_at, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(compensationId, claimId, passengerId, totalCompensation, processedAt, 'Baggage damage compensation processed');
    db.prepare(`UPDATE baggage_claims SET baggage_claim_filed = 1 WHERE id = ?`).run(claimId);
  });
  tx();

  return { claimId, assessmentId, compensationId, passengerId, totalCompensation, processedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class AviationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AviationError';
  }
}
