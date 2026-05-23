import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-VR (VR-001~VR-006): VR Experience hall 합성 도메인 — 98번째 도메인 (VR 체험관 산업, 87번째 신규 산업) 🥽 단일 클러스터 29 도메인 첫 사례 마일스톤 신기록 도전 + 25 Sprint 연속 첫 사례 마일스톤 신기록 도전
//   - vr-hall spec-container rules.md 기반 PoC source
//   - 합성 schema: vr_sessions, vr_halls, vr_memberships,
//                  pod_schedules, session_payments, headset_assignment,
//                  cancelled_session_records, session_refunds
//   - VR 체험관 lifecycle 패턴 — pod동시한도/session한도/pod예약atomic/session상태전환/ended일괄만료/session환불atomic
//   - withRuleId 재사용 98번째 도메인 (신규 detector 0개, 99 Sprint 연속 정점 도전)
//   - VrHallError code-in-message 패턴 (S275 표준)
//   - 87 산업 연속 0 ABSENCE 도전 (..+DJ+VR)
//   - 🥽 단일 클러스터 29 도메인 첫 사례 마일스톤 신기록 도전 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC+BL+ES+PO+DJ+VR 오프라인 엔터 29-클러스터)
//   - 🏆 25 Sprint 연속 첫 사례 마일스톤 신기록 도전 (S370 5→S371 6→...→S394 28→S395 29)
//   - 🏆 withRuleId 99 Sprint 정점 도전 (S264~S395 99 Sprint 누적 정점 도전)
//   - 거울 변환 51회차 도전 (carsharing → ... → dj-academy → vr-hall)
//   - Sprint WT autopilot 분리 작업 25회차 (DoD 6축 실감증 16회차 도전)
//   - Rule prefix: VR (VR experience hall)
//   - VR 차별성: AC(Arcade token+machine fault) + ES(Escape room 그룹+GM 운영) + KP(콘서트 좌석) 인접하되
//     VR pod-based 시간제 30-60분 + 헤드셋 위생 점검 + content library 라이센스
//     + 그룹 동시 multiplayer + motion sickness 환불 정책 + content rating 시스템
//     (B2C 단체 가족/친구 30분~수시간 + content 별 가격 차등 + 헤드셋 위생 절차 차별)
//   - 동시 pod 한도 16 (hall별 동시 active pod, VR 체험관 16 pod 기준)
// ---------------------------------------------------------------------------

export interface VrHallRow {
  id: string;
  name: string;
  max_concurrent_pods: number;
  active_pods: number;
  status: string; // active | closed | suspended
}

export interface VrMembershipRow {
  id: string;
  member_id: string;
  hall_id: string;
  membership_type: string; // basic | standard | premium | unlimited
  session_limit: number;
  daily_sessions: number;
  status: string; // active | paused | expired
}

export interface VrSessionRow {
  id: string;
  hall_id: string;
  membership_id: string;
  pod_id: string | null;
  schedule_id: string | null;
  payment_id: string | null;
  headset_id: string | null;
  status: string; // reserved | started | playing | ended | discomfort_exit | cancelled
  reserved_at: string;
}

export interface HeadsetAssignmentRow {
  id: string;
  hall_id: string;
  session_id: string;
  headset_id: string;
  headset_type: string; // standalone | tethered | mixed_reality
  hygiene_status: string; // pending | checked | sanitized
  assigned_at: string;
}

const MAX_CONCURRENT_PODS_PER_HALL = 16; // VR-001: hall별 동시 active pod 한도 (VR 체험관 16 pod 기준)

// ---------------------------------------------------------------------------
// VR-001: hall별 동시 active pod 한도 검증
// (ThresholdCheck detector — F567 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reservePod(
  db: Database.Database,
  hallId: string,
  membershipId: string,
): { sessionId: string; hallId: string; membershipId: string; reservedAt: string } {
  const hall = db
    .prepare('SELECT active_pods, max_concurrent_pods FROM vr_halls WHERE id = ?')
    .get(hallId) as { active_pods: number; max_concurrent_pods: number } | undefined;

  if (!hall) throw new VrHallError('E404-HALL', 'VR hall not found', 404);

  const limit = hall.max_concurrent_pods ?? MAX_CONCURRENT_PODS_PER_HALL;

  if (hall.active_pods >= limit) {
    throw new VrHallError(
      'E422-POD-LIMIT-EXCEEDED',
      `Hall is at full pod capacity (${hall.active_pods} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO vr_sessions (id, hall_id, membership_id, pod_id, schedule_id, payment_id, headset_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'reserved', ?)
  `).run(sessionId, hallId, membershipId, reservedAt);

  db.prepare(`
    UPDATE vr_halls SET active_pods = active_pods + 1 WHERE id = ?
  `).run(hallId);

  return { sessionId, hallId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// VR-002: 회원 일일 session 한도 검증 (멤버십 등급별 일일 이용 횟수 제한)
// (ThresholdCheck detector — F567 Path B var-vs-var, sessionLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applySessionLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  sessions: number,
): { memberId: string; membershipId: string; sessionLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_sessions, session_limit FROM vr_memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_sessions: number; session_limit: number } | undefined;

  if (!membership) throw new VrHallError('E404-MEMBERSHIP', 'VR membership not found', 404);

  // F567 Path B: var-vs-var, left=`sessionLimit` (`limit` keyword 매칭)
  const sessionLimit = membership.session_limit;

  if (membership.daily_sessions + sessions >= sessionLimit) {
    throw new VrHallError(
      'E422-SESSION-LIMIT-EXCEEDED',
      `Membership daily session quota exhausted (${membership.daily_sessions + sessions} >= ${sessionLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE vr_memberships SET daily_sessions = daily_sessions + ? WHERE id = ?
  `).run(sessions, membershipId);

  return { memberId, membershipId, sessionLimit, approved: true };
}

// ---------------------------------------------------------------------------
// VR-003: pod 예약 atomic — pod_schedules + vr_sessions + session_payments + headset_assignment 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processPodBooking(
  db: Database.Database,
  hallId: string,
  sessionId: string,
  contentId: string,
  headsetId: string,
  startTime: string,
  endTime: string,
  headsetType: string,
  amount: number,
): { scheduleId: string; paymentId: string; headsetAssignId: string; sessionId: string; hallId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM vr_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new VrHallError('E404-SESSION', 'Reserved VR session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const headsetAssignId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO pod_schedules (id, hall_id, session_id, content_id, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, hallId, sessionId, contentId, startTime, endTime);

    db.prepare(`
      UPDATE vr_sessions SET status = 'started', pod_id = ?, schedule_id = ?, payment_id = ?, headset_id = ? WHERE id = ?
    `).run(contentId, scheduleId, paymentId, headsetAssignId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);

    db.prepare(`
      INSERT INTO headset_assignment (id, hall_id, session_id, headset_id, headset_type, hygiene_status, assigned_at)
      VALUES (?, ?, ?, ?, ?, 'checked', ?)
    `).run(headsetAssignId, hallId, sessionId, headsetId, headsetType, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, headsetAssignId, sessionId, hallId, bookedAt };
}

// ---------------------------------------------------------------------------
// VR-004: session 상태 전환 (reserved → started → playing → ended / discomfort_exit / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'started' | 'playing' | 'ended' | 'discomfort_exit' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM vr_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new VrHallError('E404-SESSION', 'VR session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'started') ||
    (session.status === 'started' && newStatus === 'playing') ||
    (session.status === 'playing' && newStatus === 'ended') ||
    (session.status === 'playing' && newStatus === 'discomfort_exit') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'started' && newStatus === 'cancelled') ||
    (session.status === 'playing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new VrHallError(
      'E409-SESSION',
      `Cannot transition VR session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE vr_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// VR-005: ended session 일괄 만료 처리 (expire batch)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../DJ-005 87번째 재사용)
// ---------------------------------------------------------------------------
export function expireEndedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM vr_sessions
      WHERE status = 'playing'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE vr_sessions
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// VR-006: session 환불 atomic — motion sickness 30s 이내 환불 + content 미공급 환불 정책 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionRefund(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  sessionCost: number,
  refundReason: string,
  motionSicknessFee: number,
): { feeRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const session = db
    .prepare("SELECT status FROM vr_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new VrHallError('E404-CANCELLED-SESSION', 'Cancelled VR session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  // motion sickness 30s 이내 환불: 전액 환불 (motionSicknessFee=0)
  // content 미공급 환불: 전액 환불 (motionSicknessFee=0)
  // 일반 취소: motionSicknessFee 공제 후 환불
  const refundAmount = Math.max(0, sessionCost - motionSicknessFee);
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_session_records (id, member_id, session_id, session_cost, refund_reason, motion_sickness_fee, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, sessionId, sessionCost, refundReason, motionSicknessFee, refundAmount);

    db.prepare(`
      INSERT INTO session_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, feeRecordId, memberId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE cancelled_session_records SET status = 'refunded' WHERE id = ?
    `).run(feeRecordId);
  });
  tx();

  return { feeRecordId, refundId, memberId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class VrHallError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'VrHallError';
  }
}
