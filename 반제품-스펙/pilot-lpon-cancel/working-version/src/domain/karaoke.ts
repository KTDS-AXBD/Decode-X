import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-KR (KR-001~KR-006): Karaoke 합성 도메인 — 87번째 도메인 (노래방 산업, 76번째 신규 산업) 🎤 단일 클러스터 18 도메인 첫 사례 마일스톤 신기록
//   - karaoke spec-container rules.md 기반 PoC source
//   - 합성 schema: karaoke_sessions, karaokes, memberships,
//                  room_schedules, session_payments, cancelled_fee_records, session_refunds
//   - 노래방 lifecycle 패턴 — 동시룸한도/멤버십한도/룸예약atomic/세션상태전환/closed세션일괄만료/세션환불atomic
//   - withRuleId 재사용 87번째 도메인 (신규 detector 0개, 88 Sprint 연속 정점 도전)
//   - KaraokeError code-in-message 패턴 (S275 표준)
//   - 76 산업 연속 0 ABSENCE 도전 (..+OB+PL+CV+WB+BC+CO+KR)
//   - 🎤 단일 클러스터 18 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR 오프라인 엔터 18-클러스터)
//   - 🏆 14 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S383 17→S384 18)
//   - 🏆 87번째 도메인 17.4배 확장 (S262 5 → S384 87)
//   - 거울 변환 40회차 (carsharing → ... → beach-club → concert-hall → karaoke)
//   - Sprint WT autopilot 분리 작업 14회차 (DoD 6축 실감증 5회차 rules/ 영구 승격 트리거)
//   - KR 차별성: CO(클래식 콘서트홀 시즌권 + 정기 공연) + KP(K-pop 단일 콘서트 1회성) 인접하되 B2C 짧은 1-3시간 룸 단위 + 음식료 옵션 + 시간 연장 차별
//   - 동시 한도 20 (노래방별 동시 active room, 일반 노래방 기반)
//   - CO(공연당 1500 티켓) vs KR(노래방별 20 room 슬롯 + 프라이빗 룸 + 시간제 + 그룹 예약) 대비
// ---------------------------------------------------------------------------

export interface KaraokeRow {
  id: string;
  name: string;
  max_concurrent_rooms: number;
  active_rooms: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  karaoke_id: string;
  membership_type: string; // basic | premium | vip
  membership_limit: number;
  daily_used: number;
  status: string; // active | paused | expired | cancelled
}

export interface KaraokeSessionRow {
  id: string;
  karaoke_id: string;
  membership_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | ongoing | ended | closed | cancelled
  reserved_at: string;
}

export interface RoomScheduleRow {
  id: string;
  karaoke_id: string;
  session_id: string;
  room_number: string;
  start_time: string;
  end_time: string;
  group_size: number;
  status: string; // confirmed | ongoing | completed | cancelled | expired
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

const MAX_CONCURRENT_ROOMS_PER_KARAOKE = 20; // KR-001: 노래방별 동시 active room 한도 (일반 노래방 기준)

// ---------------------------------------------------------------------------
// KR-001: 노래방별 동시 active room 한도 검증
// (ThresholdCheck detector — F556 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveRoom(
  db: Database.Database,
  karaokeId: string,
  membershipId: string,
): { sessionId: string; karaokeId: string; membershipId: string; reservedAt: string } {
  const karaoke = db
    .prepare('SELECT active_rooms, max_concurrent_rooms FROM karaokes WHERE id = ?')
    .get(karaokeId) as { active_rooms: number; max_concurrent_rooms: number } | undefined;

  if (!karaoke) throw new KaraokeError('E404-KARAOKE', 'Karaoke not found', 404);

  const limit = karaoke.max_concurrent_rooms ?? MAX_CONCURRENT_ROOMS_PER_KARAOKE;

  if (karaoke.active_rooms >= limit) {
    throw new KaraokeError(
      'E422-KARAOKE-ROOM-LIMIT-EXCEEDED',
      `Karaoke is at full room capacity (${karaoke.active_rooms} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO karaoke_sessions (id, karaoke_id, membership_id, schedule_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(sessionId, karaokeId, membershipId, reservedAt);

  db.prepare(`
    UPDATE karaokes SET active_rooms = active_rooms + 1 WHERE id = ?
  `).run(karaokeId);

  return { sessionId, karaokeId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// KR-002: 회원 일일 membership 한도 검증 (멤버십 등급별 일일 room 예약 제한)
// (ThresholdCheck detector — F556 Path B var-vs-var, membershipLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyMembershipLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  rooms: number,
): { memberId: string; membershipId: string; membershipLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, membership_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; membership_limit: number } | undefined;

  if (!membership) throw new KaraokeError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F556 Path B: var-vs-var, left=`membershipLimit` (`limit` keyword 매칭)
  const membershipLimit = membership.membership_limit;

  if (membership.daily_used + rooms >= membershipLimit) {
    throw new KaraokeError(
      'E422-MEMBERSHIP-LIMIT-EXCEEDED',
      `Membership daily quota exhausted (${membership.daily_used + rooms} >= ${membershipLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(rooms, membershipId);

  return { memberId, membershipId, membershipLimit, approved: true };
}

// ---------------------------------------------------------------------------
// KR-003: room 예약 atomic — karaoke_sessions + room_schedules + session_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processRoomBooking(
  db: Database.Database,
  karaokeId: string,
  sessionId: string,
  roomNumber: string,
  startTime: string,
  endTime: string,
  groupSize: number,
  amount: number,
): { scheduleId: string; paymentId: string; sessionId: string; karaokeId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM karaoke_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new KaraokeError('E404-SESSION', 'Reserved session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO room_schedules (id, karaoke_id, session_id, room_number, start_time, end_time, group_size, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, karaokeId, sessionId, roomNumber, startTime, endTime, groupSize);

    db.prepare(`
      UPDATE karaoke_sessions SET status = 'ongoing', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, sessionId, karaokeId, bookedAt };
}

// ---------------------------------------------------------------------------
// KR-004: session 상태 전환 (reserved → ongoing → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'ongoing' | 'ended' | 'closed' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM karaoke_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new KaraokeError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'ongoing') ||
    (session.status === 'ongoing' && newStatus === 'ended') ||
    (session.status === 'ongoing' && newStatus === 'closed') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'ongoing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new KaraokeError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE karaoke_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// KR-005: closed session 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BC-005/CO-005 76번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM karaoke_sessions
      WHERE status = 'closed'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE karaoke_sessions
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// KR-006: session 환불 atomic — 취소 세션 시 drinks/menu 환불 정책 + 환불 트랜잭션
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
    .prepare("SELECT status FROM karaoke_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new KaraokeError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

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
export class KaraokeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'KaraokeError';
  }
}
