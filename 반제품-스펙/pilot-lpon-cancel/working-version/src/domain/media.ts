import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-MD (MD-001~MD-006): Media 합성 도메인 — 28번째 도메인 (미디어 산업, 17번째 신규 산업)
//   - media spec-container rules.md 기반 PoC source
//   - 합성 schema: subscriptions, contents, licenses, reports, refunds
//   - 미디어 lifecycle 패턴 — 구독tier한도/시청한도/라이선싱atomic/콘텐츠상태전환/만료배치/takedown atomic
//   - withRuleId 재사용 28번째 도메인 (신규 detector 0개, 26 Sprint 연속 정점)
//   - MediaError code-in-message 패턴 (S275 표준)
//   - 17 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK + MD)
//   - 🎯 90% coverage 마일스톤 돌파 예상
// ---------------------------------------------------------------------------

export interface SubscriptionRow {
  id: string;
  user_id: string;
  tier: string;               // free | basic | standard | premium
  status: string;             // active | suspended | cancelled | expired
  concurrent_stream_limit: number;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
}

export interface ContentRow {
  id: string;
  title: string;
  content_type: string;       // movie | series | documentary | live
  status: string;             // draft | reviewing | published | archived | expired
  license_count: number;
  published_at: string | null;
  archived_at: string | null;
  expires_at: string | null;
}

export interface LicenseRow {
  id: string;
  content_id: string;
  user_id: string;
  license_type: string;       // streaming | download
  status: string;             // active | consumed | revoked
  granted_at: string;
  expires_at: string | null;
}

export interface ReportRow {
  id: string;
  content_id: string;
  reporter_id: string;
  reason: string;
  status: string;             // pending | reviewing | resolved | dismissed
  created_at: string;
  resolved_at: string | null;
}

const MAX_CONCURRENT_STREAMS = 4;   // MD-001: 구독 tier별 최대 동시 스트림 수 (premium 기준)

// ---------------------------------------------------------------------------
// MD-001: 구독 tier 동시 시청 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function activateMediaSubscription(
  db: Database.Database,
  subscriptionId: string,
  concurrentStreamCount: number,
): { subscriptionId: string; tier: string; activeAt: string } {
  const subscription = db
    .prepare('SELECT id, status, tier FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { id: string; status: string; tier: string } | undefined;

  if (!subscription) throw new MediaError('E404-SUBSCRIPTION', 'Subscription not found', 404);
  if (subscription.status !== 'active') {
    throw new MediaError(
      'E409-SUBSCRIPTION',
      `Cannot stream with subscription status=${subscription.status}`,
      409,
    );
  }

  if (concurrentStreamCount >= MAX_CONCURRENT_STREAMS) {
    throw new MediaError(
      'E422-STREAM-LIMIT',
      `Concurrent stream limit reached (${concurrentStreamCount} >= ${MAX_CONCURRENT_STREAMS})`,
      422,
    );
  }

  const activeAt = new Date().toISOString();
  db.prepare(`UPDATE subscriptions SET status = 'active' WHERE id = ?`).run(subscriptionId);

  return { subscriptionId, tier: subscription.tier, activeAt };
}

// ---------------------------------------------------------------------------
// MD-002: 무료 시청 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, viewQuotaLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function checkViewQuota(
  db: Database.Database,
  userId: string,
  viewedCount: number,
): { viewedCount: number; viewQuotaLimit: number; withinQuota: boolean } {
  const subscription = db
    .prepare('SELECT tier FROM subscriptions WHERE user_id = ? AND status = ?')
    .get(userId, 'active') as { tier: string } | undefined;

  // 무료 계정 시청 한도 (tier별)
  const quotaByTier: Record<string, number> = {
    free: 10,
    basic: 50,
    standard: 200,
    premium: 999,
  };
  const tier = subscription?.tier ?? 'free';
  // F445 Path B: var-vs-var, left=`viewQuotaLimit` (`limit` keyword 매칭)
  const viewQuotaLimit = quotaByTier[tier] ?? 10;

  if (viewedCount > viewQuotaLimit) {
    throw new MediaError(
      'E422-VIEW-QUOTA',
      `View quota exceeded (${viewedCount} > ${viewQuotaLimit})`,
      422,
    );
  }

  return { viewedCount, viewQuotaLimit, withinQuota: true };
}

// ---------------------------------------------------------------------------
// MD-003: 콘텐츠 라이선싱 atomic — 권리 검증 + 라이선스 차감 + 시청 허용
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processLicensing(
  db: Database.Database,
  contentId: string,
  userId: string,
  licenseType: 'streaming' | 'download',
): { licenseId: string; contentId: string; userId: string; grantedAt: string } {
  const content = db
    .prepare('SELECT id, status, license_count FROM contents WHERE id = ?')
    .get(contentId) as { id: string; status: string; license_count: number } | undefined;

  if (!content) throw new MediaError('E404-CONTENT', 'Content not found', 404);
  if (content.status !== 'published') {
    throw new MediaError(
      'E409-CONTENT',
      `Content not available for licensing (status=${content.status})`,
      409,
    );
  }

  if (content.license_count <= 0) {
    throw new MediaError(
      'E422-LICENSE-EXHAUSTED',
      'No licenses available for this content',
      422,
    );
  }

  const licenseId = randomUUID();
  const grantedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE contents SET license_count = license_count - 1 WHERE id = ?`)
      .run(contentId);
    db.prepare(`
      INSERT INTO licenses (id, content_id, user_id, license_type, status, granted_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(licenseId, contentId, userId, licenseType, grantedAt);
  });
  tx();

  return { licenseId, contentId, userId, grantedAt };
}

// ---------------------------------------------------------------------------
// MD-004: 콘텐츠 상태 전환 (draft → reviewing → published → archived)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionContentStatus(
  db: Database.Database,
  contentId: string,
  newStatus: 'reviewing' | 'published' | 'archived' | 'expired',
): { contentId: string; previousStatus: string; newStatus: string } {
  const content = db
    .prepare('SELECT status FROM contents WHERE id = ?')
    .get(contentId) as { status: string } | undefined;

  if (!content) throw new MediaError('E404-CONTENT', 'Content not found', 404);

  const previousStatus = content.status;
  const allowed =
    (previousStatus === 'draft' && newStatus === 'reviewing') ||
    (previousStatus === 'reviewing' && newStatus === 'published') ||
    (previousStatus === 'reviewing' && newStatus === 'archived') ||
    (previousStatus === 'published' && newStatus === 'archived') ||
    (previousStatus === 'published' && newStatus === 'expired') ||
    (previousStatus === 'archived' && newStatus === 'expired');

  if (!allowed) {
    throw new MediaError(
      'E409-CONTENT',
      `Cannot transition content from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE contents SET status = ? WHERE id = ?`).run(newStatus, contentId);

  if (newStatus === 'published') {
    db.prepare(`UPDATE contents SET published_at = ? WHERE id = ?`).run(now, contentId);
  } else if (newStatus === 'archived') {
    db.prepare(`UPDATE contents SET archived_at = ? WHERE id = ?`).run(now, contentId);
  }

  return { contentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// MD-005: 만료 콘텐츠 일괄 처리 (published → expired 배치)
// (StatusTransition detector — batch 패턴, CC-005 batch 17번째 재사용)
// ---------------------------------------------------------------------------
export function markExpiringContent(
  db: Database.Database,
  expirationCutoffDate: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM contents
      WHERE status = 'published'
        AND expires_at IS NOT NULL
        AND expires_at <= ?
    `)
    .all(expirationCutoffDate) as Array<{ id: string }>;

  const markedIds: string[] = [];
  const now = new Date().toISOString();

  for (const content of candidates) {
    db.prepare(`
      UPDATE contents
      SET status = 'expired'
      WHERE id = ?
    `).run(content.id);
    markedIds.push(content.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// MD-006: 콘텐츠 테이크다운 atomic — 신고 + 검토 + 비공개 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTakedown(
  db: Database.Database,
  contentId: string,
  reportId: string,
  reason: string,
): { contentId: string; reportId: string; refundCount: number; takenDownAt: string } {
  const content = db
    .prepare('SELECT id, status FROM contents WHERE id = ?')
    .get(contentId) as { id: string; status: string } | undefined;

  if (!content) throw new MediaError('E404-CONTENT', 'Content not found', 404);
  if (content.status === 'archived' || content.status === 'expired') {
    throw new MediaError(
      'E409-CONTENT',
      `Content already inactive (status=${content.status})`,
      409,
    );
  }

  const report = db
    .prepare('SELECT id, status FROM reports WHERE id = ?')
    .get(reportId) as { id: string; status: string } | undefined;

  if (!report) throw new MediaError('E404-REPORT', 'Report not found', 404);

  const takenDownAt = new Date().toISOString();

  const tx = db.transaction(() => {
    // 콘텐츠 비공개 처리
    db.prepare(`UPDATE contents SET status = 'archived', archived_at = ? WHERE id = ?`)
      .run(takenDownAt, contentId);

    // 신고 해소
    db.prepare(`UPDATE reports SET status = 'resolved', resolved_at = ? WHERE id = ?`)
      .run(takenDownAt, reportId);

    // 활성 라이선스 무효화 + 환불 기록
    const activeLicenses = db
      .prepare(`SELECT id, user_id FROM licenses WHERE content_id = ? AND status = 'active'`)
      .all(contentId) as Array<{ id: string; user_id: string }>;

    for (const license of activeLicenses) {
      db.prepare(`UPDATE licenses SET status = 'revoked' WHERE id = ?`).run(license.id);
      db.prepare(`
        INSERT INTO refunds (id, license_id, user_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), license.id, license.user_id, `takedown:${reason}`, takenDownAt);
    }

    return activeLicenses.length;
  });

  const refundCount = tx() as number;

  return { contentId, reportId, refundCount, takenDownAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class MediaError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'MediaError';
  }
}
