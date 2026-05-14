import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-BR (BR-001~BR-006): Broadcast 합성 도메인 — 60번째 도메인 (방송 산업, 49번째 신규 산업)
//   - broadcast spec-container rules.md 기반 PoC source
//   - 합성 schema: stations, sponsor_contracts, broadcast_schedules, airings,
//                  sponsor_payments, sponsor_refund_records, sponsor_refunds
//   - 방송 lifecycle 패턴 — 방송국broadcast한도/viewershipdaily한도/송출batchatomic/broadcast상태전환/만료broadcast일괄/sponsor환불atomic
//   - withRuleId 재사용 60번째 도메인 (신규 detector 0개, 61 Sprint 연속 정점 도전)
//   - BroadcastError code-in-message 패턴 (S275 표준)
//   - 49 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD+SM+NW+BR)
//   - 49번째 신규 산업 마일스톤 (broadcast 추가, 디지털 콘텐츠 8-클러스터: MU+PB+AD+GM+VD+SM+NW+BR)
//   - 거울 변환 13회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast)
//   - 🏆 60 Sprint round 마일스톤 (S262~S356 60 Sprint 연속 부트스트래핑)
// ---------------------------------------------------------------------------

export interface StationRow {
  id: string;
  name: string;
  total_capacity: number;
  active_broadcasts: number;
  status: string; // active | suspended | retired
}

export interface SponsorContractRow {
  id: string;
  sponsor_id: string;
  station_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  viewership_limit: number;
  viewership_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface BroadcastScheduleRow {
  id: string;
  station_id: string;
  contract_id: string;
  airing_id: string | null;
  sponsor_payment_id: string | null;
  status: string; // scheduled | airing | updated | archived | preempted | cancelled
  scheduled_at: string;
}

export interface AiringRow {
  id: string;
  station_id: string;
  schedule_id: string;
  airing_no: string;
  status: string; // live | updated | archived | preempted | cancelled | expired
  started_at: string;
}

export interface SponsorRefundRecordRow {
  id: string;
  sponsor_id: string;
  airing_id: string;
  sponsor_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_BROADCASTS_PER_STATION = 24; // BR-001: 방송국별 동시 active broadcast 한도 (기본값, 24시간 편성)

// ---------------------------------------------------------------------------
// BR-001: 방송국 동시 active broadcast 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function scheduleBroadcast(
  db: Database.Database,
  stationId: string,
  contractId: string,
): { scheduleId: string; stationId: string; contractId: string; scheduledAt: string } {
  const station = db
    .prepare('SELECT active_broadcasts, total_capacity FROM stations WHERE id = ?')
    .get(stationId) as { active_broadcasts: number; total_capacity: number } | undefined;

  if (!station) throw new BroadcastError('E404-STATION', 'Station not found', 404);

  const limit = station.total_capacity ?? MAX_CONCURRENT_ACTIVE_BROADCASTS_PER_STATION;

  if (station.active_broadcasts >= limit) {
    throw new BroadcastError(
      'E422-STATION-CAPACITY-EXCEEDED',
      `Station is at full capacity (${station.active_broadcasts} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO broadcast_schedules (id, station_id, contract_id, airing_id, sponsor_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'scheduled', ?)
  `).run(scheduleId, stationId, contractId, scheduledAt);

  db.prepare(`
    UPDATE stations SET active_broadcasts = active_broadcasts + 1 WHERE id = ?
  `).run(stationId);

  return { scheduleId, stationId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// BR-002: 광고주/시청자 일일 viewership 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyViewershipLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyViewershipLimit(
  db: Database.Database,
  sponsorId: string,
  contractId: string,
  viewership: number,
): { sponsorId: string; contractId: string; dailyViewershipLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT viewership_used, viewership_limit FROM sponsor_contracts WHERE id = ? AND sponsor_id = ? LIMIT 1')
    .get(contractId, sponsorId) as { viewership_used: number; viewership_limit: number } | undefined;

  if (!contract) throw new BroadcastError('E404-CONTRACT', 'Sponsor contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyViewershipLimit` (`limit` keyword 매칭)
  const dailyViewershipLimit = contract.viewership_limit;

  if (contract.viewership_used + viewership >= dailyViewershipLimit) {
    throw new BroadcastError(
      'E422-DAILY-VIEWERSHIP-LIMIT-EXCEEDED',
      `Daily viewership quota exhausted (${contract.viewership_used + viewership} >= ${dailyViewershipLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE sponsor_contracts SET viewership_used = viewership_used + ? WHERE id = ?
  `).run(viewership, contractId);

  return { sponsorId, contractId, dailyViewershipLimit, approved: true };
}

// ---------------------------------------------------------------------------
// BR-003: broadcast 송출 atomic — airings + broadcast_schedules 상태전환 + sponsor_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processAiring(
  db: Database.Database,
  stationId: string,
  scheduleId: string,
  airingNo: string,
  amount: number,
): { airingId: string; sponsorPaymentId: string; scheduleId: string; stationId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM broadcast_schedules WHERE id = ? AND status = 'scheduled'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new BroadcastError('E404-SCHEDULE', 'Scheduled broadcast not found', 404);

  const airingId = randomUUID();
  const sponsorPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO airings (id, station_id, schedule_id, airing_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(airingId, stationId, scheduleId, airingNo, startedAt);

    db.prepare(`
      UPDATE broadcast_schedules SET status = 'airing', airing_id = ?, sponsor_payment_id = ? WHERE id = ?
    `).run(airingId, sponsorPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO sponsor_payments (id, schedule_id, airing_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(sponsorPaymentId, scheduleId, airingId, amount, startedAt);
  });
  tx();

  return { airingId, sponsorPaymentId, scheduleId, stationId, startedAt };
}

// ---------------------------------------------------------------------------
// BR-004: broadcast 상태 전환 (scheduled → airing → updated → archived / preempted / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionBroadcastStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'airing' | 'updated' | 'archived' | 'preempted' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM broadcast_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new BroadcastError('E404-SCHEDULE', 'Broadcast schedule not found', 404);

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
    throw new BroadcastError(
      'E409-SCHEDULE',
      `Cannot transition broadcast schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE broadcast_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// BR-005: 만료 preempted broadcast 송출 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, NW-005/SM-005/VD-005/GM-005/AD-005/TX-005/PB-005 49번째 재사용)
// ---------------------------------------------------------------------------
export function expirePreemptedBroadcastBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM airings
      WHERE status = 'preempted'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE airings
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// BR-006: sponsor 환불 atomic — preempted broadcast 시 sponsor 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSponsorRefund(
  db: Database.Database,
  sponsorId: string,
  airingId: string,
  sponsorCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; sponsorId: string; refundAmount: number; refundedAt: string } {
  const airing = db
    .prepare("SELECT status FROM airings WHERE id = ? AND status = 'preempted'")
    .get(airingId) as { status: string } | undefined;

  if (!airing) throw new BroadcastError('E404-PREEMPTED-AIRING', 'Preempted airing not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(sponsorCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO sponsor_refund_records (id, sponsor_id, airing_id, sponsor_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, sponsorId, airingId, sponsorCost, refundRate, refundAmount);

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
export class BroadcastError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BroadcastError';
  }
}
