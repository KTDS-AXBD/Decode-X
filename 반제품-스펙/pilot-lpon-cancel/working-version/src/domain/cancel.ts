import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// External API interface (카드사 취소 추상화)
// ---------------------------------------------------------------------------
export interface CardCancelApi {
  /** 카드사에 취소 전문 전송 (BL-016, BL-017) */
  requestCancel(paymentId: string, amount: number): Promise<{ externalCancelId: string }>;
}

export const mockCardCancelApi: CardCancelApi = {
  async requestCancel(_paymentId: string, _amount: number) {
    return { externalCancelId: `CXL-${randomUUID().slice(0, 8)}` };
  },
};

// ---------------------------------------------------------------------------
// 취소 가능 기간 (결제일로부터 7일)
// ---------------------------------------------------------------------------
const CANCEL_PERIOD_DAYS = 7;

// ---------------------------------------------------------------------------
// FN-004: 결제 취소
// ---------------------------------------------------------------------------
export interface CancelInput {
  userId: string;
  userRole: string;
  paymentId: string;
  reason: string;
}

export interface CancelResult {
  paymentId: string;
  status: string;
  cancelReason: string;
  requestedAt: string;
}

export async function processCancel(
  db: Database.Database,
  input: CancelInput,
  cardApi: CardCancelApi = mockCardCancelApi
): Promise<CancelResult> {
  const { userId, userRole, paymentId, reason } = input;

  // Step 1: payment 유효성 + 상태 확인
  const payment = db
    .prepare('SELECT id, user_id, merchant_id, voucher_id, amount, method, status, paid_at FROM payments WHERE id = ?')
    .get(paymentId) as {
      id: string; user_id: string; merchant_id: string; voucher_id: string;
      amount: number; method: string; status: string; paid_at: string;
    } | undefined;

  if (!payment) {
    throw new CancelError('E404', 'Payment not found', 404);
  }

  // BL-014: 결제가 PAID 상태일 때만 취소 가능
  if (payment.status !== 'PAID') {
    throw new CancelError('E409-ST', 'Payment is already canceled or not in PAID status', 409);
  }

  // 권한 확인: 본인 또는 ADMIN
  if (userRole !== 'ADMIN' && payment.user_id !== userId) {
    throw new CancelError('E403', 'Not authorized to cancel this payment', 403);
  }

  // 취소 가능 기간 확인 (결제일로부터 7일)
  const paidDate = new Date(payment.paid_at);
  const now = new Date();
  const diffDays = (now.getTime() - paidDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > CANCEL_PERIOD_DAYS) {
    throw new CancelError('E422-PD', 'Cancel period expired (7 days from payment)', 422);
  }

  // BL-016: 카드 결제인 경우 카드사에 취소 요청 전달
  let externalCancelId: string | null = null;
  if (payment.method === 'CARD') {
    try {
      // BL-017: BC카드 MPM으로 결제 취소전문 전송
      const result = await cardApi.requestCancel(paymentId, payment.amount);
      externalCancelId = result.externalCancelId;
    } catch {
      throw new CancelError('E502', 'Card cancel failed', 502);
    }
  }

  // Step 5-7: cancel_transactions INSERT + payments 상태 변경 + 잔액 복구
  const cancelId = randomUUID();
  const requestedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    // cancel_transactions INSERT
    db.prepare(`
      INSERT INTO cancel_transactions (id, payment_id, cancel_type, cancel_amount, requester_type, status, external_cancel_id, reason, created_at, updated_at)
      VALUES (?, ?, 'FULL', ?, ?, 'COMPLETED', ?, ?, ?, ?)
    `).run(
      cancelId, paymentId, payment.amount,
      userRole === 'ADMIN' ? 'ADMIN' : 'USER',
      externalCancelId, reason, requestedAt, requestedAt
    );

    // BL-016: payments.status → CANCELED
    db.prepare(`UPDATE payments SET status = 'CANCELED', canceled_at = ?, updated_at = ? WHERE id = ?`)
      .run(requestedAt, requestedAt, paymentId);

    // vouchers.balance += cancel_amount (잔액 복구)
    db.prepare(`UPDATE vouchers SET balance = balance + ?, updated_at = ? WHERE id = ?`)
      .run(payment.amount, requestedAt, payment.voucher_id);
  });
  tx();

  return {
    paymentId,
    status: 'CANCEL_REQUESTED',
    cancelReason: reason,
    requestedAt,
  };
}

// ---------------------------------------------------------------------------
// BL-042: 결제 망 취소 처리
// ---------------------------------------------------------------------------
export function processNetworkCancel(
  db: Database.Database,
  paymentId: string,
  idempotencyKey: string
): { cancelId: string; status: string } {
  // 멱등성 키로 중복 처리 방지
  const existing = db
    .prepare('SELECT id FROM payments WHERE idempotency_key = ? AND status = ?')
    .get(idempotencyKey, 'NETWORK_CANCELED') as { id: string } | undefined;

  if (existing) {
    return { cancelId: existing.id, status: 'ALREADY_PROCESSED' };
  }

  const payment = db
    .prepare('SELECT id, voucher_id, amount, status FROM payments WHERE id = ?')
    .get(paymentId) as { id: string; voucher_id: string; amount: number; status: string } | undefined;

  if (!payment || payment.status !== 'PAID') {
    throw new CancelError('E409', 'Payment not cancelable via network cancel', 409);
  }

  const cancelId = randomUUID();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO cancel_transactions (id, payment_id, cancel_type, cancel_amount, requester_type, status, reason, created_at, updated_at)
      VALUES (?, ?, 'NETWORK', ?, 'SYSTEM', 'COMPLETED', 'Network cancel detected', ?, ?)
    `).run(cancelId, paymentId, payment.amount, now, now);

    db.prepare(`UPDATE payments SET status = 'NETWORK_CANCELED', canceled_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, paymentId);

    db.prepare(`UPDATE vouchers SET balance = balance + ?, updated_at = ? WHERE id = ?`)
      .run(payment.amount, now, payment.voucher_id);
  });
  tx();

  return { cancelId, status: 'NETWORK_CANCELED' };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class CancelError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'CancelError';
  }
}
