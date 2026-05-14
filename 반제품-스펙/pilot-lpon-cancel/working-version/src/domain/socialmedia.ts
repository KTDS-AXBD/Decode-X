import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-SM (SM-001~SM-006): SocialMedia 합성 도메인 — 58번째 도메인 (소셜미디어 산업, 47번째 신규 산업)
//   - socialmedia spec-container rules.md 기반 PoC source
//   - 합성 schema: accounts, monetization_contracts, post_publishes, post_feeds,
//                  ad_distributions, creator_payout_clawback_records, creator_payout_clawbacks
//   - 소셜미디어 lifecycle 패턴 — 계정post한도/일일monetization한도/피드batchatomic/post상태전환/만료post일괄/크리에이터payout회수atomic
//   - withRuleId 재사용 58번째 도메인 (신규 detector 0개, 59 Sprint 연속 정점 도전)
//   - SocialMediaError code-in-message 패턴 (S275 표준)
//   - 47 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD+SM)
//   - 47번째 신규 산업 마일스톤 (socialmedia 추가, 디지털 콘텐츠 6-클러스터: MU+PB+AD+GM+VD+SM)
//   - 거울 변환 11회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia)
// ---------------------------------------------------------------------------

export interface AccountRow {
  id: string;
  handle: string;
  total_capacity: number;
  active_published_posts: number;
  status: string; // active | suspended | retired
}

export interface MonetizationContractRow {
  id: string;
  creator_id: string;
  account_id: string;
  tier_code: string; // free | basic | partner | premium
  monetization_limit: number;
  monetization_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface PostPublishRow {
  id: string;
  account_id: string;
  contract_id: string;
  post_feed_id: string | null;
  ad_distribution_id: string | null;
  status: string; // draft | reviewed | published | restricted | archived | reported | removed
  published_at: string;
}

export interface PostFeedRow {
  id: string;
  account_id: string;
  publish_id: string;
  feed_no: string;
  status: string; // live | restricted | archived | reported | removed | expired
  started_at: string;
}

export interface CreatorPayoutClawbackRecordRow {
  id: string;
  creator_id: string;
  post_feed_id: string;
  payout_cost: number;
  clawback_rate: number;
  clawback_amount: number;
  status: string; // pending | calculated | clawed_back
}

const MAX_CONCURRENT_ACTIVE_POSTS_PER_ACCOUNT = 10000; // SM-001: 계정별 동시 active post 한도 (기본값)

// ---------------------------------------------------------------------------
// SM-001: 계정 동시 active post 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function publishPost(
  db: Database.Database,
  accountId: string,
  contractId: string,
): { publishId: string; accountId: string; contractId: string; publishedAt: string } {
  const account = db
    .prepare('SELECT active_published_posts, total_capacity FROM accounts WHERE id = ?')
    .get(accountId) as { active_published_posts: number; total_capacity: number } | undefined;

  if (!account) throw new SocialMediaError('E404-ACCOUNT', 'Account not found', 404);

  const limit = account.total_capacity ?? MAX_CONCURRENT_ACTIVE_POSTS_PER_ACCOUNT;

  if (account.active_published_posts >= limit) {
    throw new SocialMediaError(
      'E422-ACCOUNT-CAPACITY-EXCEEDED',
      `Account is at full capacity (${account.active_published_posts} >= ${limit})`,
      422,
    );
  }

  const publishId = randomUUID();
  const publishedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO post_publishes (id, account_id, contract_id, post_feed_id, ad_distribution_id, status, published_at)
    VALUES (?, ?, ?, NULL, NULL, 'draft', ?)
  `).run(publishId, accountId, contractId, publishedAt);

  db.prepare(`
    UPDATE accounts SET active_published_posts = active_published_posts + 1 WHERE id = ?
  `).run(accountId);

  return { publishId, accountId, contractId, publishedAt };
}

// ---------------------------------------------------------------------------
// SM-002: 크리에이터 일일 monetization 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyMonetizationLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyMonetizationLimit(
  db: Database.Database,
  creatorId: string,
  contractId: string,
  earnings: number,
): { creatorId: string; contractId: string; dailyMonetizationLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT monetization_used, monetization_limit FROM monetization_contracts WHERE id = ? AND creator_id = ? LIMIT 1')
    .get(contractId, creatorId) as { monetization_used: number; monetization_limit: number } | undefined;

  if (!contract) throw new SocialMediaError('E404-CONTRACT', 'Monetization contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyMonetizationLimit` (`limit` keyword 매칭)
  const dailyMonetizationLimit = contract.monetization_limit;

  if (contract.monetization_used + earnings >= dailyMonetizationLimit) {
    throw new SocialMediaError(
      'E422-DAILY-MONETIZATION-LIMIT-EXCEEDED',
      `Daily monetization quota exhausted (${contract.monetization_used + earnings} >= ${dailyMonetizationLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE monetization_contracts SET monetization_used = monetization_used + ? WHERE id = ?
  `).run(earnings, contractId);

  return { creatorId, contractId, dailyMonetizationLimit, approved: true };
}

// ---------------------------------------------------------------------------
// SM-003: post 피드 atomic — post_feeds + post_publishes 상태전환 + ad_distributions 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processFeedDistribution(
  db: Database.Database,
  accountId: string,
  publishId: string,
  feedNo: string,
  amount: number,
): { postFeedId: string; adDistributionId: string; publishId: string; accountId: string; startedAt: string } {
  const publish = db
    .prepare("SELECT status FROM post_publishes WHERE id = ? AND status = 'reviewed'")
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new SocialMediaError('E404-PUBLISH', 'Reviewed post publish not found', 404);

  const postFeedId = randomUUID();
  const adDistributionId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO post_feeds (id, account_id, publish_id, feed_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(postFeedId, accountId, publishId, feedNo, startedAt);

    db.prepare(`
      UPDATE post_publishes SET status = 'published', post_feed_id = ?, ad_distribution_id = ? WHERE id = ?
    `).run(postFeedId, adDistributionId, publishId);

    db.prepare(`
      INSERT INTO ad_distributions (id, publish_id, post_feed_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(adDistributionId, publishId, postFeedId, amount, startedAt);
  });
  tx();

  return { postFeedId, adDistributionId, publishId, accountId, startedAt };
}

// ---------------------------------------------------------------------------
// SM-004: post 상태 전환 (draft → reviewed → published → restricted → archived / reported / removed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionPostStatus(
  db: Database.Database,
  publishId: string,
  newStatus: 'reviewed' | 'published' | 'restricted' | 'archived' | 'reported' | 'removed',
): { publishId: string; previousStatus: string; newStatus: string } {
  const publish = db
    .prepare('SELECT status FROM post_publishes WHERE id = ?')
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new SocialMediaError('E404-PUBLISH', 'Post publish not found', 404);

  const previousStatus = publish.status;
  const allowed =
    (publish.status === 'draft' && newStatus === 'reviewed') ||
    (publish.status === 'reviewed' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'restricted') ||
    (publish.status === 'restricted' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'archived') ||
    (publish.status === 'restricted' && newStatus === 'archived') ||
    (publish.status === 'published' && newStatus === 'reported') ||
    (publish.status === 'reviewed' && newStatus === 'reported') ||
    (publish.status === 'reported' && newStatus === 'removed');

  if (!allowed) {
    throw new SocialMediaError(
      'E409-PUBLISH',
      `Cannot transition post publish from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE post_publishes SET status = ? WHERE id = ?`).run(newStatus, publishId);

  return { publishId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// SM-005: 만료 removed post batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, VD-005/GM-005/AD-005/TX-005/PB-005 47번째 재사용)
// ---------------------------------------------------------------------------
export function expireRemovedPostBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM post_feeds
      WHERE status = 'removed'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE post_feeds
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// SM-006: 크리에이터 payout 회수 atomic — 콘텐츠 정책 위반 시 payout 비용 + 회수 비율 + 회수 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCreatorClawback(
  db: Database.Database,
  creatorId: string,
  postFeedId: string,
  payoutCost: number,
  clawbackRate: number,
): { clawbackRecordId: string; clawbackId: string; creatorId: string; clawbackAmount: number; clawedBackAt: string } {
  const postFeed = db
    .prepare("SELECT status FROM post_feeds WHERE id = ? AND status = 'removed'")
    .get(postFeedId) as { status: string } | undefined;

  if (!postFeed) throw new SocialMediaError('E404-REMOVED-FEED', 'Removed post feed not found', 404);

  const clawbackRecordId = randomUUID();
  const clawbackId = randomUUID();
  const clawbackAmount = Math.round(payoutCost * clawbackRate * 100) / 100;
  const clawedBackAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO creator_payout_clawback_records (id, creator_id, post_feed_id, payout_cost, clawback_rate, clawback_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(clawbackRecordId, creatorId, postFeedId, payoutCost, clawbackRate, clawbackAmount);

    db.prepare(`
      INSERT INTO creator_payout_clawbacks (id, clawback_record_id, creator_id, amount, status, clawed_back_at)
      VALUES (?, ?, ?, ?, 'clawed_back', ?)
    `).run(clawbackId, clawbackRecordId, creatorId, clawbackAmount, clawedBackAt);

    db.prepare(`
      UPDATE creator_payout_clawback_records SET status = 'clawed_back' WHERE id = ?
    `).run(clawbackRecordId);
  });
  tx();

  return { clawbackRecordId, clawbackId, creatorId, clawbackAmount, clawedBackAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class SocialMediaError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SocialMediaError';
  }
}
