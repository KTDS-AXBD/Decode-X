import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-BW (BW-001~BW-006): Bowling 합성 도메인 — 92번째 도메인 (볼링 산업, 81번째 신규 산업) 🎳 단일 클러스터 23 도메인 첫 사례 마일스톤 신기록 도전
//   - bowling spec-container rules.md 기반 PoC source
//   - 합성 schema: bowling_sessions, bowling_centers, memberships,
//                  lane_schedules, session_payments, frame_scores,
//                  cancelled_fee_records, session_refunds
//   - 볼링 lifecycle 패턴 — 동시레인한도/게임한도/레인예약atomic/세션상태전환/closed세션일괄만료/환불atomic
//   - withRuleId 재사용 92번째 도메인 (신규 detector 0개, 93 Sprint 연속 정점 도전)
//   - BowlingError code-in-message 패턴 (S275 표준)
//   - 81 산업 연속 0 ABSENCE 도전 (..+WB+BC+CO+KR+NC+ST+LS+CA+BW)
//   - 🎳 단일 클러스터 23 도메인 첫 사례 마일스톤 신기록 도전 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW 오프라인 엔터 23-클러스터)
//   - 🏆 19 Sprint 연속 첫 사례 마일스톤 신기록 도전 (S370 5→S371 6→...→S388 22→S389 23)
//   - 🏆 withRuleId 93 Sprint 정점 도전 (S264~S389 93 Sprint 누적 정점)
//   - 거울 변환 45회차 (carsharing → ... → lasertag → casino → bowling)
//   - Sprint WT autopilot 분리 작업 19회차 (DoD 6축 실감증 10회차 — rules/ 영구 등재 후 첫 자연 작동)
//   - BW 차별성: ST(스튜디오 전문 제작 시간제) + LS(레이저태그 게임형 점수 시스템) 인접하되 lane 단위 시간제 + frame/game 단위 점수 + 신발·공 임대 + 리그/토너먼트 + 단체 그룹 예약 + 멤버십 등급제
//   - 동시 한도 24 (center별 동시 active lane, 중형 볼링 센터 24 lane 기준)
//   - ST(스튜디오 전문 제작) vs LS(레이저태그 게임 점수) vs BW(lane 예약+game 한도+frame 점수+장비 임대)
// ---------------------------------------------------------------------------

export interface BowlingCenterRow {
  id: string;
  name: string;
  max_concurrent_lanes: number;
  active_lanes: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  center_id: string;
  membership_type: string; // basic | silver | gold | vip
  game_limit: number;
  daily_used: number;
  status: string; // active | paused | expired
}

export interface BowlingSessionRow {
  id: string;
  center_id: string;
  membership_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | started | completed | closed | cancelled
  reserved_at: string;
}

export interface LaneScheduleRow {
  id: string;
  center_id: string;
  session_id: string;
  lane_number: string;
  game_count: number;
  shoe_size: string;
  start_time: string;
  end_time: string;
  status: string; // confirmed | active | completed | cancelled | expired
}

export interface FrameScoreRow {
  id: string;
  session_id: string;
  lane_number: string;
  frame_number: number;
  score: number;
  created_at: string;
}

const MAX_CONCURRENT_LANES_PER_CENTER = 24; // BW-001: center별 동시 active lane 한도 (중형 볼링 센터 24 lane 기준)

// ---------------------------------------------------------------------------
// BW-001: center별 동시 active lane 한도 검증
// (ThresholdCheck detector — F561 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveLane(
  db: Database.Database,
  centerId: string,
  membershipId: string,
): { sessionId: string; centerId: string; membershipId: string; reservedAt: string } {
  const center = db
    .prepare('SELECT active_lanes, max_concurrent_lanes FROM bowling_centers WHERE id = ?')
    .get(centerId) as { active_lanes: number; max_concurrent_lanes: number } | undefined;

  if (!center) throw new BowlingError('E404-CENTER', 'Bowling center not found', 404);

  const limit = center.max_concurrent_lanes ?? MAX_CONCURRENT_LANES_PER_CENTER;

  if (center.active_lanes >= limit) {
    throw new BowlingError(
      'E422-CENTER-LANE-LIMIT-EXCEEDED',
      `Center is at full lane capacity (${center.active_lanes} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO bowling_sessions (id, center_id, membership_id, schedule_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(sessionId, centerId, membershipId, reservedAt);

  db.prepare(`
    UPDATE bowling_centers SET active_lanes = active_lanes + 1 WHERE id = ?
  `).run(centerId);

  return { sessionId, centerId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// BW-002: 회원 game 한도 검증 (멤버십 등급별 일일 game 횟수 제한)
// (ThresholdCheck detector — F561 Path B var-vs-var, gameLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyGameLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  gameCount: number,
): { memberId: string; membershipId: string; gameLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, game_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; game_limit: number } | undefined;

  if (!membership) throw new BowlingError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F561 Path B: var-vs-var, left=`gameLimit` (`limit` keyword 매칭)
  const gameLimit = membership.game_limit;

  if (membership.daily_used + gameCount >= gameLimit) {
    throw new BowlingError(
      'E422-GAME-LIMIT-EXCEEDED',
      `Membership game quota exhausted (${membership.daily_used + gameCount} >= ${gameLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(gameCount, membershipId);

  return { memberId, membershipId, gameLimit, approved: true };
}

// ---------------------------------------------------------------------------
// BW-003: lane 예약 atomic — bowling_sessions + lane_schedules + session_payments + frame_scores 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processLaneBooking(
  db: Database.Database,
  centerId: string,
  sessionId: string,
  laneNumber: string,
  gameCount: number,
  shoeSize: string,
  startTime: string,
  endTime: string,
  amount: number,
): { scheduleId: string; paymentId: string; sessionId: string; centerId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM bowling_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new BowlingError('E404-SESSION', 'Reserved session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO lane_schedules (id, center_id, session_id, lane_number, game_count, shoe_size, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, centerId, sessionId, laneNumber, gameCount, shoeSize, startTime, endTime);

    db.prepare(`
      UPDATE bowling_sessions SET status = 'started', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);

    db.prepare(`
      INSERT INTO frame_scores (id, session_id, lane_number, frame_number, score, created_at)
      VALUES (?, ?, ?, 0, 0, ?)
    `).run(randomUUID(), sessionId, laneNumber, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, sessionId, centerId, bookedAt };
}

// ---------------------------------------------------------------------------
// BW-004: session 상태 전환 (reserved → started → completed / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'started' | 'completed' | 'closed' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM bowling_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new BowlingError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'started') ||
    (session.status === 'started' && newStatus === 'completed') ||
    (session.status === 'started' && newStatus === 'closed') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'started' && newStatus === 'cancelled');

  if (!allowed) {
    throw new BowlingError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE bowling_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// BW-005: closed session 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../CA-005 81번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM bowling_sessions
      WHERE status = 'closed'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE bowling_sessions
      SET status = 'completed'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// BW-006: session 환불 atomic — 리그/단체 환불 정책 + 취소 수수료 트랜잭션
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
    .prepare("SELECT status FROM bowling_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new BowlingError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(sessionCost * (1 - cancellationRate) * 100) / 100;
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
export class BowlingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BowlingError';
  }
}
