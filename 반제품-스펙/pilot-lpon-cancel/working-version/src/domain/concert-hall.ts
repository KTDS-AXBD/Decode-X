import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-CO (CO-001~CO-006): Concert hall 합성 도메인 — 86번째 도메인 (클래식 콘서트홀 산업, 75번째 신규 산업) 🎻 단일 클러스터 17 도메인 첫 사례 마일스톤 신기록
//   - concert-hall spec-container rules.md 기반 PoC source
//   - 합성 schema: concert_tickets, concert_halls, season_passes,
//                  season_schedules, ticket_payments, cancelled_fee_records, ticket_refunds
//   - 콘서트홀 lifecycle 패턴 — 동시티켓한도/시즌권한도/티켓예매atomic/티켓상태전환/closed티켓일괄만료/티켓환불atomic
//   - withRuleId 재사용 86번째 도메인 (신규 detector 0개, 87 Sprint 연속 정점 도전)
//   - ConcertHallError code-in-message 패턴 (S275 표준)
//   - 75 산업 연속 0 ABSENCE 도전 (..+OB+PL+CV+WB+BC+CO)
//   - 🎻 단일 클러스터 17 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO 오프라인 엔터 17-클러스터)
//   - 🏆 13 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S382 16→S383 17)
//   - 🏆 86번째 도메인 17.2배 확장 (S262 5 → S383 86)
//   - 거울 변환 39회차 (carsharing → ... → wedding-hall → beach-club → concert-hall)
//   - Sprint WT autopilot 분리 작업 13회차 (DoD 6축 실감증 4회차 표준 확정)
//   - CO 차별성: KP(K-pop 1회성 콘서트) 인접하되 시즌 구독 + 정기 프로그램 + 좌석 등급(VIP/A/B/C) + 음악감독별 시리즈 모델
//   - 동시 한도 1500 (공연당 동시 active ticket, 대형 클래식 콘서트홀 기반)
//   - BC(반복 방문 + 카바나 임대) vs CO(시즌권 + 정기 공연 + 클래식 오케스트라 시리즈) 대비
// ---------------------------------------------------------------------------

export interface ConcertHallRow {
  id: string;
  name: string;
  max_concurrent_tickets: number;
  active_tickets: number;
  status: string; // active | closed | suspended
}

export interface SeasonPassRow {
  id: string;
  member_id: string;
  hall_id: string;
  pass_type: string; // standard | premium | vip
  season_limit: number;
  season_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ConcertTicketRow {
  id: string;
  hall_id: string;
  pass_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | attended | ended | closed | cancelled
  reserved_at: string;
}

export interface SeasonScheduleRow {
  id: string;
  hall_id: string;
  ticket_id: string;
  performance_date: string;
  seat_section: string; // vip | a | b | c
  conductor: string;
  program_series: string;
  status: string; // confirmed | performed | cancelled | expired
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  ticket_id: string;
  ticket_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_TICKETS_PER_CONCERT = 1500; // CO-001: 공연당 동시 active ticket 한도 (대형 클래식 콘서트홀)

// ---------------------------------------------------------------------------
// CO-001: 공연당 동시 active ticket 한도 검증
// (ThresholdCheck detector — F555 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveTicket(
  db: Database.Database,
  hallId: string,
  passId: string,
): { ticketId: string; hallId: string; passId: string; reservedAt: string } {
  const hall = db
    .prepare('SELECT active_tickets, max_concurrent_tickets FROM concert_halls WHERE id = ?')
    .get(hallId) as { active_tickets: number; max_concurrent_tickets: number } | undefined;

  if (!hall) throw new ConcertHallError('E404-HALL', 'Concert hall not found', 404);

  const limit = hall.max_concurrent_tickets ?? MAX_CONCURRENT_TICKETS_PER_CONCERT;

  if (hall.active_tickets >= limit) {
    throw new ConcertHallError(
      'E422-HALL-TICKET-LIMIT-EXCEEDED',
      `Concert hall is at full ticket capacity (${hall.active_tickets} >= ${limit})`,
      422,
    );
  }

  const ticketId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO concert_tickets (id, hall_id, pass_id, schedule_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(ticketId, hallId, passId, reservedAt);

  db.prepare(`
    UPDATE concert_halls SET active_tickets = active_tickets + 1 WHERE id = ?
  `).run(hallId);

  return { ticketId, hallId, passId, reservedAt };
}

// ---------------------------------------------------------------------------
// CO-002: 회원 시즌권 사용 한도 검증 (시즌권 유형별 공연 예약 제한)
// (ThresholdCheck detector — F555 Path B var-vs-var, seasonLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applySeasonLimit(
  db: Database.Database,
  memberId: string,
  passId: string,
  tickets: number,
): { memberId: string; passId: string; seasonLimit: number; approved: boolean } {
  const pass = db
    .prepare('SELECT season_used, season_limit FROM season_passes WHERE id = ? AND member_id = ? LIMIT 1')
    .get(passId, memberId) as { season_used: number; season_limit: number } | undefined;

  if (!pass) throw new ConcertHallError('E404-PASS', 'Season pass not found', 404);

  // F555 Path B: var-vs-var, left=`seasonLimit` (`limit` keyword 매칭)
  const seasonLimit = pass.season_limit;

  if (pass.season_used + tickets >= seasonLimit) {
    throw new ConcertHallError(
      'E422-SEASON-LIMIT-EXCEEDED',
      `Season pass quota exhausted (${pass.season_used + tickets} >= ${seasonLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE season_passes SET season_used = season_used + ? WHERE id = ?
  `).run(tickets, passId);

  return { memberId, passId, seasonLimit, approved: true };
}

// ---------------------------------------------------------------------------
// CO-003: 티켓 예매 atomic — concert_tickets + season_schedules + ticket_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTicketBooking(
  db: Database.Database,
  hallId: string,
  ticketId: string,
  performanceDate: string,
  seatSection: string,
  conductor: string,
  programSeries: string,
  amount: number,
): { scheduleId: string; paymentId: string; ticketId: string; hallId: string; bookedAt: string } {
  const ticket = db
    .prepare("SELECT status FROM concert_tickets WHERE id = ? AND status = 'reserved'")
    .get(ticketId) as { status: string } | undefined;

  if (!ticket) throw new ConcertHallError('E404-TICKET', 'Reserved ticket not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO season_schedules (id, hall_id, ticket_id, performance_date, seat_section, conductor, program_series, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, hallId, ticketId, performanceDate, seatSection, conductor, programSeries);

    db.prepare(`
      UPDATE concert_tickets SET status = 'attended', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, ticketId);

    db.prepare(`
      INSERT INTO ticket_payments (id, ticket_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, ticketId, scheduleId, amount, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, ticketId, hallId, bookedAt };
}

// ---------------------------------------------------------------------------
// CO-004: 티켓 상태 전환 (reserved → attended → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionTicketStatus(
  db: Database.Database,
  ticketId: string,
  newStatus: 'attended' | 'ended' | 'closed' | 'cancelled',
): { ticketId: string; previousStatus: string; newStatus: string } {
  const ticket = db
    .prepare('SELECT status FROM concert_tickets WHERE id = ?')
    .get(ticketId) as { status: string } | undefined;

  if (!ticket) throw new ConcertHallError('E404-TICKET', 'Ticket not found', 404);

  const previousStatus = ticket.status;
  const allowed =
    (ticket.status === 'reserved' && newStatus === 'attended') ||
    (ticket.status === 'attended' && newStatus === 'ended') ||
    (ticket.status === 'attended' && newStatus === 'closed') ||
    (ticket.status === 'reserved' && newStatus === 'cancelled') ||
    (ticket.status === 'attended' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ConcertHallError(
      'E409-TICKET',
      `Cannot transition ticket from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE concert_tickets SET status = ? WHERE id = ?`).run(newStatus, ticketId);

  return { ticketId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// CO-005: closed ticket 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BC-005 75번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedTicketBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM concert_tickets
      WHERE status = 'closed'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE concert_tickets
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// CO-006: 티켓 환불 atomic — 취소 티켓 시 시즌권 환불 정책 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTicketRefund(
  db: Database.Database,
  memberId: string,
  ticketId: string,
  ticketCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const ticket = db
    .prepare("SELECT status FROM concert_tickets WHERE id = ? AND status = 'cancelled'")
    .get(ticketId) as { status: string } | undefined;

  if (!ticket) throw new ConcertHallError('E404-CANCELLED-TICKET', 'Cancelled ticket not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(ticketCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, ticket_id, ticket_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, ticketId, ticketCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO ticket_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, feeRecordId, memberId, cancellationAmount, refundedAt);

    db.prepare(`
      UPDATE cancelled_fee_records SET status = 'refunded' WHERE id = ?
    `).run(feeRecordId);
  });
  tx();

  return { feeRecordId, refundId, memberId, cancellationAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ConcertHallError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ConcertHallError';
  }
}
