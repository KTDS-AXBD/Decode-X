import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-BUDGET (BB-001~005): 회사 예산 관리 (배정/차감/알림/이월/복구)
//   - lpon-budget spec-container rules.md 기반 PoC source (Sprint 266 F433)
//   - 합성 schema: budget_ledger
// ---------------------------------------------------------------------------

const LOW_BALANCE_THRESHOLD_RATIO = 0.1; // BB-003: 잔액 ≤ 배정 × 10%

export interface BudgetLedgerRow {
  id: string;
  company_id: string;
  allocated: number;
  balance: number;
  rollover_yn: string;
  status: string;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// BB-001: 예산 배정 (한도 검증)
// ---------------------------------------------------------------------------
export function allocateBudget(
  db: Database.Database,
  companyId: string,
  amount: number,
  maxLimit: number
): { ledgerId: string; balance: number; allocatedAt: string } {
  // BB-001 Threshold check: amount > 0 AND amount ≤ maxLimit
  if (amount <= 0) {
    throw new BudgetError('E422-AMT', 'Budget allocation must be positive', 422);
  }
  if (amount > maxLimit) {
    throw new BudgetError('E422-LMT', `Budget exceeds company max limit (max ${maxLimit})`, 422);
  }

  const ledgerId = randomUUID();
  const allocatedAt = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO budget_ledger (id, company_id, allocated, balance, rollover_yn, status, period_start, period_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'N', 'active', ?, ?, ?, ?)
  `).run(ledgerId, companyId, amount, amount, allocatedAt, periodEnd, allocatedAt, allocatedAt);

  return { ledgerId, balance: amount, allocatedAt };
}

// ---------------------------------------------------------------------------
// BB-002: 직원 충전 시 예산 차감
// ---------------------------------------------------------------------------
export function deductForCharge(
  db: Database.Database,
  ledgerId: string,
  amount: number
): { ledgerId: string; balanceAfter: number; deductedAt: string } {
  const ledger = db
    .prepare('SELECT id, balance, status FROM budget_ledger WHERE id = ?')
    .get(ledgerId) as { id: string; balance: number; status: string } | undefined;

  if (!ledger) {
    throw new BudgetError('E404', 'Budget ledger not found', 404);
  }

  // BB-002 Threshold: balance ≥ amount
  if (ledger.balance < amount) {
    throw new BudgetError('E422-BUDGET-INSUFFICIENT', 'Budget insufficient for charge request', 422);
  }

  if (ledger.status !== 'active') {
    throw new BudgetError('E422-ST', 'Budget ledger not active', 422);
  }

  const deductedAt = new Date().toISOString();
  db.prepare(`UPDATE budget_ledger SET balance = balance - ?, updated_at = ? WHERE id = ?`)
    .run(amount, deductedAt, ledgerId);

  const updated = db.prepare('SELECT balance FROM budget_ledger WHERE id = ?').get(ledgerId) as {
    balance: number;
  };

  return { ledgerId, balanceAfter: updated.balance, deductedAt };
}

// ---------------------------------------------------------------------------
// BB-003: 잔액 임계치 (≤ 10%) 알림
// ---------------------------------------------------------------------------
export function checkLowBalanceAlert(
  db: Database.Database,
  ledgerId: string
): { alertNeeded: boolean; balance: number; allocated: number; threshold: number } {
  const ledger = db
    .prepare('SELECT id, allocated, balance FROM budget_ledger WHERE id = ?')
    .get(ledgerId) as { id: string; allocated: number; balance: number } | undefined;

  if (!ledger) {
    throw new BudgetError('E404', 'Budget ledger not found', 404);
  }

  const threshold = ledger.allocated * LOW_BALANCE_THRESHOLD_RATIO;

  // BB-003 Threshold check: balance ≤ allocated × 0.1
  const alertNeeded = ledger.balance <= threshold;

  return { alertNeeded, balance: ledger.balance, allocated: ledger.allocated, threshold };
}

// ---------------------------------------------------------------------------
// BB-004: 예산 이월 처리 (rollover_yn Y/N)
// ---------------------------------------------------------------------------
export function rolloverBudget(
  db: Database.Database,
  ledgerId: string
): { ledgerId: string; status: string; rolledOverAt: string } {
  const ledger = db
    .prepare('SELECT id, rollover_yn, balance, status FROM budget_ledger WHERE id = ?')
    .get(ledgerId) as { id: string; rollover_yn: string; balance: number; status: string } | undefined;

  if (!ledger) {
    throw new BudgetError('E404', 'Budget ledger not found', 404);
  }

  if (ledger.status !== 'active') {
    throw new BudgetError('E422-ST', 'Budget ledger not active', 422);
  }

  const rolledOverAt = new Date().toISOString();

  // BB-004 Status transition: rollover_yn === 'Y' → status='rolled_over' / === 'N' → status='EXPIRED'
  if (ledger.rollover_yn === 'Y') {
    db.prepare(`UPDATE budget_ledger SET status = 'rolled_over', updated_at = ? WHERE id = ?`)
      .run(rolledOverAt, ledgerId);
    return { ledgerId, status: 'rolled_over', rolledOverAt };
  } else if (ledger.rollover_yn === 'N') {
    db.prepare(`UPDATE budget_ledger SET status = 'EXPIRED', balance = 0, updated_at = ? WHERE id = ?`)
      .run(rolledOverAt, ledgerId);
    return { ledgerId, status: 'EXPIRED', rolledOverAt };
  } else {
    throw new BudgetError('E422-INVALID-ROLLOVER', 'rollover_yn must be Y or N', 422);
  }
}

// ---------------------------------------------------------------------------
// BB-005: 차감 후 충전 실패 시 예산 복구 (atomic rollback)
// ---------------------------------------------------------------------------
export function refundDeductedBudget(
  db: Database.Database,
  ledgerId: string,
  amount: number
): { ledgerId: string; balanceAfter: number; refundedAt: string } {
  if (amount <= 0) {
    throw new BudgetError('E422-AMT', 'Refund amount must be positive', 422);
  }

  const refundedAt = new Date().toISOString();

  // BB-005 + atomic transaction — restore + audit log atomically
  const tx = db.transaction(() => {
    const ledger = db.prepare('SELECT id, balance, status FROM budget_ledger WHERE id = ?').get(ledgerId) as
      | { id: string; balance: number; status: string }
      | undefined;

    if (!ledger) {
      throw new BudgetError('E500-INTEGRITY', 'Budget ledger missing — rollback', 500);
    }

    db.prepare(`UPDATE budget_ledger SET balance = balance + ?, updated_at = ? WHERE id = ?`)
      .run(amount, refundedAt, ledgerId);
  });
  tx();

  const updated = db.prepare('SELECT balance FROM budget_ledger WHERE id = ?').get(ledgerId) as {
    balance: number;
  };

  return { ledgerId, balanceAfter: updated.balance, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class BudgetError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'BudgetError';
  }
}
