import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-GA (GA-001~GA-006): Gambling 합성 도메인 — 65번째 도메인 (카지노/베팅 산업, 54번째 신규 산업)
//   - gambling spec-container rules.md 기반 PoC source
//   - 합성 schema: casinos, player_contracts, game_schedules, bets,
//                  wager_payments, wager_refund_records, wager_refunds
//   - 베팅 lifecycle 패턴 — 카지노bet한도/playerdailybet한도/정산batchatomic/bet상태전환/만료voidedbet일괄/wager환불atomic
//   - withRuleId 재사용 65번째 도메인 (신규 detector 0개, 66 Sprint 연속 정점 도전)
//   - GamblingError code-in-message 패턴 (S275 표준)
//   - 54 산업 연속 0 ABSENCE 도전 (..+NW+BR+ER+PC+RA+AR+GA)
//   - 65번째 도메인 마일스톤 (gambling 추가, GM+GA 게임엔터 2-클러스터 신규 형성)
//   - 거울 변환 18회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling)
//   - 🎮 게임엔터 2-클러스터 (GM 게임 in-app purchase + GA 카지노/베팅 payout 통합 추상화)
// ---------------------------------------------------------------------------

export interface CasinoRow {
  id: string;
  name: string;
  total_capacity: number;
  active_bets: number;
  status: string; // active | suspended | retired
}

export interface PlayerContractRow {
  id: string;
  player_id: string;
  casino_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  bet_limit: number;
  bet_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface GameScheduleRow {
  id: string;
  casino_id: string;
  contract_id: string;
  bet_id: string | null;
  wager_payment_id: string | null;
  status: string; // placed | active | updated | settled | voided | cancelled
  scheduled_at: string;
}

export interface BetRow {
  id: string;
  casino_id: string;
  schedule_id: string;
  bet_no: string;
  status: string; // active | updated | settled | voided | cancelled | expired
  started_at: string;
}

export interface WagerRefundRecordRow {
  id: string;
  player_id: string;
  bet_id: string;
  wager_amount: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_BETS_PER_CASINO = 200; // GA-001: 카지노별 동시 active bet 한도 (기본값, 일반 카지노 테이블/슬롯 동시 진행 가능 베팅 수)

// ---------------------------------------------------------------------------
// GA-001: 카지노 동시 active bet 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function placeBet(
  db: Database.Database,
  casinoId: string,
  contractId: string,
): { scheduleId: string; casinoId: string; contractId: string; scheduledAt: string } {
  const casino = db
    .prepare('SELECT active_bets, total_capacity FROM casinos WHERE id = ?')
    .get(casinoId) as { active_bets: number; total_capacity: number } | undefined;

  if (!casino) throw new GamblingError('E404-CASINO', 'Casino not found', 404);

  const limit = casino.total_capacity ?? MAX_CONCURRENT_ACTIVE_BETS_PER_CASINO;

  if (casino.active_bets >= limit) {
    throw new GamblingError(
      'E422-CASINO-CAPACITY-EXCEEDED',
      `Casino is at full capacity (${casino.active_bets} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO game_schedules (id, casino_id, contract_id, bet_id, wager_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'placed', ?)
  `).run(scheduleId, casinoId, contractId, scheduledAt);

  db.prepare(`
    UPDATE casinos SET active_bets = active_bets + 1 WHERE id = ?
  `).run(casinoId);

  return { scheduleId, casinoId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// GA-002: 플레이어 일일 bet 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyBetLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyBetLimit(
  db: Database.Database,
  playerId: string,
  contractId: string,
  bet: number,
): { playerId: string; contractId: string; dailyBetLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT bet_used, bet_limit FROM player_contracts WHERE id = ? AND player_id = ? LIMIT 1')
    .get(contractId, playerId) as { bet_used: number; bet_limit: number } | undefined;

  if (!contract) throw new GamblingError('E404-CONTRACT', 'Player contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyBetLimit` (`limit` keyword 매칭)
  const dailyBetLimit = contract.bet_limit;

  if (contract.bet_used + bet >= dailyBetLimit) {
    throw new GamblingError(
      'E422-DAILY-BET-LIMIT-EXCEEDED',
      `Daily bet quota exhausted (${contract.bet_used + bet} >= ${dailyBetLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE player_contracts SET bet_used = bet_used + ? WHERE id = ?
  `).run(bet, contractId);

  return { playerId, contractId, dailyBetLimit, approved: true };
}

// ---------------------------------------------------------------------------
// GA-003: bet 정산 atomic — bets + game_schedules 상태전환 + wager_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBetSettlement(
  db: Database.Database,
  casinoId: string,
  scheduleId: string,
  betNo: string,
  amount: number,
): { betId: string; wagerPaymentId: string; scheduleId: string; casinoId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM game_schedules WHERE id = ? AND status = 'placed'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new GamblingError('E404-SCHEDULE', 'Placed bet not found', 404);

  const betId = randomUUID();
  const wagerPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO bets (id, casino_id, schedule_id, bet_no, status, started_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(betId, casinoId, scheduleId, betNo, startedAt);

    db.prepare(`
      UPDATE game_schedules SET status = 'active', bet_id = ?, wager_payment_id = ? WHERE id = ?
    `).run(betId, wagerPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO wager_payments (id, schedule_id, bet_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(wagerPaymentId, scheduleId, betId, amount, startedAt);
  });
  tx();

  return { betId, wagerPaymentId, scheduleId, casinoId, startedAt };
}

// ---------------------------------------------------------------------------
// GA-004: bet 상태 전환 (placed → active → updated → settled / voided / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionBetStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'active' | 'updated' | 'settled' | 'voided' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM game_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new GamblingError('E404-SCHEDULE', 'Game schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'placed' && newStatus === 'active') ||
    (schedule.status === 'active' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'active') ||
    (schedule.status === 'active' && newStatus === 'settled') ||
    (schedule.status === 'updated' && newStatus === 'settled') ||
    (schedule.status === 'placed' && newStatus === 'voided') ||
    (schedule.status === 'active' && newStatus === 'voided') ||
    (schedule.status === 'placed' && newStatus === 'cancelled') ||
    (schedule.status === 'active' && newStatus === 'cancelled');

  if (!allowed) {
    throw new GamblingError(
      'E409-SCHEDULE',
      `Cannot transition game schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE game_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// GA-005: 만료 voided bet batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 54번째 재사용)
// ---------------------------------------------------------------------------
export function expireVoidedBetBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM bets
      WHERE status = 'voided'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE bets
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// GA-006: wager 환불 atomic — voided bet 시 wager 금액 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processWagerRefund(
  db: Database.Database,
  playerId: string,
  betId: string,
  wagerAmount: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; playerId: string; refundAmount: number; refundedAt: string } {
  const bet = db
    .prepare("SELECT status FROM bets WHERE id = ? AND status = 'voided'")
    .get(betId) as { status: string } | undefined;

  if (!bet) throw new GamblingError('E404-VOIDED-BET', 'Voided bet not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(wagerAmount * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO wager_refund_records (id, player_id, bet_id, wager_amount, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, playerId, betId, wagerAmount, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO wager_refunds (id, refund_record_id, player_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, playerId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE wager_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, playerId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class GamblingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'GamblingError';
  }
}
