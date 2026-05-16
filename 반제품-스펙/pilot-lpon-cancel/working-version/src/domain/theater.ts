import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-TH (TH-001~TH-006): Theater 합성 도메인 — 67번째 도메인 (영화관/극장/공연장 산업, 56번째 신규 산업)
//   - theater spec-container rules.md 기반 PoC source
//   - 합성 schema: theaters, patron_contracts, performance_schedules, seats,
//                  seat_payments, seat_refund_records, seat_refunds
//   - 공연 lifecycle 패턴 — 극장seat한도/patrondailyattendance한도/입장batchatomic/seat상태전환/만료withdrawnseat일괄/seat환불atomic
//   - withRuleId 재사용 67번째 도메인 (신규 detector 0개, 68 Sprint 연속 정점 도전)
//   - TheaterError code-in-message 패턴 (S275 표준)
//   - 56 산업 연속 0 ABSENCE 도전 (..+ER+PC+RA+AR+GA+AM+TH)
//   - 67번째 도메인 마일스톤 (theater 추가, 🎭 AM+TH 오프라인 엔터 2-클러스터 확장)
//   - 거울 변환 20회차 정점 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater)
//   - 🎭 영화관/극장/공연장 통합 추상화 (스크린/홀/공연장 + 좌석 + 회차 + 멤버십 등급)
// ---------------------------------------------------------------------------

export interface TheaterRow {
  id: string;
  name: string;
  total_capacity: number;
  active_seats: number;
  status: string; // active | suspended | retired
}

export interface PatronContractRow {
  id: string;
  patron_id: string;
  theater_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  attendance_limit: number;
  attendance_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface PerformanceScheduleRow {
  id: string;
  theater_id: string;
  contract_id: string;
  seat_id: string | null;
  seat_payment_id: string | null;
  status: string; // booked | seated | updated | ended | withdrawn | cancelled
  scheduled_at: string;
}

export interface SeatRow {
  id: string;
  theater_id: string;
  schedule_id: string;
  seat_no: string;
  status: string; // seated | updated | ended | withdrawn | cancelled | expired
  started_at: string;
}

export interface SeatRefundRecordRow {
  id: string;
  patron_id: string;
  seat_id: string;
  seat_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_SEATS_PER_THEATER = 2000; // TH-001: 극장별 동시 active seat 한도 (기본값, 대형 멀티플렉스 1관 1000~2000석)

// ---------------------------------------------------------------------------
// TH-001: 극장 동시 active seat 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookSeat(
  db: Database.Database,
  theaterId: string,
  contractId: string,
): { scheduleId: string; theaterId: string; contractId: string; scheduledAt: string } {
  const theater = db
    .prepare('SELECT active_seats, total_capacity FROM theaters WHERE id = ?')
    .get(theaterId) as { active_seats: number; total_capacity: number } | undefined;

  if (!theater) throw new TheaterError('E404-THEATER', 'Theater not found', 404);

  const limit = theater.total_capacity ?? MAX_CONCURRENT_ACTIVE_SEATS_PER_THEATER;

  if (theater.active_seats >= limit) {
    throw new TheaterError(
      'E422-THEATER-CAPACITY-EXCEEDED',
      `Theater is at full capacity (${theater.active_seats} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO performance_schedules (id, theater_id, contract_id, seat_id, seat_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'booked', ?)
  `).run(scheduleId, theaterId, contractId, scheduledAt);

  db.prepare(`
    UPDATE theaters SET active_seats = active_seats + 1 WHERE id = ?
  `).run(theaterId);

  return { scheduleId, theaterId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// TH-002: 관람객 일일 관람 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyAttendanceLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyAttendanceLimit(
  db: Database.Database,
  patronId: string,
  contractId: string,
  attendance: number,
): { patronId: string; contractId: string; dailyAttendanceLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT attendance_used, attendance_limit FROM patron_contracts WHERE id = ? AND patron_id = ? LIMIT 1')
    .get(contractId, patronId) as { attendance_used: number; attendance_limit: number } | undefined;

  if (!contract) throw new TheaterError('E404-CONTRACT', 'Patron contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyAttendanceLimit` (`limit` keyword 매칭)
  const dailyAttendanceLimit = contract.attendance_limit;

  if (contract.attendance_used + attendance >= dailyAttendanceLimit) {
    throw new TheaterError(
      'E422-DAILY-ATTENDANCE-LIMIT-EXCEEDED',
      `Daily attendance quota exhausted (${contract.attendance_used + attendance} >= ${dailyAttendanceLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE patron_contracts SET attendance_used = attendance_used + ? WHERE id = ?
  `).run(attendance, contractId);

  return { patronId, contractId, dailyAttendanceLimit, approved: true };
}

// ---------------------------------------------------------------------------
// TH-003: 공연 입장 atomic — seats + performance_schedules 상태전환 + seat_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processShowAdmission(
  db: Database.Database,
  theaterId: string,
  scheduleId: string,
  seatNo: string,
  amount: number,
): { seatId: string; seatPaymentId: string; scheduleId: string; theaterId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM performance_schedules WHERE id = ? AND status = 'booked'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new TheaterError('E404-SCHEDULE', 'Booked seat not found', 404);

  const seatId = randomUUID();
  const seatPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO seats (id, theater_id, schedule_id, seat_no, status, started_at)
      VALUES (?, ?, ?, ?, 'seated', ?)
    `).run(seatId, theaterId, scheduleId, seatNo, startedAt);

    db.prepare(`
      UPDATE performance_schedules SET status = 'seated', seat_id = ?, seat_payment_id = ? WHERE id = ?
    `).run(seatId, seatPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO seat_payments (id, schedule_id, seat_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(seatPaymentId, scheduleId, seatId, amount, startedAt);
  });
  tx();

  return { seatId, seatPaymentId, scheduleId, theaterId, startedAt };
}

// ---------------------------------------------------------------------------
// TH-004: seat 상태 전환 (booked → seated → updated → ended / withdrawn / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSeatStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'seated' | 'updated' | 'ended' | 'withdrawn' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM performance_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new TheaterError('E404-SCHEDULE', 'Performance schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'booked' && newStatus === 'seated') ||
    (schedule.status === 'seated' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'seated') ||
    (schedule.status === 'seated' && newStatus === 'ended') ||
    (schedule.status === 'updated' && newStatus === 'ended') ||
    (schedule.status === 'booked' && newStatus === 'withdrawn') ||
    (schedule.status === 'seated' && newStatus === 'withdrawn') ||
    (schedule.status === 'booked' && newStatus === 'cancelled') ||
    (schedule.status === 'seated' && newStatus === 'cancelled');

  if (!allowed) {
    throw new TheaterError(
      'E409-SCHEDULE',
      `Cannot transition performance schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE performance_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// TH-005: 만료 withdrawn seat batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 56번째 재사용)
// ---------------------------------------------------------------------------
export function expireWithdrawnSeatBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM seats
      WHERE status = 'withdrawn'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE seats
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// TH-006: seat 환불 atomic — withdrawn seat 시 seat 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processShowRefund(
  db: Database.Database,
  patronId: string,
  seatId: string,
  seatCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; patronId: string; refundAmount: number; refundedAt: string } {
  const seat = db
    .prepare("SELECT status FROM seats WHERE id = ? AND status = 'withdrawn'")
    .get(seatId) as { status: string } | undefined;

  if (!seat) throw new TheaterError('E404-WITHDRAWN-SEAT', 'Withdrawn seat not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(seatCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO seat_refund_records (id, patron_id, seat_id, seat_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, patronId, seatId, seatCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO seat_refunds (id, refund_record_id, patron_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, patronId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE seat_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, patronId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class TheaterError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'TheaterError';
  }
}
