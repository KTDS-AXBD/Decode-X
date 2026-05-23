import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-ES (ES-001~ES-006): Escape Room 합성 도메인 — 95번째 도메인 (방탈출 카페 산업, 84번째 신규 산업) 🔓 단일 클러스터 26 도메인 첫 사례 마일스톤 신기록 + 22 Sprint 연속 첫 사례 마일스톤 신기록
//   - escape-room spec-container rules.md 기반 PoC source
//   - 합성 schema: escape_sessions, escape_facilities, memberships,
//                  room_schedules, session_payments, hint_usage,
//                  cancelled_session_records, session_refunds
//   - 방탈출 카페 lifecycle 패턴 — 동시room한도/attempt한도/room예약atomic/session상태전환/ended세션일괄만료/session환불atomic
//   - withRuleId 재사용 95번째 도메인 (신규 detector 0개, 96 Sprint 연속 정점 도전)
//   - EscapeRoomError code-in-message 패턴 (S275 표준)
//   - 84 산업 연속 0 ABSENCE 도전 (..+AC+BL+ES)
//   - 🔓 단일 클러스터 26 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC+BL+ES 오프라인 엔터 26-클러스터)
//   - 🏆 22 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S391 25→S392 26)
//   - 🏆 withRuleId 96 Sprint 정점 도전 (S264~S392 96 Sprint 누적 정점)
//   - 거울 변환 48회차 (carsharing → ... → arcade → billiards → escape-room)
//   - Sprint WT autopilot 분리 작업 22회차 (DoD 6축 실감증 13회차)
//   - Rule prefix: ES (EScape room)
//   - ES 차별성: BL(당구 table-based 시간제) + KP(콘서트 그룹 좌석) 인접하되
//     room-based 예약 + 시간제 45-60분 + 난이도별 테마 + 그룹 활동 3-6명
//     + 탈출 성공 보너스 + 힌트 시스템 + 게임 마스터(GM) 운영 모델
//   - 동시 한도 8 (facility별 동시 active room, 중형 방탈출 카페 8 room 기준)
// ---------------------------------------------------------------------------

export interface EscapeFacilityRow {
  id: string;
  name: string;
  max_concurrent_rooms: number;
  active_rooms: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  facility_id: string;
  membership_type: string; // basic | silver | gold | vip
  attempt_limit: number;
  daily_attempts: number;
  status: string; // active | paused | expired
}

export interface EscapeSessionRow {
  id: string;
  facility_id: string;
  membership_id: string;
  room_id: string | null;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | starting | playing | ended | abandoned | cancelled
  escape_result: string | null; // escaped | failed | null
  reserved_at: string;
}

export interface HintUsageRow {
  id: string;
  facility_id: string;
  session_id: string;
  hints_allowed: number;
  hints_used: number;
  recorded_at: string;
}

const MAX_CONCURRENT_ROOMS_PER_FACILITY = 8; // ES-001: facility별 동시 active room 한도 (중형 방탈출 카페 8 room 기준)

// ---------------------------------------------------------------------------
// ES-001: facility별 동시 active room 한도 검증
// (ThresholdCheck detector — F564 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveRoom(
  db: Database.Database,
  facilityId: string,
  membershipId: string,
): { sessionId: string; facilityId: string; membershipId: string; reservedAt: string } {
  const facility = db
    .prepare('SELECT active_rooms, max_concurrent_rooms FROM escape_facilities WHERE id = ?')
    .get(facilityId) as { active_rooms: number; max_concurrent_rooms: number } | undefined;

  if (!facility) throw new EscapeRoomError('E404-FACILITY', 'Escape facility not found', 404);

  const limit = facility.max_concurrent_rooms ?? MAX_CONCURRENT_ROOMS_PER_FACILITY;

  if (facility.active_rooms >= limit) {
    throw new EscapeRoomError(
      'E422-ROOM-LIMIT-EXCEEDED',
      `Facility is at full room capacity (${facility.active_rooms} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO escape_sessions (id, facility_id, membership_id, room_id, schedule_id, payment_id, status, escape_result, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, 'reserved', NULL, ?)
  `).run(sessionId, facilityId, membershipId, reservedAt);

  db.prepare(`
    UPDATE escape_facilities SET active_rooms = active_rooms + 1 WHERE id = ?
  `).run(facilityId);

  return { sessionId, facilityId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// ES-002: 회원 일일 escape attempt 한도 검증 (멤버십 등급별 일일 시도 횟수 제한)
// (ThresholdCheck detector — F564 Path B var-vs-var, attemptLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyAttemptLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  attempts: number,
): { memberId: string; membershipId: string; attemptLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_attempts, attempt_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_attempts: number; attempt_limit: number } | undefined;

  if (!membership) throw new EscapeRoomError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F564 Path B: var-vs-var, left=`attemptLimit` (`limit` keyword 매칭)
  const attemptLimit = membership.attempt_limit;

  if (membership.daily_attempts + attempts >= attemptLimit) {
    throw new EscapeRoomError(
      'E422-ATTEMPT-LIMIT-EXCEEDED',
      `Membership daily attempt quota exhausted (${membership.daily_attempts + attempts} >= ${attemptLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_attempts = daily_attempts + ? WHERE id = ?
  `).run(attempts, membershipId);

  return { memberId, membershipId, attemptLimit, approved: true };
}

// ---------------------------------------------------------------------------
// ES-003: room 예약 atomic — room_schedules + escape_sessions + session_payments + hint_usage 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processRoomBooking(
  db: Database.Database,
  facilityId: string,
  sessionId: string,
  roomTheme: string,
  groupSize: number,
  startTime: string,
  endTime: string,
  hintsAllowed: number,
  amount: number,
): { scheduleId: string; paymentId: string; hintId: string; sessionId: string; facilityId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM escape_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new EscapeRoomError('E404-SESSION', 'Reserved session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const hintId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO room_schedules (id, facility_id, session_id, room_theme, group_size, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, facilityId, sessionId, roomTheme, groupSize, startTime, endTime);

    db.prepare(`
      UPDATE escape_sessions SET status = 'starting', room_id = ?, schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(roomTheme, scheduleId, paymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);

    db.prepare(`
      INSERT INTO hint_usage (id, facility_id, session_id, hints_allowed, hints_used, recorded_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(hintId, facilityId, sessionId, hintsAllowed, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, hintId, sessionId, facilityId, bookedAt };
}

// ---------------------------------------------------------------------------
// ES-004: session 상태 전환 (reserved → starting → playing → ended (escaped/failed) / abandoned / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'starting' | 'playing' | 'ended' | 'abandoned' | 'cancelled',
  escapeResult?: 'escaped' | 'failed',
): { sessionId: string; previousStatus: string; newStatus: string; escapeResult: string | null } {
  const session = db
    .prepare('SELECT status FROM escape_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new EscapeRoomError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'starting') ||
    (session.status === 'starting' && newStatus === 'playing') ||
    (session.status === 'playing' && newStatus === 'ended') ||
    (session.status === 'playing' && newStatus === 'abandoned') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'starting' && newStatus === 'cancelled') ||
    (session.status === 'playing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new EscapeRoomError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const resolvedResult = newStatus === 'ended' ? (escapeResult ?? 'failed') : null;

  db.prepare(`UPDATE escape_sessions SET status = ?, escape_result = ? WHERE id = ?`).run(
    newStatus,
    resolvedResult,
    sessionId,
  );

  return { sessionId, previousStatus, newStatus, escapeResult: resolvedResult };
}

// ---------------------------------------------------------------------------
// ES-005: ended session 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BI-005 84번째 재사용)
// ---------------------------------------------------------------------------
export function expireEndedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM escape_sessions
      WHERE status = 'ended'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE escape_sessions
      SET status = 'cancelled'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// ES-006: session 환불 atomic — 그룹 환불 + escape bonus 지급 정책 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionRefund(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  sessionCost: number,
  cancellationRate: number,
  escapeBonusAmount: number,
): { feeRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const session = db
    .prepare("SELECT status FROM escape_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new EscapeRoomError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.floor(sessionCost * cancellationRate);
  const refundAmount = Math.max(0, sessionCost - cancellationAmount + escapeBonusAmount);
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_session_records (id, member_id, session_id, session_cost, escape_bonus_amount, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, sessionId, sessionCost, escapeBonusAmount, cancellationRate, cancellationAmount);

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
export class EscapeRoomError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'EscapeRoomError';
  }
}
