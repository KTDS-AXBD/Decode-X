import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// External API interface (입금 API 추상화)
// ---------------------------------------------------------------------------
export interface DepositApi {
  /** 환불 입금 요청 */
  requestDeposit(accountId: string, amount: number): Promise<{ externalTxId: string }>;
}

export const mockDepositApi: DepositApi = {
  async requestDeposit(_accountId: string, _amount: number) {
    return { externalTxId: `DEP-${randomUUID().slice(0, 8)}` };
  },
};

// ---------------------------------------------------------------------------
// FN-005: 환불 신청 (API-030 기반)
//   - API 명세에서 환불은 결제 기반 (payment_id + amount + reason)
// ---------------------------------------------------------------------------
export interface RefundInput {
  userId: string;
  paymentId: string;
  amount: number;
  reason: string;
}

export interface RefundResult {
  refundId: string;
  paymentId: string;
  amount: number;
  status: string;
  reason: string;
  requestedAt: string;
}

export function processRefundRequest(
  db: Database.Database,
  input: RefundInput
): RefundResult {
  const { userId, paymentId, amount, reason } = input;

  // Step 1: payment 유효성 확인
  const payment = db
    .prepare('SELECT id, user_id, voucher_id, amount, status FROM payments WHERE id = ?')
    .get(paymentId) as {
      id: string; user_id: string; voucher_id: string; amount: number; status: string;
    } | undefined;

  if (!payment) {
    throw new RefundError('E404', 'Payment not found', 404);
  }

  // 환불은 CANCELED 상태의 결제에 대해 가능 (API-030 명세: E409-ST)
  if (payment.status !== 'CANCELED') {
    throw new RefundError('E409-ST', 'Payment must be CANCELED before refund', 409);
  }

  // BL-020: 환불 가능 여부 확인 (rfndPsbltyYn)
  // 권한 확인
  if (payment.user_id !== userId) {
    throw new RefundError('E403', 'Not authorized', 403);
  }

  // E422-AMT: 환불 금액이 결제 금액 초과
  if (amount > payment.amount || amount <= 0) {
    throw new RefundError('E422-AMT', 'Invalid refund amount', 422);
  }

  // E422-DUP: 이미 환불 신청된 결제 확인
  const existingRefund = db
    .prepare(`SELECT id FROM refund_transactions WHERE voucher_id = ? AND status NOT IN ('FAILED')`)
    .get(payment.voucher_id) as { id: string } | undefined;

  if (existingRefund) {
    throw new RefundError('E422-DUP', 'Refund already requested for this payment', 422);
  }

  // BL-028: 제외금액 산정 (현 PoC에서는 0)
  const exclusionAmount = 0;
  const depositAmount = amount - exclusionAmount;

  // Step 4: refund_transactions INSERT
  const refundId = randomUUID();
  const requestedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO refund_transactions (id, user_id, voucher_id, refund_type, requested_amount, exclusion_amount, deposit_amount, status, rfnd_psblty_yn, created_at, updated_at)
    VALUES (?, ?, ?, 'USED_BALANCE', ?, ?, ?, 'REQUESTED', 'Y', ?, ?)
  `).run(refundId, userId, payment.voucher_id, amount, exclusionAmount, depositAmount, requestedAt, requestedAt);

  return {
    refundId,
    paymentId,
    amount,
    status: 'REQUESTED',
    reason,
    requestedAt,
  };
}

// ---------------------------------------------------------------------------
// BL-021/BL-022: 환불 승인 → 입금 처리
// ---------------------------------------------------------------------------
export async function approveRefund(
  db: Database.Database,
  refundId: string,
  depositApi: DepositApi = mockDepositApi
): Promise<{ refundId: string; status: string; approvedAt: string }> {
  const refund = db
    .prepare('SELECT id, user_id, voucher_id, deposit_amount, status FROM refund_transactions WHERE id = ?')
    .get(refundId) as {
      id: string; user_id: string; voucher_id: string; deposit_amount: number; status: string;
    } | undefined;

  if (!refund) {
    throw new RefundError('E404', 'Refund not found', 404);
  }

  if (refund.status !== 'REQUESTED') {
    throw new RefundError('E409', 'Refund already processed', 409);
  }

  // BL-021: 환불 가능 조건 충족 → 입금 처리
  const refundAccount = db
    .prepare('SELECT id FROM refund_accounts WHERE user_id = ? LIMIT 1')
    .get(refund.user_id) as { id: string } | undefined;

  if (!refundAccount) {
    // BL-027: 계좌 오류 시 수기 처리
    db.prepare(`UPDATE refund_transactions SET status = 'MANUAL_REQUIRED', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), refundId);
    throw new RefundError('E422', 'No refund account registered', 422);
  }

  // BL-022: 입금 요청
  const depositId = randomUUID();
  const approvedAt = new Date().toISOString();

  try {
    const depositResult = await depositApi.requestDeposit(refundAccount.id, refund.deposit_amount);

    const tx = db.transaction(() => {
      // deposit_transactions INSERT
      db.prepare(`
        INSERT INTO deposit_transactions (id, refund_transaction_id, refund_account_id, amount, status, external_tx_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?)
      `).run(depositId, refundId, refundAccount.id, refund.deposit_amount, depositResult.externalTxId, approvedAt, approvedAt);

      // refund_transactions 완료
      db.prepare(`UPDATE refund_transactions SET status = 'COMPLETED', updated_at = ? WHERE id = ?`)
        .run(approvedAt, refundId);

      // vouchers 잔액 차감
      db.prepare(`UPDATE vouchers SET balance = balance - ?, updated_at = ? WHERE id = ?`)
        .run(refund.deposit_amount, approvedAt, refund.voucher_id);
    });
    tx();

    return { refundId, status: 'APPROVED', approvedAt };
  } catch (err) {
    // BL-040: 입금 실패 시 에러 반환
    // BL-023: 입금 프로세스 오류
    db.prepare(`UPDATE refund_transactions SET status = 'FAILED', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), refundId);

    db.prepare(`
      INSERT INTO deposit_transactions (id, refund_transaction_id, refund_account_id, amount, status, error_message, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'FAILED', ?, ?, ?)
    `).run(depositId, refundId, refundAccount.id, refund.deposit_amount, String(err), approvedAt, approvedAt);

    throw new RefundError('E500', 'Deposit failed', 500);
  }
}

// ---------------------------------------------------------------------------
// 환불 거절
// ---------------------------------------------------------------------------
export function rejectRefund(
  db: Database.Database,
  refundId: string,
  reason: string
): { refundId: string; status: string; rejectReason: string; rejectedAt: string } {
  const refund = db
    .prepare('SELECT id, status FROM refund_transactions WHERE id = ?')
    .get(refundId) as { id: string; status: string } | undefined;

  if (!refund) {
    throw new RefundError('E404', 'Refund not found', 404);
  }

  if (refund.status !== 'REQUESTED') {
    throw new RefundError('E409', 'Refund already processed', 409);
  }

  const rejectedAt = new Date().toISOString();
  db.prepare(`UPDATE refund_transactions SET status = 'FAILED', error_message = ?, updated_at = ? WHERE id = ?`)
    .run(reason, rejectedAt, refundId);

  return { refundId, status: 'REJECTED', rejectReason: reason, rejectedAt };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class RefundError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'RefundError';
  }
}
