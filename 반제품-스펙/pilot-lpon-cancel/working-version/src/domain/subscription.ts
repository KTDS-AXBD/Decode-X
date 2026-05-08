import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-SB (SB-001~SB-006): Subscription 합성 도메인 — 14번째 도메인 (SaaS 구독 산업 다양성)
//   - subscription spec-container rules.md 기반 PoC source
//   - 합성 schema: subscriptions, subscription_payments, subscription_events
//   - SaaS 구독 lifecycle 패턴 — 생성/한도/갱신/상태/만료/취소-환불
//   - withRuleId 재사용 14번째 도메인 (신규 detector 0개, 12 Sprint 연속 정점)
//   - SubscriptionError code-in-message 패턴 (S275 표준)
//   - detector 신뢰도 5 Sprint cascade(S278~S282) + Delivery 산업 입증 패턴(S283) 활용
// ---------------------------------------------------------------------------

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_code: string;          // BASIC | PRO | ENTERPRISE
  price_krw: number;
  cycle_days: number;         // 30 | 90 | 365
  auto_charge_limit: number;  // 사용자 설정 자동결제 한도
  status: string;             // active | paused | cancelled | expired
  cycle_count: number;
  started_at: string;
  next_charge_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
}

export interface SubscriptionPaymentRow {
  id: string;
  subscription_id: string;
  amount: number;
  cycle_index: number;
  status: string;             // success | failed | refunded
  charged_at: string;
}

const MIN_PRICE_KRW = 1_000;
const MAX_CYCLE_DAYS = 365;
const MIN_CYCLE_DAYS = 7;
const MAX_REFUND_DAYS = 14;

// ---------------------------------------------------------------------------
// SB-001: 구독 생성 (price ≥ 1,000 AND 7 ≤ cycle ≤ 365)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function createSubscription(
  db: Database.Database,
  userId: string,
  planCode: string,
  priceKrw: number,
  cycleDays: number,
  autoChargeLimit: number,
): { subscriptionId: string; nextChargeAt: string; status: string } {
  if (priceKrw < MIN_PRICE_KRW) {
    throw new SubscriptionError('E422-PR', `Price below minimum (${priceKrw} < ${MIN_PRICE_KRW})`, 422);
  }
  if (cycleDays < MIN_CYCLE_DAYS) {
    throw new SubscriptionError('E422-CY-MIN', `Cycle below minimum (${cycleDays} < ${MIN_CYCLE_DAYS})`, 422);
  }
  if (cycleDays > MAX_CYCLE_DAYS) {
    throw new SubscriptionError('E422-CY-MAX', `Cycle above maximum (${cycleDays} > ${MAX_CYCLE_DAYS})`, 422);
  }

  const subscriptionId = randomUUID();
  const now = new Date();
  const nextChargeAt = new Date(now.getTime() + cycleDays * 86_400_000).toISOString();
  const startedAt = now.toISOString();

  db.prepare(`
    INSERT INTO subscriptions (id, user_id, plan_code, price_krw, cycle_days, auto_charge_limit, status, cycle_count, started_at, next_charge_at, expires_at, cancelled_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, NULL, NULL)
  `).run(subscriptionId, userId, planCode, priceKrw, cycleDays, autoChargeLimit, startedAt, nextChargeAt);

  return { subscriptionId, nextChargeAt, status: 'active' };
}

// ---------------------------------------------------------------------------
// SB-002: 자동결제 한도 검증 (auto_charge_limit ≥ price)
// (ThresholdCheck detector — F445 Path B var-vs-var with `limit` keyword)
// ---------------------------------------------------------------------------
export function checkAutoChargeLimit(
  db: Database.Database,
  subscriptionId: string,
): { canCharge: boolean; remainingHeadroom: number } {
  const sub = db
    .prepare('SELECT price_krw, auto_charge_limit, status FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { price_krw: number; auto_charge_limit: number; status: string } | undefined;

  if (!sub) {
    throw new SubscriptionError('E404-SB', 'Subscription not found', 404);
  }
  if (sub.status !== 'active') {
    throw new SubscriptionError('E409-ST', `Subscription not active (status=${sub.status})`, 409);
  }

  // F445 Path B: var-vs-var, left=`auto_charge_limit` (`limit` keyword 매칭)
  if (sub.auto_charge_limit < sub.price_krw) {
    throw new SubscriptionError('E422-LIMIT', `Auto-charge limit below price (${sub.auto_charge_limit} < ${sub.price_krw})`, 422);
  }
  const remainingHeadroom = sub.auto_charge_limit - sub.price_krw;
  return { canCharge: true, remainingHeadroom };
}

// ---------------------------------------------------------------------------
// SB-003: 자동 갱신 atomic (cycle_count++ + payment INSERT + next_charge_at UPDATE)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function autoRenew(
  db: Database.Database,
  subscriptionId: string,
): { paymentId: string; cycleIndex: number; nextChargeAt: string } {
  const sub = db
    .prepare('SELECT price_krw, cycle_days, cycle_count, status FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { price_krw: number; cycle_days: number; cycle_count: number; status: string } | undefined;

  if (!sub) throw new SubscriptionError('E404-SB', 'Subscription not found', 404);
  if (sub.status !== 'active') {
    throw new SubscriptionError('E409-ST', `Cannot renew status=${sub.status}`, 409);
  }

  const paymentId = randomUUID();
  const now = new Date();
  const chargedAt = now.toISOString();
  const nextChargeAt = new Date(now.getTime() + sub.cycle_days * 86_400_000).toISOString();
  const newCycleIndex = sub.cycle_count + 1;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO subscription_payments (id, subscription_id, amount, cycle_index, status, charged_at)
      VALUES (?, ?, ?, ?, 'success', ?)
    `).run(paymentId, subscriptionId, sub.price_krw, newCycleIndex, chargedAt);
    db.prepare(`UPDATE subscriptions SET cycle_count = ?, next_charge_at = ? WHERE id = ?`)
      .run(newCycleIndex, nextChargeAt, subscriptionId);
  });
  tx();

  return { paymentId, cycleIndex: newCycleIndex, nextChargeAt };
}

// ---------------------------------------------------------------------------
// SB-004: 상태 전환 (active ↔ paused / cancelled, paused → active / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionSubscriptionStatus(
  db: Database.Database,
  subscriptionId: string,
  newStatus: 'paused' | 'cancelled' | 'active',
): { subscriptionId: string; previousStatus: string; newStatus: string } {
  const sub = db
    .prepare('SELECT status FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { status: string } | undefined;

  if (!sub) throw new SubscriptionError('E404-SB', 'Subscription not found', 404);

  const previousStatus = sub.status;
  // 허용 전환: active ↔ paused, active → cancelled, paused → active/cancelled
  const allowed =
    (previousStatus === 'active' && ['paused', 'cancelled'].includes(newStatus)) ||
    (previousStatus === 'paused' && ['active', 'cancelled'].includes(newStatus));

  if (!allowed) {
    throw new SubscriptionError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  const cancelledAt = newStatus === 'cancelled' ? new Date().toISOString() : null;

  if (cancelledAt) {
    db.prepare(`UPDATE subscriptions SET status = ?, cancelled_at = ? WHERE id = ?`)
      .run(newStatus, cancelledAt, subscriptionId);
  } else {
    db.prepare(`UPDATE subscriptions SET status = ? WHERE id = ?`)
      .run(newStatus, subscriptionId);
  }

  return { subscriptionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// SB-005: 만료 자동 처리 (expires_at < now → status='expired' batch)
// (StatusTransition detector — batch 패턴, CC-005 / DV-005 동일 검증된 형태)
// ---------------------------------------------------------------------------
export function markExpiredSubscriptions(
  db: Database.Database,
  asOfDate: string = new Date().toISOString(),
): { markedCount: number; expiredSubscriptionIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM subscriptions
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < ?
    `)
    .all(asOfDate) as Array<{ id: string }>;

  const expiredSubscriptionIds: string[] = [];
  for (const s of candidates) {
    db.prepare(`UPDATE subscriptions SET status = 'expired' WHERE id = ?`)
      .run(s.id);
    expiredSubscriptionIds.push(s.id);
  }

  return { markedCount: expiredSubscriptionIds.length, expiredSubscriptionIds };
}

// ---------------------------------------------------------------------------
// SB-006: 취소 환불 atomic (cancel + 부분 환불 — MAX_REFUND_DAYS 이내)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function cancelWithRefund(
  db: Database.Database,
  subscriptionId: string,
  reason: string,
): { refundPaymentId: string; refundAmount: number; cancelledAt: string } {
  const sub = db
    .prepare('SELECT price_krw, started_at, status FROM subscriptions WHERE id = ?')
    .get(subscriptionId) as { price_krw: number; started_at: string; status: string } | undefined;

  if (!sub) throw new SubscriptionError('E404-SB', 'Subscription not found', 404);
  if (sub.status === 'cancelled' || sub.status === 'expired') {
    throw new SubscriptionError('E409-SB', `Already terminated (status=${sub.status})`, 409);
  }

  const startedDate = new Date(sub.started_at);
  const now = new Date();
  const elapsedDays = (now.getTime() - startedDate.getTime()) / (1000 * 60 * 60 * 24);

  // 14일 이내 환불 가능, 초과 시 0원
  const refundAmount = elapsedDays <= MAX_REFUND_DAYS ? sub.price_krw : 0;
  const refundPaymentId = randomUUID();
  const cancelledAt = now.toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = ? WHERE id = ?`)
      .run(cancelledAt, subscriptionId);
    if (refundAmount > 0) {
      db.prepare(`
        INSERT INTO subscription_payments (id, subscription_id, amount, cycle_index, status, charged_at)
        VALUES (?, ?, ?, -1, 'refunded', ?)
      `).run(refundPaymentId, subscriptionId, -refundAmount, cancelledAt);
    }
  });
  tx();

  // reason은 audit log에 기록 (실 구현에서는 별도 테이블)
  void reason;
  return { refundPaymentId, refundAmount, cancelledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class SubscriptionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SubscriptionError';
  }
}
