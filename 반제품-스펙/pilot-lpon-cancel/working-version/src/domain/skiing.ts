import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-SK (SK-001~SK-006): Skiing 합성 도메인 — 68번째 도메인 (스키 리조트 산업, 57번째 신규 산업)
//   - skiing spec-container rules.md 기반 PoC source
//   - 합성 schema: resorts, skier_contracts, lift_schedules, passes,
//                  pass_payments, pass_refund_records, pass_refunds
//   - 스키 리조트 lifecycle 패턴 — 리조트pass한도/skierdailyride한도/탑승batchatomic/pass상태전환/만료suspendedpass일괄/slope환불atomic
//   - withRuleId 재사용 68번째 도메인 (신규 detector 0개, 69 Sprint 연속 정점 도전)
//   - SkiingError code-in-message 패턴 (S275 표준)
//   - 57 산업 연속 0 ABSENCE 도전 (..+PC+RA+AR+GA+AM+TH+SK)
//   - 68번째 도메인 마일스톤 (skiing 추가, 🏔️ SP+SK 스포츠 레저 2-클러스터 신규 형성)
//   - 거울 변환 21회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing)
//   - 🏔️ 스포츠/레저 통합 추상화 (피트니스 시설 + 스포츠 강습 + 윈터 레저 + 시즌권자 정책)
// ---------------------------------------------------------------------------

export interface ResortRow {
  id: string;
  name: string;
  total_capacity: number;
  active_passes: number;
  status: string; // active | suspended | retired
}

export interface SkierContractRow {
  id: string;
  skier_id: string;
  resort_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  ride_limit: number;
  ride_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface LiftScheduleRow {
  id: string;
  resort_id: string;
  contract_id: string;
  pass_id: string | null;
  pass_payment_id: string | null;
  status: string; // reserved | boarded | updated | completed | suspended | cancelled
  scheduled_at: string;
}

export interface PassRow {
  id: string;
  resort_id: string;
  schedule_id: string;
  pass_no: string;
  status: string; // boarded | updated | completed | suspended | cancelled | expired
  started_at: string;
}

export interface PassRefundRecordRow {
  id: string;
  skier_id: string;
  pass_id: string;
  pass_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_PASSES_PER_RESORT = 8000; // SK-001: 리조트별 동시 active pass 한도 (기본값, 대형 스키 리조트 동시 이용 가능 인원)

// ---------------------------------------------------------------------------
// SK-001: 리조트 동시 active pass 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reservePass(
  db: Database.Database,
  resortId: string,
  contractId: string,
): { scheduleId: string; resortId: string; contractId: string; scheduledAt: string } {
  const resort = db
    .prepare('SELECT active_passes, total_capacity FROM resorts WHERE id = ?')
    .get(resortId) as { active_passes: number; total_capacity: number } | undefined;

  if (!resort) throw new SkiingError('E404-RESORT', 'Resort not found', 404);

  const limit = resort.total_capacity ?? MAX_CONCURRENT_ACTIVE_PASSES_PER_RESORT;

  if (resort.active_passes >= limit) {
    throw new SkiingError(
      'E422-RESORT-CAPACITY-EXCEEDED',
      `Resort is at full capacity (${resort.active_passes} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO lift_schedules (id, resort_id, contract_id, pass_id, pass_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(scheduleId, resortId, contractId, scheduledAt);

  db.prepare(`
    UPDATE resorts SET active_passes = active_passes + 1 WHERE id = ?
  `).run(resortId);

  return { scheduleId, resortId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// SK-002: 스키어 일일 ride 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyRideLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyRideLimit(
  db: Database.Database,
  skierId: string,
  contractId: string,
  ride: number,
): { skierId: string; contractId: string; dailyRideLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT ride_used, ride_limit FROM skier_contracts WHERE id = ? AND skier_id = ? LIMIT 1')
    .get(contractId, skierId) as { ride_used: number; ride_limit: number } | undefined;

  if (!contract) throw new SkiingError('E404-CONTRACT', 'Skier contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyRideLimit` (`limit` keyword 매칭)
  const dailyRideLimit = contract.ride_limit;

  if (contract.ride_used + ride >= dailyRideLimit) {
    throw new SkiingError(
      'E422-DAILY-RIDE-LIMIT-EXCEEDED',
      `Daily ride quota exhausted (${contract.ride_used + ride} >= ${dailyRideLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE skier_contracts SET ride_used = ride_used + ? WHERE id = ?
  `).run(ride, contractId);

  return { skierId, contractId, dailyRideLimit, approved: true };
}

// ---------------------------------------------------------------------------
// SK-003: 리프트 탑승 atomic — passes + lift_schedules 상태전환 + pass_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processLiftBoarding(
  db: Database.Database,
  resortId: string,
  scheduleId: string,
  passNo: string,
  amount: number,
): { passId: string; passPaymentId: string; scheduleId: string; resortId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM lift_schedules WHERE id = ? AND status = 'reserved'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new SkiingError('E404-SCHEDULE', 'Reserved pass not found', 404);

  const passId = randomUUID();
  const passPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO passes (id, resort_id, schedule_id, pass_no, status, started_at)
      VALUES (?, ?, ?, ?, 'boarded', ?)
    `).run(passId, resortId, scheduleId, passNo, startedAt);

    db.prepare(`
      UPDATE lift_schedules SET status = 'boarded', pass_id = ?, pass_payment_id = ? WHERE id = ?
    `).run(passId, passPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO pass_payments (id, schedule_id, pass_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(passPaymentId, scheduleId, passId, amount, startedAt);
  });
  tx();

  return { passId, passPaymentId, scheduleId, resortId, startedAt };
}

// ---------------------------------------------------------------------------
// SK-004: pass 상태 전환 (reserved → boarded → updated → completed / suspended / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionPassStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'boarded' | 'updated' | 'completed' | 'suspended' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM lift_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new SkiingError('E404-SCHEDULE', 'Lift schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'reserved' && newStatus === 'boarded') ||
    (schedule.status === 'boarded' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'boarded') ||
    (schedule.status === 'boarded' && newStatus === 'completed') ||
    (schedule.status === 'updated' && newStatus === 'completed') ||
    (schedule.status === 'reserved' && newStatus === 'suspended') ||
    (schedule.status === 'boarded' && newStatus === 'suspended') ||
    (schedule.status === 'reserved' && newStatus === 'cancelled') ||
    (schedule.status === 'boarded' && newStatus === 'cancelled');

  if (!allowed) {
    throw new SkiingError(
      'E409-SCHEDULE',
      `Cannot transition lift schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE lift_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// SK-005: 만료 suspended pass batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 57번째 재사용)
// ---------------------------------------------------------------------------
export function expireSuspendedPassBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM passes
      WHERE status = 'suspended'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE passes
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// SK-006: slope 환불 atomic — suspended pass 시 pass 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSlopeRefund(
  db: Database.Database,
  skierId: string,
  passId: string,
  passCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; skierId: string; refundAmount: number; refundedAt: string } {
  const pass = db
    .prepare("SELECT status FROM passes WHERE id = ? AND status = 'suspended'")
    .get(passId) as { status: string } | undefined;

  if (!pass) throw new SkiingError('E404-SUSPENDED-PASS', 'Suspended pass not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(passCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO pass_refund_records (id, skier_id, pass_id, pass_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, skierId, passId, passCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO pass_refunds (id, refund_record_id, skier_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, skierId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE pass_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, skierId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class SkiingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SkiingError';
  }
}
