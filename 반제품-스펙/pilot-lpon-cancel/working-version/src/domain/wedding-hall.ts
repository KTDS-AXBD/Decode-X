import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-WB (WB-001~WB-006): Wedding hall 합성 도메인 — 84번째 도메인 (예식장 산업, 73번째 신규 산업) 💒 단일 클러스터 15 도메인 첫 사례 마일스톤 신기록
//   - wedding-hall spec-container rules.md 기반 PoC source
//   - 합성 schema: wedding_ceremonies, wedding_halls, hall_memberships,
//                  hall_schedules, ceremony_payments, cancelled_fee_records, ceremony_refunds
//   - 예식장 lifecycle 패턴 — 동시예식한도/hall한도/예식예약atomic/예식상태전환/closed예식일괄만료/예식환불atomic
//   - withRuleId 재사용 84번째 도메인 (신규 detector 0개, 85 Sprint 연속 정점 도전)
//   - WeddingHallError code-in-message 패턴 (S275 표준)
//   - 73 산업 연속 0 ABSENCE 도전 (..+OB+PL+CV+WB)
//   - 💒 단일 클러스터 15 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB 오프라인 엔터 15-클러스터)
//   - 💒 11 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S378 13→S380 14→S381 15)
//   - 🏆 84번째 도메인 16.8배 확장 도전 (S262 5 → S381 84)
//   - 거울 변환 37회차 (carsharing → fastfood → ... → planetarium → convention → wedding-hall)
//   - Sprint WT autopilot 분리 작업 11회차 (DoD 6축 실감증 2회차 — domain-sprint-guard.yml 정착 검증)
//   - WB 차별성: 단일 예식 + 시간대 슬롯 + 가족/하객 좌석 + 계약금/위약금 (B2C 단일 1회성 이벤트, CV 컨벤션 다중 트랙 B2B와 대비)
//   - 동시 한도 3 (예식장별 동시 active ceremony 기반, 예식장은 홀 수 제한으로 동시 3)
// ---------------------------------------------------------------------------

export interface WeddingHallRow {
  id: string;
  name: string;
  max_concurrent_ceremonies: number;
  active_ceremonies: number;
  status: string; // active | closed | suspended
}

export interface HallMembershipRow {
  id: string;
  member_id: string;
  hall_id: string;
  membership_type: string; // standard | premium | vip
  hall_limit: number;
  hall_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface WeddingCeremonyRow {
  id: string;
  hall_id: string;
  membership_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | ongoing | ended | closed | cancelled
  scheduled_at: string;
}

export interface HallScheduleRow {
  id: string;
  hall_id: string;
  ceremony_id: string;
  slot_time: string;
  guest_count: number;
  ceremony_type: string; // morning | afternoon | evening
  status: string; // active | completed | cancelled | expired
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  ceremony_id: string;
  ceremony_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_CEREMONIES_PER_HALL = 3; // WB-001: 예식장별 동시 active ceremony 한도 (홀 수 기반, 예식장 특성상 3)

// ---------------------------------------------------------------------------
// WB-001: 예식장 동시 active ceremony 한도 검증
// (ThresholdCheck detector — F553 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveCeremony(
  db: Database.Database,
  hallId: string,
  membershipId: string,
): { ceremonyId: string; hallId: string; membershipId: string; scheduledAt: string } {
  const hall = db
    .prepare('SELECT active_ceremonies, max_concurrent_ceremonies FROM wedding_halls WHERE id = ?')
    .get(hallId) as { active_ceremonies: number; max_concurrent_ceremonies: number } | undefined;

  if (!hall) throw new WeddingHallError('E404-HALL', 'Wedding hall not found', 404);

  const limit = hall.max_concurrent_ceremonies ?? MAX_CONCURRENT_CEREMONIES_PER_HALL;

  if (hall.active_ceremonies >= limit) {
    throw new WeddingHallError(
      'E422-HALL-CEREMONY-LIMIT-EXCEEDED',
      `Hall is at full ceremony capacity (${hall.active_ceremonies} >= ${limit})`,
      422,
    );
  }

  const ceremonyId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO wedding_ceremonies (id, hall_id, membership_id, schedule_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(ceremonyId, hallId, membershipId, scheduledAt);

  db.prepare(`
    UPDATE wedding_halls SET active_ceremonies = active_ceremonies + 1 WHERE id = ?
  `).run(hallId);

  return { ceremonyId, hallId, membershipId, scheduledAt };
}

// ---------------------------------------------------------------------------
// WB-002: 회원 hall 예약 한도 검증 (멤버십 유형별 hall 제한)
// (ThresholdCheck detector — F553 Path B var-vs-var, hallLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyHallLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  halls: number,
): { memberId: string; membershipId: string; hallLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT hall_used, hall_limit FROM hall_memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { hall_used: number; hall_limit: number } | undefined;

  if (!membership) throw new WeddingHallError('E404-MEMBERSHIP', 'Hall membership not found', 404);

  // F553 Path B: var-vs-var, left=`hallLimit` (`limit` keyword 매칭)
  const hallLimit = membership.hall_limit;

  if (membership.hall_used + halls >= hallLimit) {
    throw new WeddingHallError(
      'E422-HALL-LIMIT-EXCEEDED',
      `Hall reservation quota exhausted (${membership.hall_used + halls} >= ${hallLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE hall_memberships SET hall_used = hall_used + ? WHERE id = ?
  `).run(halls, membershipId);

  return { memberId, membershipId, hallLimit, approved: true };
}

// ---------------------------------------------------------------------------
// WB-003: 예식 예약 atomic — wedding_ceremonies + hall_schedules + ceremony_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCeremonyBooking(
  db: Database.Database,
  hallId: string,
  ceremonyId: string,
  slotTime: string,
  guestCount: number,
  ceremonyType: string,
  amount: number,
): { scheduleId: string; paymentId: string; ceremonyId: string; hallId: string; startedAt: string } {
  const ceremony = db
    .prepare("SELECT status FROM wedding_ceremonies WHERE id = ? AND status = 'reserved'")
    .get(ceremonyId) as { status: string } | undefined;

  if (!ceremony) throw new WeddingHallError('E404-CEREMONY', 'Reserved ceremony not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO hall_schedules (id, hall_id, ceremony_id, slot_time, guest_count, ceremony_type, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(scheduleId, hallId, ceremonyId, slotTime, guestCount, ceremonyType);

    db.prepare(`
      UPDATE wedding_ceremonies SET status = 'ongoing', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, ceremonyId);

    db.prepare(`
      INSERT INTO ceremony_payments (id, ceremony_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, ceremonyId, scheduleId, amount, startedAt);
  });
  tx();

  return { scheduleId, paymentId, ceremonyId, hallId, startedAt };
}

// ---------------------------------------------------------------------------
// WB-004: 예식 상태 전환 (reserved → ongoing → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionCeremonyStatus(
  db: Database.Database,
  ceremonyId: string,
  newStatus: 'ongoing' | 'ended' | 'closed' | 'cancelled',
): { ceremonyId: string; previousStatus: string; newStatus: string } {
  const ceremony = db
    .prepare('SELECT status FROM wedding_ceremonies WHERE id = ?')
    .get(ceremonyId) as { status: string } | undefined;

  if (!ceremony) throw new WeddingHallError('E404-CEREMONY', 'Ceremony not found', 404);

  const previousStatus = ceremony.status;
  const allowed =
    (ceremony.status === 'reserved' && newStatus === 'ongoing') ||
    (ceremony.status === 'ongoing' && newStatus === 'ended') ||
    (ceremony.status === 'ongoing' && newStatus === 'closed') ||
    (ceremony.status === 'reserved' && newStatus === 'cancelled') ||
    (ceremony.status === 'ongoing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new WeddingHallError(
      'E409-CEREMONY',
      `Cannot transition ceremony from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE wedding_ceremonies SET status = ? WHERE id = ?`).run(newStatus, ceremonyId);

  return { ceremonyId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// WB-005: closed ceremony 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../CV-005 73번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedCeremonyBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM wedding_ceremonies
      WHERE status = 'closed'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE wedding_ceremonies
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// WB-006: 예식 환불 atomic — 취소 예식 시 예식 비용 + 위약금 + 환불 트랜잭션
// (AtomicTransaction detector — 강한 계약금/위약금 모델)
// ---------------------------------------------------------------------------
export function processCeremonyRefund(
  db: Database.Database,
  memberId: string,
  ceremonyId: string,
  ceremonyCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const ceremony = db
    .prepare("SELECT status FROM wedding_ceremonies WHERE id = ? AND status = 'cancelled'")
    .get(ceremonyId) as { status: string } | undefined;

  if (!ceremony) throw new WeddingHallError('E404-CANCELLED-CEREMONY', 'Cancelled ceremony not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(ceremonyCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, ceremony_id, ceremony_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, ceremonyId, ceremonyCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO ceremony_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
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
export class WeddingHallError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'WeddingHallError';
  }
}
