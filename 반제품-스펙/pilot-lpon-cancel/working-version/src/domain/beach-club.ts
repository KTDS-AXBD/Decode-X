import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-BC (BC-001~BC-006): Beach club 합성 도메인 — 85번째 도메인 (비치클럽 산업, 74번째 신규 산업) 🏖️ 단일 클러스터 16 도메인 첫 사례 마일스톤 신기록
//   - beach-club spec-container rules.md 기반 PoC source
//   - 합성 schema: beach_club_visits, beach_clubs, beach_memberships,
//                  cabana_schedules, visit_payments, cancelled_fee_records, visit_refunds
//   - 비치클럽 lifecycle 패턴 — 동시방문자한도/cabana한도/cabana예약atomic/방문상태전환/closed방문일괄만료/방문환불atomic
//   - withRuleId 재사용 85번째 도메인 (신규 detector 0개, 86 Sprint 연속 정점 도전)
//   - BeachClubError code-in-message 패턴 (S275 표준)
//   - 74 산업 연속 0 ABSENCE 도전 (..+OB+PL+CV+WB+BC)
//   - 🏖️ 단일 클러스터 16 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC 오프라인 엔터 16-클러스터)
//   - 🏆 12 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S378 13→S380 14→S381 15→S382 16)
//   - 🏆 85번째 도메인 17배 round 마일스톤 (S262 5 → S382 85)
//   - 거울 변환 38회차 (carsharing → fastfood → ... → convention → wedding-hall → beach-club)
//   - Sprint WT autopilot 분리 작업 12회차 (DoD 6축 실감증 3회차 — domain-sprint-guard.yml 정착 완료 트리거)
//   - BC 차별성: 풀 + 사교 + DJ 공연 + 시즌제 + VIP 프라이빗 + 종일권/시즌권 통합
//   - 동시 한도 500 (비치클럽별 동시 active visitor, 대규모 야외 공간 기반)
//   - WB(1회성 예식 + 강한 위약금) vs BC(반복 방문 + 카바나 임대 + VIP 음료/식음 옵션) 대비
// ---------------------------------------------------------------------------

export interface BeachClubRow {
  id: string;
  name: string;
  max_concurrent_visitors: number;
  active_visitors: number;
  status: string; // active | closed | suspended
}

export interface BeachMembershipRow {
  id: string;
  member_id: string;
  club_id: string;
  membership_type: string; // standard | premium | vip
  cabana_limit: number;
  cabana_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface BeachClubVisitRow {
  id: string;
  club_id: string;
  membership_id: string;
  cabana_id: string | null;
  payment_id: string | null;
  status: string; // reserved | entered | exited | ended | closed | cancelled
  visited_at: string;
}

export interface CabanaScheduleRow {
  id: string;
  club_id: string;
  visit_id: string;
  cabana_number: string;
  start_time: string;
  guest_count: number;
  cabana_type: string; // standard | premium | vip
  status: string; // active | completed | cancelled | expired
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

const MAX_CONCURRENT_VISITORS_PER_BEACH_CLUB = 500; // BC-001: 비치클럽별 동시 active visitor 한도 (대규모 야외 공간)

// ---------------------------------------------------------------------------
// BC-001: 비치클럽 동시 active visitor 한도 검증
// (ThresholdCheck detector — F554 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveDayPass(
  db: Database.Database,
  clubId: string,
  membershipId: string,
): { visitId: string; clubId: string; membershipId: string; visitedAt: string } {
  const club = db
    .prepare('SELECT active_visitors, max_concurrent_visitors FROM beach_clubs WHERE id = ?')
    .get(clubId) as { active_visitors: number; max_concurrent_visitors: number } | undefined;

  if (!club) throw new BeachClubError('E404-CLUB', 'Beach club not found', 404);

  const limit = club.max_concurrent_visitors ?? MAX_CONCURRENT_VISITORS_PER_BEACH_CLUB;

  if (club.active_visitors >= limit) {
    throw new BeachClubError(
      'E422-CLUB-VISITOR-LIMIT-EXCEEDED',
      `Beach club is at full visitor capacity (${club.active_visitors} >= ${limit})`,
      422,
    );
  }

  const visitId = randomUUID();
  const visitedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO beach_club_visits (id, club_id, membership_id, cabana_id, payment_id, status, visited_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(visitId, clubId, membershipId, visitedAt);

  db.prepare(`
    UPDATE beach_clubs SET active_visitors = active_visitors + 1 WHERE id = ?
  `).run(clubId);

  return { visitId, clubId, membershipId, visitedAt };
}

// ---------------------------------------------------------------------------
// BC-002: 회원 cabana 예약 한도 검증 (멤버십 유형별 cabana 제한)
// (ThresholdCheck detector — F554 Path B var-vs-var, cabanaLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyCabanaLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  cabanas: number,
): { memberId: string; membershipId: string; cabanaLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT cabana_used, cabana_limit FROM beach_memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { cabana_used: number; cabana_limit: number } | undefined;

  if (!membership) throw new BeachClubError('E404-MEMBERSHIP', 'Beach membership not found', 404);

  // F554 Path B: var-vs-var, left=`cabanaLimit` (`limit` keyword 매칭)
  const cabanaLimit = membership.cabana_limit;

  if (membership.cabana_used + cabanas >= cabanaLimit) {
    throw new BeachClubError(
      'E422-CABANA-LIMIT-EXCEEDED',
      `Cabana reservation quota exhausted (${membership.cabana_used + cabanas} >= ${cabanaLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE beach_memberships SET cabana_used = cabana_used + ? WHERE id = ?
  `).run(cabanas, membershipId);

  return { memberId, membershipId, cabanaLimit, approved: true };
}

// ---------------------------------------------------------------------------
// BC-003: cabana 예약 atomic — beach_club_visits + cabana_schedules + visit_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCabanaBooking(
  db: Database.Database,
  clubId: string,
  visitId: string,
  cabanaNumber: string,
  startTime: string,
  guestCount: number,
  cabanaType: string,
  amount: number,
): { cabanaId: string; paymentId: string; visitId: string; clubId: string; startedAt: string } {
  const visit = db
    .prepare("SELECT status FROM beach_club_visits WHERE id = ? AND status = 'reserved'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new BeachClubError('E404-VISIT', 'Reserved visit not found', 404);

  const cabanaId = randomUUID();
  const paymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cabana_schedules (id, club_id, visit_id, cabana_number, start_time, guest_count, cabana_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(cabanaId, clubId, visitId, cabanaNumber, startTime, guestCount, cabanaType);

    db.prepare(`
      UPDATE beach_club_visits SET status = 'entered', cabana_id = ?, payment_id = ? WHERE id = ?
    `).run(cabanaId, paymentId, visitId);

    db.prepare(`
      INSERT INTO visit_payments (id, visit_id, cabana_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, visitId, cabanaId, amount, startedAt);
  });
  tx();

  return { cabanaId, paymentId, visitId, clubId, startedAt };
}

// ---------------------------------------------------------------------------
// BC-004: 방문 상태 전환 (reserved → entered → exited → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionVisitStatus(
  db: Database.Database,
  visitId: string,
  newStatus: 'entered' | 'exited' | 'ended' | 'closed' | 'cancelled',
): { visitId: string; previousStatus: string; newStatus: string } {
  const visit = db
    .prepare('SELECT status FROM beach_club_visits WHERE id = ?')
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new BeachClubError('E404-VISIT', 'Visit not found', 404);

  const previousStatus = visit.status;
  const allowed =
    (visit.status === 'reserved' && newStatus === 'entered') ||
    (visit.status === 'entered' && newStatus === 'exited') ||
    (visit.status === 'exited' && newStatus === 'ended') ||
    (visit.status === 'entered' && newStatus === 'closed') ||
    (visit.status === 'reserved' && newStatus === 'cancelled') ||
    (visit.status === 'entered' && newStatus === 'cancelled');

  if (!allowed) {
    throw new BeachClubError(
      'E409-VISIT',
      `Cannot transition visit from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE beach_club_visits SET status = ? WHERE id = ?`).run(newStatus, visitId);

  return { visitId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// BC-005: closed visit 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../WB-005 74번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedVisitBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM beach_club_visits
      WHERE status = 'closed'
        AND visited_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE beach_club_visits
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// BC-006: 방문 환불 atomic — 취소 방문 시 방문 비용 + VIP 환불 정책 + 환불 트랜잭션
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
    .prepare("SELECT status FROM beach_club_visits WHERE id = ? AND status = 'cancelled'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new BeachClubError('E404-CANCELLED-VISIT', 'Cancelled visit not found', 404);

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
export class BeachClubError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BeachClubError';
  }
}
