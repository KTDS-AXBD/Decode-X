import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-DJ (DJ-001~DJ-006): DJ Academy 합성 도메인 — 97번째 도메인 (DJ 학원 산업, 86번째 신규 산업) 🎧 단일 클러스터 28 도메인 첫 사례 마일스톤 신기록 + 24 Sprint 연속 첫 사례 마일스톤 신기록
//   - dj-academy spec-container rules.md 기반 PoC source
//   - 합성 schema: dj_lessons, dj_academies, memberships,
//                  deck_schedules, lesson_payments, equipment_rental,
//                  cancelled_lesson_records, lesson_refunds
//   - DJ 학원 lifecycle 패턴 — deck동시한도/lesson한도/lesson예약atomic/lesson상태전환/in_progress일괄완료/lesson환불atomic
//   - withRuleId 재사용 97번째 도메인 (신규 detector 0개, 98 Sprint 연속 정점 도전)
//   - DjAcademyError code-in-message 패턴 (S275 표준)
//   - 86 산업 연속 0 ABSENCE 도전 (..+ES+PO+DJ)
//   - 🎧 단일 클러스터 28 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC+BL+ES+PO+DJ 오프라인 엔터 28-클러스터)
//   - 🏆 24 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S393 27→S394 28)
//   - 🏆 withRuleId 98 Sprint 정점 도전 (S264~S394 98 Sprint 누적 정점)
//   - 거울 변환 50회차 round 마일스톤 (carsharing → ... → escape-room → pottery → dj-academy)
//   - Sprint WT autopilot 분리 작업 24회차 (DoD 6축 실감증 15회차)
//   - Rule prefix: DJ (DJ academy)
//   - DJ 차별성: KP(콘서트 좌석) + KR(노래방 시간제) + PO(도예 워크샵 강사) 인접하되
//     학원 모델 + 월간 멤버십 + 장비 임대 + 강사 1:1/그룹 lesson + 자가 연습 booking
//     + level 진급 시스템 (B2C 1:1 또는 소그룹 60분 + 월간 정기 결제 + 장비 별도 차별)
//   - 동시 deck 한도 8 (academy별 동시 active deck, DJ 학원 8 deck 기준)
// ---------------------------------------------------------------------------

export interface DjAcademyRow {
  id: string;
  name: string;
  max_concurrent_decks: number;
  active_decks: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  academy_id: string;
  membership_type: string; // starter | basic | pro | master
  lesson_limit: number;
  monthly_lessons: number;
  status: string; // active | paused | expired
}

export interface DjLessonRow {
  id: string;
  academy_id: string;
  membership_id: string;
  deck_id: string | null;
  schedule_id: string | null;
  payment_id: string | null;
  equipment_rental_id: string | null;
  status: string; // scheduled | in_progress | completed | no_show | cancelled
  scheduled_at: string;
}

export interface EquipmentRentalRow {
  id: string;
  academy_id: string;
  lesson_id: string;
  equipment_type: string; // cdj / mixer / controller / headphones
  rental_fee: number;
  status: string; // reserved | in_use | returned | damaged
  reserved_at: string;
}

const MAX_CONCURRENT_DECKS_PER_ACADEMY = 8; // DJ-001: academy별 동시 active deck 한도 (DJ 학원 8 deck 기준)

// ---------------------------------------------------------------------------
// DJ-001: academy별 동시 active deck 한도 검증
// (ThresholdCheck detector — F566 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveLesson(
  db: Database.Database,
  academyId: string,
  membershipId: string,
): { lessonId: string; academyId: string; membershipId: string; scheduledAt: string } {
  const academy = db
    .prepare('SELECT active_decks, max_concurrent_decks FROM dj_academies WHERE id = ?')
    .get(academyId) as { active_decks: number; max_concurrent_decks: number } | undefined;

  if (!academy) throw new DjAcademyError('E404-ACADEMY', 'DJ academy not found', 404);

  const limit = academy.max_concurrent_decks ?? MAX_CONCURRENT_DECKS_PER_ACADEMY;

  if (academy.active_decks >= limit) {
    throw new DjAcademyError(
      'E422-DECK-LIMIT-EXCEEDED',
      `Academy is at full deck capacity (${academy.active_decks} >= ${limit})`,
      422,
    );
  }

  const lessonId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO dj_lessons (id, academy_id, membership_id, deck_id, schedule_id, payment_id, equipment_rental_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'scheduled', ?)
  `).run(lessonId, academyId, membershipId, scheduledAt);

  db.prepare(`
    UPDATE dj_academies SET active_decks = active_decks + 1 WHERE id = ?
  `).run(academyId);

  return { lessonId, academyId, membershipId, scheduledAt };
}

// ---------------------------------------------------------------------------
// DJ-002: 회원 월간 lesson 한도 검증 (멤버십 등급별 월간 수강 횟수 제한)
// (ThresholdCheck detector — F566 Path B var-vs-var, lessonLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyLessonLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  lessons: number,
): { memberId: string; membershipId: string; lessonLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT monthly_lessons, lesson_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { monthly_lessons: number; lesson_limit: number } | undefined;

  if (!membership) throw new DjAcademyError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F566 Path B: var-vs-var, left=`lessonLimit` (`limit` keyword 매칭)
  const lessonLimit = membership.lesson_limit;

  if (membership.monthly_lessons + lessons >= lessonLimit) {
    throw new DjAcademyError(
      'E422-LESSON-LIMIT-EXCEEDED',
      `Membership monthly lesson quota exhausted (${membership.monthly_lessons + lessons} >= ${lessonLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET monthly_lessons = monthly_lessons + ? WHERE id = ?
  `).run(lessons, membershipId);

  return { memberId, membershipId, lessonLimit, approved: true };
}

// ---------------------------------------------------------------------------
// DJ-003: lesson 예약 atomic — deck_schedules + dj_lessons + lesson_payments + equipment_rental 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processLessonBooking(
  db: Database.Database,
  academyId: string,
  lessonId: string,
  equipmentType: string,
  instructorId: string,
  startTime: string,
  endTime: string,
  rentalFee: number,
  amount: number,
): { scheduleId: string; paymentId: string; rentalId: string; lessonId: string; academyId: string; bookedAt: string } {
  const lesson = db
    .prepare("SELECT status FROM dj_lessons WHERE id = ? AND status = 'scheduled'")
    .get(lessonId) as { status: string } | undefined;

  if (!lesson) throw new DjAcademyError('E404-LESSON', 'Scheduled lesson not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const rentalId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO deck_schedules (id, academy_id, lesson_id, instructor_id, equipment_type, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, academyId, lessonId, instructorId, equipmentType, startTime, endTime);

    db.prepare(`
      UPDATE dj_lessons SET status = 'in_progress', deck_id = ?, schedule_id = ?, payment_id = ?, equipment_rental_id = ? WHERE id = ?
    `).run(equipmentType, scheduleId, paymentId, rentalId, lessonId);

    db.prepare(`
      INSERT INTO lesson_payments (id, lesson_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, lessonId, scheduleId, amount, bookedAt);

    db.prepare(`
      INSERT INTO equipment_rental (id, academy_id, lesson_id, equipment_type, rental_fee, status, reserved_at)
      VALUES (?, ?, ?, ?, ?, 'in_use', ?)
    `).run(rentalId, academyId, lessonId, equipmentType, rentalFee, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, rentalId, lessonId, academyId, bookedAt };
}

// ---------------------------------------------------------------------------
// DJ-004: lesson 상태 전환 (scheduled → in_progress → completed / no_show / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionLessonStatus(
  db: Database.Database,
  lessonId: string,
  newStatus: 'in_progress' | 'completed' | 'no_show' | 'cancelled',
): { lessonId: string; previousStatus: string; newStatus: string } {
  const lesson = db
    .prepare('SELECT status FROM dj_lessons WHERE id = ?')
    .get(lessonId) as { status: string } | undefined;

  if (!lesson) throw new DjAcademyError('E404-LESSON', 'Lesson not found', 404);

  const previousStatus = lesson.status;
  const allowed =
    (lesson.status === 'scheduled' && newStatus === 'in_progress') ||
    (lesson.status === 'in_progress' && newStatus === 'completed') ||
    (lesson.status === 'in_progress' && newStatus === 'no_show') ||
    (lesson.status === 'scheduled' && newStatus === 'cancelled') ||
    (lesson.status === 'in_progress' && newStatus === 'cancelled');

  if (!allowed) {
    throw new DjAcademyError(
      'E409-LESSON',
      `Cannot transition DJ lesson from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE dj_lessons SET status = ? WHERE id = ?`).run(newStatus, lessonId);

  return { lessonId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// DJ-005: in_progress lesson 일괄 완료 처리 (auto-complete batch)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../PO-005 86번째 재사용)
// ---------------------------------------------------------------------------
export function autocompleteInProgressBatch(
  db: Database.Database,
  now: string,
): { completedCount: number; completedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM dj_lessons
      WHERE status = 'in_progress'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const completedIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE dj_lessons
      SET status = 'completed'
      WHERE id = ?
    `).run(item.id);
    completedIds.push(item.id);
  }

  return { completedCount: completedIds.length, completedIds };
}

// ---------------------------------------------------------------------------
// DJ-006: lesson 환불 atomic — 월간 구독 환불 + 장비 파손 변상 정책 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processLessonRefund(
  db: Database.Database,
  memberId: string,
  lessonId: string,
  lessonCost: number,
  cancellationRate: number,
  equipmentDamageCharge: number,
): { feeRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const lesson = db
    .prepare("SELECT status FROM dj_lessons WHERE id = ? AND status = 'cancelled'")
    .get(lessonId) as { status: string } | undefined;

  if (!lesson) throw new DjAcademyError('E404-CANCELLED-LESSON', 'Cancelled lesson not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.floor(lessonCost * cancellationRate);
  // 장비 파손 변상은 별도 청구 — 월간 구독 환불에서 damage charge 차감
  const refundAmount = Math.max(0, lessonCost - cancellationAmount - equipmentDamageCharge);
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_lesson_records (id, member_id, lesson_id, lesson_cost, equipment_damage_charge, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, lessonId, lessonCost, equipmentDamageCharge, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO lesson_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, feeRecordId, memberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE cancelled_lesson_records SET status = 'refunded' WHERE id = ?
    `).run(feeRecordId);
  });
  tx();

  return { feeRecordId, refundId, memberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class DjAcademyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'DjAcademyError';
  }
}
