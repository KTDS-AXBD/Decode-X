import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-GY (GY-001~GY-006): Gym 합성 도메인 — 46번째 도메인 (헬스장 매장 산업, 35번째 신규 산업)
//   - gym spec-container rules.md 기반 PoC source
//   - 합성 schema: branches, memberships, members, lockers, member_payments,
//                  pt_sessions, trainers, trainer_billing_records, trainer_payouts
//   - 헬스장 매장 lifecycle 패턴 — 회원정원/PT한도/회원등록atomic/멤버십상태전환/만료멤버십배치/트레이너정산atomic
//   - withRuleId 재사용 46번째 도메인 (신규 detector 0개, 47 Sprint 연속 정점 도전)
//   - GymError code-in-message 패턴 (S275 표준)
//   - 35 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY)
//   - 35번째 신규 산업 마일스톤 (gym 추가, PT+FT+GY 3-클러스터 스포츠/헬스 형성)
// ---------------------------------------------------------------------------

export interface BranchRow {
  id: string;
  name: string;
  capacity: number;
  member_count: number;
  status: string;   // active | maintenance | closed
}

export interface MembershipRow {
  id: string;
  member_id: string;
  branch_id: string;
  tier_code: string;        // basic | standard | premium | corporate
  pt_limit: number;
  pt_used: number;
  status: string;           // active | paused | expired | cancelled
  expires_at: string;
}

export interface MemberRow {
  id: string;
  branch_id: string;
  membership_id: string;
  payment_id: string | null;
  locker_id: string | null;
  status: string;           // active | inactive | suspended
  joined_at: string;
}

export interface LockerRow {
  id: string;
  branch_id: string;
  locker_no: string;
  status: string;   // available | occupied | reserved | maintenance
  occupied_by: string | null;
}

export interface PtSessionRow {
  id: string;
  membership_id: string;
  trainer_id: string;
  status: string;   // scheduled | in_progress | completed | billed
  scheduled_at: string;
}

export interface TrainerBillingRecordRow {
  id: string;
  trainer_id: string;
  pt_session_id: string;
  revenue: number;
  billing_rate: number;
  billing_amount: number;
  status: string;   // pending | calculated | settled
}

const MAX_GYM_CAPACITY = 300; // GY-001: 헬스장 지점 회원 정원 한도 (명, 기본값)

// ---------------------------------------------------------------------------
// GY-001: 헬스장 지점 회원 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function registerGymMember(
  db: Database.Database,
  branchId: string,
  memberId: string,
): { membershipId: string; branchId: string; memberId: string; registeredAt: string } {
  const branch = db
    .prepare('SELECT member_count, capacity FROM branches WHERE id = ?')
    .get(branchId) as { member_count: number; capacity: number } | undefined;

  if (!branch) throw new GymError('E404-BRANCH', 'Gym branch not found', 404);

  const limit = branch.capacity ?? MAX_GYM_CAPACITY;

  if (branch.member_count >= limit) {
    throw new GymError(
      'E422-GYM-CAPACITY-EXCEEDED',
      `Branch is at full capacity (${branch.member_count} >= ${limit})`,
      422,
    );
  }

  const membershipId = randomUUID();
  const registeredAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO memberships (id, member_id, branch_id, tier_code, pt_limit, pt_used, status, expires_at)
    VALUES (?, ?, ?, 'basic', 0, 0, 'active', ?)
  `).run(membershipId, memberId, branchId, registeredAt);

  db.prepare(`
    UPDATE branches SET member_count = member_count + 1 WHERE id = ?
  `).run(branchId);

  return { membershipId, branchId, memberId, registeredAt };
}

// ---------------------------------------------------------------------------
// GY-002: 멤버십 PT 세션 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, ptLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyPtLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
): { memberId: string; membershipId: string; ptLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT pt_used, pt_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { pt_used: number; pt_limit: number } | undefined;

  if (!membership) throw new GymError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F445 Path B: var-vs-var, left=`ptLimit` (`limit` keyword 매칭)
  const ptLimit = membership.pt_limit;

  if (membership.pt_used >= ptLimit) {
    throw new GymError(
      'E422-PT-LIMIT-EXCEEDED',
      `PT session quota exhausted (${membership.pt_used} >= ${ptLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET pt_used = pt_used + 1 WHERE id = ?
  `).run(membershipId);

  return { memberId, membershipId, ptLimit, approved: true };
}

// ---------------------------------------------------------------------------
// GY-003: 신규 회원 등록 atomic — members + lockers 점유 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function registerMemberWithLocker(
  db: Database.Database,
  branchId: string,
  membershipId: string,
  lockerId: string,
  amount: number,
): { memberId: string; paymentId: string; lockerId: string; branchId: string; joinedAt: string } {
  const locker = db
    .prepare("SELECT status FROM lockers WHERE id = ? AND status = 'available'")
    .get(lockerId) as { status: string } | undefined;

  if (!locker) throw new GymError('E404-LOCKER', 'Locker not available', 404);

  const memberId = randomUUID();
  const paymentId = randomUUID();
  const joinedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO members (id, branch_id, membership_id, payment_id, locker_id, status, joined_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(memberId, branchId, membershipId, paymentId, lockerId, joinedAt);

    db.prepare(`
      UPDATE lockers SET status = 'occupied', occupied_by = ? WHERE id = ?
    `).run(memberId, lockerId);

    db.prepare(`
      INSERT INTO member_payments (id, member_id, membership_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, memberId, membershipId, amount, joinedAt);
  });
  tx();

  return { memberId, paymentId, lockerId, branchId, joinedAt };
}

// ---------------------------------------------------------------------------
// GY-004: 멤버십 상태 전환 (active → paused → active → expired → cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionMembershipStatus(
  db: Database.Database,
  membershipId: string,
  newStatus: 'paused' | 'active' | 'expired' | 'cancelled',
): { membershipId: string; previousStatus: string; newStatus: string } {
  const membership = db
    .prepare('SELECT status FROM memberships WHERE id = ?')
    .get(membershipId) as { status: string } | undefined;

  if (!membership) throw new GymError('E404-MEMBERSHIP', 'Membership not found', 404);

  const previousStatus = membership.status;
  const allowed =
    (membership.status === 'active' && newStatus === 'paused') ||
    (membership.status === 'paused' && newStatus === 'active') ||
    (membership.status === 'active' && newStatus === 'expired') ||
    (membership.status === 'expired' && newStatus === 'cancelled');

  if (!allowed) {
    throw new GymError(
      'E409-MEMBERSHIP',
      `Cannot transition membership from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE memberships SET status = ? WHERE id = ?`).run(newStatus, membershipId);

  return { membershipId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// GY-005: 만료 멤버십 일괄 처리 (batch expired marking)
// (StatusTransition detector — batch 패턴, BT-005/TM-005/VT-005 35번째 재사용)
// ---------------------------------------------------------------------------
export function markExpiredMembershipBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM memberships
      WHERE status = 'active'
        AND expires_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE memberships
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// GY-006: 트레이너 정산 atomic — 매출 + 트레이너 수수료 + 정산 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTrainerBilling(
  db: Database.Database,
  trainerId: string,
  ptSessionId: string,
  revenue: number,
  billingRate: number,
): { billingId: string; payoutId: string; trainerId: string; billingAmount: number; settledAt: string } {
  const session = db
    .prepare("SELECT status FROM pt_sessions WHERE id = ? AND status = 'completed'")
    .get(ptSessionId) as { status: string } | undefined;

  if (!session) throw new GymError('E404-COMPLETED-PT-SESSION', 'Completed PT session not found', 404);

  const billingId = randomUUID();
  const payoutId = randomUUID();
  const billingAmount = Math.round(revenue * billingRate * 100) / 100;
  const settledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO trainer_billing_records (id, trainer_id, pt_session_id, revenue, billing_rate, billing_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(billingId, trainerId, ptSessionId, revenue, billingRate, billingAmount);

    db.prepare(`
      INSERT INTO trainer_payouts (id, billing_id, trainer_id, amount, status, settled_at)
      VALUES (?, ?, ?, ?, 'settled', ?)
    `).run(payoutId, billingId, trainerId, billingAmount, settledAt);

    db.prepare(`
      UPDATE trainer_billing_records SET status = 'settled' WHERE id = ?
    `).run(billingId);
  });
  tx();

  return { billingId, payoutId, trainerId, billingAmount, settledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class GymError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'GymError';
  }
}
