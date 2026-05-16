import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-KP (KP-001~KP-006): K-pop 합성 도메인 — 71번째 도메인 (콘서트/팬미팅 산업, 60번째 신규 산업)
//   - kpop spec-container rules.md 기반 PoC source
//   - 합성 schema: arenas, fan_contracts, concert_schedules, entries,
//                  entry_payments, entry_refund_records, entry_refunds
//   - 콘서트 lifecycle 패턴 — 아레나entry한도/fandailyentry한도/입장batchatomic/entry상태전환/만료postponedentry일괄/concert환불atomic
//   - withRuleId 재사용 71번째 도메인 (신규 detector 0개, 72 Sprint 연속 정점 도전)
//   - KpopError code-in-message 패턴 (S275 표준)
//   - 60 산업 연속 0 ABSENCE 도전 (..+GA+AM+TH+SK+EX+GF+KP)
//   - 71번째 도메인 마일스톤 (kpop 추가, 🎤 AM+TH+KP 오프라인 엔터 3-클러스터 확장 — 단일 클러스터 3 도메인 두 번째 사례)
//   - 거울 변환 24회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop)
//   - 🎤 한국 특화 K-pop 산업 (콘서트/팬미팅/팬클럽 멤버십 + 좌석 구역 + 스탠딩/투어 일정 + 취소 환불 정책)
// ---------------------------------------------------------------------------

export interface ArenaRow {
  id: string;
  name: string;
  total_capacity: number;
  active_entries: number;
  status: string; // active | suspended | retired
}

export interface FanContractRow {
  id: string;
  fan_id: string;
  arena_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  fan_limit: number;
  fan_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ConcertScheduleRow {
  id: string;
  arena_id: string;
  contract_id: string;
  entry_id: string | null;
  entry_payment_id: string | null;
  status: string; // booked | admitted | updated | ended | postponed | cancelled
  scheduled_at: string;
}

export interface EntryRow {
  id: string;
  arena_id: string;
  schedule_id: string;
  entry_no: string;
  status: string; // admitted | updated | ended | postponed | cancelled | expired
  started_at: string;
}

export interface EntryRefundRecordRow {
  id: string;
  fan_id: string;
  entry_id: string;
  entry_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_ENTRIES_PER_ARENA = 50000; // KP-001: 아레나별 동시 active entry 한도 (기본값, 대형 아레나 잠실 종합운동장급 수용 인원)

// ---------------------------------------------------------------------------
// KP-001: 아레나 동시 active entry 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookTicket(
  db: Database.Database,
  arenaId: string,
  contractId: string,
): { scheduleId: string; arenaId: string; contractId: string; scheduledAt: string } {
  const arena = db
    .prepare('SELECT active_entries, total_capacity FROM arenas WHERE id = ?')
    .get(arenaId) as { active_entries: number; total_capacity: number } | undefined;

  if (!arena) throw new KpopError('E404-ARENA', 'Arena not found', 404);

  const limit = arena.total_capacity ?? MAX_CONCURRENT_ACTIVE_ENTRIES_PER_ARENA;

  if (arena.active_entries >= limit) {
    throw new KpopError(
      'E422-ARENA-CAPACITY-EXCEEDED',
      `Arena is at full capacity (${arena.active_entries} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO concert_schedules (id, arena_id, contract_id, entry_id, entry_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'booked', ?)
  `).run(scheduleId, arenaId, contractId, scheduledAt);

  db.prepare(`
    UPDATE arenas SET active_entries = active_entries + 1 WHERE id = ?
  `).run(arenaId);

  return { scheduleId, arenaId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// KP-002: 팬 일일 entry 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyFanLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyFanLimit(
  db: Database.Database,
  fanId: string,
  contractId: string,
  entry: number,
): { fanId: string; contractId: string; dailyFanLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT fan_used, fan_limit FROM fan_contracts WHERE id = ? AND fan_id = ? LIMIT 1')
    .get(contractId, fanId) as { fan_used: number; fan_limit: number } | undefined;

  if (!contract) throw new KpopError('E404-CONTRACT', 'Fan contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyFanLimit` (`limit` keyword 매칭)
  const dailyFanLimit = contract.fan_limit;

  if (contract.fan_used + entry >= dailyFanLimit) {
    throw new KpopError(
      'E422-DAILY-FAN-LIMIT-EXCEEDED',
      `Daily fan quota exhausted (${contract.fan_used + entry} >= ${dailyFanLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE fan_contracts SET fan_used = fan_used + ? WHERE id = ?
  `).run(entry, contractId);

  return { fanId, contractId, dailyFanLimit, approved: true };
}

// ---------------------------------------------------------------------------
// KP-003: 콘서트 입장 atomic — entries + concert_schedules 상태전환 + entry_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processConcertAdmission(
  db: Database.Database,
  arenaId: string,
  scheduleId: string,
  entryNo: string,
  amount: number,
): { entryId: string; entryPaymentId: string; scheduleId: string; arenaId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM concert_schedules WHERE id = ? AND status = 'booked'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new KpopError('E404-SCHEDULE', 'Booked entry not found', 404);

  const entryId = randomUUID();
  const entryPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO entries (id, arena_id, schedule_id, entry_no, status, started_at)
      VALUES (?, ?, ?, ?, 'admitted', ?)
    `).run(entryId, arenaId, scheduleId, entryNo, startedAt);

    db.prepare(`
      UPDATE concert_schedules SET status = 'admitted', entry_id = ?, entry_payment_id = ? WHERE id = ?
    `).run(entryId, entryPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO entry_payments (id, schedule_id, entry_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(entryPaymentId, scheduleId, entryId, amount, startedAt);
  });
  tx();

  return { entryId, entryPaymentId, scheduleId, arenaId, startedAt };
}

// ---------------------------------------------------------------------------
// KP-004: entry 상태 전환 (booked → admitted → updated → ended / postponed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionEntryStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'admitted' | 'updated' | 'ended' | 'postponed' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM concert_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new KpopError('E404-SCHEDULE', 'Concert schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'booked' && newStatus === 'admitted') ||
    (schedule.status === 'admitted' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'admitted') ||
    (schedule.status === 'admitted' && newStatus === 'ended') ||
    (schedule.status === 'updated' && newStatus === 'ended') ||
    (schedule.status === 'booked' && newStatus === 'postponed') ||
    (schedule.status === 'admitted' && newStatus === 'postponed') ||
    (schedule.status === 'booked' && newStatus === 'cancelled') ||
    (schedule.status === 'admitted' && newStatus === 'cancelled');

  if (!allowed) {
    throw new KpopError(
      'E409-SCHEDULE',
      `Cannot transition concert schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE concert_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// KP-005: 만료 postponed entry batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, GF-005/EX-005/SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 60번째 재사용)
// ---------------------------------------------------------------------------
export function expirePostponedEntryBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM entries
      WHERE status = 'postponed'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE entries
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// KP-006: concert 환불 atomic — postponed entry 시 entry 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processConcertRefund(
  db: Database.Database,
  fanId: string,
  entryId: string,
  entryCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; fanId: string; refundAmount: number; refundedAt: string } {
  const entry = db
    .prepare("SELECT status FROM entries WHERE id = ? AND status = 'postponed'")
    .get(entryId) as { status: string } | undefined;

  if (!entry) throw new KpopError('E404-POSTPONED-ENTRY', 'Postponed entry not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(entryCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO entry_refund_records (id, fan_id, entry_id, entry_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, fanId, entryId, entryCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO entry_refunds (id, refund_record_id, fan_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, fanId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE entry_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, fanId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class KpopError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'KpopError';
  }
}
