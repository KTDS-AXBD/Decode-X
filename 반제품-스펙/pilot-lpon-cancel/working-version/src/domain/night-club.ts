import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-NC (NC-001~NC-006): Night Club 합성 도메인 — 88번째 도메인 (나이트클럽 산업, 77번째 신규 산업) 🌃 단일 클러스터 19 도메인 첫 사례 마일스톤 신기록
//   - night-club spec-container rules.md 기반 PoC source
//   - 합성 schema: night_club_visits, night_clubs, memberships,
//                  vip_table_schedules, visit_payments, cancelled_fee_records, visit_refunds
//   - 나이트클럽 lifecycle 패턴 — 동시게스트한도/VIP테이블한도/VIP예약atomic/방문상태전환/closed방문일괄만료/방문환불atomic
//   - withRuleId 재사용 88번째 도메인 (신규 detector 0개, 89 Sprint 연속 정점 도전)
//   - NightClubError code-in-message 패턴 (S275 표준)
//   - 77 산업 연속 0 ABSENCE 도전 (..+WB+BC+CO+KR+NC)
//   - 🌃 단일 클러스터 19 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC 오프라인 엔터 19-클러스터)
//   - 🏆 15 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S384 18→S385 19)
//   - 🏆 88번째 도메인 17.6배 확장 (S262 5 → S385 88)
//   - 거울 변환 41회차 (carsharing → ... → concert-hall → karaoke → night-club)
//   - Sprint WT autopilot 분리 작업 15회차 (DoD 6축 실감증 6회차 rules/ 영구 승격 정착 검증)
//   - NC 차별성: KR(노래방 프라이빗 룸 1-3시간) + BC(비치클럽 시즌제 + VIP 프라이빗) 인접하되 공용 도구(common floor) + DJ 바 + 드레스코드 + 종일권 없는 입장권제 + VIP 테이블 옵션
//   - 동시 한도 500 (나이트클럽별 동시 active guest, 대형 클럽 기반)
//   - KR(노래방별 20 room) vs NC(클럽별 500 guest + VIP 테이블 30석) 대비
// ---------------------------------------------------------------------------

export interface NightClubRow {
  id: string;
  name: string;
  max_concurrent_guests: number;
  active_guests: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  club_id: string;
  membership_type: string; // basic | premium | vip
  vip_table_limit: number;
  daily_used: number;
  status: string; // active | paused | expired | cancelled
}

export interface NightClubVisitRow {
  id: string;
  club_id: string;
  membership_id: string;
  schedule_id: string | null;
  payment_id: string | null;
  status: string; // reserved | entered | exited | ended | closed | cancelled
  reserved_at: string;
}

export interface VipTableScheduleRow {
  id: string;
  club_id: string;
  visit_id: string;
  table_number: string;
  start_time: string;
  end_time: string;
  guest_count: number;
  status: string; // confirmed | active | completed | cancelled | expired
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  visit_id: string;
  visit_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_GUESTS_PER_CLUB = 500; // NC-001: 나이트클럽별 동시 active guest 한도 (대형 클럽 기준)

// ---------------------------------------------------------------------------
// NC-001: 나이트클럽별 동시 active guest 한도 검증
// (ThresholdCheck detector — F557 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveEntry(
  db: Database.Database,
  clubId: string,
  membershipId: string,
): { visitId: string; clubId: string; membershipId: string; reservedAt: string } {
  const club = db
    .prepare('SELECT active_guests, max_concurrent_guests FROM night_clubs WHERE id = ?')
    .get(clubId) as { active_guests: number; max_concurrent_guests: number } | undefined;

  if (!club) throw new NightClubError('E404-CLUB', 'Night club not found', 404);

  const limit = club.max_concurrent_guests ?? MAX_CONCURRENT_GUESTS_PER_CLUB;

  if (club.active_guests >= limit) {
    throw new NightClubError(
      'E422-CLUB-GUEST-LIMIT-EXCEEDED',
      `Club is at full guest capacity (${club.active_guests} >= ${limit})`,
      422,
    );
  }

  const visitId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO night_club_visits (id, club_id, membership_id, schedule_id, payment_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(visitId, clubId, membershipId, reservedAt);

  db.prepare(`
    UPDATE night_clubs SET active_guests = active_guests + 1 WHERE id = ?
  `).run(clubId);

  return { visitId, clubId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// NC-002: 회원 VIP 테이블 한도 검증 (멤버십 등급별 일일 VIP 테이블 예약 제한)
// (ThresholdCheck detector — F557 Path B var-vs-var, vipTableLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyVipTableLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  tables: number,
): { memberId: string; membershipId: string; vipTableLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, vip_table_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; vip_table_limit: number } | undefined;

  if (!membership) throw new NightClubError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F557 Path B: var-vs-var, left=`vipTableLimit` (`limit` keyword 매칭)
  const vipTableLimit = membership.vip_table_limit;

  if (membership.daily_used + tables >= vipTableLimit) {
    throw new NightClubError(
      'E422-VIP-TABLE-LIMIT-EXCEEDED',
      `Membership VIP table quota exhausted (${membership.daily_used + tables} >= ${vipTableLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(tables, membershipId);

  return { memberId, membershipId, vipTableLimit, approved: true };
}

// ---------------------------------------------------------------------------
// NC-003: VIP 테이블 예약 atomic — night_club_visits + vip_table_schedules + visit_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processVipBooking(
  db: Database.Database,
  clubId: string,
  visitId: string,
  tableNumber: string,
  startTime: string,
  endTime: string,
  guestCount: number,
  amount: number,
): { scheduleId: string; paymentId: string; visitId: string; clubId: string; bookedAt: string } {
  const visit = db
    .prepare("SELECT status FROM night_club_visits WHERE id = ? AND status = 'reserved'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new NightClubError('E404-VISIT', 'Reserved visit not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO vip_table_schedules (id, club_id, visit_id, table_number, start_time, end_time, guest_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, clubId, visitId, tableNumber, startTime, endTime, guestCount);

    db.prepare(`
      UPDATE night_club_visits SET status = 'entered', schedule_id = ?, payment_id = ? WHERE id = ?
    `).run(scheduleId, paymentId, visitId);

    db.prepare(`
      INSERT INTO visit_payments (id, visit_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, visitId, scheduleId, amount, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, visitId, clubId, bookedAt };
}

// ---------------------------------------------------------------------------
// NC-004: visit 상태 전환 (reserved → entered → exited → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionVisitStatus(
  db: Database.Database,
  visitId: string,
  newStatus: 'entered' | 'exited' | 'ended' | 'closed' | 'cancelled',
): { visitId: string; previousStatus: string; newStatus: string } {
  const visit = db
    .prepare('SELECT status FROM night_club_visits WHERE id = ?')
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new NightClubError('E404-VISIT', 'Visit not found', 404);

  const previousStatus = visit.status;
  const allowed =
    (visit.status === 'reserved' && newStatus === 'entered') ||
    (visit.status === 'entered' && newStatus === 'exited') ||
    (visit.status === 'exited' && newStatus === 'ended') ||
    (visit.status === 'entered' && newStatus === 'closed') ||
    (visit.status === 'reserved' && newStatus === 'cancelled') ||
    (visit.status === 'entered' && newStatus === 'cancelled');

  if (!allowed) {
    throw new NightClubError(
      'E409-VISIT',
      `Cannot transition visit from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE night_club_visits SET status = ? WHERE id = ?`).run(newStatus, visitId);

  return { visitId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// NC-005: closed visit 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BC-005/CO-005/KR-005 77번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedVisitBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM night_club_visits
      WHERE status = 'closed'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE night_club_visits
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// NC-006: visit 환불 atomic — 취소 방문 시 입장료 환불 정책 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processVisitRefund(
  db: Database.Database,
  memberId: string,
  visitId: string,
  visitCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const visit = db
    .prepare("SELECT status FROM night_club_visits WHERE id = ? AND status = 'cancelled'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new NightClubError('E404-CANCELLED-VISIT', 'Cancelled visit not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(visitCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, visit_id, visit_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, visitId, visitCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO visit_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
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
export class NightClubError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'NightClubError';
  }
}
