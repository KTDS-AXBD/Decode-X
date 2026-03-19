import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// External API interface (출금 API 추상화)
// ---------------------------------------------------------------------------
export interface WithdrawalApi {
  /** 출금 요청 — 성공 시 external_tx_id 반환, 실패 시 throw */
  requestWithdrawal(accountId: string, amount: number): Promise<{ externalTxId: string }>;
}

/** 기본 Mock 구현 — 항상 성공 */
export const mockWithdrawalApi: WithdrawalApi = {
  async requestWithdrawal(_accountId: string, _amount: number) {
    return { externalTxId: `WD-${randomUUID().slice(0, 8)}` };
  },
};

// ---------------------------------------------------------------------------
// 충전 한도 상수
// ---------------------------------------------------------------------------
const CHARGE_MIN = 1_000;
const CHARGE_MAX = 500_000;
const CHARGE_UNIT = 1_000;
const DAILY_LIMIT = 1_000_000;
const MONTHLY_LIMIT = 3_000_000;

// ---------------------------------------------------------------------------
// FN-001: 상품권 충전
// ---------------------------------------------------------------------------
export interface ChargeInput {
  userId: string;
  voucherId: string;
  amount: number;
  paymentMethod: string; // CARD | BANK_TRANSFER
  withdrawalAccountId: string;
}

export interface ChargeResult {
  chargeId: string;
  voucherId: string;
  amount: number;
  balanceAfter: number;
  paymentMethod: string;
  chargedAt: string;
}

export function processCharge(
  db: Database.Database,
  input: ChargeInput,
  api: WithdrawalApi = mockWithdrawalApi
): Promise<ChargeResult> {
  return executeCharge(db, input, api);
}

async function executeCharge(
  db: Database.Database,
  input: ChargeInput,
  api: WithdrawalApi
): Promise<ChargeResult> {
  const { userId, voucherId, amount, paymentMethod, withdrawalAccountId } = input;

  // Step 1: voucher 유효성 검사
  const voucher = db
    .prepare('SELECT id, user_id, balance, status, expires_at FROM vouchers WHERE id = ?')
    .get(voucherId) as { id: string; user_id: string; balance: number; status: string; expires_at: string } | undefined;

  if (!voucher) {
    throw new ChargeError('E404', 'Voucher not found', 404);
  }

  if (voucher.status !== 'ACTIVE') {
    throw new ChargeError('E409', 'Voucher is not active', 409);
  }

  if (voucher.user_id !== userId) {
    throw new ChargeError('E403', 'Not your voucher', 403);
  }

  // BL-005: 충전 금액 범위 및 단위 검증
  if (amount < CHARGE_MIN || amount > CHARGE_MAX || amount % CHARGE_UNIT !== 0) {
    throw new ChargeError('E422-AMT', 'Invalid charge amount (1,000~500,000, unit 1,000)', 422);
  }

  // BL-005: 일/월 충전 한도 확인
  checkChargeLimits(db, userId, amount);

  // BL-001: 외부 출금 API 호출
  let externalTxId: string;
  try {
    const result = await api.requestWithdrawal(withdrawalAccountId, amount);
    externalTxId = result.externalTxId;
  } catch {
    // BL-003: 출금 실패 시 에러 반환 + 충전 프로세스 중단
    throw new ChargeError('E500', 'Withdrawal failed', 500);
  }

  // BL-002: 출금 성공 → 충전 완료 처리 (단일 트랜잭션)
  const chargeId = randomUUID();
  const withdrawalId = randomUUID();
  const chargedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    // Step 6: charge_transactions INSERT (먼저 — FK 참조 대상)
    db.prepare(`
      INSERT INTO charge_transactions (id, user_id, voucher_id, amount, charge_type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'MANUAL', 'CHARGED', ?, ?)
    `).run(chargeId, userId, voucherId, amount, chargedAt, chargedAt);

    // Step 4: withdrawal_transactions INSERT (charge_transaction_id FK 연결)
    db.prepare(`
      INSERT INTO withdrawal_transactions (id, charge_transaction_id, account_number, bank_code, amount, status, external_tx_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?)
    `).run(withdrawalId, chargeId, withdrawalAccountId, 'MOCK', amount, externalTxId, chargedAt, chargedAt);

    // Step 7: vouchers.balance += amount
    db.prepare(`UPDATE vouchers SET balance = balance + ?, updated_at = ? WHERE id = ?`)
      .run(amount, chargedAt, voucherId);
  });
  tx();

  const updated = db.prepare('SELECT balance FROM vouchers WHERE id = ?').get(voucherId) as { balance: number };

  return {
    chargeId,
    voucherId,
    amount,
    balanceAfter: updated.balance,
    paymentMethod,
    chargedAt,
  };
}

// BL-005/BL-006: 충전 한도 확인
function checkChargeLimits(db: Database.Database, userId: string, amount: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  // 일일 한도
  const dailyRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM charge_transactions
    WHERE user_id = ? AND status = 'CHARGED' AND date(created_at) = date(?)
  `).get(userId, today) as { total: number };

  if (dailyRow.total + amount > DAILY_LIMIT) {
    throw new ChargeError('E422-LMT', `Daily charge limit exceeded (max ${DAILY_LIMIT})`, 422);
  }

  // 월간 한도
  const monthlyRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM charge_transactions
    WHERE user_id = ? AND status = 'CHARGED' AND date(created_at) >= date(?)
  `).get(userId, monthStart) as { total: number };

  if (monthlyRow.total + amount > MONTHLY_LIMIT) {
    throw new ChargeError('E422-LMT', `Monthly charge limit exceeded (max ${MONTHLY_LIMIT})`, 422);
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class ChargeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ChargeError';
  }
}
