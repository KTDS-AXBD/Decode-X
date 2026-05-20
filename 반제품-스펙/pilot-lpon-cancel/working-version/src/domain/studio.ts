import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-ST (ST-001~ST-006): Studio 합성 도메인 — 89번째 도메인 (다용도 스튜디오 산업, 78번째 신규 산업) 🎬 단일 클러스터 20 도메인 round 마일스톤 신기록
//   - studio spec-container rules.md 기반 PoC source
//   - 합성 schema: studio_slots, studios, memberships,
//                  equipment_schedules, slot_payments, cancelled_fee_records, slot_refunds
//   - 스튜디오 lifecycle 패턴 — 동시슬롯한도/장비한도/슬롯예약atomic/슬롯상태전환/closed슬롯일괄만료/슬롯환불atomic
//   - withRuleId 재사용 89번째 도메인 (신규 detector 0개, 90 Sprint 연속 정점 round 마일스톤 도전)
//   - StudioError code-in-message 패턴 (S275 표준)
//   - 78 산업 연속 0 ABSENCE 도전 (..+WB+BC+CO+KR+NC+ST)
//   - 🎬 단일 클러스터 20 도메인 round 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST 오프라인 엔터 20-클러스터)
//   - 🏆 16 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S385 19→S386 20)
//   - 🏆 89번째 도메인 17.8배 확장 (S262 5 → S386 89)
//   - 🏆 withRuleId 90 Sprint 정점 round 마일스톤 (S264~S386 90 Sprint 누적 정점)
//   - 거울 변환 42회차 (carsharing → ... → concert-hall → karaoke → night-club → studio)
//   - Sprint WT autopilot 분리 작업 16회차 (DoD 6축 실감증 7회차 정착 완성 검증)
//   - ST 차별성: KR(노래방 프라이빗 룸 1-3시간) + NC(나이트클럽 야간 입장권) 인접하되 녹음+사진+댄스+동영상 워 임대+장비 임대+시간제+패키지 수세
//   - 동시 한도 20 (스튜디오별 동시 active slot, 소형 전문 스튜디오 기반)
//   - KR(노래방별 20 room) vs NC(클럽별 500 guest) vs ST(스튜디오별 20 slot + 전문 장비 임대)
// ---------------------------------------------------------------------------

export interface StudioRow {
  id: string;
  name: string;
  max_concurrent_slots: number;
  active_slots: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  studio_id: string;
  membership_type: string; // basic | professional | enterprise
  equipment_limit: number;
  daily_used: number;
  status: string; // active | paused | expired | cancelled
}

export interface StudioSlotRow {
  id: string;
  studio_id: string;
  membership_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | ongoing | ended | closed | cancelled
  reserved_at: string;
}

export interface EquipmentScheduleRow {
  id: string;
  studio_id: string;
  slot_id: string;
  equipment_type: string;
  start_time: string;
  end_time: string;
  package_type: string;
  status: string; // confirmed | active | completed | cancelled | expired
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  slot_id: string;
  slot_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_SLOTS_PER_STUDIO = 20; // ST-001: 스튜디오별 동시 active slot 한도 (소형 전문 스튜디오 기준)

// ---------------------------------------------------------------------------
// ST-001: 스튜디오별 동시 active slot 한도 검증
// (ThresholdCheck detector — F558 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveSlot(
  db: Database.Database,
  studioId: string,
  membershipId: string,
): { slotId: string; studioId: string; membershipId: string; reservedAt: string } {
  const studio = db
    .prepare('SELECT active_slots, max_concurrent_slots FROM studios WHERE id = ?')
    .get(studioId) as { active_slots: number; max_concurrent_slots: number } | undefined;

  if (!studio) throw new StudioError('E404-STUDIO', 'Studio not found', 404);

  const limit = studio.max_concurrent_slots ?? MAX_CONCURRENT_SLOTS_PER_STUDIO;

  if (studio.active_slots >= limit) {
    throw new StudioError(
      'E422-STUDIO-SLOT-LIMIT-EXCEEDED',
      `Studio is at full slot capacity (${studio.active_slots} >= ${limit})`,
      422,
    );
  }

  const slotId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO studio_slots (id, studio_id, membership_id, schedule_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(slotId, studioId, membershipId, reservedAt);

  db.prepare(`
    UPDATE studios SET active_slots = active_slots + 1 WHERE id = ?
  `).run(studioId);

  return { slotId, studioId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// ST-002: 회원 장비 한도 검증 (멤버십 등급별 일일 장비 예약 제한)
// (ThresholdCheck detector — F558 Path B var-vs-var, equipmentLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyEquipmentLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  equipment: number,
): { memberId: string; membershipId: string; equipmentLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, equipment_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; equipment_limit: number } | undefined;

  if (!membership) throw new StudioError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F558 Path B: var-vs-var, left=`equipmentLimit` (`limit` keyword 매칭)
  const equipmentLimit = membership.equipment_limit;

  if (membership.daily_used + equipment >= equipmentLimit) {
    throw new StudioError(
      'E422-EQUIPMENT-LIMIT-EXCEEDED',
      `Membership equipment quota exhausted (${membership.daily_used + equipment} >= ${equipmentLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(equipment, membershipId);

  return { memberId, membershipId, equipmentLimit, approved: true };
}

// ---------------------------------------------------------------------------
// ST-003: 슬롯 예약 atomic — studio_slots + equipment_schedules + slot_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSlotBooking(
  db: Database.Database,
  studioId: string,
  slotId: string,
  equipmentType: string,
  startTime: string,
  endTime: string,
  packageType: string,
  amount: number,
): { scheduleId: string; paymentId: string; slotId: string; studioId: string; bookedAt: string } {
  const slot = db
    .prepare("SELECT status FROM studio_slots WHERE id = ? AND status = 'reserved'")
    .get(slotId) as { status: string } | undefined;

  if (!slot) throw new StudioError('E404-SLOT', 'Reserved slot not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO equipment_schedules (id, studio_id, slot_id, equipment_type, start_time, end_time, package_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, studioId, slotId, equipmentType, startTime, endTime, packageType);

    db.prepare(`
      UPDATE studio_slots SET status = 'ongoing', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, slotId);

    db.prepare(`
      INSERT INTO slot_payments (id, slot_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, slotId, scheduleId, amount, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, slotId, studioId, bookedAt };
}

// ---------------------------------------------------------------------------
// ST-004: slot 상태 전환 (reserved → ongoing → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSlotStatus(
  db: Database.Database,
  slotId: string,
  newStatus: 'ongoing' | 'ended' | 'closed' | 'cancelled',
): { slotId: string; previousStatus: string; newStatus: string } {
  const slot = db
    .prepare('SELECT status FROM studio_slots WHERE id = ?')
    .get(slotId) as { status: string } | undefined;

  if (!slot) throw new StudioError('E404-SLOT', 'Slot not found', 404);

  const previousStatus = slot.status;
  const allowed =
    (slot.status === 'reserved' && newStatus === 'ongoing') ||
    (slot.status === 'ongoing' && newStatus === 'ended') ||
    (slot.status === 'ongoing' && newStatus === 'closed') ||
    (slot.status === 'reserved' && newStatus === 'cancelled') ||
    (slot.status === 'ongoing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new StudioError(
      'E409-SLOT',
      `Cannot transition slot from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE studio_slots SET status = ? WHERE id = ?`).run(newStatus, slotId);

  return { slotId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// ST-005: closed slot 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BC-005/CO-005/KR-005/NC-005 78번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedSlotBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM studio_slots
      WHERE status = 'closed'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE studio_slots
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// ST-006: slot 환불 atomic — 취소 슬롯 시 패키지 환불 정책 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSlotRefund(
  db: Database.Database,
  memberId: string,
  slotId: string,
  slotCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const slot = db
    .prepare("SELECT status FROM studio_slots WHERE id = ? AND status = 'cancelled'")
    .get(slotId) as { status: string } | undefined;

  if (!slot) throw new StudioError('E404-CANCELLED-SLOT', 'Cancelled slot not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(slotCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, slot_id, slot_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, slotId, slotCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO slot_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
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
export class StudioError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'StudioError';
  }
}
