import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-MS (MS-001~MS-006): Museum 합성 도메인 — 75번째 도메인 (박물관/미술관 산업, 64번째 신규 산업) 🏛️ 단일 클러스터 6 도메인 첫 사례 마일스톤
//   - museum spec-container rules.md 기반 PoC source
//   - 합성 schema: museums, member_cards, gallery_schedules, museum_visits,
//                  visit_payments, visit_refund_records, visit_refunds
//   - 박물관 lifecycle 패턴 — 박물관입장한도/회원일일갤러리한도/입장batchatomic/관람상태전환/만료closedvisit일괄/관람환불atomic
//   - withRuleId 재사용 75번째 도메인 (신규 detector 0개, 76 Sprint 연속 정점 도전)
//   - MuseumError code-in-message 패턴 (S275 표준)
//   - 64 산업 연속 0 ABSENCE 도전 (..+SK+EX+GF+KP+SF+AQ+ZO+MS)
//   - 🏛️ 단일 클러스터 6 도메인 첫 사례 마일스톤 도전 (AM+TH+KP+AQ+ZO+MS 오프라인 엔터 6-클러스터)
//   - 거울 변환 28회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum)
//   - Sprint WT autopilot 분리 작업 2회차 (S370 1회차 ~15분 Match 100% 검증 직후 효율 재검증)
// ---------------------------------------------------------------------------

export interface MuseumRow {
  id: string;
  name: string;
  total_capacity: number;
  active_visits: number;
  status: string; // active | suspended | retired
}

export interface MemberCardRow {
  id: string;
  member_id: string;
  museum_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  gallery_limit: number;
  gallery_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface GalleryScheduleRow {
  id: string;
  museum_id: string;
  card_id: string;
  visit_id: string | null;
  payment_id: string | null;
  status: string; // reserved | visited | updated | ended | closed | cancelled
  scheduled_at: string;
}

export interface MuseumVisitRow {
  id: string;
  museum_id: string;
  schedule_id: string;
  visit_no: string;
  status: string; // visited | updated | ended | closed | cancelled | expired
  started_at: string;
}

export interface VisitRefundRecordRow {
  id: string;
  member_id: string;
  visit_id: string;
  visit_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_VISITORS_PER_MUSEUM = 5000; // MS-001: 박물관별 동시 active 입장 한도 (기본값, 국립박물관/대형 미술관급)

// ---------------------------------------------------------------------------
// MS-001: 박물관 동시 active 입장 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookAdmission(
  db: Database.Database,
  museumId: string,
  cardId: string,
): { scheduleId: string; museumId: string; cardId: string; scheduledAt: string } {
  const museum = db
    .prepare('SELECT active_visits, total_capacity FROM museums WHERE id = ?')
    .get(museumId) as { active_visits: number; total_capacity: number } | undefined;

  if (!museum) throw new MuseumError('E404-MUSEUM', 'Museum not found', 404);

  const limit = museum.total_capacity ?? MAX_CONCURRENT_VISITORS_PER_MUSEUM;

  if (museum.active_visits >= limit) {
    throw new MuseumError(
      'E422-MUSEUM-CAPACITY-EXCEEDED',
      `Museum is at full capacity (${museum.active_visits} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO gallery_schedules (id, museum_id, card_id, visit_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(scheduleId, museumId, cardId, scheduledAt);

  db.prepare(`
    UPDATE museums SET active_visits = active_visits + 1 WHERE id = ?
  `).run(museumId);

  return { scheduleId, museumId, cardId, scheduledAt };
}

// ---------------------------------------------------------------------------
// MS-002: 회원 일일 갤러리 관람 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, galleryLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyGalleryLimit(
  db: Database.Database,
  memberId: string,
  cardId: string,
  galleries: number,
): { memberId: string; cardId: string; galleryLimit: number; approved: boolean } {
  const card = db
    .prepare('SELECT gallery_used, gallery_limit FROM member_cards WHERE id = ? AND member_id = ? LIMIT 1')
    .get(cardId, memberId) as { gallery_used: number; gallery_limit: number } | undefined;

  if (!card) throw new MuseumError('E404-CARD', 'Member card not found', 404);

  // F445 Path B: var-vs-var, left=`galleryLimit` (`limit` keyword 매칭)
  const galleryLimit = card.gallery_limit;

  if (card.gallery_used + galleries >= galleryLimit) {
    throw new MuseumError(
      'E422-DAILY-GALLERY-LIMIT-EXCEEDED',
      `Daily gallery quota exhausted (${card.gallery_used + galleries} >= ${galleryLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE member_cards SET gallery_used = gallery_used + ? WHERE id = ?
  `).run(galleries, cardId);

  return { memberId, cardId, galleryLimit, approved: true };
}

// ---------------------------------------------------------------------------
// MS-003: 갤러리 입장 atomic — museum_visits + gallery_schedules 상태전환 + visit_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processGalleryEntry(
  db: Database.Database,
  museumId: string,
  scheduleId: string,
  visitNo: string,
  amount: number,
): { visitId: string; visitPaymentId: string; scheduleId: string; museumId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM gallery_schedules WHERE id = ? AND status = 'reserved'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new MuseumError('E404-SCHEDULE', 'Reserved gallery schedule not found', 404);

  const visitId = randomUUID();
  const visitPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO museum_visits (id, museum_id, schedule_id, visit_no, status, started_at)
      VALUES (?, ?, ?, ?, 'visited', ?)
    `).run(visitId, museumId, scheduleId, visitNo, startedAt);

    db.prepare(`
      UPDATE gallery_schedules SET status = 'visited', visit_id = ?, payment_id = ? WHERE id = ?
    `).run(visitId, visitPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO visit_payments (id, schedule_id, visit_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(visitPaymentId, scheduleId, visitId, amount, startedAt);
  });
  tx();

  return { visitId, visitPaymentId, scheduleId, museumId, startedAt };
}

// ---------------------------------------------------------------------------
// MS-004: 관람 상태 전환 (reserved → visited → updated → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionGalleryStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'visited' | 'updated' | 'ended' | 'closed' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM gallery_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new MuseumError('E404-SCHEDULE', 'Gallery schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'reserved' && newStatus === 'visited') ||
    (schedule.status === 'visited' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'visited') ||
    (schedule.status === 'visited' && newStatus === 'ended') ||
    (schedule.status === 'updated' && newStatus === 'ended') ||
    (schedule.status === 'reserved' && newStatus === 'closed') ||
    (schedule.status === 'visited' && newStatus === 'closed') ||
    (schedule.status === 'reserved' && newStatus === 'cancelled') ||
    (schedule.status === 'visited' && newStatus === 'cancelled');

  if (!allowed) {
    throw new MuseumError(
      'E409-SCHEDULE',
      `Cannot transition gallery schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE gallery_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// MS-005: 만료 closed 관람 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/GF-005/EX-005/SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005/AQ-005/ZO-005 64번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedGalleryBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM museum_visits
      WHERE status = 'closed'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE museum_visits
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// MS-006: 관람 환불 atomic — closed visit 시 관람 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processAdmissionRefund(
  db: Database.Database,
  memberId: string,
  visitId: string,
  visitCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const visit = db
    .prepare("SELECT status FROM museum_visits WHERE id = ? AND status = 'closed'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new MuseumError('E404-CLOSED-VISIT', 'Closed visit not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(visitCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO visit_refund_records (id, member_id, visit_id, visit_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, memberId, visitId, visitCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO visit_refunds (id, refund_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, memberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE visit_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, memberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class MuseumError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'MuseumError';
  }
}
