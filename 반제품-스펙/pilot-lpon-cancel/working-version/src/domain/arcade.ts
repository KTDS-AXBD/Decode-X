import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AC (AC-001~AC-006): Arcade 합성 도메인 — 93번째 도메인 (아케이드 산업, 82번째 신규 산업) 🕹️ 단일 클러스터 24 도메인 첫 사례 마일스톤 신기록 + 20 Sprint 연속 첫 사례 마일스톤 신기록
//   - arcade spec-container rules.md 기반 PoC source
//   - 합성 schema: arcade_sessions, arcades, memberships,
//                  token_ledger, session_payments,
//                  cancelled_token_records, token_refunds
//   - 아케이드 lifecycle 패턴 — 동시machine한도/token한도/token충전atomic/machine상태전환/ended세션일괄만료/token환불atomic
//   - withRuleId 재사용 93번째 도메인 (신규 detector 0개, 94 Sprint 연속 정점 도전)
//   - ArcadeError code-in-message 패턴 (S275 표준)
//   - 82 산업 연속 0 ABSENCE 도전 (..+BW+AC)
//   - 🕹️ 단일 클러스터 24 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC 오프라인 엔터 24-클러스터)
//   - 🏆 20 Sprint 연속 첫 사례 마일스톤 신기록 (S370 5→S371 6→...→S389 23→S390 24)
//   - 🏆 withRuleId 94 Sprint 정점 도전 (S264~S390 94 Sprint 누적 정점)
//   - 🏆🏆 20 round 마일스톤 (S370 5 → ... → S389 23 → S390 24)
//   - 거울 변환 46회차 (carsharing → ... → casino → bowling → arcade)
//   - Sprint WT autopilot 분리 작업 20회차 (DoD 6축 실감증 11회차 — rules/ 등재 후 2회차 자연 작동)
//   - AC 차별성: BW(볼링 lane 단위 시간제) + GA(도박 betting platform) 인접하되
//     token 기반 prepaid + machine 다양성 (rhythm/racing/redemption) + machine fault event
//     + prize ticket system + redemption shop + family-friendly arcade variety
//   - 동시 한도 30 (arcade별 동시 active machine, 중형 아케이드 30 machine 기준)
// ---------------------------------------------------------------------------

export interface ArcadeRow {
  id: string;
  name: string;
  max_concurrent_machines: number;
  active_machines: number;
  status: string; // active | closed | suspended
}

export interface MembershipRow {
  id: string;
  member_id: string;
  arcade_id: string;
  membership_type: string; // basic | silver | gold | vip
  token_limit: number;
  daily_used: number;
  status: string; // active | paused | expired
}

export interface ArcadeSessionRow {
  id: string;
  arcade_id: string;
  membership_id: string;
  machine_id: string | null;
  payment_id: string | null;
  status: string; // idle | active | paused | ended | fault | cancelled
  started_at: string;
}

export interface TokenLedgerRow {
  id: string;
  member_id: string;
  session_id: string;
  machine_id: string;
  tokens_used: number;
  tokens_remaining: number;
  recorded_at: string;
}

const MAX_CONCURRENT_MACHINES_PER_ARCADE = 30; // AC-001: arcade별 동시 active machine 한도 (중형 아케이드 30 machine 기준)

// ---------------------------------------------------------------------------
// AC-001: arcade별 동시 active machine 한도 검증
// (ThresholdCheck detector — F562 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function enterMachine(
  db: Database.Database,
  arcadeId: string,
  membershipId: string,
): { sessionId: string; arcadeId: string; membershipId: string; startedAt: string } {
  const arcade = db
    .prepare('SELECT active_machines, max_concurrent_machines FROM arcades WHERE id = ?')
    .get(arcadeId) as { active_machines: number; max_concurrent_machines: number } | undefined;

  if (!arcade) throw new ArcadeError('E404-ARCADE', 'Arcade not found', 404);

  const limit = arcade.max_concurrent_machines ?? MAX_CONCURRENT_MACHINES_PER_ARCADE;

  if (arcade.active_machines >= limit) {
    throw new ArcadeError(
      'E422-MACHINE-LIMIT-EXCEEDED',
      `Arcade is at full machine capacity (${arcade.active_machines} >= ${limit})`,
      422,
    );
  }

  const sessionId = randomUUID();
  const startedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO arcade_sessions (id, arcade_id, membership_id, machine_id, payment_id, status, started_at)
    VALUES (?, ?, ?, NULL, NULL, 'idle', ?)
  `).run(sessionId, arcadeId, membershipId, startedAt);

  db.prepare(`
    UPDATE arcades SET active_machines = active_machines + 1 WHERE id = ?
  `).run(arcadeId);

  return { sessionId, arcadeId, membershipId, startedAt };
}

// ---------------------------------------------------------------------------
// AC-002: 회원 일일 token 한도 검증 (멤버십 등급별 일일 token 사용량 제한)
// (ThresholdCheck detector — F562 Path B var-vs-var, tokenLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyTokenLimit(
  db: Database.Database,
  memberId: string,
  membershipId: string,
  tokenCost: number,
): { memberId: string; membershipId: string; tokenLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT daily_used, token_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1')
    .get(membershipId, memberId) as { daily_used: number; token_limit: number } | undefined;

  if (!membership) throw new ArcadeError('E404-MEMBERSHIP', 'Membership not found', 404);

  // F562 Path B: var-vs-var, left=`tokenLimit` (`limit` keyword 매칭)
  const tokenLimit = membership.token_limit;

  if (membership.daily_used + tokenCost >= tokenLimit) {
    throw new ArcadeError(
      'E422-TOKEN-LIMIT-EXCEEDED',
      `Membership token quota exhausted (${membership.daily_used + tokenCost} >= ${tokenLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE memberships SET daily_used = daily_used + ? WHERE id = ?
  `).run(tokenCost, membershipId);

  return { memberId, membershipId, tokenLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AC-003: token 충전/사용 atomic — arcade_sessions + token_ledger + session_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTokenCharge(
  db: Database.Database,
  arcadeId: string,
  sessionId: string,
  machineId: string,
  tokenCost: number,
  amount: number,
): { ledgerId: string; paymentId: string; sessionId: string; arcadeId: string; chargedAt: string } {
  const session = db
    .prepare("SELECT status FROM arcade_sessions WHERE id = ? AND status = 'idle'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new ArcadeError('E404-SESSION', 'Idle session not found', 404);

  const ledgerId = randomUUID();
  const paymentId = randomUUID();
  const chargedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO token_ledger (id, member_id, session_id, machine_id, tokens_used, tokens_remaining, recorded_at)
      VALUES (?, (SELECT membership_id FROM arcade_sessions WHERE id = ?), ?, ?, ?, 0, ?)
    `).run(ledgerId, sessionId, sessionId, machineId, tokenCost, chargedAt);

    db.prepare(`
      UPDATE arcade_sessions SET status = 'active', machine_id = ?, payment_id = ? WHERE id = ?
    `).run(machineId, paymentId, sessionId);

    db.prepare(`
      INSERT INTO session_payments (id, session_id, machine_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, sessionId, machineId, amount, chargedAt);
  });
  tx();

  return { ledgerId, paymentId, sessionId, arcadeId, chargedAt };
}

// ---------------------------------------------------------------------------
// AC-004: machine session 상태 전환 (idle → active → paused → ended / fault / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionMachineStatus(
  db: Database.Database,
  sessionId: string,
  newStatus: 'active' | 'paused' | 'ended' | 'fault' | 'cancelled',
): { sessionId: string; previousStatus: string; newStatus: string } {
  const session = db
    .prepare('SELECT status FROM arcade_sessions WHERE id = ?')
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new ArcadeError('E404-SESSION', 'Session not found', 404);

  const previousStatus = session.status;
  const allowed =
    (session.status === 'idle' && newStatus === 'active') ||
    (session.status === 'active' && newStatus === 'paused') ||
    (session.status === 'paused' && newStatus === 'active') ||
    (session.status === 'active' && newStatus === 'ended') ||
    (session.status === 'paused' && newStatus === 'ended') ||
    (session.status === 'active' && newStatus === 'fault') ||
    (session.status === 'idle' && newStatus === 'cancelled') ||
    (session.status === 'active' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ArcadeError(
      'E409-SESSION',
      `Cannot transition machine session from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE arcade_sessions SET status = ? WHERE id = ?`).run(newStatus, sessionId);

  return { sessionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AC-005: ended machine session 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../BW-005 82번째 재사용)
// ---------------------------------------------------------------------------
export function expireEndedSessionBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM arcade_sessions
      WHERE status = 'ended'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE arcade_sessions
      SET status = 'cancelled'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// AC-006: token 환불 atomic — prize ticket redemption 정책 + 잔여 token 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processTokenRefund(
  db: Database.Database,
  memberId: string,
  sessionId: string,
  tokenBalance: number,
  prizeTickets: number,
): { feeRecordId: string; refundId: string; memberId: string; refundTokens: number; refundedAt: string } {
  const session = db
    .prepare("SELECT status FROM arcade_sessions WHERE id = ? AND status = 'cancelled'")
    .get(sessionId) as { status: string } | undefined;

  if (!session) throw new ArcadeError('E404-CANCELLED-SESSION', 'Cancelled session not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const refundTokens = Math.max(0, tokenBalance - prizeTickets);
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancelled_token_records (id, member_id, session_id, token_balance, prize_tickets, refund_tokens, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, sessionId, tokenBalance, prizeTickets, refundTokens);

    db.prepare(`
      INSERT INTO token_refunds (id, fee_record_id, member_id, tokens, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, feeRecordId, memberId, refundTokens, refundedAt);

    db.prepare(`
      UPDATE cancelled_token_records SET status = 'refunded' WHERE id = ?
    `).run(feeRecordId);
  });
  tx();

  return { feeRecordId, refundId, memberId, refundTokens, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ArcadeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ArcadeError';
  }
}
