import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-TC (TC-001~TC-006): Telecom 합성 도메인 — 26번째 도메인 (통신 산업, 15번째 신규 산업)
//   - telecom spec-container rules.md 기반 PoC source
//   - 합성 schema: subscriptions, data_plans, billing_cycles, port_out_requests
//   - 통신 lifecycle 패턴 — 가입한도/데이터할당량/플랜업그레이드atomic/가입상태전환/청구주기배치/번호이동atomic
//   - withRuleId 재사용 26번째 도메인 (신규 detector 0개, 24 Sprint 연속 정점)
//   - TelecomError code-in-message 패턴 (S275 표준)
//   - 15 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC)
// ---------------------------------------------------------------------------

export interface SubscriptionRow {
  id: string;
  customer_id: string;
  line_number: string;    // 전화번호
  plan_id: string;
  status: string;         // pending | active | suspended | terminated
  carrier: string;
  activated_at: string | null;
  suspended_at: string | null;
  terminated_at: string | null;
}

export interface DataPlanRow {
  id: string;
  plan_name: string;
  data_quota_limit: number;   // bytes
  monthly_fee: number;
  max_active_lines: number;
}

export interface DataUsageRow {
  id: string;
  subscription_id: string;
  usage_bytes: number;
  recorded_at: string;
}

export interface BillingCycleRow {
  id: string;
  subscription_id: string;
  cycle_month: string;    // YYYY-MM
  status: string;         // pending | billed | failed | waived
  amount: number;
  billed_at: string | null;
}

export interface PortOutRequestRow {
  id: string;
  subscription_id: string;
  target_carrier: string;
  status: string;         // pending | approved | completed | rejected
  settlement_amount: number;
  requested_at: string;
  completed_at: string | null;
}

const MAX_ACTIVE_LINES = 5;   // TC-001: 고객당 동시 가입 회선 한도

// ---------------------------------------------------------------------------
// TC-001: 가입 회선 활성화 — 동시 가입 회선 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function activateSubscription(
  db: Database.Database,
  customerId: string,
  lineNumber: string,
  planId: string,
  carrier: string,
): { subscriptionId: string; lineNumber: string; activatedAt: string } {
  const existing = db
    .prepare(`SELECT COUNT(*) as cnt FROM subscriptions WHERE customer_id = ? AND status = 'active'`)
    .get(customerId) as { cnt: number };

  const activeLines = existing.cnt;
  if (activeLines >= MAX_ACTIVE_LINES) {
    throw new TelecomError(
      'E422-LINE-LIMIT',
      `Active line limit reached (${activeLines} >= ${MAX_ACTIVE_LINES}) for customer ${customerId}`,
      422,
    );
  }

  const subscriptionId = randomUUID();
  const activatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO subscriptions (id, customer_id, line_number, plan_id, status, carrier, activated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(subscriptionId, customerId, lineNumber, planId, carrier, activatedAt);

  return { subscriptionId, lineNumber, activatedAt };
}

// ---------------------------------------------------------------------------
// TC-002: 데이터 사용량 한도 비교 — 요금제 데이터 할당량 초과 검증
// (ThresholdCheck detector — F445 Path B var-vs-var, dataQuotaLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function checkDataUsage(
  db: Database.Database,
  subscriptionId: string,
  additionalUsageBytes: number,
): { subscriptionId: string; usageBytes: number; dataQuotaLimit: number; withinQuota: boolean } {
  const subscription = db
    .prepare('SELECT id, plan_id FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { id: string; plan_id: string } | undefined;

  if (!subscription) throw new TelecomError('E404-SUBSCRIPTION', 'Subscription not found', 404);

  const plan = db
    .prepare('SELECT data_quota_limit, monthly_fee FROM data_plans WHERE id = ?')
    .get(subscription.plan_id) as { data_quota_limit: number; monthly_fee: number } | undefined;

  if (!plan) throw new TelecomError('E404-PLAN', 'Data plan not found', 404);

  const currentUsage = db
    .prepare(`SELECT COALESCE(SUM(usage_bytes), 0) as total FROM data_usages WHERE subscription_id = ?`)
    .get(subscriptionId) as { total: number };

  const usageBytes = currentUsage.total + additionalUsageBytes;
  const dataQuotaLimit = plan.data_quota_limit;

  // F445 Path B: var-vs-var, left=`dataQuotaLimit` (`limit` keyword 매칭)
  if (usageBytes > dataQuotaLimit) {
    throw new TelecomError(
      'E429-DATA-QUOTA',
      `Data quota exceeded (${usageBytes} > ${dataQuotaLimit} bytes)`,
      429,
    );
  }

  const usageId = randomUUID();
  db.prepare(`
    INSERT INTO data_usages (id, subscription_id, usage_bytes, recorded_at)
    VALUES (?, ?, ?, ?)
  `).run(usageId, subscriptionId, additionalUsageBytes, new Date().toISOString());

  return { subscriptionId, usageBytes, dataQuotaLimit, withinQuota: true };
}

// ---------------------------------------------------------------------------
// TC-003: 플랜 업그레이드 atomic — plan 변경 + 요금 차감 + 회선 갱신 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function upgradePlan(
  db: Database.Database,
  subscriptionId: string,
  newPlanId: string,
): { subscriptionId: string; previousPlanId: string; newPlanId: string; upgradedAt: string } {
  const subscription = db
    .prepare('SELECT id, plan_id, status FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { id: string; plan_id: string; status: string } | undefined;

  if (!subscription) throw new TelecomError('E404-SUBSCRIPTION', 'Subscription not found', 404);
  if (subscription.status !== 'active') {
    throw new TelecomError(
      'E409-SUBSCRIPTION',
      `Cannot upgrade plan for subscription with status=${subscription.status}`,
      409,
    );
  }

  const newPlan = db
    .prepare('SELECT id, monthly_fee FROM data_plans WHERE id = ?')
    .get(newPlanId) as { id: string; monthly_fee: number } | undefined;

  if (!newPlan) throw new TelecomError('E404-PLAN', 'Target plan not found', 404);

  const previousPlanId = subscription.plan_id;
  const upgradedAt = new Date().toISOString();
  const cycleId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE subscriptions SET plan_id = ? WHERE id = ?`)
      .run(newPlanId, subscriptionId);
    db.prepare(`
      INSERT INTO billing_cycles (id, subscription_id, cycle_month, status, amount, billed_at)
      VALUES (?, ?, ?, 'billed', ?, ?)
    `).run(cycleId, subscriptionId, upgradedAt.slice(0, 7), newPlan.monthly_fee, upgradedAt);
    db.prepare(`UPDATE subscriptions SET activated_at = ? WHERE id = ?`)
      .run(upgradedAt, subscriptionId);
  });
  tx();

  return { subscriptionId, previousPlanId, newPlanId, upgradedAt };
}

// ---------------------------------------------------------------------------
// TC-004: 가입 상태 전환 (pending → active → suspended → terminated)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSubscriptionStatus(
  db: Database.Database,
  subscriptionId: string,
  newStatus: 'active' | 'suspended' | 'terminated',
): { subscriptionId: string; previousStatus: string; newStatus: string } {
  const subscription = db
    .prepare('SELECT status FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { status: string } | undefined;

  if (!subscription) throw new TelecomError('E404-SUBSCRIPTION', 'Subscription not found', 404);

  const previousStatus = subscription.status;
  const allowed =
    (previousStatus === 'pending' && newStatus === 'active') ||
    (previousStatus === 'active' && newStatus === 'suspended') ||
    (previousStatus === 'suspended' && newStatus === 'active') ||
    (previousStatus === 'active' && newStatus === 'terminated') ||
    (previousStatus === 'suspended' && newStatus === 'terminated');

  if (!allowed) {
    throw new TelecomError(
      'E409-SUBSCRIPTION',
      `Cannot transition subscription from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE subscriptions SET status = ? WHERE id = ?`).run(newStatus, subscriptionId);

  if (newStatus === 'active') {
    db.prepare(`UPDATE subscriptions SET activated_at = ? WHERE id = ?`).run(now, subscriptionId);
  } else if (newStatus === 'suspended') {
    db.prepare(`UPDATE subscriptions SET suspended_at = ? WHERE id = ?`).run(now, subscriptionId);
  } else if (newStatus === 'terminated') {
    db.prepare(`UPDATE subscriptions SET terminated_at = ? WHERE id = ?`).run(now, subscriptionId);
  }

  return { subscriptionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// TC-005: 청구 주기 일괄 처리 (pending → billed 배치)
// (StatusTransition detector — batch 패턴, CC-005 batch 15번째 재사용)
// ---------------------------------------------------------------------------
export function runBillingCycle(
  db: Database.Database,
  cycleMonth: string,
): { billedCount: number; billedIds: string[] } {
  const candidates = db
    .prepare(`SELECT id, subscription_id, amount FROM billing_cycles WHERE status = 'pending' AND cycle_month = ?`)
    .all(cycleMonth) as Array<{ id: string; subscription_id: string; amount: number }>;

  const billedIds: string[] = [];
  const billedAt = new Date().toISOString();

  for (const cycle of candidates) {
    db.prepare(`
      UPDATE billing_cycles
      SET status = 'billed', billed_at = ?
      WHERE id = ?
    `).run(billedAt, cycle.id);
    billedIds.push(cycle.id);
  }

  return { billedCount: billedIds.length, billedIds };
}

// ---------------------------------------------------------------------------
// TC-006: 번호이동 atomic — 번호이동 + carrier 정산 + termination 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processPortOut(
  db: Database.Database,
  subscriptionId: string,
  targetCarrier: string,
  settlementAmount: number,
): { portOutId: string; subscriptionId: string; completedAt: string } {
  const subscription = db
    .prepare('SELECT id, status, line_number FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { id: string; status: string; line_number: string } | undefined;

  if (!subscription) throw new TelecomError('E404-SUBSCRIPTION', 'Subscription not found', 404);
  if (subscription.status === 'terminated') {
    throw new TelecomError(
      'E409-SUBSCRIPTION',
      `Cannot port-out subscription with status=${subscription.status}`,
      409,
    );
  }

  const portOutId = randomUUID();
  const completedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO port_out_requests (id, subscription_id, target_carrier, status, settlement_amount, requested_at, completed_at)
      VALUES (?, ?, ?, 'completed', ?, ?, ?)
    `).run(portOutId, subscriptionId, targetCarrier, settlementAmount, completedAt, completedAt);
    db.prepare(`UPDATE subscriptions SET status = 'terminated' WHERE id = ?`)
      .run(subscriptionId);
    db.prepare(`UPDATE subscriptions SET terminated_at = ? WHERE id = ?`)
      .run(completedAt, subscriptionId);
  });
  tx();

  return { portOutId, subscriptionId, completedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class TelecomError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'TelecomError';
  }
}
