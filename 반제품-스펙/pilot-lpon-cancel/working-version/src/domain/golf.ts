import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-GF (GF-001~GF-006): Golf 합성 도메인 — 70번째 도메인 (골프장/필드 운영 산업, 59번째 신규 산업) 🏆🏆 70번째 도메인 round 마일스톤
//   - golf spec-container rules.md 기반 PoC source
//   - 합성 schema: courses, member_contracts, tee_schedules, rounds,
//                  round_payments, round_refund_records, round_refunds
//   - 골프장 lifecycle 패턴 — 코스round한도/memberdailyround한도/티오프batchatomic/round상태전환/만료suspendedround일괄/course환불atomic
//   - withRuleId 재사용 70번째 도메인 (신규 detector 0개, 71 Sprint 연속 정점 도전)
//   - GolfError code-in-message 패턴 (S275 표준)
//   - 59 산업 연속 0 ABSENCE 도전 (..+AR+GA+AM+TH+SK+EX+GF)
//   - 🏆🏆 70번째 도메인 round 마일스톤 (S262 5 → S306 70, 14배 확장)
//   - 거울 변환 23회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf)
//   - ⛳ 스포츠/레저 3-클러스터 확장 (SP 피트니스/스포츠 + SK 윈터 레저 + GF 골프) — 단일 클러스터 3 도메인 첫 사례
// ---------------------------------------------------------------------------

export interface CourseRow {
  id: string;
  name: string;
  total_capacity: number;
  active_rounds: number;
  status: string; // active | suspended | retired
}

export interface MemberContractRow {
  id: string;
  member_id: string;
  course_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  round_limit: number;
  round_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface TeeScheduleRow {
  id: string;
  course_id: string;
  contract_id: string;
  round_id: string | null;
  round_payment_id: string | null;
  status: string; // reserved | teedoff | updated | finished | suspended | cancelled
  scheduled_at: string;
}

export interface RoundRow {
  id: string;
  course_id: string;
  schedule_id: string;
  round_no: string;
  status: string; // teedoff | updated | finished | suspended | cancelled | expired
  started_at: string;
}

export interface RoundRefundRecordRow {
  id: string;
  member_id: string;
  round_id: string;
  round_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_ROUNDS_PER_COURSE = 200; // GF-001: 골프장별 동시 active round 한도 (기본값, 18홀 골프장 동시 진행 가능 라운드 ~ 144 그룹 × 안전 마진)

// ---------------------------------------------------------------------------
// GF-001: 골프장 동시 active round 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveTeeTime(
  db: Database.Database,
  courseId: string,
  contractId: string,
): { scheduleId: string; courseId: string; contractId: string; scheduledAt: string } {
  const course = db
    .prepare('SELECT active_rounds, total_capacity FROM courses WHERE id = ?')
    .get(courseId) as { active_rounds: number; total_capacity: number } | undefined;

  if (!course) throw new GolfError('E404-COURSE', 'Course not found', 404);

  const limit = course.total_capacity ?? MAX_CONCURRENT_ACTIVE_ROUNDS_PER_COURSE;

  if (course.active_rounds >= limit) {
    throw new GolfError(
      'E422-COURSE-CAPACITY-EXCEEDED',
      `Course is at full capacity (${course.active_rounds} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO tee_schedules (id, course_id, contract_id, round_id, round_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(scheduleId, courseId, contractId, scheduledAt);

  db.prepare(`
    UPDATE courses SET active_rounds = active_rounds + 1 WHERE id = ?
  `).run(courseId);

  return { scheduleId, courseId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// GF-002: 회원 일일 round 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyRoundLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyRoundLimit(
  db: Database.Database,
  memberId: string,
  contractId: string,
  round: number,
): { memberId: string; contractId: string; dailyRoundLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT round_used, round_limit FROM member_contracts WHERE id = ? AND member_id = ? LIMIT 1')
    .get(contractId, memberId) as { round_used: number; round_limit: number } | undefined;

  if (!contract) throw new GolfError('E404-CONTRACT', 'Member contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyRoundLimit` (`limit` keyword 매칭)
  const dailyRoundLimit = contract.round_limit;

  if (contract.round_used + round >= dailyRoundLimit) {
    throw new GolfError(
      'E422-DAILY-ROUND-LIMIT-EXCEEDED',
      `Daily round quota exhausted (${contract.round_used + round} >= ${dailyRoundLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE member_contracts SET round_used = round_used + ? WHERE id = ?
  `).run(round, contractId);

  return { memberId, contractId, dailyRoundLimit, approved: true };
}

// ---------------------------------------------------------------------------
// GF-003: 티오프 atomic — rounds + tee_schedules 상태전환 + round_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTeeOff(
  db: Database.Database,
  courseId: string,
  scheduleId: string,
  roundNo: string,
  amount: number,
): { roundId: string; roundPaymentId: string; scheduleId: string; courseId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM tee_schedules WHERE id = ? AND status = 'reserved'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new GolfError('E404-SCHEDULE', 'Reserved tee time not found', 404);

  const roundId = randomUUID();
  const roundPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO rounds (id, course_id, schedule_id, round_no, status, started_at)
      VALUES (?, ?, ?, ?, 'teedoff', ?)
    `).run(roundId, courseId, scheduleId, roundNo, startedAt);

    db.prepare(`
      UPDATE tee_schedules SET status = 'teedoff', round_id = ?, round_payment_id = ? WHERE id = ?
    `).run(roundId, roundPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO round_payments (id, schedule_id, round_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(roundPaymentId, scheduleId, roundId, amount, startedAt);
  });
  tx();

  return { roundId, roundPaymentId, scheduleId, courseId, startedAt };
}

// ---------------------------------------------------------------------------
// GF-004: round 상태 전환 (reserved → teedoff → updated → finished / suspended / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionRoundStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'teedoff' | 'updated' | 'finished' | 'suspended' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM tee_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new GolfError('E404-SCHEDULE', 'Tee schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'reserved' && newStatus === 'teedoff') ||
    (schedule.status === 'teedoff' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'teedoff') ||
    (schedule.status === 'teedoff' && newStatus === 'finished') ||
    (schedule.status === 'updated' && newStatus === 'finished') ||
    (schedule.status === 'reserved' && newStatus === 'suspended') ||
    (schedule.status === 'teedoff' && newStatus === 'suspended') ||
    (schedule.status === 'reserved' && newStatus === 'cancelled') ||
    (schedule.status === 'teedoff' && newStatus === 'cancelled');

  if (!allowed) {
    throw new GolfError(
      'E409-SCHEDULE',
      `Cannot transition tee schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE tee_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// GF-005: 만료 suspended round batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, EX-005/SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 59번째 재사용)
// ---------------------------------------------------------------------------
export function expireSuspendedRoundBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM rounds
      WHERE status = 'suspended'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE rounds
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// GF-006: course 환불 atomic — suspended round 시 round 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCourseRefund(
  db: Database.Database,
  memberId: string,
  roundId: string,
  roundCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const round = db
    .prepare("SELECT status FROM rounds WHERE id = ? AND status = 'suspended'")
    .get(roundId) as { status: string } | undefined;

  if (!round) throw new GolfError('E404-SUSPENDED-ROUND', 'Suspended round not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(roundCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO round_refund_records (id, member_id, round_id, round_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, memberId, roundId, roundCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO round_refunds (id, refund_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, memberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE round_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, memberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class GolfError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'GolfError';
  }
}
