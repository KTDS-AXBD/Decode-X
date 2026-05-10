import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-WL (WL-001~WL-006): Wellness 합성 도메인 — 39번째 도메인 (웰니스 산업, 28번째 신규 산업)
//   - wellness spec-container rules.md 기반 PoC source
//   - 합성 schema: sessions, session_packages, package_tiers, appointments,
//                  appointment_resources, session_reviews, cancellation_logs
//   - 웰니스/스파 lifecycle 패턴 — 정원한도/패키지한도/예약atomic/예약상태전환/노쇼배치/취소환불atomic
//   - withRuleId 재사용 39번째 도메인 (신규 detector 0개, 37 Sprint 연속 정점)
//   - WellnessError code-in-message 패턴 (S275 표준)
//   - 28 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL)
//   - 28번째 신규 산업 마일스톤 (wellness/spa 추가, Hospitality 클러스터 HO+WL 형성)
// ---------------------------------------------------------------------------

export interface SessionRow {
  id: string;
  service_id: string;
  therapist_id: string;
  scheduled_date: string;
  capacity: number;
  booked_count: number;
  status: string;   // available | full | in_progress | completed | cancelled
}

export interface SessionPackageRow {
  id: string;
  member_id: string;
  tier_code: string;
  used_count: number;
  packageUsageLimit: number;
  valid_until: string;
}

export interface PackageTierRow {
  id: string;
  tier_code: string;    // basic | premium | elite | vip
  packageUsageLimit: number;
  description: string;
}

export interface AppointmentRow {
  id: string;
  member_id: string;
  session_id: string;
  resource_id: string;
  status: string;       // booked | confirmed | in_session | completed | reviewed | cancelled | no_show
  booked_at: string;
  confirmed_at: string | null;
}

export interface AppointmentResourceRow {
  id: string;
  appointment_id: string;
  resource_id: string;
  held_at: string;
  released_at: string | null;
}

export interface CancellationLogRow {
  id: string;
  appointment_id: string;
  member_id: string;
  penalty_amount: number;
  refund_amount: number;
  reason: string;
  cancelled_at: string;
}

const MAX_SESSION_CAPACITY = 20; // WL-001: 세션 정원 한도 (인원, 기본값)

// ---------------------------------------------------------------------------
// WL-001: 세션 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookSession(
  db: Database.Database,
  sessionId: string,
  memberId: string,
): { appointmentId: string; sessionId: string; memberId: string; bookedAt: string } {
  const session = db
    .prepare('SELECT booked_count, capacity FROM sessions WHERE id = ?')
    .get(sessionId) as { booked_count: number; capacity: number } | undefined;

  if (!session) throw new WellnessError('E404-SESSION', 'Session not found', 404);

  const limit = session.capacity ?? MAX_SESSION_CAPACITY;

  if (session.booked_count >= limit) {
    throw new WellnessError(
      'E422-SESSION-CAPACITY-EXCEEDED',
      `Session is fully booked (${session.booked_count} >= ${limit})`,
      422,
    );
  }

  const appointmentId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO appointments (id, member_id, session_id, resource_id, status, booked_at, confirmed_at)
    VALUES (?, ?, ?, NULL, 'booked', ?, NULL)
  `).run(appointmentId, memberId, sessionId, bookedAt);

  db.prepare(`
    UPDATE sessions SET booked_count = booked_count + 1 WHERE id = ?
  `).run(sessionId);

  return { appointmentId, sessionId, memberId, bookedAt };
}

// ---------------------------------------------------------------------------
// WL-002: 패키지 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, packageUsageLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function usePackageSession(
  db: Database.Database,
  memberId: string,
  packageId: string,
): { memberId: string; packageId: string; packageUsageLimit: number; approved: boolean } {
  const pkg = db
    .prepare('SELECT used_count, packageUsageLimit FROM session_packages WHERE id = ? AND member_id = ? LIMIT 1')
    .get(packageId, memberId) as { used_count: number; packageUsageLimit: number } | undefined;

  if (!pkg) throw new WellnessError('E404-PACKAGE', 'Session package not found', 404);

  // F445 Path B: var-vs-var, left=`packageUsageLimit` (`limit` keyword 매칭)
  const packageUsageLimit = pkg.packageUsageLimit;

  if (pkg.used_count >= packageUsageLimit) {
    throw new WellnessError(
      'E422-PACKAGE-USAGE-EXCEEDED',
      `Package sessions exhausted (${pkg.used_count} >= ${packageUsageLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE session_packages SET used_count = used_count + 1 WHERE id = ?
  `).run(packageId);

  return { memberId, packageId, packageUsageLimit, approved: true };
}

// ---------------------------------------------------------------------------
// WL-003: 예약 확정 atomic — 예약 + 결제 + 자원 hold 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmAppointment(
  db: Database.Database,
  appointmentId: string,
  memberId: string,
  resourceId: string,
  amount: number,
): { appointmentId: string; paymentId: string; resourceHoldId: string; memberId: string; confirmedAt: string } {
  const appt = db
    .prepare("SELECT status FROM appointments WHERE id = ? AND status = 'booked'")
    .get(appointmentId) as { status: string } | undefined;

  if (!appt) throw new WellnessError('E404-APPOINTMENT', 'No booked appointment found for confirmation', 404);

  const paymentId = randomUUID();
  const resourceHoldId = randomUUID();
  const confirmedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE appointments SET status = 'confirmed', confirmed_at = ? WHERE id = ?
    `).run(confirmedAt, appointmentId);

    db.prepare(`
      INSERT INTO appointment_payments (id, appointment_id, member_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, appointmentId, memberId, amount, confirmedAt);

    db.prepare(`
      INSERT INTO appointment_resources (id, appointment_id, resource_id, held_at, released_at)
      VALUES (?, ?, ?, ?, NULL)
    `).run(resourceHoldId, appointmentId, resourceId, confirmedAt);

    db.prepare(`
      UPDATE resources SET status = 'held' WHERE id = ?
    `).run(resourceId);
  });
  tx();

  return { appointmentId, paymentId, resourceHoldId, memberId, confirmedAt };
}

// ---------------------------------------------------------------------------
// WL-004: 예약 상태 전환 (booked → confirmed → in_session → completed → reviewed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionAppointmentStatus(
  db: Database.Database,
  appointmentId: string,
  newStatus: 'confirmed' | 'in_session' | 'completed' | 'reviewed',
): { appointmentId: string; previousStatus: string; newStatus: string } {
  const appt = db
    .prepare('SELECT status FROM appointments WHERE id = ?')
    .get(appointmentId) as { status: string } | undefined;

  if (!appt) throw new WellnessError('E404-APPOINTMENT', 'Appointment not found', 404);

  const previousStatus = appt.status;
  const allowed =
    (appt.status === 'booked' && newStatus === 'confirmed') ||
    (appt.status === 'confirmed' && newStatus === 'in_session') ||
    (appt.status === 'in_session' && newStatus === 'completed') ||
    (appt.status === 'completed' && newStatus === 'reviewed');

  if (!allowed) {
    throw new WellnessError(
      'E409-APPOINTMENT',
      `Cannot transition appointment from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE appointments SET status = ? WHERE id = ?`).run(newStatus, appointmentId);

  return { appointmentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// WL-005: 노쇼 일괄 처리 (batch no-show session marking)
// (StatusTransition detector — batch 패턴, CC-005 28번째 재사용)
// ---------------------------------------------------------------------------
export function markNoShowSessions(
  db: Database.Database,
  scheduledBefore: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT a.id FROM appointments a
      JOIN sessions s ON a.session_id = s.id
      WHERE s.scheduled_date <= ?
        AND a.status = 'confirmed'
    `)
    .all(scheduledBefore) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const appt of candidates) {
    db.prepare(`
      UPDATE appointments
      SET status = 'no_show'
      WHERE id = ?
    `).run(appt.id);
    markedIds.push(appt.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// WL-006: 취소 + 패널티 + 환불 atomic 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCancellationFee(
  db: Database.Database,
  appointmentId: string,
  memberId: string,
  penaltyAmount: number,
  refundAmount: number,
): { cancellationId: string; refundId: string; memberId: string; cancelledAt: string } {
  const appt = db
    .prepare("SELECT status, session_id FROM appointments WHERE id = ? AND member_id = ?")
    .get(appointmentId, memberId) as { status: string; session_id: string } | undefined;

  if (!appt) throw new WellnessError('E404-APPOINTMENT', 'Appointment not found for cancellation', 404);
  if (appt.status === 'cancelled') {
    throw new WellnessError('E409-ALREADY-CANCELLED', 'Appointment already cancelled', 409);
  }

  const cancellationId = randomUUID();
  const refundId = randomUUID();
  const cancelledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE appointments SET status = 'cancelled' WHERE id = ?
    `).run(appointmentId);

    db.prepare(`
      INSERT INTO cancellation_logs (id, appointment_id, member_id, penalty_amount, refund_amount, reason, cancelled_at)
      VALUES (?, ?, ?, ?, ?, 'member_request', ?)
    `).run(cancellationId, appointmentId, memberId, penaltyAmount, refundAmount, cancelledAt);

    db.prepare(`
      INSERT INTO refund_records (id, appointment_id, member_id, refund_amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'completed', ?)
    `).run(refundId, appointmentId, memberId, refundAmount, cancelledAt);

    db.prepare(`
      UPDATE sessions SET booked_count = booked_count - 1 WHERE id = ?
    `).run(appt.session_id);
  });
  tx();

  return { cancellationId, refundId, memberId, cancelledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class WellnessError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'WellnessError';
  }
}
