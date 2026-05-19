import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PL (PL-001~PL-006): Planetarium 합성 도메인 — 82번째 도메인 (천문관 산업, 71번째 신규 산업) 🔭 단일 클러스터 13 도메인 첫 사례 마일스톤 도전
//   - planetarium spec-container rules.md 기반 PoC source
//   - 합성 schema: planetariums, planetarium_memberships, planetarium_sessions,
//                  dome_schedules, session_payments, cancelled_fee_records, session_refunds
//   - 천문관 lifecycle 패턴 — 돔좌석한도/상영좌석한도/돔상영atomic/세션상태전환/closed세션일괄만료/세션환불atomic
//   - withRuleId 재사용 82번째 도메인 (신규 detector 0개, 83 Sprint 연속 정점 도전)
//   - PlanetariumError code-in-message 패턴 (S275 표준)
//   - 71 산업 연속 0 ABSENCE 도전 (..+GR+OB+PL)
//   - 🔭 단일 클러스터 13 도메인 첫 사례 마일스톤 도전 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL 오프라인 엔터 13-클러스터)
//   - 🔭 9 Sprint 연속 첫 사례 마일스톤 달성 경로 (S370 5→S371 6→...→S377 12→S378 13)
//   - 🏆 82번째 도메인 16.4배 확장 도전 (S262 5 → S378 82)
//   - 거울 변환 35회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie → library → park → festival → garden → observatory → planetarium)
//   - Sprint WT autopilot 분리 작업 9회차 (DoD 5축 정착 검증 — S377 입증 패턴 재현)
//   - PL 차별성: 돔 영상 시뮬레이션 + 시간대 정기 상영 + 해설/VR 옵션 + 좌석 우선 예약
//   - OB(실 천체 telescope, 기상 의존) vs MV(일반 영화 상영, 범용) vs PL(돔 특화 시뮬레이션)
//   - 동시 한도 300 (돔 좌석 수 기반, OB 200보다 크고 MV 800보다 작음)
// ---------------------------------------------------------------------------

export interface PlanetariumRow {
  id: string;
  name: string;
  max_concurrent_sessions: number;
  active_sessions: number;
  status: string; // active | closed | suspended
}

export interface PlanetariumMembershipRow {
  id: string;
  member_id: string;
  planetarium_id: string;
  membership_type: string; // standard | premium | annual
  seat_limit: number;
  seat_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface PlanetariumSessionRow {
  id: string;
  planetarium_id: string;
  membership_id: string;
  dome_id: string | null;
  payment_id: string | null;
  status: string; // reserved | screened | ended | closed | cancelled
  scheduled_at: string;
}

export interface DomeScheduleRow {
  id: string;
  planetarium_id: string;
  session_id: string;
  dome_no: string;
  program_type: string; // standard | narrated | vr
  status: string; // active | completed | cancelled | expired
  started_at: string;
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  session_id: string;
  session_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_SESSIONS_PER_PLANETARIUM = 300; // PL-001: 천문관별 동시 active 세션 한도 (돔 좌석 수 기반, 일반 천문관 300석)

// ---------------------------------------------------------------------------
// PL-001: 천문관 동시 active 세션 한도 검증
// (ThresholdCheck detector — F550 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookSession(
  db: Database.Database,
  planetariumId: string,
  membershipId: string,
): { sessionId: string; planetariumId: string; membershipId: string; scheduledAt: string } {
  const planetarium = db
    .prepare('SELECT active_sessions, max_concurrent_sessions FROM planetariums WHERE id = ?')
    .get(planetariumId) as { active_sessions: number; max_concurrent_sessions: number } | undefined;

  if (!planetarium) throw new PlanetariumError('E404-PLANETARIUM', 'Planetarium not found', 404);

  const limit = planetarium.max_concurrent_sessions ?? MAX_CONCURRENT_SESSIONS_PER_PLANETARIUM;

  if (planetarium.active_sessions >= limit) {
    throw new PlanetariumError(
      'E422-PLANETARIUM-SESSION-LIMIT-EXCEEDED',
      `Planetarium is at full session capacity (${planetarium.active_sessions} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO planetarium_sessions (id, planetarium_id, membership_id, dome_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(sessionId, planetariumId, membershipId, scheduledAt);

  db.prepare(`
    UPDATE planetariums SET active_sessions = active_sessions + 1 WHERE id = ?
  `).run(planetariumId);

  return { sessionId, planetariumId, membershipId, scheduledAt };
}

// ---------------------------------------------------------------------------
// PL-002: 회원 돔 좌석 한도 검증 (멤버십 유형별 좌석 제한)
// (ThresholdCheck detector — F550 Path B var-vs-var, seatLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyDomeSeatLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  seats: number,
): { memberId: string; membershipId: string; seatLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT seat_used, seat_limit FROM planetarium_memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { seat_used: number; seat_limit: number } | undefined;

  if (!membership) throw new PlanetariumError('E404-MEMBERSHIP', 'Planetarium membership not found', 404);

  // F550 Path B: var-vs-var, left=`seatLimit` (`limit` keyword 매칭)
  const seatLimit = membership.seat_limit;

  if (membership.seat_used + seats >= seatLimit) {
    throw new PlanetariumError(
      'E422-DOME-SEAT-LIMIT-EXCEEDED',
      `Dome seat quota exhausted (${membership.seat_used + seats} >= ${seatLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE planetarium_memberships SET seat_used = seat_used + ? WHERE id = ?
  `).run(seats, membershipId);

  return { memberId, membershipId, seatLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PL-003: 돔 상영 atomic — planetarium_sessions + dome_schedules + session_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processDomeScreening(
  db: Database.Database,
  planetariumId: string,
  sessionId: string,
  domeNo: string,
  programType: string,
  amount: number,
): { domeId: string; sessionPaymentId: string; sessionId: string; planetariumId: string; startedAt: string } {
  const session = db
    .prepare("SELECT status FROM planetarium_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new PlanetariumError('E404-SESSION', 'Reserved session not found', 404);

  const domeId = randomUUID();
  const sessionPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO dome_schedules (id, planetarium_id, session_id, dome_no, program_type, status, started_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(domeId, planetariumId, sessionId, domeNo, programType, startedAt);

    db.prepare(`
      UPDATE planetarium_sessions SET status = 'screened', dome_id = ?, payment_id = ? WHERE id = ?
    `).run(domeId, sessionPaymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, dome_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(sessionPaymentId, sessionId, domeId, amount, startedAt);
  });
  tx();

  return { domeId, sessionPaymentId, sessionId, planetariumId, startedAt };
}

// ---------------------------------------------------------------------------
// PL-004: 세션 상태 전환 (reserved → screened → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'screened' | 'ended' | 'closed' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM planetarium_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new PlanetariumError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'screened') ||
    (session.status === 'screened' && newStatus === 'ended') ||
    (session.status === 'screened' && newStatus === 'closed') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'screened' && newStatus === 'cancelled');

  if (!allowed) {
    throw new PlanetariumError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE planetarium_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PL-005: closed 세션 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../OB-005 71번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM planetarium_sessions
      WHERE status = 'closed'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE planetarium_sessions
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// PL-006: 세션 환불 atomic — 취소 세션 시 세션 비용 + 취소 수수료 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionRefund(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  sessionCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const session = db
    .prepare("SELECT status FROM planetarium_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new PlanetariumError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(sessionCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, session_id, session_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, sessionId, sessionCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO session_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
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
export class PlanetariumError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PlanetariumError';
  }
}
