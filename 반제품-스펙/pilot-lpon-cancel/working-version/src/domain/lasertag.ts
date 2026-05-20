import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-LS (LS-001~LS-006): Laser tag 합성 도메인 — 90번째 도메인 (레이저태그 산업, 79번째 신규 산업) 🔫 단일 클러스터 21 도메인 첫 사례 마일스톤 신기록
//   - lasertag spec-container rules.md 기반 PoC source
//   - 합성 schema: lasertag_sessions, arenas, memberships,
//                  equipment_schedules, session_payments, cancelled_fee_records, session_refunds
//   - 레이저태그 lifecycle 패턴 — 동시세션한도/장비한도/세션예약atomic/세션상태전환/closed세션일괄만료/세션환불atomic
//   - withRuleId 재사용 90번째 도메인 (신규 detector 0개, 91 Sprint 연속 정점 도전)
//   - LaserTagError code-in-message 패턴 (S275 표준)
//   - 79 산업 연속 0 ABSENCE 도전 (..+WB+BC+CO+KR+NC+ST+LS)
//   - 🔫 단일 클러스터 21 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS 오프라인 엔터 21-클러스터)
//   - 🏆 17 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S386 20→S387 21)
//   - 🏆🏆🏆 90번째 도메인 = 18배 round 마일스톤 (S262 5 → S387 90)
//   - 🏆 withRuleId 91 Sprint 정점 도전 (S264~S387 91 Sprint 누적 정점)
//   - 거울 변환 43회차 (carsharing → ... → karaoke → night-club → studio → lasertag)
//   - Sprint WT autopilot 분리 작업 17회차 (DoD 6축 실감증 8회차 정착 확인)
//   - LS 차별성: ST(스튜디오 전문 제작용) + NC(나이트클럽 야간 입장권) 인접하되 게임형 엔터 + 시간제 + 그룹 예약 + 점수 시스템 + 장비 임대 + 레벨별 맵 + 멤버십
//   - 동시 한도 10 (아레나별 동시 active session, 소형 레이저태그 아레나 기반)
//   - ST(스튜디오별 20 slot) vs NC(클럽별 500 guest) vs LS(아레나별 10 session + 장비 임대 + 30-60분)
// ---------------------------------------------------------------------------

export interface ArenaRow {
  id: string;
  name: string;
  max_concurrent_sessions: number;
  active_sessions: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  arena_id: string;
  membership_type: string; // basic | silver | gold
  equipment_limit: number;
  daily_used: number;
  status: string; // active | paused | expired | cancelled
}

export interface LasertagSessionRow {
  id: string;
  arena_id: string;
  membership_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | ongoing | ended | closed | cancelled
  reserved_at: string;
}

export interface EquipmentScheduleRow {
  id: string;
  arena_id: string;
  session_id: string;
  equipment_type: string;
  start_time: string;
  end_time: string;
  map_level: string;
  status: string; // confirmed | active | completed | cancelled | expired
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

const MAX_CONCURRENT_SESSIONS_PER_ARENA = 10; // LS-001: 아레나별 동시 active session 한도 (소형 레이저태그 아레나 기준)

// ---------------------------------------------------------------------------
// LS-001: 아레나별 동시 active session 한도 검증
// (ThresholdCheck detector — F559 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveSession(
  db: Database.Database,
  arenaId: string,
  membershipId: string,
): { sessionId: string; arenaId: string; membershipId: string; reservedAt: string } {
  const arena = db
    .prepare('SELECT active_sessions, max_concurrent_sessions FROM arenas WHERE id = ?')
    .get(arenaId) as { active_sessions: number; max_concurrent_sessions: number } | undefined;

  if (!arena) throw new LaserTagError('E404-ARENA', 'Arena not found', 404);

  const limit = arena.max_concurrent_sessions ?? MAX_CONCURRENT_SESSIONS_PER_ARENA;

  if (arena.active_sessions >= limit) {
    throw new LaserTagError(
      'E422-ARENA-SESSION-LIMIT-EXCEEDED',
      `Arena is at full session capacity (${arena.active_sessions} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO lasertag_sessions (id, arena_id, membership_id, schedule_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(sessionId, arenaId, membershipId, reservedAt);

  db.prepare(`
    UPDATE arenas SET active_sessions = active_sessions + 1 WHERE id = ?
  `).run(arenaId);

  return { sessionId, arenaId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// LS-002: 회원 장비 한도 검증 (멤버십 등급별 일일 장비 예약 제한)
// (ThresholdCheck detector — F559 Path B var-vs-var, equipmentLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyEquipmentLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  equipment: number,
): { memberId: string; membershipId: string; equipmentLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, equipment_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; equipment_limit: number } | undefined;

  if (!membership) throw new LaserTagError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F559 Path B: var-vs-var, left=`equipmentLimit` (`limit` keyword 매칭)
  const equipmentLimit = membership.equipment_limit;

  if (membership.daily_used + equipment >= equipmentLimit) {
    throw new LaserTagError(
      'E422-EQUIPMENT-LIMIT-EXCEEDED',
      `Membership equipment quota exhausted (${membership.daily_used + equipment} >= ${equipmentLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(equipment, membershipId);

  return { memberId, membershipId, equipmentLimit, approved: true };
}

// ---------------------------------------------------------------------------
// LS-003: 세션 예약 atomic — lasertag_sessions + equipment_schedules + session_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionBooking(
  db: Database.Database,
  arenaId: string,
  sessionId: string,
  equipmentType: string,
  startTime: string,
  endTime: string,
  mapLevel: string,
  amount: number,
): { scheduleId: string; paymentId: string; sessionId: string; arenaId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM lasertag_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new LaserTagError('E404-SESSION', 'Reserved session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO equipment_schedules (id, arena_id, session_id, equipment_type, start_time, end_time, map_level, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, arenaId, sessionId, equipmentType, startTime, endTime, mapLevel);

    db.prepare(`
      UPDATE lasertag_sessions SET status = 'ongoing', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, sessionId, arenaId, bookedAt };
}

// ---------------------------------------------------------------------------
// LS-004: session 상태 전환 (reserved → ongoing → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'ongoing' | 'ended' | 'closed' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM lasertag_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new LaserTagError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'ongoing') ||
    (session.status === 'ongoing' && newStatus === 'ended') ||
    (session.status === 'ongoing' && newStatus === 'closed') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'ongoing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new LaserTagError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE lasertag_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// LS-005: closed session 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BC-005/CO-005/KR-005/NC-005/ST-005 79번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM lasertag_sessions
      WHERE status = 'closed'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE lasertag_sessions
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// LS-006: session 환불 atomic — 취소 세션 시 그룹 환불 정책 + 환불 트랜잭션
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
    .prepare("SELECT status FROM lasertag_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new LaserTagError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

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
export class LaserTagError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'LaserTagError';
  }
}
