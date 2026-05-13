import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-VD (VD-001~VD-006): Video 합성 도메인 — 57번째 도메인 (영상 산업, 46번째 신규 산업)
//   - video spec-container rules.md 기반 PoC source
//   - 합성 schema: channels, ad_contracts, video_publishes, video_streams,
//                  ad_payments, reward_clawback_records, reward_clawbacks
//   - 영상 lifecycle 패턴 — 채널publish한도/시청자view한도/스트림batchatomic/영상상태전환/만료영상일괄/리워드회수atomic
//   - withRuleId 재사용 57번째 도메인 (신규 detector 0개, 58 Sprint 연속 정점 도전)
//   - VideoError code-in-message 패턴 (S275 표준)
//   - 46 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD)
//   - 46번째 신규 산업 마일스톤 (video 추가, 디지털 콘텐츠 5-클러스터: MU+PB+AD+GM+VD)
//   - 거울 변환 10회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video)
// ---------------------------------------------------------------------------

export interface ChannelRow {
  id: string;
  name: string;
  total_capacity: number;
  active_published_videos: number;
  status: string; // active | suspended | retired
}

export interface AdContractRow {
  id: string;
  viewer_id: string;
  channel_id: string;
  tier_code: string; // free | basic | premium | ad-free
  view_limit: number;
  view_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface VideoPublishRow {
  id: string;
  channel_id: string;
  contract_id: string;
  video_stream_id: string | null;
  ad_payment_id: string | null;
  status: string; // uploaded | encoded | published | unlisted | retired | banned
  published_at: string;
}

export interface VideoStreamRow {
  id: string;
  channel_id: string;
  publish_id: string;
  stream_no: string;
  status: string; // live | unlisted | retired | banned | expired
  started_at: string;
}

export interface RewardClawbackRecordRow {
  id: string;
  viewer_id: string;
  video_stream_id: string;
  reward_cost: number;
  clawback_rate: number;
  clawback_amount: number;
  status: string; // pending | calculated | clawed_back
}

const MAX_CONCURRENT_PUBLISHED_VIDEOS_PER_CHANNEL = 1000; // VD-001: 채널별 동시 publish 영상 한도 (기본값)

// ---------------------------------------------------------------------------
// VD-001: 채널 동시 publish 영상 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function publishVideo(
  db: Database.Database,
  channelId: string,
  contractId: string,
): { publishId: string; channelId: string; contractId: string; publishedAt: string } {
  const channel = db
    .prepare('SELECT active_published_videos, total_capacity FROM channels WHERE id = ?')
    .get(channelId) as { active_published_videos: number; total_capacity: number } | undefined;

  if (!channel) throw new VideoError('E404-CHANNEL', 'Channel not found', 404);

  const limit = channel.total_capacity ?? MAX_CONCURRENT_PUBLISHED_VIDEOS_PER_CHANNEL;

  if (channel.active_published_videos >= limit) {
    throw new VideoError(
      'E422-CHANNEL-CAPACITY-EXCEEDED',
      `Channel is at full capacity (${channel.active_published_videos} >= ${limit})`,
      422,
    );
  }

  const publishId = randomUUID();
  const publishedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO video_publishes (id, channel_id, contract_id, video_stream_id, ad_payment_id, status, published_at)
    VALUES (?, ?, ?, NULL, NULL, 'uploaded', ?)
  `).run(publishId, channelId, contractId, publishedAt);

  db.prepare(`
    UPDATE channels SET active_published_videos = active_published_videos + 1 WHERE id = ?
  `).run(channelId);

  return { publishId, channelId, contractId, publishedAt };
}

// ---------------------------------------------------------------------------
// VD-002: 시청자 일일 view 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyViewLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyViewLimit(
  db: Database.Database,
  viewerId: string,
  contractId: string,
  views: number,
): { viewerId: string; contractId: string; dailyViewLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT view_used, view_limit FROM ad_contracts WHERE id = ? AND viewer_id = ? LIMIT 1')
    .get(contractId, viewerId) as { view_used: number; view_limit: number } | undefined;

  if (!contract) throw new VideoError('E404-CONTRACT', 'Ad contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyViewLimit` (`limit` keyword 매칭)
  const dailyViewLimit = contract.view_limit;

  if (contract.view_used + views >= dailyViewLimit) {
    throw new VideoError(
      'E422-DAILY-VIEW-LIMIT-EXCEEDED',
      `Daily view quota exhausted (${contract.view_used + views} >= ${dailyViewLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE ad_contracts SET view_used = view_used + ? WHERE id = ?
  `).run(views, contractId);

  return { viewerId, contractId, dailyViewLimit, approved: true };
}

// ---------------------------------------------------------------------------
// VD-003: 영상 스트림 atomic — video_streams + video_publishes 상태전환 + ad_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processStream(
  db: Database.Database,
  channelId: string,
  publishId: string,
  streamNo: string,
  amount: number,
): { videoStreamId: string; adPaymentId: string; publishId: string; channelId: string; startedAt: string } {
  const publish = db
    .prepare("SELECT status FROM video_publishes WHERE id = ? AND status = 'encoded'")
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new VideoError('E404-PUBLISH', 'Encoded video publish not found', 404);

  const videoStreamId = randomUUID();
  const adPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO video_streams (id, channel_id, publish_id, stream_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(videoStreamId, channelId, publishId, streamNo, startedAt);

    db.prepare(`
      UPDATE video_publishes SET status = 'published', video_stream_id = ?, ad_payment_id = ? WHERE id = ?
    `).run(videoStreamId, adPaymentId, publishId);

    db.prepare(`
      INSERT INTO ad_payments (id, publish_id, video_stream_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(adPaymentId, publishId, videoStreamId, amount, startedAt);
  });
  tx();

  return { videoStreamId, adPaymentId, publishId, channelId, startedAt };
}

// ---------------------------------------------------------------------------
// VD-004: 영상 상태 전환 (uploaded → encoded → published → unlisted → retired/banned)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionVideoStatus(
  db: Database.Database,
  publishId: string,
  newStatus: 'encoded' | 'published' | 'unlisted' | 'retired' | 'banned',
): { publishId: string; previousStatus: string; newStatus: string } {
  const publish = db
    .prepare('SELECT status FROM video_publishes WHERE id = ?')
    .get(publishId) as { status: string } | undefined;

  if (!publish) throw new VideoError('E404-PUBLISH', 'Video publish not found', 404);

  const previousStatus = publish.status;
  const allowed =
    (publish.status === 'uploaded' && newStatus === 'encoded') ||
    (publish.status === 'encoded' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'unlisted') ||
    (publish.status === 'unlisted' && newStatus === 'published') ||
    (publish.status === 'published' && newStatus === 'retired') ||
    (publish.status === 'unlisted' && newStatus === 'retired') ||
    (publish.status === 'published' && newStatus === 'banned') ||
    (publish.status === 'encoded' && newStatus === 'banned');

  if (!allowed) {
    throw new VideoError(
      'E409-PUBLISH',
      `Cannot transition video publish from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE video_publishes SET status = ? WHERE id = ?`).run(newStatus, publishId);

  return { publishId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// VD-005: 만료 retired 영상 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, GM-005/AD-005/TX-005/PB-005 46번째 재사용)
// ---------------------------------------------------------------------------
export function expireRetiredVideoBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM video_streams
      WHERE status = 'retired'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE video_streams
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// VD-006: 리워드 회수 atomic — 콘텐츠 정책 위반 시 리워드 비용 + 회수 비율 + 회수 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processRefundClaim(
  db: Database.Database,
  viewerId: string,
  videoStreamId: string,
  rewardCost: number,
  clawbackRate: number,
): { clawbackRecordId: string; clawbackId: string; viewerId: string; clawbackAmount: number; clawedBackAt: string } {
  const videoStream = db
    .prepare("SELECT status FROM video_streams WHERE id = ? AND status = 'banned'")
    .get(videoStreamId) as { status: string } | undefined;

  if (!videoStream) throw new VideoError('E404-BANNED-STREAM', 'Banned video stream not found', 404);

  const clawbackRecordId = randomUUID();
  const clawbackId = randomUUID();
  const clawbackAmount = Math.round(rewardCost * clawbackRate * 100) / 100;
  const clawedBackAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO reward_clawback_records (id, viewer_id, video_stream_id, reward_cost, clawback_rate, clawback_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(clawbackRecordId, viewerId, videoStreamId, rewardCost, clawbackRate, clawbackAmount);

    db.prepare(`
      INSERT INTO reward_clawbacks (id, clawback_record_id, viewer_id, amount, status, clawed_back_at)
      VALUES (?, ?, ?, ?, 'clawed_back', ?)
    `).run(clawbackId, clawbackRecordId, viewerId, clawbackAmount, clawedBackAt);

    db.prepare(`
      UPDATE reward_clawback_records SET status = 'clawed_back' WHERE id = ?
    `).run(clawbackRecordId);
  });
  tx();

  return { clawbackRecordId, clawbackId, viewerId, clawbackAmount, clawedBackAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class VideoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'VideoError';
  }
}
