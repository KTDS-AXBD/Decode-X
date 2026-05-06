import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PURCHASE (BP-001~005): 온누리상품권 최초 구매 (발행)
//   - lpon-purchase spec-container rules.md 기반 PoC source (Sprint 266 F433)
//   - 합성 schema: purchase_transactions, vouchers
// ---------------------------------------------------------------------------

const PER_PURCHASE_LIMIT = 500_000; // BP-001: 1회 구매 한도
const MONTHLY_PURCHASE_LIMIT = 3_000_000; // BP-003: 월 구매 한도
const REFUND_PERIOD_DAYS = 7; // BP-005: 7일 이내 환불

export interface PurchaseTransactionRow {
  id: string;
  user_id: string;
  request_id: string;
  amount: number;
  status: string;
  voucher_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// BP-001: 구매 요청 (한도 검증)
// ---------------------------------------------------------------------------
export function requestPurchase(
  db: Database.Database,
  userId: string,
  amount: number,
  requestId: string
): { purchaseId: string; status: string; createdAt: string } {
  // BP-001 Threshold check: amount > 0 AND amount ≤ PER_PURCHASE_LIMIT
  if (amount <= 0) {
    throw new PurchaseError('E422-AMT', 'Purchase amount must be positive', 422);
  }
  if (amount > PER_PURCHASE_LIMIT) {
    throw new PurchaseError(
      'E422-LMT',
      `Purchase exceeds per-purchase limit (max ${PER_PURCHASE_LIMIT})`,
      422
    );
  }

  const purchaseId = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO purchase_transactions (id, user_id, request_id, amount, status, voucher_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)
  `).run(purchaseId, userId, requestId, amount, createdAt, createdAt);

  return { purchaseId, status: 'pending', createdAt };
}

// ---------------------------------------------------------------------------
// BP-002: 결제 완료 → 상품권 발행 (atomic)
// ---------------------------------------------------------------------------
export function completePurchase(
  db: Database.Database,
  purchaseId: string,
  validityMonths: number = 12
): { purchaseId: string; voucherId: string; status: string; completedAt: string } {
  const purchase = db
    .prepare('SELECT id, user_id, amount, status FROM purchase_transactions WHERE id = ?')
    .get(purchaseId) as { id: string; user_id: string; amount: number; status: string } | undefined;

  if (!purchase) {
    throw new PurchaseError('E404', 'Purchase not found', 404);
  }

  // BP-002 Status check: pending → completed
  if (purchase.status !== 'pending') {
    throw new PurchaseError('E422-ST', 'Purchase not in pending state', 422);
  }

  const voucherId = randomUUID();
  const completedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + validityMonths * 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // BP-002 atomic: vouchers INSERT + status pending→completed
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO vouchers (id, user_id, face_amount, balance, purchased_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(voucherId, purchase.user_id, purchase.amount, purchase.amount, completedAt, expiresAt);

    db.prepare(`
      UPDATE purchase_transactions SET status = 'completed', voucher_id = ?, updated_at = ? WHERE id = ?
    `).run(voucherId, completedAt, purchaseId);
  });
  tx();

  return { purchaseId, voucherId, status: 'completed', completedAt };
}

// ---------------------------------------------------------------------------
// BP-003: 월별 구매 한도 검증
// ---------------------------------------------------------------------------
export function checkMonthlyLimit(
  db: Database.Database,
  userId: string,
  amount: number
): { allowed: boolean; monthlyTotal: number; limit: number } {
  const monthStart = new Date().toISOString().slice(0, 7) + '-01T00:00:00.000Z';

  const row = db
    .prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM purchase_transactions
      WHERE user_id = ? AND status = 'completed' AND created_at >= ?
    `)
    .get(userId, monthStart) as { total: number };

  // BP-003 Threshold check: monthlyTotal + amount ≤ MONTHLY_PURCHASE_LIMIT
  const allowed = row.total + amount <= MONTHLY_PURCHASE_LIMIT;

  if (!allowed) {
    throw new PurchaseError(
      'E422-MONTHLY-LIMIT-EXCEEDED',
      `Monthly purchase limit exceeded (max ${MONTHLY_PURCHASE_LIMIT})`,
      422
    );
  }

  return { allowed, monthlyTotal: row.total, limit: MONTHLY_PURCHASE_LIMIT };
}

// ---------------------------------------------------------------------------
// BP-004: 멱등성 체크 (이중 발행 방지)
// ---------------------------------------------------------------------------
export function handleIdempotentPurchase(
  db: Database.Database,
  requestId: string
): { duplicate: boolean; purchaseId?: string; voucherId?: string; status?: string } {
  const existing = db
    .prepare('SELECT id, status, voucher_id FROM purchase_transactions WHERE request_id = ?')
    .get(requestId) as { id: string; status: string; voucher_id: string | null } | undefined;

  if (!existing) {
    return { duplicate: false };
  }

  // BP-004 Status transition check: completed → return existing voucher / processing → HTTP 409
  if (existing.status === 'completed') {
    return {
      duplicate: true,
      purchaseId: existing.id,
      voucherId: existing.voucher_id ?? undefined,
      status: 'completed',
    };
  }

  if (existing.status === 'processing') {
    throw new PurchaseError('PURCHASE_IN_PROGRESS', 'Purchase already in progress', 409);
  }

  return { duplicate: true, purchaseId: existing.id, status: existing.status };
}

// ---------------------------------------------------------------------------
// BP-005: 7일 이내 미사용 환불
// ---------------------------------------------------------------------------
export function refundUnusedPurchase(
  db: Database.Database,
  voucherId: string
): { voucherId: string; refundedAmount: number; refundedAt: string } {
  const voucher = db
    .prepare('SELECT id, face_amount, balance, purchased_at FROM vouchers WHERE id = ?')
    .get(voucherId) as
    | { id: string; face_amount: number; balance: number; purchased_at: string }
    | undefined;

  if (!voucher) {
    throw new PurchaseError('E404', 'Voucher not found', 404);
  }

  // BP-005 Threshold: balance === face_amount AND daysSincePurchased ≤ 7
  if (voucher.balance !== voucher.face_amount) {
    throw new PurchaseError('E422-USED', 'Voucher partially used — refund denied', 422);
  }

  const daysSincePurchased =
    (Date.now() - new Date(voucher.purchased_at).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSincePurchased > REFUND_PERIOD_DAYS) {
    throw new PurchaseError(
      'PERIOD_EXPIRED',
      `Refund period expired (>${REFUND_PERIOD_DAYS} days since purchase)`,
      422
    );
  }

  const refundedAt = new Date().toISOString();
  db.prepare(`UPDATE vouchers SET status = 'REFUNDED', balance = 0, updated_at = ? WHERE id = ?`)
    .run(refundedAt, voucherId);

  return { voucherId, refundedAmount: voucher.face_amount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class PurchaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'PurchaseError';
  }
}
