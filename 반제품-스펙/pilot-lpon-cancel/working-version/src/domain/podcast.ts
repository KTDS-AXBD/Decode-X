import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PC (PC-001~PC-006): Podcast 합성 도메인 — 62번째 도메인 (팟캐스트 산업, 51번째 신규 산업)
//   - podcast spec-container rules.md 기반 PoC source
//   - 합성 schema: hosts, listener_contracts, episode_publishes, episode_distributions,
//                  ad_insertions, listener_refund_records, listener_refunds
//   - 팟캐스트 lifecycle 패턴 — 호스트episode한도/청취자daily한도/배포batchatomic/episode상태전환/만료episode일괄/청취자환불atomic
//   - withRuleId 재사용 62번째 도메인 (신규 detector 0개, 63 Sprint 연속 정점 도전)
//   - PodcastError code-in-message 패턴 (S275 표준)
//   - 51 산업 연속 0 ABSENCE 도전 (..+VD+SM+NW+BR+ER+PC)
//   - 51번째 신규 산업 마일스톤 (podcast 추가, 디지털 콘텐츠 10-클러스터: MU+PB+AD+GM+VD+SM+NW+BR+ER+PC)
//   - 거울 변환 15회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast)
// ---------------------------------------------------------------------------

export interface HostRow {
  id: string;
  name: string;
  total_capacity: number;
  active_published_episodes: number;
  status: string; // active | suspended | retired
}

export interface ListenerContractRow {
  id: string;
  listener_id: string;
  host_id: string;
  tier_code: string; // free | basic | premium | super-fan
  listen_limit: number;
  listen_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface EpisodePublishRow {
  id: string;
  host_id: string;
  contract_id: string;
  episode_distribution_id: string | null;
  ad_insertion_id: string | null;
  status: string; // recorded | edited | published | updated | archived | removed
  published_at: string;
}

export interface EpisodeDistributionRow {
  id: string;
  host_id: string;
  publish_id: string;
  distribution_no: string;
  status: string; // live | updated | archived | removed | expired
  started_at: string;
}

export interface ListenerRefundRecordRow {
  id: string;
  listener_id: string;
  episode_distribution_id: string;
  subscription_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_PUBLISHED_EPISODES_PER_HOST = 5000; // PC-001: 호스트별 동시 published episode 한도 (기본값)

// ---------------------------------------------------------------------------
// PC-001: 호스트 동시 published episode 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function publishEpisode(
  db: Database.Database,
  hostId: string,
  contractId: string,
): { publishId: string; hostId: string; contractId: string; publishedAt: string } {
  const host = db
    .prepare('SELECT active_published_episodes, total_capacity FROM hosts WHERE id = ?')
    .get(hostId) as { active_published_episodes: number; total_capacity: number } | undefined;

  if (!host) throw new PodcastError('E404-HOST', 'Host not found', 404);

  const limit = host.total_capacity ?? MAX_CONCURRENT_PUBLISHED_EPISODES_PER_HOST;

  if (host.active_published_episodes >= limit) {
    throw new PodcastError(
      'E422-HOST-CAPACITY-EXCEEDED',
      `Host is at full capacity (${host.active_published_episodes} >= ${limit})`,
      422,
    );
  }

  const publishId = randomUUID();
  const publishedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO episode_publishes (id, host_id, contract_id, episode_distribution_id, ad_insertion_id, status, published_at)
    VALUES (?, ?, ?, NULL, NULL, 'recorded', ?)
  `).run(publishId, hostId, contractId, publishedAt);

  db.prepare(`
    UPDATE hosts SET active_published_episodes = active_published_episodes + 1 WHERE id = ?
  `).run(hostId);

  return { publishId, hostId, contractId, publishedAt };
}

// ---------------------------------------------------------------------------
// PC-002: 청취자 일일 listen 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyListenLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyListenLimit(
  db: Database.Database,
  listenerId: string,
  contractId: string,
  listens: number,
): { listenerId: string; contractId: string; dailyListenLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT listen_used, listen_limit FROM listener_contracts WHERE id = ? AND listener_id = ? LIMIT 1')
    .get(contractId, listenerId) as { listen_used: number; listen_limit: number } | undefined;

  if (!contract) throw new PodcastError('E404-CONTRACT', 'Listener contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyListenLimit` (`limit` keyword 매칭)
  const dailyListenLimit = contract.listen_limit;

  if (contract.listen_used + listens >= dailyListenLimit) {
    throw new PodcastError(
      'E422-DAILY-LISTEN-LIMIT-EXCEEDED',
      `Daily listen quota exhausted (${contract.listen_used + listens} >= ${dailyListenLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE listener_contracts SET listen_used = listen_used + ? WHERE id = ?
  `).run(listens, contractId);

  return { listenerId, contractId, dailyListenLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PC-003: episode 배포 atomic — episode_distributions + episode_publishes 상태전환 + ad_insertions 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processDistribution(
  db: Database.Database,
  hostId: string,
  publishId: string,
  distributionNo: string,
  amount: number,
): { episodeDistributionId: string; adInsertionId: string; publishId: string; hostId: string; startedAt: string } {
  const publish = db
    .prepare("SELECT status FROM episode_publishes WHERE id = ? AND status = 'edited'")
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new PodcastError('E404-PUBLISH', 'Edited episode publish not found', 404);

  const episodeDistributionId = randomUUID();
  const adInsertionId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO episode_distributions (id, host_id, publish_id, distribution_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(episodeDistributionId, hostId, publishId, distributionNo, startedAt);

    db.prepare(`
      UPDATE episode_publishes SET status = 'published', episode_distribution_id = ?, ad_insertion_id = ? WHERE id = ?
    `).run(episodeDistributionId, adInsertionId, publishId);

    db.prepare(`
      INSERT INTO ad_insertions (id, publish_id, episode_distribution_id, amount, status, inserted_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(adInsertionId, publishId, episodeDistributionId, amount, startedAt);
  });
  tx();

  return { episodeDistributionId, adInsertionId, publishId, hostId, startedAt };
}

// ---------------------------------------------------------------------------
// PC-004: episode 상태 전환 (recorded → edited → published → updated → archived / removed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionEpisodeStatus(
  db: Database.Database,
  publishId: string,
  newStatus: 'edited' | 'published' | 'updated' | 'archived' | 'removed',
): { publishId: string; previousStatus: string; newStatus: string } {
  const publish = db
    .prepare('SELECT status FROM episode_publishes WHERE id = ?')
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new PodcastError('E404-PUBLISH', 'Episode publish not found', 404);

  const previousStatus = publish.status;
  const allowed =
    (publish.status === 'recorded' && newStatus === 'edited') ||
    (publish.status === 'edited' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'updated') ||
    (publish.status === 'updated' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'archived') ||
    (publish.status === 'updated' && newStatus === 'archived') ||
    (publish.status === 'published' && newStatus === 'removed') ||
    (publish.status === 'updated' && newStatus === 'removed');

  if (!allowed) {
    throw new PodcastError(
      'E409-PUBLISH',
      `Cannot transition episode publish from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE episode_publishes SET status = ? WHERE id = ?`).run(newStatus, publishId);

  return { publishId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PC-005: 만료 removed episode 배포 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, ER-005/BR-005/NW-005/SM-005/VD-005/GM-005 51번째 재사용)
// ---------------------------------------------------------------------------
export function expireRemovedEpisodeBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM episode_distributions
      WHERE status = 'removed'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE episode_distributions
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// PC-006: 청취자 환불 atomic — removed episode 시 청취자 구독료 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processListenerRefund(
  db: Database.Database,
  listenerId: string,
  episodeDistributionId: string,
  subscriptionCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; listenerId: string; refundAmount: number; refundedAt: string } {
  const distribution = db
    .prepare("SELECT status FROM episode_distributions WHERE id = ? AND status = 'removed'")
    .get(episodeDistributionId) as { status: string } | undefined;

  if (!distribution) throw new PodcastError('E404-REMOVED-DISTRIBUTION', 'Removed episode distribution not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(subscriptionCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO listener_refund_records (id, listener_id, episode_distribution_id, subscription_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, listenerId, episodeDistributionId, subscriptionCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO listener_refunds (id, refund_record_id, listener_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, listenerId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE listener_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, listenerId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class PodcastError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PodcastError';
  }
}
