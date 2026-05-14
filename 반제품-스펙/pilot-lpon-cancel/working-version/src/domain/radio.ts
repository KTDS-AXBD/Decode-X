import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-RA (RA-001~RA-006): Radio 합성 도메인 — 63번째 도메인 (라디오 산업, 52번째 신규 산업)
//   - radio spec-container rules.md 기반 PoC source
//   - 합성 schema: channels, sponsor_contracts, program_schedules, broadcasts,
//                  sponsor_payments, sponsor_refund_records, sponsor_refunds
//   - 라디오 lifecycle 패턴 — 채널program한도/listenershipdaily한도/송출batchatomic/program상태전환/만료broadcast일괄/sponsor환불atomic
//   - withRuleId 재사용 63번째 도메인 (신규 detector 0개, 64 Sprint 연속 정점 도전)
//   - RadioError code-in-message 패턴 (S275 표준)
//   - 52 산업 연속 0 ABSENCE 도전 (..+VD+SM+NW+BR+ER+PC+RA)
//   - 52번째 신규 산업 마일스톤 (radio 추가, 디지털 콘텐츠 11-클러스터: MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA)
//   - 거울 변환 16회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio)
//   - 🏆🏆 1세션 9 Sprint 신기록 (세션 305 누적 9 Sprint)
// ---------------------------------------------------------------------------

export interface ChannelRow {
  id: string;
  name: string;
  total_capacity: number;
  active_programs: number;
  status: string; // active | suspended | retired
}

export interface SponsorContractRow {
  id: string;
  sponsor_id: string;
  channel_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  listenership_limit: number;
  listenership_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ProgramScheduleRow {
  id: string;
  channel_id: string;
  contract_id: string;
  broadcast_id: string | null;
  sponsor_payment_id: string | null;
  status: string; // scheduled | airing | updated | archived | preempted | cancelled
  scheduled_at: string;
}

export interface BroadcastRow {
  id: string;
  channel_id: string;
  schedule_id: string;
  broadcast_no: string;
  status: string; // live | updated | archived | preempted | cancelled | expired
  started_at: string;
}

export interface SponsorRefundRecordRow {
  id: string;
  sponsor_id: string;
  broadcast_id: string;
  sponsor_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_PROGRAMS_PER_CHANNEL = 48; // RA-001: 채널별 동시 active program 한도 (기본값, 30분 슬롯 24시간 × 2)

// ---------------------------------------------------------------------------
// RA-001: 채널 동시 active program 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function scheduleProgram(
  db: Database.Database,
  channelId: string,
  contractId: string,
): { scheduleId: string; channelId: string; contractId: string; scheduledAt: string } {
  const channel = db
    .prepare('SELECT active_programs, total_capacity FROM channels WHERE id = ?')
    .get(channelId) as { active_programs: number; total_capacity: number } | undefined;

  if (!channel) throw new RadioError('E404-CHANNEL', 'Channel not found', 404);

  const limit = channel.total_capacity ?? MAX_CONCURRENT_ACTIVE_PROGRAMS_PER_CHANNEL;

  if (channel.active_programs >= limit) {
    throw new RadioError(
      'E422-CHANNEL-CAPACITY-EXCEEDED',
      `Channel is at full capacity (${channel.active_programs} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO program_schedules (id, channel_id, contract_id, broadcast_id, sponsor_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'scheduled', ?)
  `).run(scheduleId, channelId, contractId, scheduledAt);

  db.prepare(`
    UPDATE channels SET active_programs = active_programs + 1 WHERE id = ?
  `).run(channelId);

  return { scheduleId, channelId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// RA-002: 광고주 일일 listenership 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyListenershipLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyListenershipLimit(
  db: Database.Database,
  sponsorId: string,
  contractId: string,
  listenership: number,
): { sponsorId: string; contractId: string; dailyListenershipLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT listenership_used, listenership_limit FROM sponsor_contracts WHERE id = ? AND sponsor_id = ? LIMIT 1')
    .get(contractId, sponsorId) as { listenership_used: number; listenership_limit: number } | undefined;

  if (!contract) throw new RadioError('E404-CONTRACT', 'Sponsor contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyListenershipLimit` (`limit` keyword 매칭)
  const dailyListenershipLimit = contract.listenership_limit;

  if (contract.listenership_used + listenership >= dailyListenershipLimit) {
    throw new RadioError(
      'E422-DAILY-LISTENERSHIP-LIMIT-EXCEEDED',
      `Daily listenership quota exhausted (${contract.listenership_used + listenership} >= ${dailyListenershipLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE sponsor_contracts SET listenership_used = listenership_used + ? WHERE id = ?
  `).run(listenership, contractId);

  return { sponsorId, contractId, dailyListenershipLimit, approved: true };
}

// ---------------------------------------------------------------------------
// RA-003: program 송출 atomic — broadcasts + program_schedules 상태전환 + sponsor_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBroadcast(
  db: Database.Database,
  channelId: string,
  scheduleId: string,
  broadcastNo: string,
  amount: number,
): { broadcastId: string; sponsorPaymentId: string; scheduleId: string; channelId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM program_schedules WHERE id = ? AND status = 'scheduled'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new RadioError('E404-SCHEDULE', 'Scheduled program not found', 404);

  const broadcastId = randomUUID();
  const sponsorPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO broadcasts (id, channel_id, schedule_id, broadcast_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(broadcastId, channelId, scheduleId, broadcastNo, startedAt);

    db.prepare(`
      UPDATE program_schedules SET status = 'airing', broadcast_id = ?, sponsor_payment_id = ? WHERE id = ?
    `).run(broadcastId, sponsorPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO sponsor_payments (id, schedule_id, broadcast_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(sponsorPaymentId, scheduleId, broadcastId, amount, startedAt);
  });
  tx();

  return { broadcastId, sponsorPaymentId, scheduleId, channelId, startedAt };
}

// ---------------------------------------------------------------------------
// RA-004: program 상태 전환 (scheduled → airing → updated → archived / preempted / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionProgramStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'airing' | 'updated' | 'archived' | 'preempted' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM program_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new RadioError('E404-SCHEDULE', 'Program schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'scheduled' && newStatus === 'airing') ||
    (schedule.status === 'airing' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'airing') ||
    (schedule.status === 'airing' && newStatus === 'archived') ||
    (schedule.status === 'updated' && newStatus === 'archived') ||
    (schedule.status === 'scheduled' && newStatus === 'preempted') ||
    (schedule.status === 'airing' && newStatus === 'preempted') ||
    (schedule.status === 'scheduled' && newStatus === 'cancelled') ||
    (schedule.status === 'airing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new RadioError(
      'E409-SCHEDULE',
      `Cannot transition program schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE program_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// RA-005: 만료 preempted broadcast batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 52번째 재사용)
// ---------------------------------------------------------------------------
export function expirePreemptedBroadcastBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM broadcasts
      WHERE status = 'preempted'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE broadcasts
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// RA-006: sponsor 환불 atomic — preempted broadcast 시 sponsor 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSponsorRefund(
  db: Database.Database,
  sponsorId: string,
  broadcastId: string,
  sponsorCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; sponsorId: string; refundAmount: number; refundedAt: string } {
  const broadcast = db
    .prepare("SELECT status FROM broadcasts WHERE id = ? AND status = 'preempted'")
    .get(broadcastId) as { status: string } | undefined;

  if (!broadcast) throw new RadioError('E404-PREEMPTED-BROADCAST', 'Preempted broadcast not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(sponsorCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO sponsor_refund_records (id, sponsor_id, broadcast_id, sponsor_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, sponsorId, broadcastId, sponsorCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO sponsor_refunds (id, refund_record_id, sponsor_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, sponsorId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE sponsor_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, sponsorId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class RadioError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'RadioError';
  }
}
