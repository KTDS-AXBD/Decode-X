import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  allocateBudget,
  deductForCharge,
  checkLowBalanceAlert,
  rolloverBudget,
  refundDeductedBudget,
  BudgetError,
} from '../domain/budget.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.prepare(
    `CREATE TABLE budget_ledger (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      allocated INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      rollover_yn TEXT NOT NULL DEFAULT 'N',
      status TEXT NOT NULL DEFAULT 'active',
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
  return db;
}

const COMPANY_LIMIT = 10_000_000;

describe('BB-001: allocateBudget (한도 검증 + 원장 INSERT)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('정상 배정 — amount > 0 AND amount ≤ maxLimit', () => {
    const result = allocateBudget(db, 'company-1', 5_000_000, COMPANY_LIMIT);
    expect(result.balance).toBe(5_000_000);

    const row = db.prepare('SELECT * FROM budget_ledger WHERE id = ?').get(result.ledgerId) as { allocated: number; status: string };
    expect(row.allocated).toBe(5_000_000);
    expect(row.status).toBe('active');
  });

  it('한도 초과 → HTTP 422', () => {
    expect(() => allocateBudget(db, 'company-1', 20_000_000, COMPANY_LIMIT)).toThrow(/exceeds company max limit/);
  });

  it('음수 금액 → HTTP 422', () => {
    expect(() => allocateBudget(db, 'company-1', -1, COMPANY_LIMIT)).toThrow(/positive/);
  });
});

describe('BB-002: deductForCharge (잔액 ≥ amount)', () => {
  let db: Database.Database;
  let ledgerId: string;

  beforeEach(() => {
    db = createTestDb();
    ledgerId = allocateBudget(db, 'company-1', 1_000_000, COMPANY_LIMIT).ledgerId;
  });

  it('정상 차감 — balance 감소', () => {
    const result = deductForCharge(db, ledgerId, 100_000);
    expect(result.balanceAfter).toBe(900_000);
  });

  it('잔액 부족 → BUDGET_INSUFFICIENT', () => {
    expect(() => deductForCharge(db, ledgerId, 2_000_000)).toThrow(/Budget insufficient/);
  });
});

describe('BB-003: checkLowBalanceAlert (잔액 ≤ allocated × 0.1)', () => {
  let db: Database.Database;
  let ledgerId: string;

  beforeEach(() => {
    db = createTestDb();
    ledgerId = allocateBudget(db, 'company-1', 1_000_000, COMPANY_LIMIT).ledgerId;
  });

  it('잔액 50% — alert 불필요', () => {
    deductForCharge(db, ledgerId, 500_000);
    const alert = checkLowBalanceAlert(db, ledgerId);
    expect(alert.alertNeeded).toBe(false);
  });

  it('잔액 5% — alert 필요', () => {
    deductForCharge(db, ledgerId, 950_000);
    const alert = checkLowBalanceAlert(db, ledgerId);
    expect(alert.alertNeeded).toBe(true);
    expect(alert.threshold).toBe(100_000);
  });

  it('잔액 정확 10% — alert 경계 PASS', () => {
    deductForCharge(db, ledgerId, 900_000);
    const alert = checkLowBalanceAlert(db, ledgerId);
    expect(alert.alertNeeded).toBe(true); // ≤ 10%
  });
});

describe('BB-004: rolloverBudget (rollover_yn Y/N)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('rollover_yn=Y → status=rolled_over', () => {
    const ledgerId = allocateBudget(db, 'company-1', 100_000, COMPANY_LIMIT).ledgerId;
    db.prepare(`UPDATE budget_ledger SET rollover_yn = 'Y' WHERE id = ?`).run(ledgerId);
    const result = rolloverBudget(db, ledgerId);
    expect(result.status).toBe('rolled_over');
  });

  it('rollover_yn=N → status=EXPIRED + balance=0', () => {
    const ledgerId = allocateBudget(db, 'company-1', 100_000, COMPANY_LIMIT).ledgerId;
    const result = rolloverBudget(db, ledgerId);
    expect(result.status).toBe('EXPIRED');

    const row = db.prepare('SELECT balance FROM budget_ledger WHERE id = ?').get(ledgerId) as { balance: number };
    expect(row.balance).toBe(0);
  });
});

describe('BB-005: refundDeductedBudget (atomic 복구)', () => {
  let db: Database.Database;
  let ledgerId: string;

  beforeEach(() => {
    db = createTestDb();
    ledgerId = allocateBudget(db, 'company-1', 1_000_000, COMPANY_LIMIT).ledgerId;
    deductForCharge(db, ledgerId, 200_000);
  });

  it('정상 복구 — balance 원복', () => {
    const result = refundDeductedBudget(db, ledgerId, 200_000);
    expect(result.balanceAfter).toBe(1_000_000);
  });

  it('Negative amount → HTTP 422', () => {
    expect(() => refundDeductedBudget(db, ledgerId, -1)).toThrow(/positive/);
  });

  it('존재하지 않는 ledger → 롤백 (atomic)', () => {
    expect(() => refundDeductedBudget(db, 'nonexistent', 100_000)).toThrow(/missing — rollback/);
  });
});
