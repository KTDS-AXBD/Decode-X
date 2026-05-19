import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PA (PA-001~PA-006): Park 합성 도메인 — 78번째 도메인 (자연공원 산업, 67번째 신규 산업) 🌲 단일 클러스터 9 도메인 첫 사례 마일스톤
//   - park spec-container rules.md 기반 PoC source
//   - 합성 schema: parks, member_passes, park_visits, trail_schedules,
//                  visit_payments, cancelled_fee_records, visit_refunds
//   - 국립공원/자연공원 lifecycle 패턴 — 동시방문한도/회원일일trail한도/트레일입장atomic/방문상태전환/closed방문일괄만료/방문환불atomic
//   - withRuleId 재사용 78번째 도메인 (신규 detector 0개, 79 Sprint 연속 정점 도전)
//   - ParkError code-in-message 패턴 (S275 표준)
//   - 67 산업 연속 0 ABSENCE 도전 (..+SK+EX+GF+KP+SF+AQ+ZO+MS+MV+LB+PA)
//   - 🌲 단일 클러스터 9 도메인 첫 사례 마일스톤 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA 오프라인 엔터 9-클러스터)
//   - 거울 변환 31회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie → library → park)
//   - Sprint WT autopilot 분리 작업 5회차 (S370 1회차 ✅ + S371 2회차 fix-forward + S372 3회차 utils test DoD 보강 + S373 4회차 재현 + S374 5회차 패턴 명확 확립)
// ---------------------------------------------------------------------------

export interface ParkRow {
  id: string;
  name: string;
  total_capacity: number;
  active_visits: number;
  status: string; // active | closed | suspended
}

export interface MemberPassRow {
  id: string;
  member_id: string;
  park_id: string;
  tier_code: string; // free | basic | premium | vip
  trail_limit: number;
  trail_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ParkVisitRow {
  id: string;
  park_id: string;
  pass_id: string;
  trail_id: string | null;
  payment_id: string | null;
  status: string; // reserved | entered | exited | ended | closed | cancelled
  scheduled_at: string;
}

export interface TrailScheduleRow {
  id: string;
  park_id: string;
  visit_id: string;
  trail_no: string;
  status: string; // active | completed | cancelled | expired
  started_at: string;
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  visit_id: string;
  visit_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_VISITS_PER_PARK = 300; // PA-001: 공원별 동시 active 방문 한도 (자연공원 기준 300인)

// ---------------------------------------------------------------------------
// PA-001: 공원 동시 active 방문 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveVisit(
  db: Database.Database,
  parkId: string,
  passId: string,
): { visitId: string; parkId: string; passId: string; scheduledAt: string } {
  const park = db
    .prepare('SELECT active_visits, total_capacity FROM parks WHERE id = ?')
    .get(parkId) as { active_visits: number; total_capacity: number } | undefined;

  if (!park) throw new ParkError('E404-PARK', 'Park not found', 404);

  const limit = park.total_capacity ?? MAX_CONCURRENT_VISITS_PER_PARK;

  if (park.active_visits >= limit) {
    throw new ParkError(
      'E422-PARK-VISIT-LIMIT-EXCEEDED',
      `Park is at full visitor capacity (${park.active_visits} >= ${limit})`,
      422,
    );
  }

  const visitId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO park_visits (id, park_id, pass_id, trail_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(visitId, parkId, passId, scheduledAt);

  db.prepare(`
    UPDATE parks SET active_visits = active_visits + 1 WHERE id = ?
  `).run(parkId);

  return { visitId, parkId, passId, scheduledAt };
}

// ---------------------------------------------------------------------------
// PA-002: 회원 일일 trail 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, trailLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyTrailLimit(
  db: Database.Database,
  memberId: string,
  passId: string,
  trails: number,
): { memberId: string; passId: string; trailLimit: number; approved: boolean } {
  const pass = db
    .prepare('SELECT trail_used, trail_limit FROM member_passes WHERE id = ? AND member_id = ? LIMIT 1')
    .get(passId, memberId) as { trail_used: number; trail_limit: number } | undefined;

  if (!pass) throw new ParkError('E404-PASS', 'Member pass not found', 404);

  // F445 Path B: var-vs-var, left=`trailLimit` (`limit` keyword 매칭)
  const trailLimit = pass.trail_limit;

  if (pass.trail_used + trails >= trailLimit) {
    throw new ParkError(
      'E422-DAILY-TRAIL-LIMIT-EXCEEDED',
      `Daily trail quota exhausted (${pass.trail_used + trails} >= ${trailLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE member_passes SET trail_used = trail_used + ? WHERE id = ?
  `).run(trails, passId);

  return { memberId, passId, trailLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PA-003: 트레일 입장 atomic — park_visits + trail_schedules 상태전환 + visit_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTrailEntry(
  db: Database.Database,
  parkId: string,
  visitId: string,
  trailNo: string,
  amount: number,
): { trailId: string; visitPaymentId: string; visitId: string; parkId: string; startedAt: string } {
  const visit = db
    .prepare("SELECT status FROM park_visits WHERE id = ? AND status = 'reserved'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new ParkError('E404-VISIT', 'Reserved visit not found', 404);

  const trailId = randomUUID();
  const visitPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO trail_schedules (id, park_id, visit_id, trail_no, status, started_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(trailId, parkId, visitId, trailNo, startedAt);

    db.prepare(`
      UPDATE park_visits SET status = 'entered', trail_id = ?, payment_id = ? WHERE id = ?
    `).run(trailId, visitPaymentId, visitId);

    db.prepare(`
      INSERT INTO visit_payments (id, visit_id, trail_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(visitPaymentId, visitId, trailId, amount, startedAt);
  });
  tx();

  return { trailId, visitPaymentId, visitId, parkId, startedAt };
}

// ---------------------------------------------------------------------------
// PA-004: 방문 상태 전환 (reserved → entered → exited → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionVisitStatus(
  db: Database.Database,
  visitId: string,
  newStatus: 'entered' | 'exited' | 'ended' | 'closed' | 'cancelled',
): { visitId: string; previousStatus: string; newStatus: string } {
  const visit = db
    .prepare('SELECT status FROM park_visits WHERE id = ?')
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new ParkError('E404-VISIT', 'Visit not found', 404);

  const previousStatus = visit.status;
  const allowed =
    (visit.status === 'reserved' && newStatus === 'entered') ||
    (visit.status === 'entered' && newStatus === 'exited') ||
    (visit.status === 'exited' && newStatus === 'ended') ||
    (visit.status === 'entered' && newStatus === 'closed') ||
    (visit.status === 'reserved' && newStatus === 'cancelled') ||
    (visit.status === 'entered' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ParkError(
      'E409-VISIT',
      `Cannot transition visit from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE park_visits SET status = ? WHERE id = ?`).run(newStatus, visitId);

  return { visitId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PA-005: closed 방문 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../LB-005 67번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedVisitBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM park_visits
      WHERE status = 'closed'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE park_visits
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// PA-006: 방문 환불 atomic — 취소 방문 시 방문 비용 + 취소 수수료 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processVisitRefund(
  db: Database.Database,
  memberId: string,
  visitId: string,
  visitCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const visit = db
    .prepare("SELECT status FROM park_visits WHERE id = ? AND status = 'cancelled'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new ParkError('E404-CANCELLED-VISIT', 'Cancelled visit not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(visitCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, visit_id, visit_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, visitId, visitCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO visit_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
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
export class ParkError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ParkError';
  }
}
