import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-NW (NW-001~NW-006): News 합성 도메인 — 59번째 도메인 (뉴스 산업, 48번째 신규 산업)
//   - news spec-container rules.md 기반 PoC source
//   - 합성 schema: publishers, subscription_contracts, article_publishes, article_syndications,
//                  subscription_charges, subscription_refund_records, subscription_refunds
//   - 뉴스 lifecycle 패턴 — 퍼블리셔article한도/구독자daily한도/신디케이션batchatomic/article상태전환/만료article일괄/구독료환불atomic
//   - withRuleId 재사용 59번째 도메인 (신규 detector 0개, 60 Sprint 연속 정점 도전)
//   - NewsError code-in-message 패턴 (S275 표준)
//   - 48 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD+SM+NW)
//   - 48번째 신규 산업 마일스톤 (news 추가, 디지털 콘텐츠 7-클러스터: MU+PB+AD+GM+VD+SM+NW)
//   - 거울 변환 12회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news)
// ---------------------------------------------------------------------------

export interface PublisherRow {
  id: string;
  name: string;
  total_capacity: number;
  active_published_articles: number;
  status: string; // active | suspended | retired
}

export interface SubscriptionContractRow {
  id: string;
  subscriber_id: string;
  publisher_id: string;
  tier_code: string; // free | digital | premium | enterprise
  article_limit: number;
  article_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ArticlePublishRow {
  id: string;
  publisher_id: string;
  contract_id: string;
  article_syndication_id: string | null;
  subscription_charge_id: string | null;
  status: string; // drafted | edited | published | updated | archived | retracted
  published_at: string;
}

export interface ArticleSyndicationRow {
  id: string;
  publisher_id: string;
  publish_id: string;
  syndication_no: string;
  status: string; // live | updated | archived | retracted | expired
  started_at: string;
}

export interface SubscriptionRefundRecordRow {
  id: string;
  subscriber_id: string;
  article_syndication_id: string;
  subscription_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_PUBLISHED_ARTICLES_PER_PUBLISHER = 50000; // NW-001: 퍼블리셔별 동시 published article 한도 (기본값)

// ---------------------------------------------------------------------------
// NW-001: 퍼블리셔 동시 published article 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function publishArticle(
  db: Database.Database,
  publisherId: string,
  contractId: string,
): { publishId: string; publisherId: string; contractId: string; publishedAt: string } {
  const publisher = db
    .prepare('SELECT active_published_articles, total_capacity FROM publishers WHERE id = ?')
    .get(publisherId) as { active_published_articles: number; total_capacity: number } | undefined;

  if (!publisher) throw new NewsError('E404-PUBLISHER', 'Publisher not found', 404);

  const limit = publisher.total_capacity ?? MAX_CONCURRENT_PUBLISHED_ARTICLES_PER_PUBLISHER;

  if (publisher.active_published_articles >= limit) {
    throw new NewsError(
      'E422-PUBLISHER-CAPACITY-EXCEEDED',
      `Publisher is at full capacity (${publisher.active_published_articles} >= ${limit})`,
      422,
    );
  }

  const publishId = randomUUID();
  const publishedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO article_publishes (id, publisher_id, contract_id, article_syndication_id, subscription_charge_id, status, published_at)
    VALUES (?, ?, ?, NULL, NULL, 'drafted', ?)
  `).run(publishId, publisherId, contractId, publishedAt);

  db.prepare(`
    UPDATE publishers SET active_published_articles = active_published_articles + 1 WHERE id = ?
  `).run(publisherId);

  return { publishId, publisherId, contractId, publishedAt };
}

// ---------------------------------------------------------------------------
// NW-002: 구독자 일일 article view 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyArticleLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyArticleQuotaLimit(
  db: Database.Database,
  subscriberId: string,
  contractId: string,
  articles: number,
): { subscriberId: string; contractId: string; dailyArticleLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT article_used, article_limit FROM subscription_contracts WHERE id = ? AND subscriber_id = ? LIMIT 1')
    .get(contractId, subscriberId) as { article_used: number; article_limit: number } | undefined;

  if (!contract) throw new NewsError('E404-CONTRACT', 'Subscription contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyArticleLimit` (`limit` keyword 매칭)
  const dailyArticleLimit = contract.article_limit;

  if (contract.article_used + articles >= dailyArticleLimit) {
    throw new NewsError(
      'E422-DAILY-ARTICLE-LIMIT-EXCEEDED',
      `Daily article quota exhausted (${contract.article_used + articles} >= ${dailyArticleLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE subscription_contracts SET article_used = article_used + ? WHERE id = ?
  `).run(articles, contractId);

  return { subscriberId, contractId, dailyArticleLimit, approved: true };
}

// ---------------------------------------------------------------------------
// NW-003: article 신디케이션 atomic — article_syndications + article_publishes 상태전환 + subscription_charges 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSyndication(
  db: Database.Database,
  publisherId: string,
  publishId: string,
  syndicationNo: string,
  amount: number,
): { articleSyndicationId: string; subscriptionChargeId: string; publishId: string; publisherId: string; startedAt: string } {
  const publish = db
    .prepare("SELECT status FROM article_publishes WHERE id = ? AND status = 'edited'")
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new NewsError('E404-PUBLISH', 'Edited article publish not found', 404);

  const articleSyndicationId = randomUUID();
  const subscriptionChargeId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO article_syndications (id, publisher_id, publish_id, syndication_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(articleSyndicationId, publisherId, publishId, syndicationNo, startedAt);

    db.prepare(`
      UPDATE article_publishes SET status = 'published', article_syndication_id = ?, subscription_charge_id = ? WHERE id = ?
    `).run(articleSyndicationId, subscriptionChargeId, publishId);

    db.prepare(`
      INSERT INTO subscription_charges (id, publish_id, article_syndication_id, amount, status, charged_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(subscriptionChargeId, publishId, articleSyndicationId, amount, startedAt);
  });
  tx();

  return { articleSyndicationId, subscriptionChargeId, publishId, publisherId, startedAt };
}

// ---------------------------------------------------------------------------
// NW-004: article 상태 전환 (drafted → edited → published → updated → archived / retracted)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionArticleStatus(
  db: Database.Database,
  publishId: string,
  newStatus: 'edited' | 'published' | 'updated' | 'archived' | 'retracted',
): { publishId: string; previousStatus: string; newStatus: string } {
  const publish = db
    .prepare('SELECT status FROM article_publishes WHERE id = ?')
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new NewsError('E404-PUBLISH', 'Article publish not found', 404);

  const previousStatus = publish.status;
  const allowed =
    (publish.status === 'drafted' && newStatus === 'edited') ||
    (publish.status === 'edited' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'updated') ||
    (publish.status === 'updated' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'archived') ||
    (publish.status === 'updated' && newStatus === 'archived') ||
    (publish.status === 'published' && newStatus === 'retracted') ||
    (publish.status === 'updated' && newStatus === 'retracted');

  if (!allowed) {
    throw new NewsError(
      'E409-PUBLISH',
      `Cannot transition article publish from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE article_publishes SET status = ? WHERE id = ?`).run(newStatus, publishId);

  return { publishId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// NW-005: 만료 retracted article 신디케이션 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SM-005/VD-005/GM-005/AD-005/TX-005/PB-005 48번째 재사용)
// ---------------------------------------------------------------------------
export function expireRetractedArticleBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM article_syndications
      WHERE status = 'retracted'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE article_syndications
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// NW-006: 구독료 환불 atomic — retracted article 시 구독료 환불 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSubscriptionRefund(
  db: Database.Database,
  subscriberId: string,
  articleSyndicationId: string,
  subscriptionCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; subscriberId: string; refundAmount: number; refundedAt: string } {
  const syndication = db
    .prepare("SELECT status FROM article_syndications WHERE id = ? AND status = 'retracted'")
    .get(articleSyndicationId) as { status: string } | undefined;

  if (!syndication) throw new NewsError('E404-RETRACTED-SYNDICATION', 'Retracted article syndication not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(subscriptionCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO subscription_refund_records (id, subscriber_id, article_syndication_id, subscription_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, subscriberId, articleSyndicationId, subscriptionCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO subscription_refunds (id, refund_record_id, subscriber_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, subscriberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE subscription_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, subscriberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class NewsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'NewsError';
  }
}
