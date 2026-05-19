import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-MV (MV-001~MV-006): Movie 합성 도메인 — 76번째 도메인 (영화관 산업, 65번째 신규 산업) 🎬 단일 클러스터 7 도메인 첫 사례 마일스톤
//   - movie spec-container rules.md 기반 PoC source
//   - 합성 schema: theaters, member_passes, screenings, theater_visits,
//                  ticket_payments, ticket_refund_records, ticket_refunds
//   - 영화관 lifecycle 패턴 — 동시상영한도/회원일일티켓한도/좌석예매atomic/상영상태전환/만료closedscreening일괄/티켓환불atomic
//   - withRuleId 재사용 76번째 도메인 (신규 detector 0개, 77 Sprint 연속 정점 도전)
//   - MovieError code-in-message 패턴 (S275 표준)
//   - 65 산업 연속 0 ABSENCE 도전 (..+SK+EX+GF+KP+SF+AQ+ZO+MS+MV)
//   - 🎬 단일 클러스터 7 도메인 첫 사례 마일스톤 도전 (AM+TH+KP+AQ+ZO+MS+MV 오프라인 엔터 7-클러스터)
//   - 거울 변환 29회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie)
//   - Sprint WT autopilot 분리 작업 3회차 (S370 1회차 ✅ + S371 2회차 fix-forward + S372 3회차 utils test DoD 보강)
// ---------------------------------------------------------------------------

export interface TheaterRow {
  id: string;
  name: string;
  total_screening_capacity: number;
  active_screenings: number;
  status: string; // active | suspended | retired
}

export interface MemberPassRow {
  id: string;
  member_id: string;
  theater_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  ticket_limit: number;
  ticket_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ScreeningRow {
  id: string;
  theater_id: string;
  pass_id: string;
  visit_id: string | null;
  payment_id: string | null;
  status: string; // reserved | watched | ended | closed | cancelled
  scheduled_at: string;
}

export interface TheaterVisitRow {
  id: string;
  theater_id: string;
  screening_id: string;
  visit_no: string;
  status: string; // watched | ended | closed | cancelled | expired
  started_at: string;
}

export interface TicketRefundRecordRow {
  id: string;
  member_id: string;
  visit_id: string;
  ticket_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_SCREENINGS_PER_THEATER = 20; // MV-001: 영화관별 동시 active 상영 한도 (기본값, 멀티플렉스급 — 20개 상영관 기준)

// ---------------------------------------------------------------------------
// MV-001: 영화관 동시 active 상영 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookSeat(
  db: Database.Database,
  theaterId: string,
  passId: string,
): { screeningId: string; theaterId: string; passId: string; scheduledAt: string } {
  const theater = db
    .prepare('SELECT active_screenings, total_screening_capacity FROM theaters WHERE id = ?')
    .get(theaterId) as { active_screenings: number; total_screening_capacity: number } | undefined;

  if (!theater) throw new MovieError('E404-THEATER', 'Theater not found', 404);

  const limit = theater.total_screening_capacity ?? MAX_CONCURRENT_SCREENINGS_PER_THEATER;

  if (theater.active_screenings >= limit) {
    throw new MovieError(
      'E422-THEATER-SCREENING-LIMIT-EXCEEDED',
      `Theater is at full screening capacity (${theater.active_screenings} >= ${limit})`,
      422,
    );
  }

  const screeningId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO screenings (id, theater_id, pass_id, visit_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(screeningId, theaterId, passId, scheduledAt);

  db.prepare(`
    UPDATE theaters SET active_screenings = active_screenings + 1 WHERE id = ?
  `).run(theaterId);

  return { screeningId, theaterId, passId, scheduledAt };
}

// ---------------------------------------------------------------------------
// MV-002: 회원 일일 티켓 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, ticketLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyTicketLimit(
  db: Database.Database,
  memberId: string,
  passId: string,
  tickets: number,
): { memberId: string; passId: string; ticketLimit: number; approved: boolean } {
  const pass = db
    .prepare('SELECT ticket_used, ticket_limit FROM member_passes WHERE id = ? AND member_id = ? LIMIT 1')
    .get(passId, memberId) as { ticket_used: number; ticket_limit: number } | undefined;

  if (!pass) throw new MovieError('E404-PASS', 'Member pass not found', 404);

  // F445 Path B: var-vs-var, left=`ticketLimit` (`limit` keyword 매칭)
  const ticketLimit = pass.ticket_limit;

  if (pass.ticket_used + tickets >= ticketLimit) {
    throw new MovieError(
      'E422-DAILY-TICKET-LIMIT-EXCEEDED',
      `Daily ticket quota exhausted (${pass.ticket_used + tickets} >= ${ticketLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE member_passes SET ticket_used = ticket_used + ? WHERE id = ?
  `).run(tickets, passId);

  return { memberId, passId, ticketLimit, approved: true };
}

// ---------------------------------------------------------------------------
// MV-003: 좌석 예매 atomic — theater_visits + screenings 상태전환 + ticket_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSeatEntry(
  db: Database.Database,
  theaterId: string,
  screeningId: string,
  visitNo: string,
  amount: number,
): { visitId: string; ticketPaymentId: string; screeningId: string; theaterId: string; startedAt: string } {
  const screening = db
    .prepare("SELECT status FROM screenings WHERE id = ? AND status = 'reserved'")
    .get(screeningId) as { status: string } | undefined;

  if (!screening) throw new MovieError('E404-SCREENING', 'Reserved screening not found', 404);

  const visitId = randomUUID();
  const ticketPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO theater_visits (id, theater_id, screening_id, visit_no, status, started_at)
      VALUES (?, ?, ?, ?, 'watched', ?)
    `).run(visitId, theaterId, screeningId, visitNo, startedAt);

    db.prepare(`
      UPDATE screenings SET status = 'watched', visit_id = ?, payment_id = ? WHERE id = ?
    `).run(visitId, ticketPaymentId, screeningId);

    db.prepare(`
      INSERT INTO ticket_payments (id, screening_id, visit_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(ticketPaymentId, screeningId, visitId, amount, startedAt);
  });
  tx();

  return { visitId, ticketPaymentId, screeningId, theaterId, startedAt };
}

// ---------------------------------------------------------------------------
// MV-004: 상영 상태 전환 (reserved → watched → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionScreeningStatus(
  db: Database.Database,
  screeningId: string,
  newStatus: 'watched' | 'ended' | 'closed' | 'cancelled',
): { screeningId: string; previousStatus: string; newStatus: string } {
  const screening = db
    .prepare('SELECT status FROM screenings WHERE id = ?')
    .get(screeningId) as { status: string } | undefined;

  if (!screening) throw new MovieError('E404-SCREENING', 'Screening not found', 404);

  const previousStatus = screening.status;
  const allowed =
    (screening.status === 'reserved' && newStatus === 'watched') ||
    (screening.status === 'watched' && newStatus === 'ended') ||
    (screening.status === 'reserved' && newStatus === 'closed') ||
    (screening.status === 'watched' && newStatus === 'closed') ||
    (screening.status === 'reserved' && newStatus === 'cancelled') ||
    (screening.status === 'watched' && newStatus === 'cancelled');

  if (!allowed) {
    throw new MovieError(
      'E409-SCREENING',
      `Cannot transition screening from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE screenings SET status = ? WHERE id = ?`).run(newStatus, screeningId);

  return { screeningId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// MV-005: 만료 closed 상영 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/GF-005/EX-005/SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005/AQ-005/ZO-005/MS-005 65번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedScreeningBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM theater_visits
      WHERE status = 'closed'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE theater_visits
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// MV-006: 티켓 환불 atomic — closed visit 시 티켓 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTicketRefund(
  db: Database.Database,
  memberId: string,
  visitId: string,
  ticketCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const visit = db
    .prepare("SELECT status FROM theater_visits WHERE id = ? AND status = 'closed'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new MovieError('E404-CLOSED-VISIT', 'Closed visit not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(ticketCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO ticket_refund_records (id, member_id, visit_id, ticket_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, memberId, visitId, ticketCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO ticket_refunds (id, refund_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, memberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE ticket_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, memberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class MovieError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'MovieError';
  }
}

