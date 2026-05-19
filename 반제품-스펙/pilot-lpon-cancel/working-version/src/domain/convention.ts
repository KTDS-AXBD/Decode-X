import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-CV (CV-001~CV-006): Convention 합성 도메인 — 83번째 도메인 (컨벤션 산업, 72번째 신규 산업) ✏️ 단일 클러스터 14 도메인 첫 사례 마일스톤 신기록 도전
//   - convention spec-container rules.md 기반 PoC source
//   - 합성 schema: conventions, convention_memberships, convention_sessions,
//                  booth_schedules, session_payments, cancelled_fee_records, session_refunds
//   - 컨벤션 lifecycle 패턴 — 세션동시한도/부스한도/부스등록atomic/세션상태전환/closed세션일괄만료/세션환불atomic
//   - withRuleId 재사용 83번째 도메인 (신규 detector 0개, 84 Sprint 연속 정점 도전)
//   - ConventionError code-in-message 패턴 (S275 표준)
//   - 72 산업 연속 0 ABSENCE 도전 (..+GR+OB+PL+CV)
//   - ✏️ 단일 클러스터 14 도메인 첫 사례 마일스톤 신기록 도전 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV 오프라인 엔터 14-클러스터)
//   - ✏️ 10 Sprint 연속 첫 사례 마일스톤 신기록 도전 (S370 5→S371 6→...→S378 13→S380 14)
//   - 🏆 83번째 도메인 16.6배 확장 도전 (S262 5 → S380 83)
//   - 거울 변환 36회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie → library → park → festival → garden → observatory → planetarium → convention)
//   - Sprint WT autopilot 분리 작업 10회차 (DoD 6축 실감증 — domain-sprint-guard.yml 첫 실 작동)
//   - CV 차별성: 다중 트랙 세션 + 부스 임대 + B2B 단기 이벤트 (MS 정적 전시 + EX 단기 박람회 인접하되 회의/컨벤션 세션 + 부스 배정 + 등록자 운영이 핵심)
//   - 동시 한도 200 (컨벤션별 동시 active session 기반, PL 300보다 작고 B2B 집중형)
// ---------------------------------------------------------------------------

export interface ConventionRow {
  id: string;
  name: string;
  max_concurrent_sessions: number;
  active_sessions: number;
  status: string; // active | closed | suspended
}

export interface ConventionMembershipRow {
  id: string;
  member_id: string;
  convention_id: string;
  membership_type: string; // standard | premium | annual
  booth_limit: number;
  booth_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ConventionSessionRow {
  id: string;
  convention_id: string;
  membership_id: string;
  booth_id: string | null;
  payment_id: string | null;
  status: string; // reserved | ongoing | ended | closed | cancelled
  scheduled_at: string;
}

export interface BoothScheduleRow {
  id: string;
  convention_id: string;
  session_id: string;
  booth_no: string;
  session_type: string; // keynote | workshop | exhibition | networking
  status: string; // active | completed | cancelled | expired
  started_at: string;
}

export interface CancelledFeeRecordRow {
  id: string;
  member_id: string;
  session_id: string;
  session_cost: number;
  cancellation_rate: number;
  cancellation_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_SESSIONS_PER_CONVENTION = 200; // CV-001: 컨벤션별 동시 active 세션 한도 (동시 진행 세션 수 기반, B2B 컨벤션 200)

// ---------------------------------------------------------------------------
// CV-001: 컨벤션 동시 active 세션 한도 검증
// (ThresholdCheck detector — F552 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function reserveSession(
  db: Database.Database,
  conventionId: string,
  membershipId: string,
): { sessionId: string; conventionId: string; membershipId: string; scheduledAt: string } {
  const convention = db
    .prepare('SELECT active_sessions, max_concurrent_sessions FROM conventions WHERE id = ?')
    .get(conventionId) as { active_sessions: number; max_concurrent_sessions: number } | undefined;

  if (!convention) throw new ConventionError('E404-CONVENTION', 'Convention not found', 404);

  const limit = convention.max_concurrent_sessions ?? MAX_CONCURRENT_SESSIONS_PER_CONVENTION;

  if (convention.active_sessions >= limit) {
    throw new ConventionError(
      'E422-CONVENTION-SESSION-LIMIT-EXCEEDED',
      `Convention is at full session capacity (${convention.active_sessions} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO convention_sessions (id, convention_id, membership_id, booth_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(sessionId, conventionId, membershipId, scheduledAt);

  db.prepare(`
    UPDATE conventions SET active_sessions = active_sessions + 1 WHERE id = ?
  `).run(conventionId);

  return { sessionId, conventionId, membershipId, scheduledAt };
}

// ---------------------------------------------------------------------------
// CV-002: 회원 부스 예약 한도 검증 (멤버십 유형별 부스 제한)
// (ThresholdCheck detector — F552 Path B var-vs-var, boothLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyBoothLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  booths: number,
): { memberId: string; membershipId: string; boothLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT booth_used, booth_limit FROM convention_memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { booth_used: number; booth_limit: number } | undefined;

  if (!membership) throw new ConventionError('E404-MEMBERSHIP', 'Convention membership not found', 404);

  // F552 Path B: var-vs-var, left=`boothLimit` (`limit` keyword 매칭)
  const boothLimit = membership.booth_limit;

  if (membership.booth_used + booths >= boothLimit) {
    throw new ConventionError(
      'E422-BOOTH-LIMIT-EXCEEDED',
      `Booth quota exhausted (${membership.booth_used + booths} >= ${boothLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE convention_memberships SET booth_used = booth_used + ? WHERE id = ?
  `).run(booths, membershipId);

  return { memberId, membershipId, boothLimit, approved: true };
}

// ---------------------------------------------------------------------------
// CV-003: 부스 등록 atomic — convention_sessions + booth_schedules + session_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBoothBooking(
  db: Database.Database,
  conventionId: string,
  sessionId: string,
  boothNo: string,
  sessionType: string,
  amount: number,
): { boothId: string; sessionPaymentId: string; sessionId: string; conventionId: string; startedAt: string } {
  const session = db
    .prepare("SELECT status FROM convention_sessions WHERE id = ? AND status = 'reserved'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new ConventionError('E404-SESSION', 'Reserved session not found', 404);

  const boothId = randomUUID();
  const sessionPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO booth_schedules (id, convention_id, session_id, booth_no, session_type, status, started_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(boothId, conventionId, sessionId, boothNo, sessionType, startedAt);

    db.prepare(`
      UPDATE convention_sessions SET status = 'ongoing', booth_id = ?, payment_id = ? WHERE id = ?
    `).run(boothId, sessionPaymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, booth_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(sessionPaymentId, sessionId, boothId, amount, startedAt);
  });
  tx();

  return { boothId, sessionPaymentId, sessionId, conventionId, startedAt };
}

// ---------------------------------------------------------------------------
// CV-004: 세션 상태 전환 (reserved → ongoing → ended / closed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSessionStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'ongoing' | 'ended' | 'closed' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM convention_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new ConventionError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'reserved' && newStatus === 'ongoing') ||
    (session.status === 'ongoing' && newStatus === 'ended') ||
    (session.status === 'ongoing' && newStatus === 'closed') ||
    (session.status === 'reserved' && newStatus === 'cancelled') ||
    (session.status === 'ongoing' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ConventionError(
      'E409-SESSION',
      `Cannot transition session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE convention_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// CV-005: closed 세션 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../PL-005 72번째 재사용)
// ---------------------------------------------------------------------------
export function expireClosedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM convention_sessions
      WHERE status = 'closed'
        AND scheduled_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE convention_sessions
      SET status = 'ended'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// CV-006: 세션 환불 atomic — 취소 세션 시 세션 비용 + 취소 수수료 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSessionRefund(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  sessionCost: number,
  cancellationRate: number,
): { feeRecordId: string; refundId: string; memberId: string; cancellationAmount: number; refundedAt: string } {
  const session = db
    .prepare("SELECT status FROM convention_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new ConventionError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const cancellationAmount = Math.round(sessionCost * cancellationRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_fee_records (id, member_id, session_id, session_cost, cancellation_rate, cancellation_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, sessionId, sessionCost, cancellationRate, cancellationAmount);

    db.prepare(`
      INSERT INTO session_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
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
export class ConventionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ConventionError';
  }
}
