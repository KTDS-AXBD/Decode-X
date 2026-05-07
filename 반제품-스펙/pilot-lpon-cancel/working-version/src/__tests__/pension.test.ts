import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  validateEnrollmentEligibility,
  checkAnnualAccumulationLimit,
  requestEarlyWithdrawal,
  initiateReceiptPayout,
  applyTaxBenefit,
  terminatePlan,
  disbursePrincipalAndInterest,
  PensionError,
} from '../domain/pension.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.prepare(`
    CREATE TABLE pension_accounts (
      id TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      type TEXT NOT NULL DEFAULT 'DC',
      enrolled_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE TABLE pension_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      accumulated_this_year INTEGER NOT NULL DEFAULT 0,
      balance INTEGER NOT NULL DEFAULT 0,
      year INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE TABLE pension_withdrawals (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE TABLE pension_payouts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      principal INTEGER NOT NULL,
      interest INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      disbursed_at TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE TABLE pension_tax_benefits (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      annual_contribution INTEGER NOT NULL,
      eligible_amount INTEGER NOT NULL,
      excess_amount INTEGER NOT NULL DEFAULT 0,
      applied_at TEXT NOT NULL
    )
  `).run();
  return db;
}

function insertAccount(
  db: Database.Database,
  accountId: string,
  status = 'ACTIVE',
): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO pension_accounts (id, holder_id, status, type, enrolled_at, updated_at)
    VALUES (?, ?, ?, 'DC', ?, ?)
  `).run(accountId, 'holder-1', status, now, now);
}

function insertLedger(
  db: Database.Database,
  accountId: string,
  accumulated: number,
  balance: number,
): void {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const id = `ledger-${Date.now()}`;
  db.prepare(`
    INSERT INTO pension_ledger (id, account_id, accumulated_this_year, balance, year, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, accountId, accumulated, balance, year, now, now);
}

// ---------------------------------------------------------------------------
// P-001: validateEnrollmentEligibility
// ---------------------------------------------------------------------------
describe('P-001: validateEnrollmentEligibility (가입 자격 검증)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('정상 가입 — 근속 1년 이상, 연령 18세 이상, 재직 중', () => {
    const result = validateEnrollmentEligibility(db, 'holder-1', 2, 30, 'ACTIVE');
    expect(result.accountId).toBeTruthy();
    const row = db.prepare('SELECT * FROM pension_accounts WHERE id = ?').get(result.accountId);
    expect(row).toBeTruthy();
  });

  it('근속 부족(0.5년) → E422-INELIGIBLE', () => {
    expect(() => validateEnrollmentEligibility(db, 'holder-1', 0.5, 25, 'ACTIVE'))
      .toThrow('Service years below minimum');
  });

  it('미성년자(17세) → E422-INELIGIBLE', () => {
    expect(() => validateEnrollmentEligibility(db, 'holder-1', 1, 17, 'ACTIVE'))
      .toThrow('at least 18');
  });

  it('퇴직 상태 → E422-INELIGIBLE', () => {
    expect(() => validateEnrollmentEligibility(db, 'holder-1', 2, 30, 'RESIGNED'))
      .toThrow('Employment must be active');
  });
});

// ---------------------------------------------------------------------------
// P-002: checkAnnualAccumulationLimit
// ---------------------------------------------------------------------------
describe('P-002: checkAnnualAccumulationLimit (연간 적립 한도)', () => {
  let db: Database.Database;
  const accountId = 'acct-1';

  beforeEach(() => {
    db = createTestDb();
    insertAccount(db, accountId);
  });

  it('신규 적립 — 한도 이내', () => {
    const result = checkAnnualAccumulationLimit(db, accountId, 5_000_000);
    expect(result.newBalance).toBe(5_000_000);
    expect(result.accumulatedThisYear).toBe(5_000_000);
  });

  it('기적립 있을 때 누적 적립 — 한도 이내', () => {
    insertLedger(db, accountId, 10_000_000, 10_000_000);
    const result = checkAnnualAccumulationLimit(db, accountId, 5_000_000);
    expect(result.accumulatedThisYear).toBe(15_000_000);
  });

  it('한도 초과 → E422-LIMIT_EXCEEDED', () => {
    insertLedger(db, accountId, 16_000_000, 16_000_000);
    expect(() => checkAnnualAccumulationLimit(db, accountId, 3_000_000))
      .toThrow('Annual accumulation limit exceeded');
  });

  it('경계값 정확히 한도 → 성공', () => {
    const result = checkAnnualAccumulationLimit(db, accountId, 18_000_000);
    expect(result.accumulatedThisYear).toBe(18_000_000);
  });

  it('음수 금액 → E422-INVALID_AMOUNT', () => {
    expect(() => checkAnnualAccumulationLimit(db, accountId, -1))
      .toThrow('positive');
  });
});

// ---------------------------------------------------------------------------
// P-003: requestEarlyWithdrawal
// ---------------------------------------------------------------------------
describe('P-003: requestEarlyWithdrawal (중도인출 사유)', () => {
  let db: Database.Database;
  const accountId = 'acct-2';

  beforeEach(() => {
    db = createTestDb();
    insertAccount(db, accountId);
  });

  it('주택구입 사유 → UNDER_REVIEW 상태 생성', () => {
    const result = requestEarlyWithdrawal(db, accountId, 'HOUSING_PURCHASE', 5_000_000);
    expect(result.status).toBe('UNDER_REVIEW');
    expect(result.withdrawalId).toBeTruthy();
  });

  it('의료비 사유 → UNDER_REVIEW 상태 생성', () => {
    const result = requestEarlyWithdrawal(db, accountId, 'MEDICAL', 2_000_000);
    expect(result.status).toBe('UNDER_REVIEW');
  });

  it('미허용 사유 → E403-INVALID_REASON', () => {
    expect(() => requestEarlyWithdrawal(db, accountId, 'VACATION', 1_000_000))
      .toThrow('not an allowed reason');
  });

  it('금액 0 → E422-INVALID_AMOUNT', () => {
    expect(() => requestEarlyWithdrawal(db, accountId, 'HOUSING_PURCHASE', 0))
      .toThrow('positive');
  });
});

// ---------------------------------------------------------------------------
// P-004: initiateReceiptPayout
// ---------------------------------------------------------------------------
describe('P-004: initiateReceiptPayout (수령 개시 시기)', () => {
  let db: Database.Database;
  const accountId = 'acct-3';

  beforeEach(() => {
    db = createTestDb();
    insertAccount(db, accountId);
  });

  it('55세 이상 + 5년 이상 → RECEIVING 전환', () => {
    const result = initiateReceiptPayout(db, accountId, 60, 10);
    expect(result.status).toBe('RECEIVING');
    const row = db.prepare('SELECT status FROM pension_accounts WHERE id = ?').get(accountId) as { status: string };
    expect(row.status).toBe('RECEIVING');
  });

  it('연령 미달(50세) → E422-AGE_NOT_MET', () => {
    expect(() => initiateReceiptPayout(db, accountId, 50, 10))
      .toThrow('at least 55');
  });

  it('가입 기간 부족(3년) → E422-SUBSCRIPTION_TOO_SHORT', () => {
    expect(() => initiateReceiptPayout(db, accountId, 60, 3))
      .toThrow('at least 5 years');
  });
});

// ---------------------------------------------------------------------------
// P-005: applyTaxBenefit
// ---------------------------------------------------------------------------
describe('P-005: applyTaxBenefit (세액공제 적용)', () => {
  let db: Database.Database;
  const accountId = 'acct-4';

  beforeEach(() => {
    db = createTestDb();
    insertAccount(db, accountId);
  });

  it('한도 이내 납입 → 전액 세액공제', () => {
    const result = applyTaxBenefit(db, accountId, 7_000_000);
    expect(result.eligibleAmount).toBe(7_000_000);
    expect(result.excessAmount).toBe(0);
  });

  it('한도 초과 납입 → 한도분만 세액공제', () => {
    const result = applyTaxBenefit(db, accountId, 12_000_000);
    expect(result.eligibleAmount).toBe(9_000_000);
    expect(result.excessAmount).toBe(3_000_000);
  });

  it('정확히 한도 금액 → 전액 세액공제', () => {
    const result = applyTaxBenefit(db, accountId, 9_000_000);
    expect(result.eligibleAmount).toBe(9_000_000);
    expect(result.excessAmount).toBe(0);
  });

  it('음수 납입 → E422-INVALID_AMOUNT', () => {
    expect(() => applyTaxBenefit(db, accountId, -1))
      .toThrow('positive');
  });
});

// ---------------------------------------------------------------------------
// P-006: terminatePlan
// ---------------------------------------------------------------------------
describe('P-006: terminatePlan (해지 처리)', () => {
  let db: Database.Database;
  const accountId = 'acct-5';

  beforeEach(() => {
    db = createTestDb();
  });

  it('진행 중 인출 없음 → TERMINATED 전환', () => {
    insertAccount(db, accountId, 'ACTIVE');
    const result = terminatePlan(db, accountId);
    expect(result.status).toBe('TERMINATED');
    const row = db.prepare('SELECT status FROM pension_accounts WHERE id = ?').get(accountId) as { status: string };
    expect(row.status).toBe('TERMINATED');
  });

  it('진행 중 인출 존재 → E409-WITHDRAWAL_IN_PROGRESS', () => {
    insertAccount(db, accountId, 'ACTIVE');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO pension_withdrawals (id, account_id, reason, amount, status, created_at, updated_at)
      VALUES ('w-1', ?, 'MEDICAL', 1000000, 'UNDER_REVIEW', ?, ?)
    `).run(accountId, now, now);
    expect(() => terminatePlan(db, accountId))
      .toThrow('pending withdrawals');
  });

  it('이미 해지 → E409-ALREADY_TERMINATED', () => {
    insertAccount(db, accountId, 'TERMINATED');
    expect(() => terminatePlan(db, accountId))
      .toThrow('already terminated');
  });

  it('SUSPENDED 상태도 TERMINATED 전환 가능', () => {
    insertAccount(db, accountId, 'SUSPENDED');
    const result = terminatePlan(db, accountId);
    expect(result.status).toBe('TERMINATED');
  });
});

// ---------------------------------------------------------------------------
// P-007: disbursePrincipalAndInterest
// ---------------------------------------------------------------------------
describe('P-007: disbursePrincipalAndInterest (원리금 지급 원자성)', () => {
  let db: Database.Database;
  const accountId = 'acct-6';

  beforeEach(() => {
    db = createTestDb();
    insertAccount(db, accountId);
    insertLedger(db, accountId, 10_000_000, 10_000_000);
  });

  it('정상 원리금 지급 → payouts에 기록', () => {
    const result = disbursePrincipalAndInterest(db, accountId, 10_000_000, 500_000, 'MATURITY');
    expect(result.totalAmount).toBe(10_500_000);
    expect(result.payoutId).toBeTruthy();
    const row = db.prepare('SELECT total_amount FROM pension_payouts WHERE id = ?').get(result.payoutId) as { total_amount: number };
    expect(row.total_amount).toBe(10_500_000);
  });

  it('이자 0인 중도인출 → 원금만 지급', () => {
    const result = disbursePrincipalAndInterest(db, accountId, 3_000_000, 0, 'EARLY_WITHDRAWAL');
    expect(result.totalAmount).toBe(3_000_000);
  });

  it('원금 0 → E422-INVALID_PRINCIPAL', () => {
    expect(() => disbursePrincipalAndInterest(db, accountId, 0, 0, 'TERMINATION'))
      .toThrow('Principal must be positive');
  });

  it('원금 음수 → E422-INVALID_PRINCIPAL', () => {
    expect(() => disbursePrincipalAndInterest(db, accountId, -1, 0, 'TERMINATION'))
      .toThrow('Principal must be positive');
  });
});
