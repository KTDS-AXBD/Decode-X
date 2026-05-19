import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-GR (GR-001~GR-006): Garden 합성 도메인 — 80번째 도메인 (식물원/수목원 산업, 69번째 신규 산업) 🌷 단일 클러스터 11 도메인 첫 사례 마일스톤
//   - garden spec-container rules.md 기반 PoC source
//   - 합성 schema: gardens, garden_memberships, garden_visits, zone_sessions,
//                  visit_payments, cancelled_fee_records, visit_refunds
//   - 식물원 lifecycle 패턴 — 동시방문한도/zone입장한도/zone입장atomic/방문상태전환/closed방문일괄만료/방문환불atomic
//   - withRuleId 재사용 80번째 도메인 (신규 detector 0개, 81 Sprint 연속 정점 도전)
//   - GardenError code-in-message 패턴 (S275 표준)
//   - 69 산업 연속 0 ABSENCE 도전 (..+AQ+ZO+MS+MV+LB+PA+FE+GR)
//   - 🌷 단일 클러스터 11 도메인 첫 사례 마일스톤 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR 오프라인 엔터 11-클러스터)
//   - 🌷 7 Sprint 연속 첫 사례 마일스톤 (S370 5→S371 6→S372 7→S373 8→S374 9→S375 10→S376 11)
//   - 🏆 80번째 도메인 16배 round 마일스톤 (S262 5 → S376 80, 16.0배 확장)
//   - 거울 변환 33회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie → library → park → festival → garden)
//   - Sprint WT autopilot 분리 작업 7회차
//   - GR 차별성 (PA 자연공원/MS 박물관과 분리): zone 분리 구역 입장 + 계절권(seasonal membership) + 온실/구역별 특수 zone 모델
// ---------------------------------------------------------------------------

export interface GardenRow {
  id: string;
  name: string;
  total_capacity: number;
  active_visits: number;
  status: string; // active | closed | suspended
}

export interface GardenMembershipRow {
  id: string;
  member_id: string;
  garden_id: string;
  membership_type: string; // day | seasonal | annual
  zone_limit: number;
  zone_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface GardenVisitRow {
  id: string;
  garden_id: string;
  membership_id: string;
  zone_id: string | null;
  payment_id: string | null;
  status: string; // reserved | entered | exited | ended | closed | cancelled
  scheduled_at: string;
}

export interface ZoneSessionRow {
  id: string;
  garden_id: string;
  visit_id: string;
  zone_no: string;
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

const MAX_CONCURRENT_GARDEN_VISITS = 3000; // GR-001: 식물원별 동시 active 방문 한도 (중대형 식물원 기준 3000인)

// ---------------------------------------------------------------------------
// GR-001: 식물원 동시 active 방문 한도 검증
// (ThresholdCheck detector — F548 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveVisit(
  db: Database.Database,
  gardenId: string,
  membershipId: string,
): { visitId: string; gardenId: string; membershipId: string; scheduledAt: string } {
  const garden = db
    .prepare('SELECT active_visits, total_capacity FROM gardens WHERE id = ?')
    .get(gardenId) as { active_visits: number; total_capacity: number } | undefined;

  if (!garden) throw new GardenError('E404-GARDEN', 'Garden not found', 404);

  const limit = garden.total_capacity ?? MAX_CONCURRENT_GARDEN_VISITS;

  if (garden.active_visits >= limit) {
    throw new GardenError(
      'E422-GARDEN-VISIT-LIMIT-EXCEEDED',
      `Garden is at full visit capacity (${garden.active_visits} >= ${limit})`,
      422,
    );
  }

  const visitId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO garden_visits (id, garden_id, membership_id, zone_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(visitId, gardenId, membershipId, scheduledAt);

  db.prepare(`
    UPDATE gardens SET active_visits = active_visits + 1 WHERE id = ?
  `).run(gardenId);

  return { visitId, gardenId, membershipId, scheduledAt };
}

// ---------------------------------------------------------------------------
// GR-002: 멤버 zone 입장 한도 검증 (membership 유형별 zone 제한)
// (ThresholdCheck detector — F548 Path B var-vs-var, zoneLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyZoneLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  zones: number,
): { memberId: string; membershipId: string; zoneLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT zone_used, zone_limit FROM garden_memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { zone_used: number; zone_limit: number } | undefined;

  if (!membership) throw new GardenError('E404-MEMBERSHIP', 'Garden membership not found', 404);

  // F548 Path B: var-vs-var, left=`zoneLimit` (`limit` keyword 매칭)
  const zoneLimit = membership.zone_limit;

  if (membership.zone_used + zones >= zoneLimit) {
    throw new GardenError(
      'E422-ZONE-LIMIT-EXCEEDED',
      `Zone entry quota exhausted (${membership.zone_used + zones} >= ${zoneLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE garden_memberships SET zone_used = zone_used + ? WHERE id = ?
  `).run(zones, membershipId);

  return { memberId, membershipId, zoneLimit, approved: true };
}

// ---------------------------------------------------------------------------
// GR-003: zone 입장 atomic — garden_visits + zone_sessions 상태전환 + visit_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processGardenEntry(
  db: Database.Database,
  gardenId: string,
  visitId: string,
  zoneNo: string,
  amount: number,
): { zoneId: string; visitPaymentId: string; visitId: string; gardenId: string; startedAt: string } {
  const visit = db
    .prepare("SELECT status FROM garden_visits WHERE id = ? AND status = 'reserved'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new GardenError('E404-VISIT', 'Reserved visit not found', 404);

  const zoneId = randomUUID();
  const visitPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO zone_sessions (id, garden_id, visit_id, zone_no, status, started_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(zoneId, gardenId, visitId, zoneNo, startedAt);

    db.prepare(`
      UPDATE garden_visits SET status = 'entered', zone_id = ?, payment_id = ? WHERE id = ?
    `).run(zoneId, visitPaymentId, visitId);

    db.prepare(`
      INSERT INTO visit_payments (id, visit_id, zone_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(visitPaymentId, visitId, zoneId, amount, startedAt);
  });
  tx();

  return { zoneId, visitPaymentId, visitId, gardenId, startedAt };
}

// ---------------------------------------------------------------------------
// GR-004: 방문 상태 전환 (reserved → entered → exited → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionVisitStatus(
  db: Database.Database,
  visitId: string,
  newStatus: 'entered' | 'exited' | 'ended' | 'closed' | 'cancelled',
): { visitId: string; previousStatus: string; newStatus: string } {
  const visit = db
    .prepare('SELECT status FROM garden_visits WHERE id = ?')
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new GardenError('E404-VISIT', 'Visit not found', 404);

  const previousStatus = visit.status;
  const allowed =
    (visit.status === 'reserved' && newStatus === 'entered') ||
    (visit.status === 'entered' && newStatus === 'exited') ||
    (visit.status === 'exited' && newStatus === 'ended') ||
    (visit.status === 'entered' && newStatus === 'closed') ||
    (visit.status === 'reserved' && newStatus === 'cancelled') ||
    (visit.status === 'entered' && newStatus === 'cancelled');

  if (!allowed) {
    throw new GardenError(
      'E409-VISIT',
      `Cannot transition visit from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE garden_visits SET status = ? WHERE id = ?`).run(newStatus, visitId);

  return { visitId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// GR-005: closed 방문 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../FE-005 69번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedVisitBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM garden_visits
      WHERE status = 'closed'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE garden_visits
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// GR-006: 방문 환불 atomic — 취소 방문 시 방문 비용 + 취소 수수료 + 환불 트랜잭션
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
    .prepare("SELECT status FROM garden_visits WHERE id = ? AND status = 'cancelled'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new GardenError('E404-CANCELLED-VISIT', 'Cancelled visit not found', 404);

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
export class GardenError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'GardenError';
  }
}
