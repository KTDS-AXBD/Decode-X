import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-BI (BI-001~BI-006): Billiards 합성 도메인 — 94번째 도메인 (당구장 산업, 83번째 신규 산업) 🎱 단일 클러스터 25 도메인 첫 사례 마일스톤 신기록 + 21 Sprint 연속 첫 사례 마일스톤 신기록
//   - billiards spec-container rules.md 기반 PoC source
//   - 합성 schema: billiards_sessions, billiard_halls, memberships,
//                  table_schedules, session_payments, cue_inventory,
//                  cancelled_session_records, session_refunds
//   - 당구장 lifecycle 패턴 — 동시table한도/hour한도/table예약atomic/session상태전환/ended세션일괄만료/session환불atomic
//   - withRuleId 재사용 94번째 도메인 (신규 detector 0개, 95 Sprint 연속 정점 도전)
//   - BilliardsError code-in-message 패턴 (S275 표준)
//   - 83 산업 연속 0 ABSENCE 도전 (..+BW+AC+BL)
//   - 🎱 단일 클러스터 25 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC+BL 오프라인 엔터 25-클러스터)
//   - 🏆 21 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S390 24→S391 25)
//   - 🏆 withRuleId 95 Sprint 정점 도전 (S264~S391 95 Sprint 누적 정점)
//   - 거울 변환 47회차 (carsharing → ... → bowling → arcade → billiards)
//   - Sprint WT autopilot 분리 작업 21회차 (DoD 6축 실감증 12회차 — 11회 자연 작동 후 12회차)
//   - Rule prefix: BI (BIlliards) — "BL" reserved for lpon business logic (BL-001~042, BL-G001~G006)
//   - BI 차별성: BW(볼링 lane+frame scoring) + KR(노래방 시간제) 인접하되
//     table-based 시간제 + cue stick inventory 임대 + frame/game 단위 미사용 (시간만)
//     + 단체 동시 사용 + cue 파손 변상 정책 모델
//   - 동시 한도 20 (hall별 동시 active table, 중형 당구장 20 table 기준)
// ---------------------------------------------------------------------------

export interface BilliardHallRow {
  id: string;
  name: string;
  max_concurrent_tables: number;
  active_tables: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  hall_id: string;
  membership_type: string; // basic | silver | gold | vip
  hour_limit: number;
  daily_used: number;
  status: string; // active | paused | expired
}

export interface BilliardsSessionRow {
  id: string;
  hall_id: string;
  membership_id: string;
  table_id: string | null;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | started | playing | ended | abandoned | cancelled
  reserved_at: string;
}

export interface CueInventoryRow {
  id: string;
  hall_id: string;
  session_id: string;
  cue_count: number;
  damage_count: number;
  recorded_at: string;
}

const MAX_CONCURRENT_TABLES_PER_HALL = 20; // BI-001: hall별 동시 active table 한도 (중형 당구장 20 table 기준)

// ---------------------------------------------------------------------------
// BI-001: hall별 동시 active table 한도 검증
// (ThresholdCheck detector — F563 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveTable(
  db: Database.Database,
  hallId: string,
  membershipId: string,
): { sessionId: string; hallId: string; membershipId: string; reservedAt: string } {
  const hall = db
    .prepare('SELECT active_tables, max_concurrent_tables FROM billiard_halls WHERE id = ?')
    .get(hallId) as { active_tables: number; max_concurrent_tables: number } | undefined;

  if (!hall) throw new BilliardsError('E404-HALL', 'Billiard hall not found', 404);

  const limit = hall.max_concurrent_tables ?? MAX_CONCURRENT_TABLES_PER_HALL;

  if (hall.active_tables >= limit) {
    throw new BilliardsError(
      'E422-TABLE-LIMIT-EXCEEDED',
      `Hall is at full table capacity (${hall.active_tables} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO billiards_sessions (id, hall_id, membership_id, table_id, schedule_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, 'reserved', ?)
  `).run(sessionId, hallId, membershipId, reservedAt);

  db.prepare(`
    UPDATE billiard_halls SET active_tables = active_tables + 1 WHERE id = ?
  `).run(hallId);

  return { sessionId, hallId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// BI-002: 회원 일일 hour 한도 검증 (멤버십 등급별 일일 이용 시간 제한)
// (ThresholdCheck detector — F563 Path B var-vs-var, hourLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyHourLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  hours: number,
): { memberId: string; membershipId: string; hourLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, hour_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; hour_limit: number } | undefined;

  if (!membership) throw new BilliardsError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F563 Path B: var-vs-var, left=`hourLimit` (`limit` keyword 매칭)
  const hourLimit = membership.hour_limit;

  if (membership.daily_used + hours >= hourLimit) {
    throw new BilliardsError(
      'E422-HOUR-LIMIT-EXCEEDED',
      `Membership hour quota exhausted (${membership.daily_used + hours} >= ${hourLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(hours, membershipId);

  return { memberId, membershipId, hourLimit, approved: true };
}

// ---------------------------------------------------------------------------
// BI-003: table 예약 atomic — table_schedules + billiards_sessions + session_payments + cue_inventory 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTableBooking(
  db: Database.Database,
  hallId: string,
  sessionId: string,
  tableNumber: number,
  partySize: number,
  startTime: string,
  endTime: string,
  cueCount: number,
  amount: number,
): { scheduleId: string; paymentId: string; cueId: string; sessionId: string; hallId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM billiards_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new BilliardsError('E404-SESSION', 'Reserved session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const cueId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO table_schedules (id, hall_id, session_id, table_number, party_size, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, hallId, sessionId, tableNumber, partySize, startTime, endTime);

    db.prepare(`
      UPDATE billiards_sessions SET status = 'started', table_id = ?, schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(tableNumber.toString(), scheduleId, paymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);

    db.prepare(`
      INSERT INTO cue_inventory (id, hall_id, session_id, cue_count, damage_count, recorded_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(cueId, hallId, sessionId, cueCount, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, cueId, sessionId, hallId, bookedAt };
}

// ---------------------------------------------------------------------------
// BI-004: session 상태 전환 (reserved → started → playing → ended / abandoned / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'started' | 'playing' | 'ended' | 'abandoned' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM billiards_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new BilliardsError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'started') ||
    (session.status === 'started' && newStatus === 'playing') ||
    (session.status === 'playing' && newStatus === 'ended') ||
    (session.status === 'playing' && newStatus === 'abandoned') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'started' && newStatus === 'cancelled') ||
    (session.status === 'playing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new BilliardsError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE billiards_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// BI-005: ended session 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../AC-005 83번째 재사용)
// ---------------------------------------------------------------------------
export function expireEndedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM billiards_sessions
      WHERE status = 'ended'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE billiards_sessions
      SET status = 'cancelled'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// BI-006: session 환불 atomic — cue 파손 변상 정책 + 단체 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionRefund(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  sessionCost: number,
  cancellationRate: number,
  cueDamageCount: number,
  cueDamageFeePerCue: number,
): { feeRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const session = db
    .prepare("SELECT status FROM billiards_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new BilliardsError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cueDamageFee = cueDamageCount * cueDamageFeePerCue;
  const cancellationAmount = Math.floor(sessionCost * cancellationRate);
  const refundAmount = Math.max(0, sessionCost - cancellationAmount - cueDamageFee);
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_session_records (id, member_id, session_id, session_cost, cue_damage_fee, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, sessionId, sessionCost, cueDamageFee, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO session_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, feeRecordId, memberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE cancelled_session_records SET status = 'refunded' WHERE id = ?
    `).run(feeRecordId);
  });
  tx();

  return { feeRecordId, refundId, memberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class BilliardsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BilliardsError';
  }
}
