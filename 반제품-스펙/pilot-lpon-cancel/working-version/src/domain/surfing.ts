import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-SF (SF-001~SF-006): Surfing 합성 도메인 — 72번째 도메인 (서핑/해양 스포츠 산업, 61번째 신규 산업) 🏆🏆 1세션 9 Sprint 신기록 동률 도달
//   - surfing spec-container rules.md 기반 PoC source
//   - 합성 schema: spots, surfer_contracts, session_schedules, boards,
//                  board_payments, board_refund_records, board_refunds
//   - 서핑 lifecycle 패턴 — 스팟board한도/surferdailysession한도/세션batchatomic/board상태전환/만료suspendedboard일괄/session환불atomic
//   - withRuleId 재사용 72번째 도메인 (신규 detector 0개, 73 Sprint 연속 정점 도전)
//   - SurfingError code-in-message 패턴 (S275 표준)
//   - 61 산업 연속 0 ABSENCE 도전 (..+AM+TH+SK+EX+GF+KP+SF)
//   - 🏆🏆 1세션 9 Sprint 신기록 동률 도달 (세션 305 9 Sprint 신기록과 동일)
//   - 거울 변환 25회차 정점 round (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing)
//   - 🏄 SP+SK+GF+SF 스포츠 레저 4-클러스터 확장 (피트니스/스포츠 + 윈터 레저 + 골프 + 서핑 통합 추상화 — 단일 클러스터 4 도메인 첫 사례)
// ---------------------------------------------------------------------------

export interface SpotRow {
  id: string;
  name: string;
  total_capacity: number;
  active_boards: number;
  status: string; // active | suspended | retired
}

export interface SurferContractRow {
  id: string;
  surfer_id: string;
  spot_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  session_limit: number;
  session_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface SessionScheduleRow {
  id: string;
  spot_id: string;
  contract_id: string;
  board_id: string | null;
  board_payment_id: string | null;
  status: string; // reserved | riding | updated | finished | suspended | cancelled
  scheduled_at: string;
}

export interface BoardRow {
  id: string;
  spot_id: string;
  schedule_id: string;
  board_no: string;
  status: string; // riding | updated | finished | suspended | cancelled | expired
  started_at: string;
}

export interface BoardRefundRecordRow {
  id: string;
  surfer_id: string;
  board_id: string;
  board_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_BOARDS_PER_SPOT = 300; // SF-001: 서핑 스팟별 동시 active board 한도 (기본값, 인기 서핑 스팟 안전 수용 인원)

// ---------------------------------------------------------------------------
// SF-001: 스팟 동시 active board 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveBoard(
  db: Database.Database,
  spotId: string,
  contractId: string,
): { scheduleId: string; spotId: string; contractId: string; scheduledAt: string } {
  const spot = db
    .prepare('SELECT active_boards, total_capacity FROM spots WHERE id = ?')
    .get(spotId) as { active_boards: number; total_capacity: number } | undefined;

  if (!spot) throw new SurfingError('E404-SPOT', 'Spot not found', 404);

  const limit = spot.total_capacity ?? MAX_CONCURRENT_ACTIVE_BOARDS_PER_SPOT;

  if (spot.active_boards >= limit) {
    throw new SurfingError(
      'E422-SPOT-CAPACITY-EXCEEDED',
      `Spot is at full capacity (${spot.active_boards} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO session_schedules (id, spot_id, contract_id, board_id, board_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(scheduleId, spotId, contractId, scheduledAt);

  db.prepare(`
    UPDATE spots SET active_boards = active_boards + 1 WHERE id = ?
  `).run(spotId);

  return { scheduleId, spotId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// SF-002: 서퍼 일일 session 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailySessionLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applySessionLimit(
  db: Database.Database,
  surferId: string,
  contractId: string,
  session: number,
): { surferId: string; contractId: string; dailySessionLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT session_used, session_limit FROM surfer_contracts WHERE id = ? AND surfer_id = ? LIMIT 1')
    .get(contractId, surferId) as { session_used: number; session_limit: number } | undefined;

  if (!contract) throw new SurfingError('E404-CONTRACT', 'Surfer contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailySessionLimit` (`limit` keyword 매칭)
  const dailySessionLimit = contract.session_limit;

  if (contract.session_used + session >= dailySessionLimit) {
    throw new SurfingError(
      'E422-DAILY-SESSION-LIMIT-EXCEEDED',
      `Daily session quota exhausted (${contract.session_used + session} >= ${dailySessionLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE surfer_contracts SET session_used = session_used + ? WHERE id = ?
  `).run(session, contractId);

  return { surferId, contractId, dailySessionLimit, approved: true };
}

// ---------------------------------------------------------------------------
// SF-003: 서핑 세션 시작 atomic — boards + session_schedules 상태전환 + board_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSurfSession(
  db: Database.Database,
  spotId: string,
  scheduleId: string,
  boardNo: string,
  amount: number,
): { boardId: string; boardPaymentId: string; scheduleId: string; spotId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM session_schedules WHERE id = ? AND status = 'reserved'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new SurfingError('E404-SCHEDULE', 'Reserved board not found', 404);

  const boardId = randomUUID();
  const boardPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO boards (id, spot_id, schedule_id, board_no, status, started_at)
      VALUES (?, ?, ?, ?, 'riding', ?)
    `).run(boardId, spotId, scheduleId, boardNo, startedAt);

    db.prepare(`
      UPDATE session_schedules SET status = 'riding', board_id = ?, board_payment_id = ? WHERE id = ?
    `).run(boardId, boardPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO board_payments (id, schedule_id, board_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(boardPaymentId, scheduleId, boardId, amount, startedAt);
  });
  tx();

  return { boardId, boardPaymentId, scheduleId, spotId, startedAt };
}

// ---------------------------------------------------------------------------
// SF-004: board 상태 전환 (reserved → riding → updated → finished / suspended / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionBoardStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'riding' | 'updated' | 'finished' | 'suspended' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM session_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new SurfingError('E404-SCHEDULE', 'Session schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'reserved' && newStatus === 'riding') ||
    (schedule.status === 'riding' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'riding') ||
    (schedule.status === 'riding' && newStatus === 'finished') ||
    (schedule.status === 'updated' && newStatus === 'finished') ||
    (schedule.status === 'reserved' && newStatus === 'suspended') ||
    (schedule.status === 'riding' && newStatus === 'suspended') ||
    (schedule.status === 'reserved' && newStatus === 'cancelled') ||
    (schedule.status === 'riding' && newStatus === 'cancelled');

  if (!allowed) {
    throw new SurfingError(
      'E409-SCHEDULE',
      `Cannot transition session schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE session_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// SF-005: 만료 suspended board batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, KP-005/GF-005/EX-005/SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 61번째 재사용)
// ---------------------------------------------------------------------------
export function expireSuspendedBoardBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM boards
      WHERE status = 'suspended'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE boards
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// SF-006: session 환불 atomic — suspended board 시 board 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionRefund(
  db: Database.Database,
  surferId: string,
  boardId: string,
  boardCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; surferId: string; refundAmount: number; refundedAt: string } {
  const board = db
    .prepare("SELECT status FROM boards WHERE id = ? AND status = 'suspended'")
    .get(boardId) as { status: string } | undefined;

  if (!board) throw new SurfingError('E404-SUSPENDED-BOARD', 'Suspended board not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(boardCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO board_refund_records (id, surfer_id, board_id, board_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, surferId, boardId, boardCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO board_refunds (id, refund_record_id, surfer_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, surferId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE board_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, surferId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class SurfingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SurfingError';
  }
}
