import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-FT (FT-001~FT-006): Fitness 합성 도메인 — 42번째 도메인 (피트니스 산업, 31번째 신규 산업)
//   - fitness spec-container rules.md 기반 PoC source
//   - 합성 schema: fitness_classes, class_bookings, memberships,
//                  pt_bookings, trainer_slots, pt_payments,
//                  member_progress, equipment, equipment_reservations,
//                  equipment_holds, no_show_fees
//   - 피트니스 lifecycle 패턴 — 정원한도/PT세션한도/PT예약atomic/진행상태전환/노쇼배치/기구예약atomic
//   - withRuleId 재사용 42번째 도메인 (신규 detector 0개, 40 Sprint 연속 정점 — round number)
//   - FitnessError code-in-message 패턴 (S275 표준)
//   - 31 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT)
//   - 31번째 신규 산업 마일스톤 (fitness 추가, WL+SP+FT 클러스터 형성)
// ---------------------------------------------------------------------------

export interface FitnessClassRow {
  id: string;
  instructor_id: string;
  class_name: string;
  scheduled_at: string;
  capacity: number;
  booked_count: number;
  status: string;   // open | full | in_progress | completed | cancelled
}

export interface ClassBookingRow {
  id: string;
  member_id: string;
  class_id: string;
  status: string;       // booked | confirmed | attended | no_show | cancelled
  booked_at: string;
}

export interface MembershipRow {
  id: string;
  member_id: string;
  tier_code: string;        // basic | silver | gold | platinum
  pt_session_limit: number;
  pt_sessions_used: number;
  valid_until: string;
}

export interface PtBookingRow {
  id: string;
  member_id: string;
  trainer_id: string;
  slot_id: string;
  payment_id: string | null;
  status: string;           // reserved | confirmed | in_session | completed | cancelled
  reserved_at: string;
}

export interface MemberProgressRow {
  id: string;
  member_id: string;
  program_id: string;
  status: string;   // initial | in_progress | assessment | completed
  started_at: string | null;
  assessed_at: string | null;
  completed_at: string | null;
}

export interface EquipmentRow {
  id: string;
  name: string;
  equipment_type: string;
  status: string;   // available | reserved | in_use | maintenance
  daily_usage_count: number;
}

const MAX_CLASS_CAPACITY = 25; // FT-001: 클래스 정원 한도 (인원, 기본값)

// ---------------------------------------------------------------------------
// FT-001: 클래스 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookClassSlot(
  db: Database.Database,
  classId: string,
  memberId: string,
): { bookingId: string; classId: string; memberId: string; bookedAt: string } {
  const cls = db
    .prepare('SELECT booked_count, capacity FROM fitness_classes WHERE id = ?')
    .get(classId) as { booked_count: number; capacity: number } | undefined;

  if (!cls) throw new FitnessError('E404-CLASS', 'Fitness class not found', 404);

  const limit = cls.capacity ?? MAX_CLASS_CAPACITY;

  if (cls.booked_count >= limit) {
    throw new FitnessError(
      'E422-CLASS-CAPACITY-EXCEEDED',
      `Class is fully booked (${cls.booked_count} >= ${limit})`,
      422,
    );
  }

  const bookingId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO class_bookings (id, member_id, class_id, status, booked_at)
    VALUES (?, ?, ?, 'booked', ?)
  `).run(bookingId, memberId, classId, bookedAt);

  db.prepare(`
    UPDATE fitness_classes SET booked_count = booked_count + 1 WHERE id = ?
  `).run(classId);

  return { bookingId, classId, memberId, bookedAt };
}

// ---------------------------------------------------------------------------
// FT-002: 멤버십 PT 세션 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, ptSessionLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function usePtSession(
  db: Database.Database,
  memberId: string,
  membershipId: string,
): { memberId: string; membershipId: string; ptSessionLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT pt_sessions_used, pt_session_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { pt_sessions_used: number; pt_session_limit: number } | undefined;

  if (!membership) throw new FitnessError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F445 Path B: var-vs-var, left=`ptSessionLimit` (`limit` keyword 매칭)
  const ptSessionLimit = membership.pt_session_limit;

  if (membership.pt_sessions_used >= ptSessionLimit) {
    throw new FitnessError(
      'E422-PT-SESSION-LIMIT-EXCEEDED',
      `PT sessions exhausted (${membership.pt_sessions_used} >= ${ptSessionLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET pt_sessions_used = pt_sessions_used + 1 WHERE id = ?
  `).run(membershipId);

  return { memberId, membershipId, ptSessionLimit, approved: true };
}

// ---------------------------------------------------------------------------
// FT-003: 퍼스널 트레이닝 예약 atomic — 예약 + 트레이너 슬롯 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function bookPersonalTraining(
  db: Database.Database,
  memberId: string,
  trainerId: string,
  slotId: string,
  amount: number,
): { ptBookingId: string; paymentId: string; slotId: string; memberId: string; reservedAt: string } {
  const slot = db
    .prepare("SELECT status FROM trainer_slots WHERE id = ? AND trainer_id = ? AND status = 'available'")
    .get(slotId, trainerId) as { status: string } | undefined;

  if (!slot) throw new FitnessError('E404-SLOT', 'Trainer slot not available', 404);

  const ptBookingId = randomUUID();
  const paymentId = randomUUID();
  const reservedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO pt_bookings (id, member_id, trainer_id, slot_id, payment_id, status, reserved_at)
      VALUES (?, ?, ?, ?, ?, 'reserved', ?)
    `).run(ptBookingId, memberId, trainerId, slotId, paymentId, reservedAt);

    db.prepare(`
      UPDATE trainer_slots SET status = 'booked', booked_member_id = ? WHERE id = ?
    `).run(memberId, slotId);

    db.prepare(`
      INSERT INTO pt_payments (id, pt_booking_id, member_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, ptBookingId, memberId, amount, reservedAt);
  });
  tx();

  return { ptBookingId, paymentId, slotId, memberId, reservedAt };
}

// ---------------------------------------------------------------------------
// FT-004: 운동 진행 상태 전환 (initial → in_progress → assessment → completed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionProgressStatus(
  db: Database.Database,
  progressId: string,
  newStatus: 'in_progress' | 'assessment' | 'completed',
): { progressId: string; previousStatus: string; newStatus: string } {
  const progress = db
    .prepare('SELECT status FROM member_progress WHERE id = ?')
    .get(progressId) as { status: string } | undefined;

  if (!progress) throw new FitnessError('E404-PROGRESS', 'Member progress record not found', 404);

  const previousStatus = progress.status;
  const allowed =
    (progress.status === 'initial' && newStatus === 'in_progress') ||
    (progress.status === 'in_progress' && newStatus === 'assessment') ||
    (progress.status === 'assessment' && newStatus === 'completed');

  if (!allowed) {
    throw new FitnessError(
      'E409-PROGRESS',
      `Cannot transition progress from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  const updateField =
    newStatus === 'in_progress' ? 'started_at' :
    newStatus === 'assessment' ? 'assessed_at' : 'completed_at';

  db.prepare(`UPDATE member_progress SET status = ?, ${updateField} = ? WHERE id = ?`).run(newStatus, now, progressId);

  return { progressId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// FT-005: 노쇼 일괄 처리 (batch no-show class booking marking)
// (StatusTransition detector — batch 패턴, CC-005 31번째 재사용)
// ---------------------------------------------------------------------------
export function markNoShowBatch(
  db: Database.Database,
  scheduledBefore: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT cb.id FROM class_bookings cb
      JOIN fitness_classes fc ON cb.class_id = fc.id
      WHERE fc.scheduled_at <= ?
        AND cb.status = 'booked'
    `)
    .all(scheduledBefore) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const booking of candidates) {
    db.prepare(`
      UPDATE class_bookings
      SET status = 'no_show'
      WHERE id = ?
    `).run(booking.id);
    markedIds.push(booking.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// FT-006: 기구 예약 atomic — 예약 + hold + 사용 통계 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function reserveEquipment(
  db: Database.Database,
  memberId: string,
  equipmentId: string,
  durationMinutes: number,
): { reservationId: string; holdId: string; memberId: string; reservedAt: string } {
  const equipment = db
    .prepare("SELECT status FROM equipment WHERE id = ? AND status = 'available'")
    .get(equipmentId) as { status: string } | undefined;

  if (!equipment) throw new FitnessError('E404-EQUIPMENT', 'Equipment not available for reservation', 404);

  const reservationId = randomUUID();
  const holdId = randomUUID();
  const reservedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO equipment_reservations (id, member_id, equipment_id, duration_minutes, status, reserved_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(reservationId, memberId, equipmentId, durationMinutes, reservedAt);

    db.prepare(`
      INSERT INTO equipment_holds (id, reservation_id, equipment_id, held_at, released_at)
      VALUES (?, ?, ?, ?, NULL)
    `).run(holdId, reservationId, equipmentId, reservedAt);

    db.prepare(`
      UPDATE equipment
      SET status = 'reserved', daily_usage_count = daily_usage_count + 1
      WHERE id = ?
    `).run(equipmentId);
  });
  tx();

  return { reservationId, holdId, memberId, reservedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class FitnessError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'FitnessError';
  }
}
