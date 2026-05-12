import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-MU (MU-001~MU-006): Music streaming 합성 도메인 — 51번째 도메인 (음악 스트리밍 산업, 40번째 신규 산업)
//   - music spec-container rules.md 기반 PoC source
//   - 합성 schema: streaming_tiers, royalty_contracts, playback_sessions, track_plays,
//                  royalty_payouts, cancellation_refund_records, cancellation_refunds
//   - 음악 스트리밍 lifecycle 패턴 — 동시스트림한도/로열티수수료한도/재생atomic/세션상태전환/플레이리스트퇴역배치/구독취소환불atomic
//   - withRuleId 재사용 51번째 도메인 (신규 detector 0개, 52 Sprint 연속 정점 도전)
//   - MusicError code-in-message 패턴 (S275 표준)
//   - 40 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU)
//   - 40번째 신규 산업 마일스톤 (music 추가, 디지털 콘텐츠 신규 도메인)
//   - 거울 변환 4회차 (carsharing → fastfood → aerospace → music)
// ---------------------------------------------------------------------------

export interface StreamingTierRow {
  id: string;
  name: string;
  total_capacity: number;
  active_sessions: number;
  status: string; // active | maintenance | retired
}

export interface RoyaltyContractRow {
  id: string;
  artist_id: string;
  streaming_tier_id: string;
  tier_code: string; // free | standard | premium | family
  fee_limit: number;
  fee_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface PlaybackSessionRow {
  id: string;
  streaming_tier_id: string;
  contract_id: string;
  track_play_id: string | null;
  royalty_payout_id: string | null;
  status: string; // pending | confirmed | playing | paused | completed | aborted
  scheduled_at: string;
}

export interface TrackPlayRow {
  id: string;
  streaming_tier_id: string;
  session_id: string;
  track_isrc: string;
  status: string; // playing | completed | expired
  played_at: string;
}

export interface CancellationRefundRecordRow {
  id: string;
  subscriber_id: string;
  track_play_id: string;
  subscription_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_SESSIONS_PER_TIER = 50; // MU-001: 음악 스트리밍 티어별 동시 세션 정원 한도 (개, 기본값)

// ---------------------------------------------------------------------------
// MU-001: 음악 스트리밍 티어 동시 세션 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function startStream(
  db: Database.Database,
  streamingTierId: string,
  contractId: string,
): { sessionId: string; streamingTierId: string; contractId: string; scheduledAt: string } {
  const tier = db
    .prepare('SELECT active_sessions, total_capacity FROM streaming_tiers WHERE id = ?')
    .get(streamingTierId) as { active_sessions: number; total_capacity: number } | undefined;

  if (!tier) throw new MusicError('E404-STREAMING-TIER', 'Streaming tier not found', 404);

  const limit = tier.total_capacity ?? MAX_CONCURRENT_SESSIONS_PER_TIER;

  if (tier.active_sessions >= limit) {
    throw new MusicError(
      'E422-STREAMING-TIER-CAPACITY-EXCEEDED',
      `Streaming tier is at full capacity (${tier.active_sessions} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO playback_sessions (id, streaming_tier_id, contract_id, track_play_id, royalty_payout_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'pending', ?)
  `).run(sessionId, streamingTierId, contractId, scheduledAt);

  db.prepare(`
    UPDATE streaming_tiers SET active_sessions = active_sessions + 1 WHERE id = ?
  `).run(streamingTierId);

  return { sessionId, streamingTierId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// MU-002: 아티스트 로열티 수수료 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, royaltyPayoutLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyRoyaltyTier(
  db: Database.Database,
  artistId: string,
  contractId: string,
  fee: number,
): { artistId: string; contractId: string; royaltyPayoutLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT fee_used, fee_limit FROM royalty_contracts WHERE id = ? AND artist_id = ? LIMIT 1')
    .get(contractId, artistId) as { fee_used: number; fee_limit: number } | undefined;

  if (!contract) throw new MusicError('E404-CONTRACT', 'Royalty contract not found', 404);

  // F445 Path B: var-vs-var, left=`royaltyPayoutLimit` (`limit` keyword 매칭)
  const royaltyPayoutLimit = contract.fee_limit;

  if (contract.fee_used + fee >= royaltyPayoutLimit) {
    throw new MusicError(
      'E422-ROYALTY-PAYOUT-LIMIT-EXCEEDED',
      `Royalty payout quota exhausted (${contract.fee_used + fee} >= ${royaltyPayoutLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE royalty_contracts SET fee_used = fee_used + ? WHERE id = ?
  `).run(fee, contractId);

  return { artistId, contractId, royaltyPayoutLimit, approved: true };
}

// ---------------------------------------------------------------------------
// MU-003: 트랙 재생 atomic — track_plays + playback_sessions 상태전환 + royalty_payouts 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function playTrack(
  db: Database.Database,
  streamingTierId: string,
  sessionId: string,
  trackIsrc: string,
  amount: number,
): { trackPlayId: string; royaltyPayoutId: string; sessionId: string; streamingTierId: string; playedAt: string } {
  const session = db
    .prepare("SELECT status FROM playback_sessions WHERE id = ? AND status = 'confirmed'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new MusicError('E404-SESSION', 'Confirmed playback session not found', 404);

  const trackPlayId = randomUUID();
  const royaltyPayoutId = randomUUID();
  const playedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO track_plays (id, streaming_tier_id, session_id, track_isrc, status, played_at)
      VALUES (?, ?, ?, ?, 'playing', ?)
    `).run(trackPlayId, streamingTierId, sessionId, trackIsrc, playedAt);

    db.prepare(`
      UPDATE playback_sessions SET status = 'playing', track_play_id = ?, royalty_payout_id = ? WHERE id = ?
    `).run(trackPlayId, royaltyPayoutId, sessionId);

    db.prepare(`
      INSERT INTO royalty_payouts (id, session_id, track_play_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(royaltyPayoutId, sessionId, trackPlayId, amount, playedAt);
  });
  tx();

  return { trackPlayId, royaltyPayoutId, sessionId, streamingTierId, playedAt };
}

// ---------------------------------------------------------------------------
// MU-004: 재생 세션 상태 전환 (pending → confirmed → playing → paused → completed/aborted)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'confirmed' | 'playing' | 'paused' | 'completed' | 'aborted',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM playback_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new MusicError('E404-SESSION', 'Playback session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'pending' && newStatus === 'confirmed') ||
    (session.status === 'confirmed' && newStatus === 'playing') ||
    (session.status === 'playing' && newStatus === 'paused') ||
    (session.status === 'playing' && newStatus === 'completed') ||
    (session.status === 'paused' && newStatus === 'playing') ||
    (session.status === 'pending' && newStatus === 'aborted') ||
    (session.status === 'confirmed' && newStatus === 'aborted');

  if (!allowed) {
    throw new MusicError(
      'E409-SESSION',
      `Cannot transition playback session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE playback_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// MU-005: 만료 트랙 플레이 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, AS-005/FS-005/CS-005/PK-005/GY-005/VT-005 40번째 재사용)
// ---------------------------------------------------------------------------
export function expireTrackPlayBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM track_plays
      WHERE status = 'completed'
        AND played_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE track_plays
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// MU-006: 구독 취소 환불 atomic — 구독비용 + 환불비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCancellationRefund(
  db: Database.Database,
  subscriberId: string,
  trackPlayId: string,
  subscriptionCost: number,
  refundRate: number,
): { cancellationRefundId: string; refundId: string; subscriberId: string; refundAmount: number; refundedAt: string } {
  const trackPlay = db
    .prepare("SELECT status FROM track_plays WHERE id = ? AND status = 'playing'")
    .get(trackPlayId) as { status: string } | undefined;

  if (!trackPlay) throw new MusicError('E404-PLAYING-TRACK', 'Playing track play not found', 404);

  const cancellationRefundId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(subscriptionCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancellation_refund_records (id, subscriber_id, track_play_id, subscription_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(cancellationRefundId, subscriberId, trackPlayId, subscriptionCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO cancellation_refunds (id, cancellation_refund_id, subscriber_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, cancellationRefundId, subscriberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE cancellation_refund_records SET status = 'refunded' WHERE id = ?
    `).run(cancellationRefundId);
  });
  tx();

  return { cancellationRefundId, refundId, subscriberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class MusicError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'MusicError';
  }
}
