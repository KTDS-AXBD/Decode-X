import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-OB (OB-001~OB-006): Observatory 합성 도메인 — 81번째 도메인 (천문대 산업, 70번째 신규 산업) 🔭 단일 클러스터 12 도메인 첫 사례 마일스톤
//   - observatory spec-container rules.md 기반 PoC source
//   - 합성 schema: observatories, observatory_memberships, observatory_observations,
//                  telescope_schedules, observation_payments, cancelled_fee_records, observation_refunds
//   - 천문대 lifecycle 패턴 — 동시관측한도/telescope한도/telescope관측atomic/관측상태전환/closed관측일괄만료/관측환불atomic
//   - withRuleId 재사용 81번째 도메인 (신규 detector 0개, 82 Sprint 연속 정점 도전)
//   - ObservatoryError code-in-message 패턴 (S275 표준)
//   - 70 산업 연속 0 ABSENCE 도전 (..+AQ+ZO+MS+MV+LB+PA+FE+GR+OB)
//   - 🔭 단일 클러스터 12 도메인 첫 사례 마일스톤 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB 오프라인 엔터 12-클러스터)
//   - 🔭 8 Sprint 연속 첫 사례 마일스톤 (S370 5→S371 6→S372 7→S373 8→S374 9→S375 10→S376 11→S377 12)
//   - 🏆 81번째 도메인 16.2배 확장 (S262 5 → S377 81)
//   - 거울 변환 34회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie → library → park → festival → garden → observatory)
//   - Sprint WT autopilot 분리 작업 8회차 (DoD 5축 강화 — DOMAIN_MAP 명시 신규 추가, S376 false claim 패턴 차단)
//   - OB 차별성 (GR 식물원/MS 박물관과 분리): telescope 시간 슬롯 + 야간 관측 + 기상 의존 모델
//   - 동시 한도 200 (천문대 telescope 수 기반, GR 3000/PA 2000보다 훨씬 작음)
// ---------------------------------------------------------------------------

export interface ObservatoryRow {
  id: string;
  name: string;
  max_concurrent_observations: number;
  active_observations: number;
  status: string; // active | closed | suspended
}

export interface ObservatoryMembershipRow {
  id: string;
  member_id: string;
  observatory_id: string;
  membership_type: string; // night | monthly | annual
  telescope_limit: number;
  telescope_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ObservatoryObservationRow {
  id: string;
  observatory_id: string;
  membership_id: string;
  telescope_id: string | null;
  payment_id: string | null;
  status: string; // reserved | observed | ended | closed | cancelled
  scheduled_at: string;
}

export interface TelescopeScheduleRow {
  id: string;
  observatory_id: string;
  observation_id: string;
  telescope_no: string;
  status: string; // active | completed | cancelled | expired
  started_at: string;
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  observation_id: string;
  observation_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_OBSERVATIONS_PER_OBSERVATORY = 200; // OB-001: 천문대별 동시 active 관측 한도 (telescope 수 기반, 일반 천문대 200슬롯)

// ---------------------------------------------------------------------------
// OB-001: 천문대 동시 active 관측 한도 검증
// (ThresholdCheck detector — F549 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveObservation(
  db: Database.Database,
  observatoryId: string,
  membershipId: string,
): { observationId: string; observatoryId: string; membershipId: string; scheduledAt: string } {
  const observatory = db
    .prepare('SELECT active_observations, max_concurrent_observations FROM observatories WHERE id = ?')
    .get(observatoryId) as { active_observations: number; max_concurrent_observations: number } | undefined;

  if (!observatory) throw new ObservatoryError('E404-OBSERVATORY', 'Observatory not found', 404);

  const limit = observatory.max_concurrent_observations ?? MAX_CONCURRENT_OBSERVATIONS_PER_OBSERVATORY;

  if (observatory.active_observations >= limit) {
    throw new ObservatoryError(
      'E422-OBSERVATORY-OBSERVATION-LIMIT-EXCEEDED',
      `Observatory is at full observation capacity (${observatory.active_observations} >= ${limit})`,
      422,
    );
  }

  const observationId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO observatory_observations (id, observatory_id, membership_id, telescope_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(observationId, observatoryId, membershipId, scheduledAt);

  db.prepare(`
    UPDATE observatories SET active_observations = active_observations + 1 WHERE id = ?
  `).run(observatoryId);

  return { observationId, observatoryId, membershipId, scheduledAt };
}

// ---------------------------------------------------------------------------
// OB-002: 회원 telescope 한도 검증 (멤버십 유형별 telescope 제한)
// (ThresholdCheck detector — F549 Path B var-vs-var, telescopeLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyTelescopeLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  telescopes: number,
): { memberId: string; membershipId: string; telescopeLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT telescope_used, telescope_limit FROM observatory_memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { telescope_used: number; telescope_limit: number } | undefined;

  if (!membership) throw new ObservatoryError('E404-MEMBERSHIP', 'Observatory membership not found', 404);

  // F549 Path B: var-vs-var, left=`telescopeLimit` (`limit` keyword 매칭)
  const telescopeLimit = membership.telescope_limit;

  if (membership.telescope_used + telescopes >= telescopeLimit) {
    throw new ObservatoryError(
      'E422-TELESCOPE-LIMIT-EXCEEDED',
      `Telescope usage quota exhausted (${membership.telescope_used + telescopes} >= ${telescopeLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE observatory_memberships SET telescope_used = telescope_used + ? WHERE id = ?
  `).run(telescopes, membershipId);

  return { memberId, membershipId, telescopeLimit, approved: true };
}

// ---------------------------------------------------------------------------
// OB-003: telescope 관측 atomic — observatory_observations + telescope_schedules + observation_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTelescopeObservation(
  db: Database.Database,
  observatoryId: string,
  observationId: string,
  telescopeNo: string,
  amount: number,
): { telescopeId: string; observationPaymentId: string; observationId: string; observatoryId: string; startedAt: string } {
  const observation = db
    .prepare("SELECT status FROM observatory_observations WHERE id = ? AND status = 'reserved'")
    .get(observationId) as { status: string } | undefined;

  if (!observation) throw new ObservatoryError('E404-OBSERVATION', 'Reserved observation not found', 404);

  const telescopeId = randomUUID();
  const observationPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO telescope_schedules (id, observatory_id, observation_id, telescope_no, status, started_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(telescopeId, observatoryId, observationId, telescopeNo, startedAt);

    db.prepare(`
      UPDATE observatory_observations SET status = 'observed', telescope_id = ?, payment_id = ? WHERE id = ?
    `).run(telescopeId, observationPaymentId, observationId);

    db.prepare(`
      INSERT INTO observation_payments (id, observation_id, telescope_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(observationPaymentId, observationId, telescopeId, amount, startedAt);
  });
  tx();

  return { telescopeId, observationPaymentId, observationId, observatoryId, startedAt };
}

// ---------------------------------------------------------------------------
// OB-004: 관측 상태 전환 (reserved → observed → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionObservationStatus(
  db: Database.Database,
  observationId: string,
  newStatus: 'observed' | 'ended' | 'closed' | 'cancelled',
): { observationId: string; previousStatus: string; newStatus: string } {
  const observation = db
    .prepare('SELECT status FROM observatory_observations WHERE id = ?')
    .get(observationId) as { status: string } | undefined;

  if (!observation) throw new ObservatoryError('E404-OBSERVATION', 'Observation not found', 404);

  const previousStatus = observation.status;
  const allowed =
    (observation.status === 'reserved' && newStatus === 'observed') ||
    (observation.status === 'observed' && newStatus === 'ended') ||
    (observation.status === 'observed' && newStatus === 'closed') ||
    (observation.status === 'reserved' && newStatus === 'cancelled') ||
    (observation.status === 'observed' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ObservatoryError(
      'E409-OBSERVATION',
      `Cannot transition observation from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE observatory_observations SET status = ? WHERE id = ?`).run(newStatus, observationId);

  return { observationId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// OB-005: closed 관측 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../GR-005 70번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedObservationBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM observatory_observations
      WHERE status = 'closed'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE observatory_observations
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// OB-006: 관측 환불 atomic — 취소 관측 시 관측 비용 + 취소 수수료 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processObservationRefund(
  db: Database.Database,
  memberId: string,
  observationId: string,
  observationCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const observation = db
    .prepare("SELECT status FROM observatory_observations WHERE id = ? AND status = 'cancelled'")
    .get(observationId) as { status: string } | undefined;

  if (!observation) throw new ObservatoryError('E404-CANCELLED-OBSERVATION', 'Cancelled observation not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(observationCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, observation_id, observation_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, observationId, observationCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO observation_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
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
export class ObservatoryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ObservatoryError';
  }
}
