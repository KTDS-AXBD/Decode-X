import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-EX (EX-001~EX-006): Exhibition 합성 도메인 — 69번째 도메인 (박람회/컨벤션 산업, 58번째 신규 산업)
//   - exhibition spec-container rules.md 기반 PoC source
//   - 합성 schema: venues, exhibitor_contracts, booth_schedules, admissions,
//                  booth_payments, admission_refund_records, admission_refunds
//   - 박람회 lifecycle 패턴 — venueadmission한도/exhibitordailyvisitor한도/개장batchatomic/booth상태전환/만료withdrawnadmission일괄/booth환불atomic
//   - withRuleId 재사용 69번째 도메인 (신규 detector 0개, 70 Sprint 연속 정점 round 마일스톤 도전)
//   - ExhibitionError code-in-message 패턴 (S275 표준)
//   - 58 산업 연속 0 ABSENCE 도전 (..+RA+AR+GA+AM+TH+SK+EX)
//   - 69번째 도메인 마일스톤 (exhibition 추가, 🎨 AR+EX 예술/전시 2-클러스터 신규 형성)
//   - 거울 변환 22회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition)
//   - 🎨 예술/전시 포럼 통합 추상화 (시각 예술 갤러리 + 박람회/컨벤션 부스 + B2B 전시업체 + 일일 관람객 관리)
// ---------------------------------------------------------------------------

export interface VenueRow {
  id: string;
  name: string;
  total_capacity: number;
  active_admissions: number;
  status: string; // active | suspended | retired
}

export interface ExhibitorContractRow {
  id: string;
  exhibitor_id: string;
  venue_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  visitor_limit: number;
  visitor_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface BoothScheduleRow {
  id: string;
  venue_id: string;
  contract_id: string;
  admission_id: string | null;
  booth_payment_id: string | null;
  status: string; // booked | exhibited | updated | closed | withdrawn | cancelled
  scheduled_at: string;
}

export interface AdmissionRow {
  id: string;
  venue_id: string;
  schedule_id: string;
  admission_no: string;
  status: string; // exhibited | updated | closed | withdrawn | cancelled | expired
  started_at: string;
}

export interface AdmissionRefundRecordRow {
  id: string;
  exhibitor_id: string;
  admission_id: string;
  booth_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_ADMISSIONS_PER_VENUE = 10000; // EX-001: venue별 동시 active admission 한도 (기본값, 대형 전시장 1일 동시 입장 가능 인원)

// ---------------------------------------------------------------------------
// EX-001: venue 동시 active admission 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookBooth(
  db: Database.Database,
  venueId: string,
  contractId: string,
): { scheduleId: string; venueId: string; contractId: string; scheduledAt: string } {
  const venue = db
    .prepare('SELECT active_admissions, total_capacity FROM venues WHERE id = ?')
    .get(venueId) as { active_admissions: number; total_capacity: number } | undefined;

  if (!venue) throw new ExhibitionError('E404-VENUE', 'Venue not found', 404);

  const limit = venue.total_capacity ?? MAX_CONCURRENT_ACTIVE_ADMISSIONS_PER_VENUE;

  if (venue.active_admissions >= limit) {
    throw new ExhibitionError(
      'E422-VENUE-CAPACITY-EXCEEDED',
      `Venue is at full capacity (${venue.active_admissions} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO booth_schedules (id, venue_id, contract_id, admission_id, booth_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'booked', ?)
  `).run(scheduleId, venueId, contractId, scheduledAt);

  db.prepare(`
    UPDATE venues SET active_admissions = active_admissions + 1 WHERE id = ?
  `).run(venueId);

  return { scheduleId, venueId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// EX-002: 전시업체 일일 visitor 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyVisitorLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyVisitorLimit(
  db: Database.Database,
  exhibitorId: string,
  contractId: string,
  visitor: number,
): { exhibitorId: string; contractId: string; dailyVisitorLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT visitor_used, visitor_limit FROM exhibitor_contracts WHERE id = ? AND exhibitor_id = ? LIMIT 1')
    .get(contractId, exhibitorId) as { visitor_used: number; visitor_limit: number } | undefined;

  if (!contract) throw new ExhibitionError('E404-CONTRACT', 'Exhibitor contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyVisitorLimit` (`limit` keyword 매칭)
  const dailyVisitorLimit = contract.visitor_limit;

  if (contract.visitor_used + visitor >= dailyVisitorLimit) {
    throw new ExhibitionError(
      'E422-DAILY-VISITOR-LIMIT-EXCEEDED',
      `Daily visitor quota exhausted (${contract.visitor_used + visitor} >= ${dailyVisitorLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE exhibitor_contracts SET visitor_used = visitor_used + ? WHERE id = ?
  `).run(visitor, contractId);

  return { exhibitorId, contractId, dailyVisitorLimit, approved: true };
}

// ---------------------------------------------------------------------------
// EX-003: 부스 개장 atomic — admissions + booth_schedules 상태전환 + booth_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBoothOpening(
  db: Database.Database,
  venueId: string,
  scheduleId: string,
  admissionNo: string,
  amount: number,
): { admissionId: string; boothPaymentId: string; scheduleId: string; venueId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM booth_schedules WHERE id = ? AND status = 'booked'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new ExhibitionError('E404-SCHEDULE', 'Booked booth not found', 404);

  const admissionId = randomUUID();
  const boothPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO admissions (id, venue_id, schedule_id, admission_no, status, started_at)
      VALUES (?, ?, ?, ?, 'exhibited', ?)
    `).run(admissionId, venueId, scheduleId, admissionNo, startedAt);

    db.prepare(`
      UPDATE booth_schedules SET status = 'exhibited', admission_id = ?, booth_payment_id = ? WHERE id = ?
    `).run(admissionId, boothPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO booth_payments (id, schedule_id, admission_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(boothPaymentId, scheduleId, admissionId, amount, startedAt);
  });
  tx();

  return { admissionId, boothPaymentId, scheduleId, venueId, startedAt };
}

// ---------------------------------------------------------------------------
// EX-004: booth 상태 전환 (booked → exhibited → updated → closed / withdrawn / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionBoothStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'exhibited' | 'updated' | 'closed' | 'withdrawn' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM booth_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new ExhibitionError('E404-SCHEDULE', 'Booth schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'booked' && newStatus === 'exhibited') ||
    (schedule.status === 'exhibited' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'exhibited') ||
    (schedule.status === 'exhibited' && newStatus === 'closed') ||
    (schedule.status === 'updated' && newStatus === 'closed') ||
    (schedule.status === 'booked' && newStatus === 'withdrawn') ||
    (schedule.status === 'exhibited' && newStatus === 'withdrawn') ||
    (schedule.status === 'booked' && newStatus === 'cancelled') ||
    (schedule.status === 'exhibited' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ExhibitionError(
      'E409-SCHEDULE',
      `Cannot transition booth schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE booth_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// EX-005: 만료 withdrawn admission batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SK-005/TH-005/AM-005/GA-005/AR-005/RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 58번째 재사용)
// ---------------------------------------------------------------------------
export function expireWithdrawnAdmissionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM admissions
      WHERE status = 'withdrawn'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE admissions
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// EX-006: booth 환불 atomic — withdrawn admission 시 booth 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBoothRefund(
  db: Database.Database,
  exhibitorId: string,
  admissionId: string,
  boothCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; exhibitorId: string; refundAmount: number; refundedAt: string } {
  const admission = db
    .prepare("SELECT status FROM admissions WHERE id = ? AND status = 'withdrawn'")
    .get(admissionId) as { status: string } | undefined;

  if (!admission) throw new ExhibitionError('E404-WITHDRAWN-ADMISSION', 'Withdrawn admission not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(boothCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO admission_refund_records (id, exhibitor_id, admission_id, booth_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, exhibitorId, admissionId, boothCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO admission_refunds (id, refund_record_id, exhibitor_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, exhibitorId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE admission_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, exhibitorId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ExhibitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ExhibitionError';
  }
}
