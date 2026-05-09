import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-RT (RT-001~RT-006): Retail 합성 도메인 — 23번째 도메인 (소매 산업, 12번째 신규 산업)
//   - retail spec-container rules.md 기반 PoC source
//   - 합성 schema: sku_catalog, promotions, orders, inventory_sync_log, return_log
//   - 소매 lifecycle 패턴 — SKU가격티어검증/프로모션자격/주문체크아웃/상태전환/재고동기화배치/반품환불
//   - withRuleId 재사용 23번째 도메인 (신규 detector 0개, 21 Sprint 연속 정점)
//   - RetailError code-in-message 패턴 (S275 표준)
//   - 12 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT)
// ---------------------------------------------------------------------------

export interface SkuRow {
  id: string;
  product_id: string;
  price_tier: number;
  price: number;
  stock_status: string;  // available | out_of_stock | synced
}

export interface PromotionRow {
  id: string;
  product_id: string;
  min_order_amount: number;
  status: string;  // active | expired
}

export interface OrderRow {
  id: string;
  customer_id: string;
  cart_items: string;   // JSON array
  total_amount: number;
  status: string;       // placed | confirmed | shipped | delivered | completed
  created_at: string;
}

export interface InventorySyncLogRow {
  id: string;
  sku_id: string;
  synced_at: string;
}

export interface ReturnLogRow {
  id: string;
  order_id: string;
  reason: string;
  refund_amount: number;
  returned_at: string;
}

const MAX_SKU_PRICE_TIER = 10;
const MIN_ORDER_AMOUNT = 10_000;

// ---------------------------------------------------------------------------
// RT-001: SKU 목록 조회 — 가격 티어 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function listSku(
  db: Database.Database,
  productId: string,
  requestedTier: number,
): { skus: SkuRow[]; tier: number } {
  if (requestedTier <= 0) {
    throw new RetailError('E422-TIER-MIN', `Price tier must be positive (${requestedTier})`, 422);
  }
  if (requestedTier > MAX_SKU_PRICE_TIER) {
    throw new RetailError('E422-TIER-MAX', `Price tier exceeds limit (${requestedTier} > ${MAX_SKU_PRICE_TIER})`, 422);
  }

  const skus = db
    .prepare('SELECT * FROM sku_catalog WHERE product_id = ? AND price_tier <= ?')
    .all(productId, requestedTier) as SkuRow[];

  return { skus, tier: requestedTier };
}

// ---------------------------------------------------------------------------
// RT-002: 프로모션 자격 검증 — 최소 주문액 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, cartTotal < minOrderLimit 'limit' keyword 매칭)
// ---------------------------------------------------------------------------
export function applyPromotion(
  db: Database.Database,
  promotionId: string,
  cartTotal: number,
): { discountAmount: number; eligibleAmount: number } {
  const promotion = db
    .prepare('SELECT min_order_amount, status FROM promotions WHERE id = ?')
    .get(promotionId) as { min_order_amount: number; status: string } | undefined;

  if (!promotion) throw new RetailError('E404-PROMO', 'Promotion not found', 404);
  if (promotion.status !== 'active') {
    throw new RetailError('E409-PROMO', `Promotion is not active (status=${promotion.status})`, 409);
  }

  // F445 Path B: var-vs-var, left=`minOrderLimit` (`limit` keyword 매칭)
  const minOrderLimit = Math.max(promotion.min_order_amount, MIN_ORDER_AMOUNT);
  if (cartTotal < minOrderLimit) {
    throw new RetailError('E422-PROMO-MIN', `Cart total below minimum order limit (${cartTotal} < ${minOrderLimit} limit)`, 422);
  }

  const discountAmount = Math.floor(cartTotal * 0.1);
  const eligibleAmount = cartTotal - discountAmount;

  return { discountAmount, eligibleAmount };
}

// ---------------------------------------------------------------------------
// RT-003: 주문 체크아웃 atomic (장바구니 + 재고 예약 + 결제 + 감사)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCheckout(
  db: Database.Database,
  customerId: string,
  cartItems: string[],
  totalAmount: number,
): { orderId: string; status: string; placedAt: string } {
  if (cartItems.length === 0) {
    throw new RetailError('E422-CART-EMPTY', 'Cart must not be empty', 422);
  }
  if (totalAmount <= 0) {
    throw new RetailError('E422-AMOUNT-MIN', `Total amount must be positive (${totalAmount})`, 422);
  }

  const orderId = randomUUID();
  const placedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO orders (id, customer_id, cart_items, total_amount, status, created_at)
      VALUES (?, ?, ?, ?, 'placed', ?)
    `).run(orderId, customerId, JSON.stringify(cartItems), totalAmount, placedAt);
    db.prepare(`
      INSERT INTO inventory_sync_log (id, sku_id, synced_at)
      VALUES (?, ?, ?)
    `).run(randomUUID(), cartItems[0] ?? '', placedAt);
  });
  tx();

  return { orderId, status: 'placed', placedAt };
}

// ---------------------------------------------------------------------------
// RT-004: 주문 상태 전환 (placed → confirmed → shipped → delivered → completed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionOrderStatus(
  db: Database.Database,
  orderId: string,
  newStatus: 'confirmed' | 'shipped' | 'delivered' | 'completed',
): { orderId: string; previousStatus: string; newStatus: string } {
  const order = db
    .prepare('SELECT status FROM orders WHERE id = ?')
    .get(orderId) as { status: string } | undefined;

  if (!order) throw new RetailError('E404-ORD', 'Order not found', 404);

  const previousStatus = order.status;
  const allowed =
    (previousStatus === 'placed' && newStatus === 'confirmed') ||
    (previousStatus === 'confirmed' && newStatus === 'shipped') ||
    (previousStatus === 'shipped' && newStatus === 'delivered') ||
    (previousStatus === 'delivered' && newStatus === 'completed');

  if (!allowed) {
    throw new RetailError('E409-ORD', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  db.prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(newStatus, orderId);

  return { orderId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// RT-005: 재고 일괄 동기화 (SKU 재고 상태 배치 갱신)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF-005 동일 형태 12번째)
// ---------------------------------------------------------------------------
export function markInventorySync(
  db: Database.Database,
  productId: string,
): { syncedCount: number; syncedSkuIds: string[] } {
  const candidates = db
    .prepare(`SELECT id FROM sku_catalog WHERE status = 'available' AND product_id = ?`)
    .all(productId) as Array<{ id: string }>;

  const syncedSkuIds: string[] = [];
  const syncedAt = new Date().toISOString();

  for (const sku of candidates) {
    db.prepare(`UPDATE sku_catalog SET stock_status = 'synced' WHERE id = ?`)
      .run(sku.id);
    db.prepare(`
      INSERT INTO inventory_sync_log (id, sku_id, synced_at)
      VALUES (?, ?, ?)
    `).run(randomUUID(), sku.id, syncedAt);
    syncedSkuIds.push(sku.id);
  }

  return { syncedCount: syncedSkuIds.length, syncedSkuIds };
}

// ---------------------------------------------------------------------------
// RT-006: 반품 + 환불 atomic (반품 접수 + 재고 복구 + 환불 처리)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processReturnRefund(
  db: Database.Database,
  orderId: string,
  reason: string,
): { returnLogId: string; refundAmount: number; returnedAt: string } {
  const order = db
    .prepare('SELECT status, total_amount FROM orders WHERE id = ?')
    .get(orderId) as { status: string; total_amount: number } | undefined;

  if (!order) throw new RetailError('E404-ORD', 'Order not found', 404);
  if (order.status !== 'delivered' && order.status !== 'completed') {
    throw new RetailError('E409-ORD', `Cannot return order with status=${order.status} (requires delivered or completed)`, 409);
  }

  const returnLogId = randomUUID();
  const refundAmount = order.total_amount;
  const returnedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE orders SET status = 'returned' WHERE id = ?`)
      .run(orderId);
    db.prepare(`
      INSERT INTO return_log (id, order_id, reason, refund_amount, returned_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(returnLogId, orderId, reason, refundAmount, returnedAt);
  });
  tx();

  return { returnLogId, refundAmount, returnedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class RetailError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'RetailError';
  }
}
