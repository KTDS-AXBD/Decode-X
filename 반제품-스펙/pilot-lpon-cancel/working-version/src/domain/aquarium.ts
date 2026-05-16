import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AQ (AQ-001~AQ-006): Aquarium 합성 도메인 — 73번째 도메인 (수족관/해양생물 산업, 62번째 신규 산업) 🏆🏆🏆 1세션 10 Sprint 신기록 도전
//   - aquarium spec-container rules.md 기반 PoC source
//   - 합성 schema: aquariums, guest_contracts, tour_schedules, admits,
//                  admit_payments, admit_refund_records, admit_refunds
//   - 수족관 lifecycle 패턴 — 수족관admit한도/guestdailytour한도/입장batchatomic/admit상태전환/만료closedadmit일괄/tour환불atomic
//   - withRuleId 재사용 73번째 도메인 (신규 detector 0개, 74 Sprint 연속 정점 도전)
//   - AquariumError code-in-message 패턴 (S275 표준)
//   - 62 산업 연속 0 ABSENCE 도전 (..+TH+SK+EX+GF+KP+SF+AQ)
//   - 🏆🏆🏆 1세션 10 Sprint 신기록 도전 (직전 세션 305 9 Sprint 신기록 갱신)
//   - 거울 변환 26회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium)
//   - 🐠 AM+TH+KP+AQ 오프라인 엔터 4-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 통합 추상화 — 단일 클러스터 4 도메인 두 번째 사례, SP 4-클러스터에 이어 두 클러스터 동시 4 도메인 형성 마일스톤)
// ---------------------------------------------------------------------------

export interface AquariumRow {
  id: string;
  name: string;
  total_capacity: number;
  active_admits: number;
  status: string; // active | suspended | retired
}

export interface GuestContractRow {
  id: string;
  guest_id: string;
  aquarium_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  tour_limit: number;
  tour_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface TourScheduleRow {
  id: string;
  aquarium_id: string;
  contract_id: string;
  admit_id: string | null;
  admit_payment_id: string | null;
  status: string; // reserved | toured | updated | ended | closed | cancelled
  scheduled_at: string;
}

export interface AdmitRow {
  id: string;
  aquarium_id: string;
  schedule_id: string;
  admit_no: string;
  status: string; // toured | updated | ended | closed | cancelled | expired
  started_at: string;
}

export interface AdmitRefundRecordRow {
  id: string;
  guest_id: string;
  admit_id: string;
  admit_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_ADMITS_PER_AQUARIUM = 8000; // AQ-001: 수족관별 동시 active admit 한도 (기본값, 대형 수족관 일일 동시 관람 가능 인원)

// ---------------------------------------------------------------------------
// AQ-001: 수족관 동시 active admit 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookAdmit(
  db: Database.Database,
  aquariumId: string,
  contractId: string,
): { scheduleId: string; aquariumId: string; contractId: string; scheduledAt: string } {
  const aquarium = db
    .prepare('SELECT active_admits, total_capacity FROM aquariums WHERE id = ?')
    .get(aquariumId) as { active_admits: number; total_capacity: number } | undefined;

  if (!aquarium) throw new AquariumError('E404-AQUARIUM', 'Aquarium not found', 404);

  const limit = aquarium.total_capacity ?? MAX_CONCURRENT_ACTIVE_ADMITS_PER_AQUARIUM;

  if (aquarium.active_admits >= limit) {
    throw new AquariumError(
      'E422-AQUARIUM-CAPACITY-EXCEEDED',
      `Aquarium is at full capacity (${aquarium.active_admits} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO tour_schedules (id, aquarium_id, contract_id, admit_id, admit_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(scheduleId, aquariumId, contractId, scheduledAt);

  db.prepare(`
    UPDATE aquariums SET active_admits = active_admits + 1 WHERE id = ?
  `).run(aquariumId);

  return { scheduleId, aquariumId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// AQ-002: 관람객 일일 tour 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyTourLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyTourLimit(
  db: Database.Database,
  guestId: string,
  contractId: string,
  tour: number,
): { guestId: string; contractId: string; dailyTourLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT tour_used, tour_limit FROM guest_contracts WHERE id = ? AND guest_id = ? LIMIT 1')
    .get(contractId, guestId) as { tour_used: number; tour_limit: number } | undefined;

  if (!contract) throw new AquariumError('E404-CONTRACT', 'Guest contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyTourLimit` (`limit` keyword 매칭)
  const dailyTourLimit = contract.tour_limit;

  if (contract.tour_used + tour >= dailyTourLimit) {
    throw new AquariumError(
      'E422-DAILY-TOUR-LIMIT-EXCEEDED',
      `Daily tour quota exhausted (${contract.tour_used + tour} >= ${dailyTourLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE guest_contracts SET tour_used = tour_used + ? WHERE id = ?
  `).run(tour, contractId);

  return { guestId, contractId, dailyTourLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AQ-003: 관람 입장 atomic — admits + tour_schedules 상태전환 + admit_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processAdmitEntry(
  db: Database.Database,
  aquariumId: string,
  scheduleId: string,
  admitNo: string,
  amount: number,
): { admitId: string; admitPaymentId: string; scheduleId: string; aquariumId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM tour_schedules WHERE id = ? AND status = 'reserved'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new AquariumError('E404-SCHEDULE', 'Reserved admit not found', 404);

  const admitId = randomUUID();
  const admitPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO admits (id, aquarium_id, schedule_id, admit_no, status, started_at)
      VALUES (?, ?, ?, ?, 'toured', ?)
    `).run(admitId, aquariumId, scheduleId, admitNo, startedAt);

    db.prepare(`
      UPDATE tour_schedules SET status = 'toured', admit_id = ?, admit_payment_id = ? WHERE id = ?
    `).run(admitId, admitPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO admit_payments (id, schedule_id, admit_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(admitPaymentId, scheduleId, admitId, amount, startedAt);
  });
  tx();

  return { admitId, admitPaymentId, scheduleId, aquariumId, startedAt };
}

// ---------------------------------------------------------------------------
// AQ-004: admit 상태 전환 (reserved → toured → updated → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionAdmitStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'toured' | 'updated' | 'ended' | 'closed' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM tour_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new AquariumError('E404-SCHEDULE', 'Tour schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'reserved' && newStatus === 'toured') ||
    (schedule.status === 'toured' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'toured') ||
    (schedule.status === 'toured' && newStatus === 'ended') ||
    (schedule.status === 'updated' && newStatus === 'ended') ||
    (schedule.status === 'reserved' && newStatus === 'closed') ||
    (schedule.status === 'toured' && newStatus === 'closed') ||
    (schedule.status === 'reserved' && newStatus === 'cancelled') ||
    (schedule.status === 'toured' && newStatus === 'cancelled');

  if (!allowed) {
    throw new AquariumError(
      'E409-SCHEDULE',
      `Cannot transition tour schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE tour_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AQ-005: 만료 closed admit batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/GF-005/EX-005/SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 62번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedAdmitBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM admits
      WHERE status = 'closed'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE admits
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// AQ-006: tour 환불 atomic — closed admit 시 admit 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTourRefund(
  db: Database.Database,
  guestId: string,
  admitId: string,
  admitCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; guestId: string; refundAmount: number; refundedAt: string } {
  const admit = db
    .prepare("SELECT status FROM admits WHERE id = ? AND status = 'closed'")
    .get(admitId) as { status: string } | undefined;

  if (!admit) throw new AquariumError('E404-CLOSED-ADMIT', 'Closed admit not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(admitCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO admit_refund_records (id, guest_id, admit_id, admit_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, guestId, admitId, admitCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO admit_refunds (id, refund_record_id, guest_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, guestId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE admit_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, guestId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class AquariumError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AquariumError';
  }
}
