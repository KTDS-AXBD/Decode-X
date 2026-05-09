import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-BK (BK-001~BK-006): Banking 합성 도메인 — 27번째 도메인 (은행 산업, 16번째 신규 산업)
//   - banking spec-container rules.md 기반 PoC source
//   - 합성 schema: accounts, transactions, kyc_records, aml_checks
//   - 은행 lifecycle 패턴 — 출금한도/송금수수료/계좌이체atomic/계좌상태전환/휴면계좌배치/KYC atomic
//   - withRuleId 재사용 27번째 도메인 (신규 detector 0개, 25 Sprint 연속 정점)
//   - BankingError code-in-message 패턴 (S275 표준)
//   - 16 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK)
// ---------------------------------------------------------------------------

export interface AccountRow {
  id: string;
  customer_id: string;
  account_number: string;
  account_type: string;  // checking | savings | business
  status: string;        // pending_kyc | active | frozen | dormant | closed
  balance: number;
  currency: string;
  opened_at: string;
  frozen_at: string | null;
  dormant_at: string | null;
  closed_at: string | null;
}

export interface TransactionRow {
  id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  transaction_type: string;  // withdrawal | deposit | transfer
  status: string;             // pending | completed | failed | reversed
  fee: number;
  created_at: string;
  completed_at: string | null;
}

export interface KycRecordRow {
  id: string;
  account_id: string;
  verification_status: string;  // pending | verified | failed
  verified_at: string | null;
  document_type: string;
}

export interface AmlCheckRow {
  id: string;
  account_id: string;
  check_status: string;  // pending | cleared | flagged
  checked_at: string | null;
  risk_score: number;
}

const MAX_WITHDRAWAL_AMOUNT = 10_000_000;   // BK-001: 1회 출금 한도 (1천만원)

// ---------------------------------------------------------------------------
// BK-001: 일일 출금 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function processWithdrawal(
  db: Database.Database,
  accountId: string,
  amount: number,
): { transactionId: string; accountId: string; amount: number; completedAt: string } {
  const account = db
    .prepare('SELECT id, status, balance FROM accounts WHERE id = ?')
    .get(accountId) as { id: string; status: string; balance: number } | undefined;

  if (!account) throw new BankingError('E404-ACCOUNT', 'Account not found', 404);
  if (account.status !== 'active') {
    throw new BankingError(
      'E409-ACCOUNT',
      `Cannot withdraw from account with status=${account.status}`,
      409,
    );
  }

  if (amount >= MAX_WITHDRAWAL_AMOUNT) {
    throw new BankingError(
      'E422-WITHDRAWAL-LIMIT',
      `Withdrawal amount exceeds limit (${amount} >= ${MAX_WITHDRAWAL_AMOUNT})`,
      422,
    );
  }

  if (account.balance < amount) {
    throw new BankingError(
      'E422-INSUFFICIENT-FUNDS',
      `Insufficient funds (balance=${account.balance}, requested=${amount})`,
      422,
    );
  }

  const transactionId = randomUUID();
  const completedAt = new Date().toISOString();

  db.prepare(`UPDATE accounts SET balance = balance - ? WHERE id = ?`).run(amount, accountId);
  db.prepare(`
    INSERT INTO transactions (id, from_account_id, to_account_id, amount, transaction_type, status, fee, created_at, completed_at)
    VALUES (?, ?, NULL, ?, 'withdrawal', 'completed', 0, ?, ?)
  `).run(transactionId, accountId, amount, completedAt, completedAt);

  return { transactionId, accountId, amount, completedAt };
}

// ---------------------------------------------------------------------------
// BK-002: 송금 수수료 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, transferFeeLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function computeTransferFee(
  db: Database.Database,
  fromAccountId: string,
  transferAmount: number,
): { feeAmount: number; transferFeeLimit: number; withinLimit: boolean } {
  const account = db
    .prepare('SELECT id, account_type FROM accounts WHERE id = ?')
    .get(fromAccountId) as { id: string; account_type: string } | undefined;

  if (!account) throw new BankingError('E404-ACCOUNT', 'Account not found', 404);

  // 계좌 유형별 수수료 한도
  const feeRateByType: Record<string, number> = {
    checking: 0.001,
    savings: 0.0005,
    business: 0.0015,
  };
  const feeRate = feeRateByType[account.account_type] ?? 0.001;
  const feeAmount = Math.floor(transferAmount * feeRate);

  // F445 Path B: var-vs-var, left=`transferFeeLimit` (`limit` keyword 매칭)
  const transferFeeLimit = 50_000;  // 최대 수수료 한도 5만원
  if (feeAmount > transferFeeLimit) {
    throw new BankingError(
      'E422-TRANSFER-FEE',
      `Transfer fee exceeds limit (${feeAmount} > ${transferFeeLimit})`,
      422,
    );
  }

  return { feeAmount, transferFeeLimit, withinLimit: true };
}

// ---------------------------------------------------------------------------
// BK-003: 계좌 이체 atomic — 출금 + 입금 + 거래 기록 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processAccountTransfer(
  db: Database.Database,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  fee: number,
): { transactionId: string; fromAccountId: string; toAccountId: string; completedAt: string } {
  const fromAccount = db
    .prepare('SELECT id, status, balance FROM accounts WHERE id = ?')
    .get(fromAccountId) as { id: string; status: string; balance: number } | undefined;

  if (!fromAccount) throw new BankingError('E404-ACCOUNT', 'Source account not found', 404);
  if (fromAccount.status !== 'active') {
    throw new BankingError(
      'E409-ACCOUNT',
      `Cannot transfer from account with status=${fromAccount.status}`,
      409,
    );
  }

  const toAccount = db
    .prepare('SELECT id, status FROM accounts WHERE id = ?')
    .get(toAccountId) as { id: string; status: string } | undefined;

  if (!toAccount) throw new BankingError('E404-ACCOUNT', 'Destination account not found', 404);
  if (toAccount.status !== 'active') {
    throw new BankingError(
      'E409-ACCOUNT',
      `Cannot transfer to account with status=${toAccount.status}`,
      409,
    );
  }

  if (fromAccount.balance < amount + fee) {
    throw new BankingError(
      'E422-INSUFFICIENT-FUNDS',
      `Insufficient funds for transfer (balance=${fromAccount.balance}, required=${amount + fee})`,
      422,
    );
  }

  const transactionId = randomUUID();
  const completedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE accounts SET balance = balance - ? WHERE id = ?`)
      .run(amount + fee, fromAccountId);
    db.prepare(`UPDATE accounts SET balance = balance + ? WHERE id = ?`)
      .run(amount, toAccountId);
    db.prepare(`
      INSERT INTO transactions (id, from_account_id, to_account_id, amount, transaction_type, status, fee, created_at, completed_at)
      VALUES (?, ?, ?, ?, 'transfer', 'completed', ?, ?, ?)
    `).run(transactionId, fromAccountId, toAccountId, amount, fee, completedAt, completedAt);
  });
  tx();

  return { transactionId, fromAccountId, toAccountId, completedAt };
}

// ---------------------------------------------------------------------------
// BK-004: 계좌 상태 전환 (pending_kyc → active → frozen → dormant)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionAccountStatus(
  db: Database.Database,
  accountId: string,
  newStatus: 'active' | 'frozen' | 'dormant' | 'closed',
): { accountId: string; previousStatus: string; newStatus: string } {
  const account = db
    .prepare('SELECT status FROM accounts WHERE id = ?')
    .get(accountId) as { status: string } | undefined;

  if (!account) throw new BankingError('E404-ACCOUNT', 'Account not found', 404);

  const previousStatus = account.status;
  const allowed =
    (previousStatus === 'pending_kyc' && newStatus === 'active') ||
    (previousStatus === 'active' && newStatus === 'frozen') ||
    (previousStatus === 'active' && newStatus === 'dormant') ||
    (previousStatus === 'frozen' && newStatus === 'active') ||
    (previousStatus === 'frozen' && newStatus === 'closed') ||
    (previousStatus === 'dormant' && newStatus === 'active') ||
    (previousStatus === 'dormant' && newStatus === 'closed');

  if (!allowed) {
    throw new BankingError(
      'E409-ACCOUNT',
      `Cannot transition account from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE accounts SET status = ? WHERE id = ?`).run(newStatus, accountId);

  if (newStatus === 'frozen') {
    db.prepare(`UPDATE accounts SET frozen_at = ? WHERE id = ?`).run(now, accountId);
  } else if (newStatus === 'dormant') {
    db.prepare(`UPDATE accounts SET dormant_at = ? WHERE id = ?`).run(now, accountId);
  } else if (newStatus === 'closed') {
    db.prepare(`UPDATE accounts SET closed_at = ? WHERE id = ?`).run(now, accountId);
  }

  return { accountId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// BK-005: 휴면 계좌 일괄 동결 처리 (active → dormant 배치)
// (StatusTransition detector — batch 패턴, CC-005 batch 16번째 재사용)
// ---------------------------------------------------------------------------
export function markDormantAccounts(
  db: Database.Database,
  inactiveCutoffDate: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM accounts
      WHERE status = 'active'
        AND (SELECT MAX(completed_at) FROM transactions WHERE from_account_id = accounts.id OR to_account_id = accounts.id) < ?
    `)
    .all(inactiveCutoffDate) as Array<{ id: string }>;

  const markedIds: string[] = [];
  const dormantAt = new Date().toISOString();

  for (const account of candidates) {
    db.prepare(`
      UPDATE accounts
      SET status = 'dormant', dormant_at = ?
      WHERE id = ?
    `).run(dormantAt, account.id);
    markedIds.push(account.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// BK-006: KYC 본인확인 atomic — 본인확인 + AML 체크 + 계좌 활성화
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function verifyKyc(
  db: Database.Database,
  accountId: string,
  documentType: string,
): { kycId: string; amlId: string; accountId: string; activatedAt: string } {
  const account = db
    .prepare('SELECT id, status FROM accounts WHERE id = ?')
    .get(accountId) as { id: string; status: string } | undefined;

  if (!account) throw new BankingError('E404-ACCOUNT', 'Account not found', 404);
  if (account.status !== 'pending_kyc') {
    throw new BankingError(
      'E409-ACCOUNT',
      `KYC only valid for pending_kyc accounts (status=${account.status})`,
      409,
    );
  }

  const kycId = randomUUID();
  const amlId = randomUUID();
  const activatedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO kyc_records (id, account_id, verification_status, verified_at, document_type)
      VALUES (?, ?, 'verified', ?, ?)
    `).run(kycId, accountId, activatedAt, documentType);
    db.prepare(`
      INSERT INTO aml_checks (id, account_id, check_status, checked_at, risk_score)
      VALUES (?, ?, 'cleared', ?, 0)
    `).run(amlId, accountId, activatedAt);
    db.prepare(`UPDATE accounts SET status = 'active' WHERE id = ?`)
      .run(accountId);
  });
  tx();

  return { kycId, amlId, accountId, activatedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class BankingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BankingError';
  }
}
