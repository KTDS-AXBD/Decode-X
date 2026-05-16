import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AM (AM-001~AM-006): Amusement 합성 도메인 — 66번째 도메인 (놀이공원/테마파크 산업, 55번째 신규 산업)
//   - amusement spec-container rules.md 기반 PoC source
//   - 합성 schema: parks, visitor_contracts, ride_schedules, tickets,
//                  ticket_payments, ticket_refund_records, ticket_refunds
//   - 테마파크 lifecycle 패턴 — 파크ticket한도/visitordailyvisit한도/입장batchatomic/ticket상태전환/만료revokedticket일괄/ticket환불atomic
//   - withRuleId 재사용 66번째 도메인 (신규 detector 0개, 67 Sprint 연속 정점 도전)
//   - AmusementError code-in-message 패턴 (S275 표준)
//   - 55 산업 연속 0 ABSENCE 도전 (..+BR+ER+PC+RA+AR+GA+AM)
//   - 66번째 도메인 마일스톤 (amusement 추가, 🎢 오프라인 엔터테인먼트 신규 클러스터 출범)
//   - 거울 변환 19회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement)
//   - 🎢 오프라인 엔터테인먼트 신규 카테고리 (디지털 12-클러스터 + 게임엔터 2-클러스터 + 오프라인 엔터 1 = 3 메타 카테고리)
// ---------------------------------------------------------------------------

export interface ParkRow {
  id: string;
  name: string;
  total_capacity: number;
  active_tickets: number;
  status: string; // active | suspended | retired
}

export interface VisitorContractRow {
  id: string;
  visitor_id: string;
  park_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  visit_limit: number;
  visit_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface RideScheduleRow {
  id: string;
  park_id: string;
  contract_id: string;
  ticket_id: string | null;
  ticket_payment_id: string | null;
  status: string; // reserved | admitted | updated | completed | revoked | cancelled
  scheduled_at: string;
}

export interface TicketRow {
  id: string;
  park_id: string;
  schedule_id: string;
  ticket_no: string;
  status: string; // admitted | updated | completed | revoked | cancelled | expired
  started_at: string;
}

export interface TicketRefundRecordRow {
  id: string;
  visitor_id: string;
  ticket_id: string;
  ticket_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_TICKETS_PER_PARK = 5000; // AM-001: 테마파크별 동시 active ticket 한도 (기본값, 일반 테마파크 일일 동시 이용 가능 방문객 수)

// ---------------------------------------------------------------------------
// AM-001: 테마파크 동시 active ticket 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveTicket(
  db: Database.Database,
  parkId: string,
  contractId: string,
): { scheduleId: string; parkId: string; contractId: string; scheduledAt: string } {
  const park = db
    .prepare('SELECT active_tickets, total_capacity FROM parks WHERE id = ?')
    .get(parkId) as { active_tickets: number; total_capacity: number } | undefined;

  if (!park) throw new AmusementError('E404-PARK', 'Park not found', 404);

  const limit = park.total_capacity ?? MAX_CONCURRENT_ACTIVE_TICKETS_PER_PARK;

  if (park.active_tickets >= limit) {
    throw new AmusementError(
      'E422-PARK-CAPACITY-EXCEEDED',
      `Park is at full capacity (${park.active_tickets} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO ride_schedules (id, park_id, contract_id, ticket_id, ticket_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(scheduleId, parkId, contractId, scheduledAt);

  db.prepare(`
    UPDATE parks SET active_tickets = active_tickets + 1 WHERE id = ?
  `).run(parkId);

  return { scheduleId, parkId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// AM-002: 방문객 일일 방문 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyVisitLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyVisitLimit(
  db: Database.Database,
  visitorId: string,
  contractId: string,
  visit: number,
): { visitorId: string; contractId: string; dailyVisitLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT visit_used, visit_limit FROM visitor_contracts WHERE id = ? AND visitor_id = ? LIMIT 1')
    .get(contractId, visitorId) as { visit_used: number; visit_limit: number } | undefined;

  if (!contract) throw new AmusementError('E404-CONTRACT', 'Visitor contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyVisitLimit` (`limit` keyword 매칭)
  const dailyVisitLimit = contract.visit_limit;

  if (contract.visit_used + visit >= dailyVisitLimit) {
    throw new AmusementError(
      'E422-DAILY-VISIT-LIMIT-EXCEEDED',
      `Daily visit quota exhausted (${contract.visit_used + visit} >= ${dailyVisitLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE visitor_contracts SET visit_used = visit_used + ? WHERE id = ?
  `).run(visit, contractId);

  return { visitorId, contractId, dailyVisitLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AM-003: 놀이기구 입장 atomic — tickets + ride_schedules 상태전환 + ticket_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processRideAdmission(
  db: Database.Database,
  parkId: string,
  scheduleId: string,
  ticketNo: string,
  amount: number,
): { ticketId: string; ticketPaymentId: string; scheduleId: string; parkId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM ride_schedules WHERE id = ? AND status = 'reserved'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new AmusementError('E404-SCHEDULE', 'Reserved ticket not found', 404);

  const ticketId = randomUUID();
  const ticketPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO tickets (id, park_id, schedule_id, ticket_no, status, started_at)
      VALUES (?, ?, ?, ?, 'admitted', ?)
    `).run(ticketId, parkId, scheduleId, ticketNo, startedAt);

    db.prepare(`
      UPDATE ride_schedules SET status = 'admitted', ticket_id = ?, ticket_payment_id = ? WHERE id = ?
    `).run(ticketId, ticketPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO ticket_payments (id, schedule_id, ticket_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(ticketPaymentId, scheduleId, ticketId, amount, startedAt);
  });
  tx();

  return { ticketId, ticketPaymentId, scheduleId, parkId, startedAt };
}

// ---------------------------------------------------------------------------
// AM-004: ticket 상태 전환 (reserved → admitted → updated → completed / revoked / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionTicketStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'admitted' | 'updated' | 'completed' | 'revoked' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM ride_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new AmusementError('E404-SCHEDULE', 'Ride schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'reserved' && newStatus === 'admitted') ||
    (schedule.status === 'admitted' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'admitted') ||
    (schedule.status === 'admitted' && newStatus === 'completed') ||
    (schedule.status === 'updated' && newStatus === 'completed') ||
    (schedule.status === 'reserved' && newStatus === 'revoked') ||
    (schedule.status === 'admitted' && newStatus === 'revoked') ||
    (schedule.status === 'reserved' && newStatus === 'cancelled') ||
    (schedule.status === 'admitted' && newStatus === 'cancelled');

  if (!allowed) {
    throw new AmusementError(
      'E409-SCHEDULE',
      `Cannot transition ride schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE ride_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AM-005: 만료 revoked ticket batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 55번째 재사용)
// ---------------------------------------------------------------------------
export function expireRevokedTicketBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM tickets
      WHERE status = 'revoked'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE tickets
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// AM-006: ticket 환불 atomic — revoked ticket 시 ticket 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTicketRefund(
  db: Database.Database,
  visitorId: string,
  ticketId: string,
  ticketCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; visitorId: string; refundAmount: number; refundedAt: string } {
  const ticket = db
    .prepare("SELECT status FROM tickets WHERE id = ? AND status = 'revoked'")
    .get(ticketId) as { status: string } | undefined;

  if (!ticket) throw new AmusementError('E404-REVOKED-TICKET', 'Revoked ticket not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(ticketCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO ticket_refund_records (id, visitor_id, ticket_id, ticket_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, visitorId, ticketId, ticketCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO ticket_refunds (id, refund_record_id, visitor_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, visitorId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE ticket_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, visitorId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class AmusementError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AmusementError';
  }
}
