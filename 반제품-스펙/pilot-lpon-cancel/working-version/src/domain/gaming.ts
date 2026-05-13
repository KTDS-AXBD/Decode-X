import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-GM (GM-001~GM-006): Gaming 합성 도메인 — 56번째 도메인 (게임 산업, 45번째 신규 산업)
//   - gaming spec-container rules.md 기반 PoC source
//   - 합성 schema: studios, store_contracts, game_launches, game_sessions,
//                  store_payments, refund_claim_records, refund_claims
//   - 게임 lifecycle 패턴 — 스튜디오라이브한도/인앱결제한도/세션batchatomic/게임상태전환/만료게임일괄/환불atomic
//   - withRuleId 재사용 56번째 도메인 (신규 detector 0개, 57 Sprint 연속 정점 도전)
//   - GamingError code-in-message 패턴 (S275 표준)
//   - 45 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM)
//   - 45번째 신규 산업 마일스톤 (gaming 추가, 디지털 콘텐츠 4-클러스터: MU+PB+AD+GM)
//   - 거울 변환 9회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming)
// ---------------------------------------------------------------------------

export interface StudioRow {
  id: string;
  name: string;
  total_capacity: number;
  active_live_games: number;
  status: string; // active | suspended | retired
}

export interface StoreContractRow {
  id: string;
  player_id: string;
  studio_id: string;
  tier_code: string; // free | premium | vip | whale
  fee_limit: number;
  fee_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface GameLaunchRow {
  id: string;
  studio_id: string;
  contract_id: string;
  game_session_id: string | null;
  store_payment_id: string | null;
  status: string; // registered | published | live | maintained | retired | banned
  launched_at: string;
}

export interface GameSessionRow {
  id: string;
  studio_id: string;
  launch_id: string;
  match_no: string;
  status: string; // live | maintained | retired | banned | expired
  started_at: string;
}

export interface RefundClaimRecordRow {
  id: string;
  player_id: string;
  game_session_id: string;
  purchase_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_LIVE_GAMES_PER_STUDIO = 250; // GM-001: 스튜디오별 동시 라이브 게임 한도 (기본값)

// ---------------------------------------------------------------------------
// GM-001: 스튜디오 동시 라이브 게임 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function launchGame(
  db: Database.Database,
  studioId: string,
  contractId: string,
): { launchId: string; studioId: string; contractId: string; launchedAt: string } {
  const studio = db
    .prepare('SELECT active_live_games, total_capacity FROM studios WHERE id = ?')
    .get(studioId) as { active_live_games: number; total_capacity: number } | undefined;

  if (!studio) throw new GamingError('E404-STUDIO', 'Studio not found', 404);

  const limit = studio.total_capacity ?? MAX_CONCURRENT_LIVE_GAMES_PER_STUDIO;

  if (studio.active_live_games >= limit) {
    throw new GamingError(
      'E422-STUDIO-CAPACITY-EXCEEDED',
      `Studio is at full capacity (${studio.active_live_games} >= ${limit})`,
      422,
    );
  }

  const launchId = randomUUID();
  const launchedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO game_launches (id, studio_id, contract_id, game_session_id, store_payment_id, status, launched_at)
    VALUES (?, ?, ?, NULL, NULL, 'registered', ?)
  `).run(launchId, studioId, contractId, launchedAt);

  db.prepare(`
    UPDATE studios SET active_live_games = active_live_games + 1 WHERE id = ?
  `).run(studioId);

  return { launchId, studioId, contractId, launchedAt };
}

// ---------------------------------------------------------------------------
// GM-002: 플레이어 인앱 결제 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, inAppPaymentLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyInAppPurchase(
  db: Database.Database,
  playerId: string,
  contractId: string,
  fee: number,
): { playerId: string; contractId: string; inAppPaymentLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT fee_used, fee_limit FROM store_contracts WHERE id = ? AND player_id = ? LIMIT 1')
    .get(contractId, playerId) as { fee_used: number; fee_limit: number } | undefined;

  if (!contract) throw new GamingError('E404-CONTRACT', 'Store contract not found', 404);

  // F445 Path B: var-vs-var, left=`inAppPaymentLimit` (`limit` keyword 매칭)
  const inAppPaymentLimit = contract.fee_limit;

  if (contract.fee_used + fee >= inAppPaymentLimit) {
    throw new GamingError(
      'E422-IN-APP-PAYMENT-LIMIT-EXCEEDED',
      `In-app payment quota exhausted (${contract.fee_used + fee} >= ${inAppPaymentLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE store_contracts SET fee_used = fee_used + ? WHERE id = ?
  `).run(fee, contractId);

  return { playerId, contractId, inAppPaymentLimit, approved: true };
}

// ---------------------------------------------------------------------------
// GM-003: 게임 세션 atomic — game_sessions + game_launches 상태전환 + store_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processGameSession(
  db: Database.Database,
  studioId: string,
  launchId: string,
  matchNo: string,
  amount: number,
): { gameSessionId: string; storePaymentId: string; launchId: string; studioId: string; startedAt: string } {
  const launch = db
    .prepare("SELECT status FROM game_launches WHERE id = ? AND status = 'published'")
    .get(launchId) as { status: string } | undefined;

  if (!launch) throw new GamingError('E404-LAUNCH', 'Published game launch not found', 404);

  const gameSessionId = randomUUID();
  const storePaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO game_sessions (id, studio_id, launch_id, match_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(gameSessionId, studioId, launchId, matchNo, startedAt);

    db.prepare(`
      UPDATE game_launches SET status = 'live', game_session_id = ?, store_payment_id = ? WHERE id = ?
    `).run(gameSessionId, storePaymentId, launchId);

    db.prepare(`
      INSERT INTO store_payments (id, launch_id, game_session_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(storePaymentId, launchId, gameSessionId, amount, startedAt);
  });
  tx();

  return { gameSessionId, storePaymentId, launchId, studioId, startedAt };
}

// ---------------------------------------------------------------------------
// GM-004: 게임 상태 전환 (registered → published → live → maintained → retired/banned)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionGameStatus(
  db: Database.Database,
  launchId: string,
  newStatus: 'published' | 'live' | 'maintained' | 'retired' | 'banned',
): { launchId: string; previousStatus: string; newStatus: string } {
  const launch = db
    .prepare('SELECT status FROM game_launches WHERE id = ?')
    .get(launchId) as { status: string } | undefined;

  if (!launch) throw new GamingError('E404-LAUNCH', 'Game launch not found', 404);

  const previousStatus = launch.status;
  const allowed =
    (launch.status === 'registered' && newStatus === 'published') ||
    (launch.status === 'published' && newStatus === 'live') ||
    (launch.status === 'live' && newStatus === 'maintained') ||
    (launch.status === 'maintained' && newStatus === 'live') ||
    (launch.status === 'live' && newStatus === 'retired') ||
    (launch.status === 'maintained' && newStatus === 'retired') ||
    (launch.status === 'live' && newStatus === 'banned') ||
    (launch.status === 'published' && newStatus === 'banned');

  if (!allowed) {
    throw new GamingError(
      'E409-LAUNCH',
      `Cannot transition game launch from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE game_launches SET status = ? WHERE id = ?`).run(newStatus, launchId);

  return { launchId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// GM-005: 만료 retired 게임 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SH-005/MU-005/PB-005/TX-005/AD-005 45번째 재사용)
// ---------------------------------------------------------------------------
export function expireRetiredGameBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM game_sessions
      WHERE status = 'retired'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE game_sessions
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// GM-006: 환불 atomic — 인앱 결제 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processRefundClaim(
  db: Database.Database,
  playerId: string,
  gameSessionId: string,
  purchaseCost: number,
  refundRate: number,
): { refundClaimId: string; refundId: string; playerId: string; refundAmount: number; refundedAt: string } {
  const gameSession = db
    .prepare("SELECT status FROM game_sessions WHERE id = ? AND status = 'banned'")
    .get(gameSessionId) as { status: string } | undefined;

  if (!gameSession) throw new GamingError('E404-BANNED-SESSION', 'Banned game session not found', 404);

  const refundClaimId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(purchaseCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO refund_claim_records (id, player_id, game_session_id, purchase_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundClaimId, playerId, gameSessionId, purchaseCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO refund_claims (id, refund_claim_id, player_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundClaimId, playerId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE refund_claim_records SET status = 'refunded' WHERE id = ?
    `).run(refundClaimId);
  });
  tx();

  return { refundClaimId, refundId, playerId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class GamingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'GamingError';
  }
}
