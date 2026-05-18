import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-ZO (ZO-001~ZO-006): Zoo 합성 도메인 — 74번째 도메인 (동물원 산업, 63번째 신규 산업) 🦁 단일 클러스터 5 도메인 첫 사례 마일스톤
//   - zoo spec-container rules.md 기반 PoC source
//   - 합성 schema: zoos, visitor_passes, exhibit_schedules, zoo_visits,
//                  visit_payments, visit_refund_records, visit_refunds
//   - 동물원 lifecycle 패턴 — 동물원visit한도/visitordailyzone한도/입장batchatomic/visit상태전환/만료closedvisit일괄/visit환불atomic
//   - withRuleId 재사용 74번째 도메인 (신규 detector 0개, 75 Sprint 연속 정점 도전)
//   - ZooError code-in-message 패턴 (S275 표준)
//   - 63 산업 연속 0 ABSENCE 도전 (..+TH+SK+EX+GF+KP+SF+AQ+ZO)
//   - 🦁 단일 클러스터 5 도메인 첫 사례 마일스톤 도전 (AM+TH+KP+AQ+ZO 오프라인 엔터 5-클러스터)
//   - 거울 변환 27회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo)
//   - Sprint WT autopilot 분리 작업 (Master inline 57회 정점 후 분리 검증)
// ---------------------------------------------------------------------------

export interface ZooRow {
  id: string;
  name: string;
  total_capacity: number;
  active_visits: number;
  status: string; // active | suspended | retired
}

export interface VisitorPassRow {
  id: string;
  visitor_id: string;
  zoo_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  zone_limit: number;
  zone_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ExhibitScheduleRow {
  id: string;
  zoo_id: string;
  pass_id: string;
  visit_id: string | null;
  payment_id: string | null;
  status: string; // reserved | visited | updated | ended | closed | cancelled
  scheduled_at: string;
}

export interface ZooVisitRow {
  id: string;
  zoo_id: string;
  schedule_id: string;
  visit_no: string;
  status: string; // visited | updated | ended | closed | cancelled | expired
  started_at: string;
}

export interface VisitRefundRecordRow {
  id: string;
  visitor_id: string;
  visit_id: string;
  visit_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_VISITS_PER_ZOO = 15000; // ZO-001: 동물원별 동시 active 입장 한도 (기본값, 대형 동물원 일일 동시 관람 가능 인원 — 서울대공원/에버랜드급)

// ---------------------------------------------------------------------------
// ZO-001: 동물원 동시 active 입장 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookVisit(
  db: Database.Database,
  zooId: string,
  passId: string,
): { scheduleId: string; zooId: string; passId: string; scheduledAt: string } {
  const zoo = db
    .prepare('SELECT active_visits, total_capacity FROM zoos WHERE id = ?')
    .get(zooId) as { active_visits: number; total_capacity: number } | undefined;

  if (!zoo) throw new ZooError('E404-ZOO', 'Zoo not found', 404);

  const limit = zoo.total_capacity ?? MAX_CONCURRENT_ACTIVE_VISITS_PER_ZOO;

  if (zoo.active_visits >= limit) {
    throw new ZooError(
      'E422-ZOO-CAPACITY-EXCEEDED',
      `Zoo is at full capacity (${zoo.active_visits} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO exhibit_schedules (id, zoo_id, pass_id, visit_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(scheduleId, zooId, passId, scheduledAt);

  db.prepare(`
    UPDATE zoos SET active_visits = active_visits + 1 WHERE id = ?
  `).run(zooId);

  return { scheduleId, zooId, passId, scheduledAt };
}

// ---------------------------------------------------------------------------
// ZO-002: 방문객 일일 관람 구역 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, zoneLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyZoneLimit(
  db: Database.Database,
  visitorId: string,
  passId: string,
  zone: number,
): { visitorId: string; passId: string; zoneLimit: number; approved: boolean } {
  const pass = db
    .prepare('SELECT zone_used, zone_limit FROM visitor_passes WHERE id = ? AND visitor_id = ? LIMIT 1')
    .get(passId, visitorId) as { zone_used: number; zone_limit: number } | undefined;

  if (!pass) throw new ZooError('E404-PASS', 'Visitor pass not found', 404);

  // F445 Path B: var-vs-var, left=`zoneLimit` (`limit` keyword 매칭)
  const zoneLimit = pass.zone_limit;

  if (pass.zone_used + zone >= zoneLimit) {
    throw new ZooError(
      'E422-DAILY-ZONE-LIMIT-EXCEEDED',
      `Daily zone quota exhausted (${pass.zone_used + zone} >= ${zoneLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE visitor_passes SET zone_used = zone_used + ? WHERE id = ?
  `).run(zone, passId);

  return { visitorId, passId, zoneLimit, approved: true };
}

// ---------------------------------------------------------------------------
// ZO-003: 관람 입장 atomic — zoo_visits + exhibit_schedules 상태전환 + visit_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processExhibitEntry(
  db: Database.Database,
  zooId: string,
  scheduleId: string,
  visitNo: string,
  amount: number,
): { visitId: string; visitPaymentId: string; scheduleId: string; zooId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM exhibit_schedules WHERE id = ? AND status = 'reserved'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new ZooError('E404-SCHEDULE', 'Reserved exhibit not found', 404);

  const visitId = randomUUID();
  const visitPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO zoo_visits (id, zoo_id, schedule_id, visit_no, status, started_at)
      VALUES (?, ?, ?, ?, 'visited', ?)
    `).run(visitId, zooId, scheduleId, visitNo, startedAt);

    db.prepare(`
      UPDATE exhibit_schedules SET status = 'visited', visit_id = ?, payment_id = ? WHERE id = ?
    `).run(visitId, visitPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO visit_payments (id, schedule_id, visit_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(visitPaymentId, scheduleId, visitId, amount, startedAt);
  });
  tx();

  return { visitId, visitPaymentId, scheduleId, zooId, startedAt };
}

// ---------------------------------------------------------------------------
// ZO-004: 방문 상태 전환 (reserved → visited → updated → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionVisitStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'visited' | 'updated' | 'ended' | 'closed' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM exhibit_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new ZooError('E404-SCHEDULE', 'Exhibit schedule not found', 404);

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
    throw new ZooError(
      'E409-SCHEDULE',
      `Cannot transition exhibit schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE exhibit_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// ZO-005: 만료 closed 방문 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/GF-005/EX-005/SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005/AQ-005 63번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedVisitBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM zoo_visits
      WHERE status = 'closed'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE zoo_visits
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// ZO-006: 방문 환불 atomic — closed visit 시 방문 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processVisitRefund(
  db: Database.Database,
  visitorId: string,
  visitId: string,
  visitCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; visitorId: string; refundAmount: number; refundedAt: string } {
  const visit = db
    .prepare("SELECT status FROM zoo_visits WHERE id = ? AND status = 'closed'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new ZooError('E404-CLOSED-VISIT', 'Closed visit not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(visitCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO visit_refund_records (id, visitor_id, visit_id, visit_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, visitorId, visitId, visitCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO visit_refunds (id, refund_record_id, visitor_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, visitorId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE visit_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, visitorId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ZooError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ZooError';
  }
}
