import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AS (AS-001~AS-006): Aerospace 합성 도메인 — 50번째 도메인 (항공우주 산업, 39번째 신규 산업)
//   - aerospace spec-container rules.md 기반 PoC source
//   - 합성 schema: launch_pad_pool, missions, contractor_orbits, payloads,
//                  mission_payments, decommission_records, abort_refund_records, abort_refunds
//   - 항공우주 lifecycle 패턴 — 발사대정원/궤도수수료한도/미션atomic/미션상태전환/위성퇴역배치/abort환불atomic
//   - withRuleId 재사용 50번째 도메인 (신규 detector 0개, 51 Sprint 연속 정점 도전)
//   - AerospaceError code-in-message 패턴 (S275 표준)
//   - 39 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS)
//   - 39번째 신규 산업 마일스톤 (aerospace 추가, 항공 4번째 — TR+AV+CS+AS 항공/운송 4-클러스터 확장)
//   - 🏆 50번째 도메인 마일스톤 (S262 5 → S299 50, 10배 확장)
// ---------------------------------------------------------------------------

export interface LaunchPadPoolRow {
  id: string;
  name: string;
  total_capacity: number;
  active_launches: number;
  status: string; // active | maintenance | decommissioned
}

export interface ContractorOrbitRow {
  id: string;
  contractor_id: string;
  launch_pad_id: string;
  tier_code: string; // suborbital | leo | geo | deepspace
  fee_limit: number;
  fee_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface MissionRow {
  id: string;
  launch_pad_id: string;
  orbit_id: string;
  payload_id: string | null;
  mission_payment_id: string | null;
  status: string; // pending | confirmed | launching | inOrbit | aborted
  scheduled_at: string;
}

export interface PayloadRow {
  id: string;
  launch_pad_id: string;
  mission_id: string;
  payload_number: string;
  status: string; // launching | inOrbit | retired
  deployed_at: string;
}

export interface AbortRefundRecordRow {
  id: string;
  contractor_id: string;
  payload_id: string;
  mission_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_DAILY_LAUNCHES_PER_PAD = 24; // AS-001: 항공우주 발사대 일일 발사 정원 한도 (건, 기본값)

// ---------------------------------------------------------------------------
// AS-001: 항공우주 발사대 일일 발사 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function scheduleLaunch(
  db: Database.Database,
  launchPadId: string,
  orbitId: string,
): { missionId: string; launchPadId: string; orbitId: string; scheduledAt: string } {
  const pad = db
    .prepare('SELECT active_launches, total_capacity FROM launch_pad_pool WHERE id = ?')
    .get(launchPadId) as { active_launches: number; total_capacity: number } | undefined;

  if (!pad) throw new AerospaceError('E404-LAUNCH-PAD', 'Launch pad pool not found', 404);

  const limit = pad.total_capacity ?? MAX_DAILY_LAUNCHES_PER_PAD;

  if (pad.active_launches >= limit) {
    throw new AerospaceError(
      'E422-LAUNCH-PAD-CAPACITY-EXCEEDED',
      `Launch pad is at full capacity (${pad.active_launches} >= ${limit})`,
      422,
    );
  }

  const missionId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO missions (id, launch_pad_id, orbit_id, payload_id, mission_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'pending', ?)
  `).run(missionId, launchPadId, orbitId, scheduledAt);

  db.prepare(`
    UPDATE launch_pad_pool SET active_launches = active_launches + 1 WHERE id = ?
  `).run(launchPadId);

  return { missionId, launchPadId, orbitId, scheduledAt };
}

// ---------------------------------------------------------------------------
// AS-002: 계약자 궤도 수수료 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, orbitFeeLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyOrbitFeeTier(
  db: Database.Database,
  contractorId: string,
  orbitId: string,
  fee: number,
): { contractorId: string; orbitId: string; orbitFeeLimit: number; approved: boolean } {
  const orbit = db
    .prepare('SELECT fee_used, fee_limit FROM contractor_orbits WHERE id = ? AND contractor_id = ? LIMIT 1')
    .get(orbitId, contractorId) as { fee_used: number; fee_limit: number } | undefined;

  if (!orbit) throw new AerospaceError('E404-ORBIT', 'Contractor orbit not found', 404);

  // F445 Path B: var-vs-var, left=`orbitFeeLimit` (`limit` keyword 매칭)
  const orbitFeeLimit = orbit.fee_limit;

  if (orbit.fee_used + fee >= orbitFeeLimit) {
    throw new AerospaceError(
      'E422-ORBIT-FEE-LIMIT-EXCEEDED',
      `Orbit fee quota exhausted (${orbit.fee_used + fee} >= ${orbitFeeLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE contractor_orbits SET fee_used = fee_used + ? WHERE id = ?
  `).run(fee, orbitId);

  return { contractorId, orbitId, orbitFeeLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AS-003: 미션 실행 atomic — payloads + missions 상태전환 + mission_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function executeMission(
  db: Database.Database,
  launchPadId: string,
  missionId: string,
  payloadNumber: string,
  amount: number,
): { payloadId: string; missionPaymentId: string; missionId: string; launchPadId: string; deployedAt: string } {
  const mission = db
    .prepare("SELECT status FROM missions WHERE id = ? AND status = 'confirmed'")
    .get(missionId) as { status: string } | undefined;

  if (!mission) throw new AerospaceError('E404-MISSION', 'Confirmed mission not found', 404);

  const payloadId = randomUUID();
  const missionPaymentId = randomUUID();
  const deployedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO payloads (id, launch_pad_id, mission_id, payload_number, status, deployed_at)
      VALUES (?, ?, ?, ?, 'launching', ?)
    `).run(payloadId, launchPadId, missionId, payloadNumber, deployedAt);

    db.prepare(`
      UPDATE missions SET status = 'launching', payload_id = ?, mission_payment_id = ? WHERE id = ?
    `).run(payloadId, missionPaymentId, missionId);

    db.prepare(`
      INSERT INTO mission_payments (id, mission_id, payload_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(missionPaymentId, missionId, payloadId, amount, deployedAt);
  });
  tx();

  return { payloadId, missionPaymentId, missionId, launchPadId, deployedAt };
}

// ---------------------------------------------------------------------------
// AS-004: 미션 상태 전환 (pending → confirmed → launching → inOrbit → aborted)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionMissionStatus(
  db: Database.Database,
  missionId: string,
  newStatus: 'confirmed' | 'launching' | 'inOrbit' | 'aborted',
): { missionId: string; previousStatus: string; newStatus: string } {
  const mission = db
    .prepare('SELECT status FROM missions WHERE id = ?')
    .get(missionId) as { status: string } | undefined;

  if (!mission) throw new AerospaceError('E404-MISSION', 'Mission not found', 404);

  const previousStatus = mission.status;
  const allowed =
    (mission.status === 'pending' && newStatus === 'confirmed') ||
    (mission.status === 'confirmed' && newStatus === 'launching') ||
    (mission.status === 'launching' && newStatus === 'inOrbit') ||
    (mission.status === 'pending' && newStatus === 'aborted') ||
    (mission.status === 'confirmed' && newStatus === 'aborted');

  if (!allowed) {
    throw new AerospaceError(
      'E409-MISSION',
      `Cannot transition mission from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE missions SET status = ? WHERE id = ?`).run(newStatus, missionId);

  return { missionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AS-005: 만료 위성 일괄 퇴역 처리 (batch retire marking)
// (StatusTransition detector — batch 패턴, FS-005/CS-005/PK-005/GY-005/VT-005 39번째 재사용)
// ---------------------------------------------------------------------------
export function retireSatelliteBatch(
  db: Database.Database,
  now: string,
): { retiredCount: number; retiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM payloads
      WHERE status = 'inOrbit'
        AND deployed_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const retiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE payloads
      SET status = 'retired'
      WHERE id = ?
    `).run(item.id);
    retiredIds.push(item.id);
  }

  return { retiredCount: retiredIds.length, retiredIds };
}

// ---------------------------------------------------------------------------
// AS-006: 미션 abort 환불 atomic — 미션비용 + 환불비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processAbortRefund(
  db: Database.Database,
  contractorId: string,
  payloadId: string,
  missionCost: number,
  refundRate: number,
): { abortRefundId: string; refundId: string; contractorId: string; refundAmount: number; refundedAt: string } {
  const payload = db
    .prepare("SELECT status FROM payloads WHERE id = ? AND status = 'launching'")
    .get(payloadId) as { status: string } | undefined;

  if (!payload) throw new AerospaceError('E404-LAUNCHING-PAYLOAD', 'Launching payload not found', 404);

  const abortRefundId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(missionCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO abort_refund_records (id, contractor_id, payload_id, mission_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(abortRefundId, contractorId, payloadId, missionCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO abort_refunds (id, abort_refund_id, contractor_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, abortRefundId, contractorId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE abort_refund_records SET status = 'refunded' WHERE id = ?
    `).run(abortRefundId);
  });
  tx();

  return { abortRefundId, refundId, contractorId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class AerospaceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AerospaceError';
  }
}
