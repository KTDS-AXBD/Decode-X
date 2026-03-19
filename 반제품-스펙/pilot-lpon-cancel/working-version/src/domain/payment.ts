import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// External API interface (카드사 승인 추상화)
// ---------------------------------------------------------------------------
export interface CardApi {
  /** 카드 승인 요청 */
  authorize(merchantId: string, amount: number): Promise<{ approvalId: string }>;
}

export const mockCardApi: CardApi = {
  async authorize(_merchantId: string, _amount: number) {
    return { approvalId: `AUTH-${randomUUID().slice(0, 8)}` };
  },
};

// ---------------------------------------------------------------------------
// SMS Notification interface
// ---------------------------------------------------------------------------
export interface NotificationService {
  sendPaymentSms(userId: string, amount: number, merchantName: string): Promise<void>;
}

export const mockNotificationService: NotificationService = {
  async sendPaymentSms() { /* no-op */ },
};

// ---------------------------------------------------------------------------
// FN-003: 결제
// ---------------------------------------------------------------------------
export interface PaymentInput {
  userId: string;
  voucherId: string;
  merchantId: string;
  amount: number;
  method: string; // QR | CARD | ONLINE
}

export interface PaymentResult {
  paymentId: string;
  voucherId: string;
  merchantId: string;
  amount: number;
  balanceAfter: number;
  status: string;
  paidAt: string;
}

export async function processPayment(
  db: Database.Database,
  input: PaymentInput,
  cardApi: CardApi = mockCardApi,
  notifService: NotificationService = mockNotificationService
): Promise<PaymentResult> {
  const { userId, voucherId, merchantId, amount, method } = input;

  // Step 1: voucher 유효성 검사
  const voucher = db
    .prepare('SELECT id, user_id, balance, status FROM vouchers WHERE id = ?')
    .get(voucherId) as { id: string; user_id: string; balance: number; status: string } | undefined;

  if (!voucher) {
    throw new PaymentError('E404-V', 'Voucher not found', 404);
  }

  if (voucher.status !== 'ACTIVE') {
    throw new PaymentError('E409-VS', 'Voucher is not active', 409);
  }

  if (voucher.user_id !== userId) {
    throw new PaymentError('E403', 'Not your voucher', 403);
  }

  // Step 2: merchant 유효성 검사
  const merchant = db
    .prepare('SELECT id, name, status FROM merchants WHERE id = ?')
    .get(merchantId) as { id: string; name: string; status: string } | undefined;

  if (!merchant) {
    throw new PaymentError('E404-M', 'Merchant not found', 404);
  }

  // BL-014: 가맹점 활성 상태 확인
  if (merchant.status !== 'ACTIVE') {
    throw new PaymentError('E409-MS', 'Merchant is not active', 409);
  }

  // 금액 검증
  if (amount <= 0) {
    throw new PaymentError('E422-AMT', 'Payment amount must be positive', 422);
  }

  // BL-014: 잔액 확인
  if (voucher.balance < amount) {
    throw new PaymentError('E422-BAL', 'Insufficient voucher balance', 422);
  }

  // Step 4: 결제수단별 분기 — CARD일 때 카드사 승인
  if (method === 'CARD') {
    try {
      await cardApi.authorize(merchantId, amount);
    } catch {
      throw new PaymentError('E502', 'Card authorization failed', 502);
    }
  }

  // Step 5-6: 결제 생성 + 잔액 차감
  const paymentId = randomUUID();
  const paidAt = new Date().toISOString();
  const idempotencyKey = randomUUID();

  const tx = db.transaction(() => {
    // payments INSERT
    db.prepare(`
      INSERT INTO payments (id, user_id, merchant_id, voucher_id, amount, method, status, paid_at, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PAID', ?, ?, ?, ?)
    `).run(paymentId, userId, merchantId, voucherId, amount, method, paidAt, idempotencyKey, paidAt, paidAt);

    // vouchers.balance -= amount
    db.prepare('UPDATE vouchers SET balance = balance - ?, updated_at = ? WHERE id = ?')
      .run(amount, paidAt, voucherId);
  });
  tx();

  const updated = db.prepare('SELECT balance FROM vouchers WHERE id = ?').get(voucherId) as { balance: number };

  // BL-015: 결제금액 >= 50,000원 시 SMS 발송
  if (amount >= 50_000) {
    try {
      await notifService.sendPaymentSms(userId, amount, merchant.name);
      // 알림 레코드 저장
      db.prepare(`
        INSERT INTO payment_notifications (id, payment_id, recipient_type, recipient_id, channel, status, created_at)
        VALUES (?, ?, 'USER', ?, 'SMS', 'SENT', ?)
      `).run(randomUUID(), paymentId, userId, paidAt);
    } catch {
      // 알림 실패는 결제 자체를 실패시키지 않음
      db.prepare(`
        INSERT INTO payment_notifications (id, payment_id, recipient_type, recipient_id, channel, status, created_at)
        VALUES (?, ?, 'USER', ?, 'SMS', 'FAILED', ?)
      `).run(randomUUID(), paymentId, userId, paidAt);
    }
  }

  return {
    paymentId,
    voucherId,
    merchantId,
    amount,
    balanceAfter: updated.balance,
    status: 'PAID',
    paidAt,
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class PaymentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}
