import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-FE (FE-001~FE-006): Festival 합성 도메인 — 79번째 도메인 (페스티벌 산업, 68번째 신규 산업) 🎪 단일 클러스터 10 도메인 첫 사례 round 마일스톤
//   - festival spec-container rules.md 기반 PoC source
//   - 합성 schema: festivals, festival_passes, festival_entries, stage_schedules,
//                  entry_payments, cancelled_fee_records, entry_refunds
//   - 페스티벌 lifecycle 패턴 — 동시참가한도/멤버일일stage한도/stage입장atomic/참가상태전환/closed참가일괄만료/참가환불atomic
//   - withRuleId 재사용 79번째 도메인 (신규 detector 0개, 80 Sprint 연속 정점 round 마일스톤 도전)
//   - FestivalError code-in-message 패턴 (S275 표준)
//   - 68 산업 연속 0 ABSENCE 도전 (..+SK+EX+GF+KP+SF+AQ+ZO+MS+MV+LB+PA+FE)
//   - 🎪 단일 클러스터 10 도메인 첫 사례 round 마일스톤 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE 오프라인 엔터 10-클러스터)
//   - 거울 변환 32회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie → library → park → festival)
//   - Sprint WT autopilot 분리 작업 6회차 (S370 1회차 ✅ + S371 2회차 + S372 3회차 + S373 4회차 + S374 5회차 + S375 6회차 DoD 명시 패턴 결정적 확립)
//   - FE 차별성 (KP 콘서트와 분리): 다일정(multi-date) + 멀티 stage 동시 운영 + festival pass (day/weekend/full)
// ---------------------------------------------------------------------------

export interface FestivalRow {
  id: string;
  name: string;
  total_capacity: number;
  active_entries: number;
  status: string; // active | closed | suspended
}

export interface FestivalPassRow {
  id: string;
  member_id: string;
  festival_id: string;
  pass_type: string; // day | weekend | full
  stage_limit: number;
  stage_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface FestivalEntryRow {
  id: string;
  festival_id: string;
  pass_id: string;
  stage_id: string | null;
  payment_id: string | null;
  status: string; // reserved | entered | exited | ended | closed | cancelled
  scheduled_at: string;
}

export interface StageScheduleRow {
  id: string;
  festival_id: string;
  entry_id: string;
  stage_no: string;
  status: string; // active | completed | cancelled | expired
  started_at: string;
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  entry_id: string;
  entry_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_FESTIVAL_ENTRIES = 5000; // FE-001: 페스티벌별 동시 active 참가 한도 (대형 페스티벌 기준 5000인)

// ---------------------------------------------------------------------------
// FE-001: 페스티벌 동시 active 참가 한도 검증
// (ThresholdCheck detector — F547 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveEntry(
  db: Database.Database,
  festivalId: string,
  passId: string,
): { entryId: string; festivalId: string; passId: string; scheduledAt: string } {
  const festival = db
    .prepare('SELECT active_entries, total_capacity FROM festivals WHERE id = ?')
    .get(festivalId) as { active_entries: number; total_capacity: number } | undefined;

  if (!festival) throw new FestivalError('E404-FESTIVAL', 'Festival not found', 404);

  const limit = festival.total_capacity ?? MAX_CONCURRENT_FESTIVAL_ENTRIES;

  if (festival.active_entries >= limit) {
    throw new FestivalError(
      'E422-FESTIVAL-ENTRY-LIMIT-EXCEEDED',
      `Festival is at full entry capacity (${festival.active_entries} >= ${limit})`,
      422,
    );
  }

  const entryId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO festival_entries (id, festival_id, pass_id, stage_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(entryId, festivalId, passId, scheduledAt);

  db.prepare(`
    UPDATE festivals SET active_entries = active_entries + 1 WHERE id = ?
  `).run(festivalId);

  return { entryId, festivalId, passId, scheduledAt };
}

// ---------------------------------------------------------------------------
// FE-002: 멤버 일일 stage 한도 비교 (festival pass tier별 stage 제한)
// (ThresholdCheck detector — F547 Path B var-vs-var, stageLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyStageLimit(
  db: Database.Database,
  memberId: string,
  passId: string,
  stages: number,
): { memberId: string; passId: string; stageLimit: number; approved: boolean } {
  const pass = db
    .prepare('SELECT stage_used, stage_limit FROM festival_passes WHERE id = ? AND member_id = ? LIMIT 1')
    .get(passId, memberId) as { stage_used: number; stage_limit: number } | undefined;

  if (!pass) throw new FestivalError('E404-PASS', 'Festival pass not found', 404);

  // F547 Path B: var-vs-var, left=`stageLimit` (`limit` keyword 매칭)
  const stageLimit = pass.stage_limit;

  if (pass.stage_used + stages >= stageLimit) {
    throw new FestivalError(
      'E422-DAILY-STAGE-LIMIT-EXCEEDED',
      `Daily stage quota exhausted (${pass.stage_used + stages} >= ${stageLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE festival_passes SET stage_used = stage_used + ? WHERE id = ?
  `).run(stages, passId);

  return { memberId, passId, stageLimit, approved: true };
}

// ---------------------------------------------------------------------------
// FE-003: stage 입장 atomic — festival_entries + stage_schedules 상태전환 + entry_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processStageEntry(
  db: Database.Database,
  festivalId: string,
  entryId: string,
  stageNo: string,
  amount: number,
): { stageId: string; entryPaymentId: string; entryId: string; festivalId: string; startedAt: string } {
  const entry = db
    .prepare("SELECT status FROM festival_entries WHERE id = ? AND status = 'reserved'")
    .get(entryId) as { status: string } | undefined;

  if (!entry) throw new FestivalError('E404-ENTRY', 'Reserved entry not found', 404);

  const stageId = randomUUID();
  const entryPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO stage_schedules (id, festival_id, entry_id, stage_no, status, started_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(stageId, festivalId, entryId, stageNo, startedAt);

    db.prepare(`
      UPDATE festival_entries SET status = 'entered', stage_id = ?, payment_id = ? WHERE id = ?
    `).run(stageId, entryPaymentId, entryId);

    db.prepare(`
      INSERT INTO entry_payments (id, entry_id, stage_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(entryPaymentId, entryId, stageId, amount, startedAt);
  });
  tx();

  return { stageId, entryPaymentId, entryId, festivalId, startedAt };
}

// ---------------------------------------------------------------------------
// FE-004: 참가 상태 전환 (reserved → entered → exited → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionEntryStatus(
  db: Database.Database,
  entryId: string,
  newStatus: 'entered' | 'exited' | 'ended' | 'closed' | 'cancelled',
): { entryId: string; previousStatus: string; newStatus: string } {
  const entry = db
    .prepare('SELECT status FROM festival_entries WHERE id = ?')
    .get(entryId) as { status: string } | undefined;

  if (!entry) throw new FestivalError('E404-ENTRY', 'Entry not found', 404);

  const previousStatus = entry.status;
  const allowed =
    (entry.status === 'reserved' && newStatus === 'entered') ||
    (entry.status === 'entered' && newStatus === 'exited') ||
    (entry.status === 'exited' && newStatus === 'ended') ||
    (entry.status === 'entered' && newStatus === 'closed') ||
    (entry.status === 'reserved' && newStatus === 'cancelled') ||
    (entry.status === 'entered' && newStatus === 'cancelled');

  if (!allowed) {
    throw new FestivalError(
      'E409-ENTRY',
      `Cannot transition entry from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE festival_entries SET status = ? WHERE id = ?`).run(newStatus, entryId);

  return { entryId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// FE-005: closed 참가 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../PA-005 68번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedEntryBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM festival_entries
      WHERE status = 'closed'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE festival_entries
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// FE-006: 참가 환불 atomic — 취소 참가 시 참가 비용 + 취소 수수료 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processEntryRefund(
  db: Database.Database,
  memberId: string,
  entryId: string,
  entryCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const entry = db
    .prepare("SELECT status FROM festival_entries WHERE id = ? AND status = 'cancelled'")
    .get(entryId) as { status: string } | undefined;

  if (!entry) throw new FestivalError('E404-CANCELLED-ENTRY', 'Cancelled entry not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(entryCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, entry_id, entry_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, entryId, entryCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO entry_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, feeRecordId, memberId, cancellationAmount, refundedAt);

    db.prepare(`
      UPDATE cancelled_fee_records SET status = 'refunded' WHERE id = ?
    `).run(feeRecordId);
  });
  tx();

  return { feeRecordId, refundId, memberId, cancellationAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class FestivalError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'FestivalError';
  }
}
