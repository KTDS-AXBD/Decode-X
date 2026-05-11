import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-FS (FS-001~FS-006): Fast Food 합성 도메인 — 49번째 도메인 (패스트푸드 산업, 38번째 신규 산업)
//   - fastfood spec-container rules.md 기반 PoC source
//   - 합성 schema: kiosk_pool, orders, customer_memberships, kitchen_tickets,
//                  order_payments, stale_records, franchise_billing_records, franchise_payouts
//   - 패스트푸드 lifecycle 패턴 — 키오스크주문정원/콤보할인한도/결제atomic/주문상태전환/stale배치/가맹점정산atomic
//   - withRuleId 재사용 49번째 도메인 (신규 detector 0개, 50 Sprint 연속 정점 도전)
//   - FastFoodError code-in-message 패턴 (S275 표준)
//   - 38 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS)
//   - 38번째 신규 산업 마일스톤 (fastfood 추가, 외식 서비스 4번째 — DV+WL+FT+FS QSR 클러스터 확장)
// ---------------------------------------------------------------------------

export interface KioskPoolRow {
  id: string;
  name: string;
  total_capacity: number;
  active_orders: number;
  status: string; // active | maintenance | closed
}

export interface CustomerMembershipRow {
  id: string;
  customer_id: string;
  kiosk_id: string;
  tier_code: string; // basic | silver | gold | corporate
  discount_limit: number;
  discount_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface OrderRow {
  id: string;
  kiosk_id: string;
  membership_id: string;
  ticket_id: string | null;
  payment_id: string | null;
  status: string; // pending | confirmed | preparing | ready | cancelled
  ordered_at: string;
}

export interface KitchenTicketRow {
  id: string;
  kiosk_id: string;
  order_id: string;
  ticket_number: string;
  status: string; // preparing | ready | stale
  accepted_at: string;
}

export interface FranchiseBillingRecordRow {
  id: string;
  franchisee_id: string;
  kitchen_ticket_id: string;
  revenue: number;
  billing_rate: number;
  billing_amount: number;
  status: string; // pending | calculated | settled
}

const MAX_DAILY_ORDERS_PER_KIOSK = 300; // FS-001: 패스트푸드 키오스크 일일 주문 정원 한도 (건, 기본값)

// ---------------------------------------------------------------------------
// FS-001: 패스트푸드 키오스크 일일 주문 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function placeOrder(
  db: Database.Database,
  kioskId: string,
  membershipId: string,
): { orderId: string; kioskId: string; membershipId: string; orderedAt: string } {
  const kiosk = db
    .prepare('SELECT active_orders, total_capacity FROM kiosk_pool WHERE id = ?')
    .get(kioskId) as { active_orders: number; total_capacity: number } | undefined;

  if (!kiosk) throw new FastFoodError('E404-KIOSK', 'Kiosk pool not found', 404);

  const limit = kiosk.total_capacity ?? MAX_DAILY_ORDERS_PER_KIOSK;

  if (kiosk.active_orders >= limit) {
    throw new FastFoodError(
      'E422-KIOSK-CAPACITY-EXCEEDED',
      `Kiosk is at full capacity (${kiosk.active_orders} >= ${limit})`,
      422,
    );
  }

  const orderId = randomUUID();
  const orderedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO orders (id, kiosk_id, membership_id, ticket_id, payment_id, status, ordered_at)
    VALUES (?, ?, ?, NULL, NULL, 'pending', ?)
  `).run(orderId, kioskId, membershipId, orderedAt);

  db.prepare(`
    UPDATE kiosk_pool SET active_orders = active_orders + 1 WHERE id = ?
  `).run(kioskId);

  return { orderId, kioskId, membershipId, orderedAt };
}

// ---------------------------------------------------------------------------
// FS-002: 회원 콤보 할인 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, discountLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyComboDiscount(
  db: Database.Database,
  customerId: string,
  membershipId: string,
  discount: number,
): { customerId: string; membershipId: string; discountLimit: number; approved: boolean } {
  const membership = db
    .prepare('SELECT discount_used, discount_limit FROM customer_memberships WHERE id = ? AND customer_id = ? LIMIT 1')
    .get(membershipId, customerId) as { discount_used: number; discount_limit: number } | undefined;

  if (!membership) throw new FastFoodError('E404-MEMBERSHIP', 'Customer membership not found', 404);

  // F445 Path B: var-vs-var, left=`discountLimit` (`limit` keyword 매칭)
  const discountLimit = membership.discount_limit;

  if (membership.discount_used + discount >= discountLimit) {
    throw new FastFoodError(
      'E422-COMBO-DISCOUNT-LIMIT-EXCEEDED',
      `Combo discount quota exhausted (${membership.discount_used + discount} >= ${discountLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE customer_memberships SET discount_used = discount_used + ? WHERE id = ?
  `).run(discount, membershipId);

  return { customerId, membershipId, discountLimit, approved: true };
}

// ---------------------------------------------------------------------------
// FS-003: 결제 atomic — kitchen_tickets + orders 상태전환 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processPayment(
  db: Database.Database,
  kioskId: string,
  orderId: string,
  ticketNumber: string,
  amount: number,
): { ticketId: string; paymentId: string; orderId: string; kioskId: string; acceptedAt: string } {
  const order = db
    .prepare("SELECT status FROM orders WHERE id = ? AND status = 'confirmed'")
    .get(orderId) as { status: string } | undefined;

  if (!order) throw new FastFoodError('E404-ORDER', 'Confirmed order not found', 404);

  const ticketId = randomUUID();
  const paymentId = randomUUID();
  const acceptedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO kitchen_tickets (id, kiosk_id, order_id, ticket_number, status, accepted_at)
      VALUES (?, ?, ?, ?, 'preparing', ?)
    `).run(ticketId, kioskId, orderId, ticketNumber, acceptedAt);

    db.prepare(`
      UPDATE orders SET status = 'preparing', ticket_id = ?, payment_id = ? WHERE id = ?
    `).run(ticketId, paymentId, orderId);

    db.prepare(`
      INSERT INTO order_payments (id, order_id, ticket_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, orderId, ticketId, amount, acceptedAt);
  });
  tx();

  return { ticketId, paymentId, orderId, kioskId, acceptedAt };
}

// ---------------------------------------------------------------------------
// FS-004: 주문 상태 전환 (pending → confirmed → preparing → ready → cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionOrderStatus(
  db: Database.Database,
  orderId: string,
  newStatus: 'confirmed' | 'preparing' | 'ready' | 'cancelled',
): { orderId: string; previousStatus: string; newStatus: string } {
  const order = db
    .prepare('SELECT status FROM orders WHERE id = ?')
    .get(orderId) as { status: string } | undefined;

  if (!order) throw new FastFoodError('E404-ORDER', 'Order not found', 404);

  const previousStatus = order.status;
  const allowed =
    (order.status === 'pending' && newStatus === 'confirmed') ||
    (order.status === 'confirmed' && newStatus === 'preparing') ||
    (order.status === 'preparing' && newStatus === 'ready') ||
    (order.status === 'pending' && newStatus === 'cancelled') ||
    (order.status === 'confirmed' && newStatus === 'cancelled');

  if (!allowed) {
    throw new FastFoodError(
      'E409-ORDER',
      `Cannot transition order from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(newStatus, orderId);

  return { orderId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// FS-005: stale kitchen ticket 일괄 처리 (batch stale marking)
// (StatusTransition detector — batch 패턴, CS-005/PK-005/GY-005/VT-005 38번째 재사용)
// ---------------------------------------------------------------------------
export function markStaleOrderBatch(
  db: Database.Database,
  now: string,
): { staleCount: number; staleIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM kitchen_tickets
      WHERE status = 'preparing'
        AND accepted_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const staleIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE kitchen_tickets
      SET status = 'stale'
      WHERE id = ?
    `).run(item.id);
    staleIds.push(item.id);
  }

  return { staleCount: staleIds.length, staleIds };
}

// ---------------------------------------------------------------------------
// FS-006: 가맹점 일일 매출 정산 atomic — 매출 + 정산비율 + 정산 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function settleDailyRevenue(
  db: Database.Database,
  franchiseeId: string,
  kitchenTicketId: string,
  revenue: number,
  billingRate: number,
): { billingId: string; payoutId: string; franchiseeId: string; billingAmount: number; settledAt: string } {
  const ticket = db
    .prepare("SELECT status FROM kitchen_tickets WHERE id = ? AND status = 'ready'")
    .get(kitchenTicketId) as { status: string } | undefined;

  if (!ticket) throw new FastFoodError('E404-READY-KITCHEN-TICKET', 'Ready kitchen ticket not found', 404);

  const billingId = randomUUID();
  const payoutId = randomUUID();
  const billingAmount = Math.round(revenue * billingRate * 100) / 100;
  const settledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO franchise_billing_records (id, franchisee_id, kitchen_ticket_id, revenue, billing_rate, billing_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(billingId, franchiseeId, kitchenTicketId, revenue, billingRate, billingAmount);

    db.prepare(`
      INSERT INTO franchise_payouts (id, billing_id, franchisee_id, amount, status, settled_at)
      VALUES (?, ?, ?, ?, 'settled', ?)
    `).run(payoutId, billingId, franchiseeId, billingAmount, settledAt);

    db.prepare(`
      UPDATE franchise_billing_records SET status = 'settled' WHERE id = ?
    `).run(billingId);
  });
  tx();

  return { billingId, payoutId, franchiseeId, billingAmount, settledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class FastFoodError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'FastFoodError';
  }
}
