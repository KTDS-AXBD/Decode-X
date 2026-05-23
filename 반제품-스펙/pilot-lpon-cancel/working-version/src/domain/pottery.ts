import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PO (PO-001~PO-006): Pottery Studio 합성 도메인 — 96번째 도메인 (도예 공방 산업, 85번째 신규 산업) 🏺 단일 클러스터 27 도메인 첫 사례 마일스톤 신기록 + 23 Sprint 연속 첫 사례 마일스톤 신기록
//   - pottery spec-container rules.md 기반 PoC source
//   - 합성 schema: pottery_sessions, pottery_studios, memberships,
//                  wheel_schedules, session_payments, material_kits,
//                  cancelled_session_records, session_refunds
//   - 도예 공방 lifecycle 패턴 — wheel동시한도/class한도/class예약atomic/session상태전환/kiln_pending일괄완료/session환불atomic
//   - withRuleId 재사용 96번째 도메인 (신규 detector 0개, 97 Sprint 연속 정점 도전)
//   - PotteryError code-in-message 패턴 (S275 표준)
//   - 85 산업 연속 0 ABSENCE 도전 (..+BL+ES+PO)
//   - 🏺 단일 클러스터 27 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC+BL+ES+PO 오프라인 엔터 27-클러스터)
//   - 🏆 23 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S392 26→S393 27)
//   - 🏆 withRuleId 97 Sprint 정점 도전 (S264~S393 97 Sprint 누적 정점)
//   - 거울 변환 49회차 (carsharing → ... → billiards → escape-room → pottery)
//   - Sprint WT autopilot 분리 작업 23회차 (DoD 6축 실감증 14회차)
//   - Rule prefix: PO (POttery studio)
//   - PO 차별성: ES(방탈출 그룹 활동) + KP(콘서트 좌석) + GR(자연공원 정적) 인접하되
//     워크샵형 도예 클래스 + 강사 운영 + 재료 키트 사전 결제 + 가마 구운 후 출품 소유권
//     + 다회권 패키지 (B2C 가족/커플 1.5-2시간 + 재료비 별도 + 가마 1-2주 대기 차별)
//   - 동시 wheel 한도 12 (studio별 동시 active wheel, 중형 도예 공방 12 wheel 기준)
// ---------------------------------------------------------------------------

export interface PotteryStudioRow {
  id: string;
  name: string;
  max_concurrent_wheels: number;
  active_wheels: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  studio_id: string;
  membership_type: string; // basic | silver | gold | vip
  class_limit: number;
  daily_classes: number;
  status: string; // active | paused | expired
}

export interface PotterySessionRow {
  id: string;
  studio_id: string;
  membership_id: string;
  wheel_id: string | null;
  schedule_id: string | null;
  payment_id: string | null;
  material_kit_id: string | null;
  status: string; // reserved | started | completed | kiln_pending | finished | cancelled
  reserved_at: string;
}

export interface MaterialKitRow {
  id: string;
  studio_id: string;
  session_id: string;
  clay_type: string;
  kit_fee: number;
  status: string; // prepared | consumed | refunded
  prepared_at: string;
}

const MAX_CONCURRENT_WHEELS_PER_STUDIO = 12; // PO-001: studio별 동시 active wheel 한도 (중형 도예 공방 12 wheel 기준)

// ---------------------------------------------------------------------------
// PO-001: studio별 동시 active wheel 한도 검증
// (ThresholdCheck detector — F565 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveWheel(
  db: Database.Database,
  studioId: string,
  membershipId: string,
): { sessionId: string; studioId: string; membershipId: string; reservedAt: string } {
  const studio = db
    .prepare('SELECT active_wheels, max_concurrent_wheels FROM pottery_studios WHERE id = ?')
    .get(studioId) as { active_wheels: number; max_concurrent_wheels: number } | undefined;

  if (!studio) throw new PotteryError('E404-STUDIO', 'Pottery studio not found', 404);

  const limit = studio.max_concurrent_wheels ?? MAX_CONCURRENT_WHEELS_PER_STUDIO;

  if (studio.active_wheels >= limit) {
    throw new PotteryError(
      'E422-WHEEL-LIMIT-EXCEEDED',
      `Studio is at full wheel capacity (${studio.active_wheels} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO pottery_sessions (id, studio_id, membership_id, wheel_id, schedule_id, payment_id, material_kit_id, status, reserved_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'reserved', ?)
  `).run(sessionId, studioId, membershipId, reservedAt);

  db.prepare(`
    UPDATE pottery_studios SET active_wheels = active_wheels + 1 WHERE id = ?
  `).run(studioId);

  return { sessionId, studioId, membershipId, reservedAt };
}

// ---------------------------------------------------------------------------
// PO-002: 회원 일일 class 한도 검증 (멤버십 등급별 일일 수강 횟수 제한)
// (ThresholdCheck detector — F565 Path B var-vs-var, classLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyClassLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  classes: number,
): { memberId: string; membershipId: string; classLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_classes, class_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_classes: number; class_limit: number } | undefined;

  if (!membership) throw new PotteryError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F565 Path B: var-vs-var, left=`classLimit` (`limit` keyword 매칭)
  const classLimit = membership.class_limit;

  if (membership.daily_classes + classes >= classLimit) {
    throw new PotteryError(
      'E422-CLASS-LIMIT-EXCEEDED',
      `Membership daily class quota exhausted (${membership.daily_classes + classes} >= ${classLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_classes = daily_classes + ? WHERE id = ?
  `).run(classes, membershipId);

  return { memberId, membershipId, classLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PO-003: class 예약 atomic — wheel_schedules + pottery_sessions + session_payments + material_kits 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processClassBooking(
  db: Database.Database,
  studioId: string,
  sessionId: string,
  clayType: string,
  instructorId: string,
  startTime: string,
  endTime: string,
  kitFee: number,
  amount: number,
): { scheduleId: string; paymentId: string; kitId: string; sessionId: string; studioId: string; bookedAt: string } {
  const session = db
    .prepare("SELECT status FROM pottery_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new PotteryError('E404-SESSION', 'Reserved session not found', 404);

  const scheduleId = randomUUID();
  const paymentId = randomUUID();
  const kitId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO wheel_schedules (id, studio_id, session_id, instructor_id, clay_type, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(scheduleId, studioId, sessionId, instructorId, clayType, startTime, endTime);

    db.prepare(`
      UPDATE pottery_sessions SET status = 'started', wheel_id = ?, schedule_id = ?, payment_id = ?, material_kit_id = ? WHERE id = ?
    `).run(clayType, scheduleId, paymentId, kitId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, schedule_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, scheduleId, amount, bookedAt);

    db.prepare(`
      INSERT INTO material_kits (id, studio_id, session_id, clay_type, kit_fee, status, prepared_at)
      VALUES (?, ?, ?, ?, ?, 'prepared', ?)
    `).run(kitId, studioId, sessionId, clayType, kitFee, bookedAt);
  });
  tx();

  return { scheduleId, paymentId, kitId, sessionId, studioId, bookedAt };
}

// ---------------------------------------------------------------------------
// PO-004: session 상태 전환 (reserved → started → completed → kiln_pending → finished / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'started' | 'completed' | 'kiln_pending' | 'finished' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM pottery_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new PotteryError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'started') ||
    (session.status === 'started' && newStatus === 'completed') ||
    (session.status === 'completed' && newStatus === 'kiln_pending') ||
    (session.status === 'kiln_pending' && newStatus === 'finished') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'started' && newStatus === 'cancelled') ||
    (session.status === 'completed' && newStatus === 'cancelled');

  if (!allowed) {
    throw new PotteryError(
      'E409-SESSION',
      `Cannot transition pottery session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE pottery_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PO-005: kiln_pending session 일괄 완료 처리 (batch finish marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../ES-005 85번째 재사용)
// ---------------------------------------------------------------------------
export function expireKilnPendingBatch(
  db: Database.Database,
  now: string,
): { finishedCount: number; finishedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM pottery_sessions
      WHERE status = 'kiln_pending'
        AND reserved_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const finishedIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE pottery_sessions
      SET status = 'finished'
      WHERE id = ?
    `).run(item.id);
    finishedIds.push(item.id);
  }

  return { finishedCount: finishedIds.length, finishedIds };
}

// ---------------------------------------------------------------------------
// PO-006: session 환불 atomic — 재료비 비환불 + 가마 단계 도달 시 환불 차등 정책 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionRefund(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  sessionCost: number,
  cancellationRate: number,
  materialFeeNonRefundable: number,
): { feeRecordId: string; refundId: string; memberId: string; refundAmount: number; refundedAt: string } {
  const session = db
    .prepare("SELECT status FROM pottery_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new PotteryError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.floor(sessionCost * cancellationRate);
  // 재료비는 비환불 — 가마 단계 도달 여부와 무관하게 material_fee_non_refundable 차감
  const refundAmount = Math.max(0, sessionCost - cancellationAmount - materialFeeNonRefundable);
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_session_records (id, member_id, session_id, session_cost, material_fee_non_refundable, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, sessionId, sessionCost, materialFeeNonRefundable, cancellationRate, cancellationAmount);

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
export class PotteryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PotteryError';
  }
}
