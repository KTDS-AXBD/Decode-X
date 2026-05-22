import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-CA (CA-001~CA-006): Casino 합성 도메인 — 91번째 도메인 (카지노 산업, 80번째 신규 산업) 🎰 단일 클러스터 22 도메인 첫 사례 마일스톤 신기록
//   - casino spec-container rules.md 기반 PoC source
//   - 합성 schema: casino_sessions, gaming_floors, memberships,
//                  table_schedules, session_payments, cashout_records, session_refunds
//   - 카지노 lifecycle 패턴 — 동시세션한도/베팅한도/테이블예약atomic/세션상태전환/closed세션일괄만료/캐시아웃atomic
//   - withRuleId 재사용 91번째 도메인 (신규 detector 0개, 92 Sprint 연속 정점 도전)
//   - CasinoError code-in-message 패턴 (S275 표준)
//   - 80 산업 연속 0 ABSENCE 도전 (..+WB+BC+CO+KR+NC+ST+LS+CA)
//   - 🎰 단일 클러스터 22 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA 오프라인 엔터 22-클러스터)
//   - 🏆 18 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S387 21→S388 22)
//   - 🏆🏆 80 신규 산업 round 마일스톤 (CC~CA 80 신규 산업 0 ABSENCE 연속 정점)
//   - 🏆 withRuleId 92 Sprint 정점 도전 (S264~S388 92 Sprint 누적 정점)
//   - 거울 변환 44회차 (carsharing → ... → studio → lasertag → casino)
//   - Sprint WT autopilot 분리 작업 18회차 (DoD 6축 실감증 9회차 정착 확인)
//   - CA 차별성: GA(일반 도박 betting platform) + NC(나이트클럽 야간 입장 + VIP 테이블) 인접하되 물리 floor 운영 + 칩 ledger + table dealer 스케줄 + credit line/cage + jackpot/페이아웃 + responsible gaming 한도
//   - 동시 한도 20 (floor별 동시 active session, 대형 카지노 floor 기준)
//   - GA(betting payout) vs NC(야간 입장+VIP) vs CA(물리 테이블 + 칩 환금 + jackpot + responsible gaming)
// ---------------------------------------------------------------------------

export interface GamingFloorRow {
  id: string;
  name: string;
  max_concurrent_sessions: number;
  active_sessions: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  floor_id: string;
  membership_type: string; // basic | silver | gold | vip
  betting_limit: number;
  daily_used: number;
  credit_line: number;
  status: string; // active | paused | expired | barred
}

export interface CasinoSessionRow {
  id: string;
  floor_id: string;
  membership_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // registered | seated | playing | cashout | closed | barred
  registered_at: string;
}

export interface TableScheduleRow {
  id: string;
  floor_id: string;
  session_id: string;
  game_type: string;
  table_number: string;
  dealer_id: string;
  start_time: string;
  end_time: string;
  status: string; // confirmed | active | completed | cancelled | expired
}

export interface CashoutRecordRow {
  id: string;
  member_id: string;
  session_id: string;
  chip_amount: number;
  cash_amount: number;
  jackpot_amount: number;
  cashout_rate: number;
  status: string; // pending | calculated | paid
}

const MAX_CONCURRENT_SESSIONS_PER_FLOOR = 20; // CA-001: floor별 동시 active session 한도 (대형 카지노 floor 기준)

// ---------------------------------------------------------------------------
// CA-001: floor별 동시 active session 한도 검증
// (ThresholdCheck detector — F560 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function registerSession(
  db: Database.Database,
  floorId: string,
  membershipId: string,
): { sessionId: string; floorId: string; membershipId: string; registeredAt: string } {
  const floor = db
    .prepare('SELECT active_sessions, max_concurrent_sessions FROM gaming_floors WHERE id = ?')
    .get(floorId) as { active_sessions: number; max_concurrent_sessions: number } | undefined;

  if (!floor) throw new CasinoError('E404-FLOOR', 'Gaming floor not found', 404);

  const limit = floor.max_concurrent_sessions ?? MAX_CONCURRENT_SESSIONS_PER_FLOOR;

  if (floor.active_sessions >= limit) {
    throw new CasinoError(
      'E422-FLOOR-SESSION-LIMIT-EXCEEDED',
      `Floor is at full session capacity (${floor.active_sessions} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const registeredAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO casino_sessions (id, floor_id, membership_id, schedule_id, payment_id, status, registered_at)
    VALUES (?, ?, ?, NULL, NULL, 'registered', ?)
  `).run(sessionId, floorId, membershipId, registeredAt);

  db.prepare(`
    UPDATE gaming_floors SET active_sessions = active_sessions + 1 WHERE id = ?
  `).run(floorId);

  return { sessionId, floorId, membershipId, registeredAt };
}

// ---------------------------------------------------------------------------
// CA-002: 회원 베팅 한도 검증 (멤버십 등급별 일일 베팅 및 credit line 제한)
// (ThresholdCheck detector — F560 Path B var-vs-var, bettingLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyBettingLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  betAmount: number,
): { memberId: string; membershipId: string; bettingLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, betting_limit, credit_line FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; betting_limit: number; credit_line: number } | undefined;

  if (!membership) throw new CasinoError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F560 Path B: var-vs-var, left=`bettingLimit` (`limit` keyword 매칭)
  const bettingLimit = membership.betting_limit;

  if (membership.daily_used + betAmount >= bettingLimit) {
    throw new CasinoError(
      'E422-BETTING-LIMIT-EXCEEDED',
      `Membership betting quota exhausted (${membership.daily_used + betAmount} >= ${bettingLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(betAmount, membershipId);

  return { memberId, membershipId, bettingLimit, approved: true };
}

// ---------------------------------------------------------------------------
// CA-003: 테이블 예약 atomic — casino_sessions + table_schedules + session_payments + chip_ledger 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTableBooking(
  db: Database.Database,
  floorId: string,
  sessionId: string,
  gameType: string,
  tableNumber: string,
  dealerId: string,
  startTime: string,
  endTime: string,
  amount: number,
): { scheduleId: string; paymentId: string; sessionId: string; floorId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM casino_sessions WHERE id = ? AND status = 'registered'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new CasinoError('E404-SESSION', 'Registered session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO table_schedules (id, floor_id, session_id, game_type, table_number, dealer_id, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, floorId, sessionId, gameType, tableNumber, dealerId, startTime, endTime);

    db.prepare(`
      UPDATE casino_sessions SET status = 'seated', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);

    db.prepare(`
      INSERT INTO chip_ledger (id, session_id, member_id, chip_amount, transaction_type, created_at)
      VALUES (?, ?, (SELECT member_id FROM memberships WHERE id = (SELECT membership_id FROM casino_sessions WHERE id = ?)), ?, 'buy-in', ?)
    `).run(randomUUID(), sessionId, sessionId, amount, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, sessionId, floorId, bookedAt };
}

// ---------------------------------------------------------------------------
// CA-004: session 상태 전환 (registered → seated → playing → cashout / closed / barred)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'seated' | 'playing' | 'cashout' | 'closed' | 'barred',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM casino_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new CasinoError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'registered' && newStatus === 'seated') ||
    (session.status === 'seated' && newStatus === 'playing') ||
    (session.status === 'playing' && newStatus === 'cashout') ||
    (session.status === 'playing' && newStatus === 'closed') ||
    (session.status === 'registered' && newStatus === 'barred') ||
    (session.status === 'seated' && newStatus === 'barred') ||
    (session.status === 'playing' && newStatus === 'barred');

  if (!allowed) {
    throw new CasinoError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE casino_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// CA-005: closed session 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BC-005/CO-005/KR-005/NC-005/ST-005/LS-005 80번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM casino_sessions
      WHERE status = 'closed'
        AND registered_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE casino_sessions
      SET status = 'cashout'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// CA-006: cashout atomic — 칩 현금 교환 + jackpot 페이아웃 정책 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCashout(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  chipAmount: number,
  jackpotAmount: number,
  cashoutRate: number,
): { cashoutRecordId: string; refundId: string; memberId: string; cashAmount: number; cashedOutAt: string } {
  const session = db
    .prepare("SELECT status FROM casino_sessions WHERE id = ? AND status = 'cashout'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new CasinoError('E404-CASHOUT-SESSION', 'Cashout session not found', 404);

  const cashoutRecordId = randomUUID();
  const refundId = randomUUID();
  const cashAmount = Math.round((chipAmount * cashoutRate + jackpotAmount) * 100) / 100;
  const cashedOutAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cashout_records (id, member_id, session_id, chip_amount, cash_amount, jackpot_amount, cashout_rate, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'calculated')
    `).run(cashoutRecordId, memberId, sessionId, chipAmount, cashAmount, jackpotAmount, cashoutRate);

    db.prepare(`
      INSERT INTO session_refunds (id, cashout_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, cashoutRecordId, memberId, cashAmount, cashedOutAt);

    db.prepare(`
      UPDATE cashout_records SET status = 'paid' WHERE id = ?
    `).run(cashoutRecordId);
  });
  tx();

  return { cashoutRecordId, refundId, memberId, cashAmount, cashedOutAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class CasinoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'CasinoError';
  }
}
