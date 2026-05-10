import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-SP (SP-001~SP-006): Sports 합성 도메인 — 37번째 도메인 (스포츠 산업, 26번째 신규 산업)
//   - sports spec-container rules.md 기반 PoC source
//   - 합성 schema: venue_seats, season_ticket_tiers, season_ticket_requests,
//                  ticket_sales, events, merchandise_batches, refund_rebookings
//   - 스포츠 운용 lifecycle 패턴 — 경기장한도/시즌권한도/티켓판매atomic/이벤트상태전환/상품교체/환불재예약atomic
//   - withRuleId 재사용 37번째 도메인 (신규 detector 0개, 35 Sprint 연속 정점)
//   - SportsError code-in-message 패턴 (S275 표준)
//   - 26 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP)
//   - 🏆 26번째 신규 산업 마일스톤 (event mgmt 산업 추가)
// ---------------------------------------------------------------------------

export interface VenueSeatRow {
  id: string;
  venue_id: string;
  event_id: string;
  section: string;
  seat_number: string;
  status: string;         // available | held | sold | cancelled
  reserved_at: string | null;
}

export interface VenueCapacityRow {
  id: string;
  venue_id: string;
  total_capacity: number;
  event_type: string;
}

export interface SeasonTicketTierRow {
  id: string;
  tier_code: string;     // bronze | silver | gold | platinum
  seasonTicketLimit: number;
  price_per_season: number;
  description: string;
}

export interface SeasonTicketRequestRow {
  id: string;
  member_id: string;
  tier_code: string;
  requested_quantity: number;
  status: string;        // pending | approved | rejected
  requested_at: string;
}

export interface TicketSaleRow {
  id: string;
  event_id: string;
  member_id: string;
  seat_id: string;
  amount: number;
  status: string;        // initiated | payment_confirmed | issued | cancelled
  sold_at: string;
}

export interface EventRow {
  id: string;
  venue_id: string;
  event_code: string;
  status: string;        // scheduled | ticketing | live | completed | archived
  event_date: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MerchandiseBatchRow {
  id: string;
  event_id: string;
  batch_code: string;
  status: string;        // pending | synced | failed
  synced_at: string | null;
}

const MAX_VENUE_CAPACITY = 50000; // SP-001: 경기장 최대 좌석 한도 (좌석 수)

// ---------------------------------------------------------------------------
// SP-001: 경기장 좌석 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookVenueSeat(
  db: Database.Database,
  venueId: string,
  eventId: string,
  section: string,
  seatNumber: string,
  memberId: string,
): { seatId: string; venueId: string; totalBooked: number; reservedAt: string } {
  const existing = db
    .prepare('SELECT COUNT(*) as cnt FROM venue_seats WHERE venue_id = ? AND event_id = ? AND status IN (\'held\', \'sold\')')
    .get(venueId, eventId) as { cnt: number } | undefined;

  const totalBooked = (existing?.cnt ?? 0) + 1;
  if (totalBooked >= MAX_VENUE_CAPACITY) {
    throw new SportsError(
      'E422-VENUE-CAPACITY-EXCEEDED',
      `Venue capacity exceeded maximum limit (${totalBooked} >= ${MAX_VENUE_CAPACITY})`,
      422,
    );
  }

  const seatId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO venue_seats (id, venue_id, event_id, section, seat_number, status, reserved_at)
    VALUES (?, ?, ?, ?, ?, 'held', ?)
  `).run(seatId, venueId, eventId, section, seatNumber, reservedAt);

  return { seatId, venueId, totalBooked, reservedAt };
}

// ---------------------------------------------------------------------------
// SP-002: 시즌권 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, seasonTicketLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applySeasonTicketTier(
  db: Database.Database,
  memberId: string,
  tierCode: 'bronze' | 'silver' | 'gold' | 'platinum',
  requestedQuantity: number,
): { memberId: string; requestedQuantity: number; seasonTicketLimit: number; approved: boolean } {
  const tier = db
    .prepare('SELECT seasonTicketLimit FROM season_ticket_tiers WHERE tier_code = ? LIMIT 1')
    .get(tierCode) as { seasonTicketLimit: number } | undefined;

  if (!tier) throw new SportsError('E404-TIER', 'Season ticket tier not found', 404);

  // F445 Path B: var-vs-var, left=`seasonTicketLimit` (`limit` keyword 매칭)
  const seasonTicketLimit = tier.seasonTicketLimit;

  if (requestedQuantity > seasonTicketLimit) {
    throw new SportsError(
      'E422-SEASON-TICKET-EXCEEDED',
      `Season ticket request exceeded tier limit (${requestedQuantity} > ${seasonTicketLimit})`,
      422,
    );
  }

  const requestId = randomUUID();
  const requestedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO season_ticket_requests (id, member_id, tier_code, requested_quantity, status, requested_at)
    VALUES (?, ?, ?, ?, 'approved', ?)
  `).run(requestId, memberId, tierCode, requestedQuantity, requestedAt);

  return { memberId, requestedQuantity, seasonTicketLimit, approved: true };
}

// ---------------------------------------------------------------------------
// SP-003: 티켓 판매 atomic — 결제 + 좌석 hold + 발권 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTicketSale(
  db: Database.Database,
  eventId: string,
  memberId: string,
  seatId: string,
  amount: number,
): { saleId: string; paymentId: string; ticketId: string; memberId: string; soldAt: string } {
  const seat = db
    .prepare('SELECT status FROM venue_seats WHERE id = ? AND status = \'held\'')
    .get(seatId) as { status: string } | undefined;

  if (!seat) throw new SportsError('E404-SEAT', 'No held seat found for sale', 404);

  const saleId = randomUUID();
  const paymentId = randomUUID();
  const ticketId = randomUUID();
  const soldAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO ticket_sales (id, event_id, member_id, seat_id, amount, status, sold_at)
      VALUES (?, ?, ?, ?, ?, 'payment_confirmed', ?)
    `).run(saleId, eventId, memberId, seatId, amount, soldAt);

    db.prepare(`
      UPDATE venue_seats SET status = 'sold' WHERE id = ?
    `).run(seatId);

    db.prepare(`
      INSERT INTO issued_tickets (id, sale_id, event_id, member_id, seat_id, issued_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ticketId, saleId, eventId, memberId, seatId, soldAt);

    db.prepare(`
      UPDATE ticket_sales SET status = 'issued' WHERE id = ?
    `).run(saleId);
  });
  tx();

  return { saleId, paymentId, ticketId, memberId, soldAt };
}

// ---------------------------------------------------------------------------
// SP-004: 이벤트 상태 전환 (scheduled → ticketing → live → completed → archived)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionEventStatus(
  db: Database.Database,
  eventId: string,
  newStatus: 'ticketing' | 'live' | 'completed' | 'archived',
): { eventId: string; previousStatus: string; newStatus: string } {
  const event = db
    .prepare('SELECT status FROM events WHERE id = ?')
    .get(eventId) as { status: string } | undefined;

  if (!event) throw new SportsError('E404-EVENT', 'Event not found', 404);

  const previousStatus = event.status;
  const allowed =
    (event.status === 'scheduled' && newStatus === 'ticketing') ||
    (event.status === 'ticketing' && newStatus === 'live') ||
    (event.status === 'live' && newStatus === 'completed') ||
    (event.status === 'completed' && newStatus === 'archived');

  if (!allowed) {
    throw new SportsError(
      'E409-EVENT',
      `Cannot transition event from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE events SET status = ? WHERE id = ?`).run(newStatus, eventId);

  if (newStatus === 'live') {
    db.prepare(`UPDATE events SET started_at = ? WHERE id = ?`).run(now, eventId);
  }
  if (newStatus === 'completed') {
    db.prepare(`UPDATE events SET completed_at = ? WHERE id = ?`).run(now, eventId);
  }

  return { eventId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// SP-005: 상품 일괄 동기화 처리 (batch merchandise sync)
// (StatusTransition detector — batch 패턴, CC-005 batch 26번째 재사용)
// ---------------------------------------------------------------------------
export function markMerchandiseSync(
  db: Database.Database,
  syncedBefore: string,
): { syncedCount: number; syncedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM merchandise_batches
      WHERE created_at <= ?
        AND status = 'pending'
    `)
    .all(syncedBefore) as Array<{ id: string }>;

  const syncedIds: string[] = [];

  for (const batch of candidates) {
    db.prepare(`
      UPDATE merchandise_batches
      SET status = 'synced', synced_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), batch.id);
    syncedIds.push(batch.id);
  }

  return { syncedCount: syncedIds.length, syncedIds };
}

// ---------------------------------------------------------------------------
// SP-006: 환불 + 재예약 atomic — 취소 + 환불 + 재예약 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processRefundRebook(
  db: Database.Database,
  originalSaleId: string,
  newEventId: string,
  newSeatId: string,
  memberId: string,
): { refundId: string; cancelId: string; rebookSaleId: string; memberId: string; processedAt: string } {
  const refundId = randomUUID();
  const cancelId = randomUUID();
  const rebookSaleId = randomUUID();
  const processedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO refund_records (id, sale_id, member_id, refund_amount, status, refunded_at)
      SELECT ?, id, ?, amount, 'completed', ? FROM ticket_sales WHERE id = ?
    `).run(refundId, memberId, processedAt, originalSaleId);

    db.prepare(`
      UPDATE ticket_sales SET status = 'cancelled' WHERE id = ?
    `).run(originalSaleId);

    db.prepare(`
      UPDATE venue_seats
      SET status = 'available'
      WHERE id = (SELECT seat_id FROM ticket_sales WHERE id = ?)
    `).run(originalSaleId);

    db.prepare(`
      INSERT INTO ticket_sales (id, event_id, member_id, seat_id, amount, status, sold_at)
      SELECT ?, ?, ?, ?, amount, 'issued', ? FROM ticket_sales WHERE id = ?
    `).run(rebookSaleId, newEventId, memberId, newSeatId, processedAt, originalSaleId);

    db.prepare(`
      INSERT INTO cancellation_logs (id, sale_id, member_id, reason, cancelled_at)
      VALUES (?, ?, ?, 'rebook', ?)
    `).run(cancelId, originalSaleId, memberId, processedAt);

    db.prepare(`
      UPDATE venue_seats SET status = 'sold' WHERE id = ?
    `).run(newSeatId);
  });
  tx();

  return { refundId, cancelId, rebookSaleId, memberId, processedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class SportsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SportsError';
  }
}
