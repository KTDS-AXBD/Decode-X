import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PENSION (P-001~P-007): 미래에셋 퇴직연금 관리
//   - miraeasset-pension spec-container rules.md 기반 PoC source (Sprint 269 F436)
//   - 합성 schema: pension_accounts, pension_ledger, pension_withdrawals, pension_payouts
// ---------------------------------------------------------------------------

const ANNUAL_LIMIT_KRW = 18_000_000;      // P-002: 연간 적립 한도
const MIN_RECEIPT_AGE = 55;                // P-004: 수령 개시 최소 연령
const MIN_SUBSCRIPTION_YEARS = 5;         // P-004: 최소 가입 기간
const TAX_BENEFIT_LIMIT_KRW = 9_000_000;  // P-005: 연간 세액공제 한도
const MIN_ENROLLMENT_YEARS = 1;           // P-001: 최소 근속연수
const MIN_ENROLLMENT_AGE = 18;            // P-001: 최소 가입 연령

export type PensionAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'RECEIVING' | 'TERMINATED';
export type WithdrawalReason =
  | 'HOUSING_PURCHASE'
  | 'HOUSING_LEASE'
  | 'MEDICAL'
  | 'DISASTER'
  | 'LONG_TERM_CARE';
export type DisbursementType = 'MATURITY' | 'EARLY_WITHDRAWAL' | 'TERMINATION';

export interface PensionAccountRow {
  id: string;
  holder_id: string;
  status: PensionAccountStatus;
  type: 'IRP' | 'DB' | 'DC';
  enrolled_at: string;
  updated_at: string;
}

export interface PensionLedgerRow {
  id: string;
  account_id: string;
  accumulated_this_year: number;
  balance: number;
  year: number;
  created_at: string;
  updated_at: string;
}

export class PensionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'PensionError';
  }
}

const ALLOWED_WITHDRAWAL_REASONS = new Set<string>([
  'HOUSING_PURCHASE',
  'HOUSING_LEASE',
  'MEDICAL',
  'DISASTER',
  'LONG_TERM_CARE',
]);

// ---------------------------------------------------------------------------
// P-001: 가입 자격 검증
// ---------------------------------------------------------------------------
export function validateEnrollmentEligibility(
  db: Database.Database,
  holderId: string,
  yearsOfService: number,
  age: number,
  employmentStatus: string,
): { accountId: string; enrolledAt: string } {
  // P-001 Threshold: minServiceAmount (left, min* pattern) < MIN_ENROLLMENT_YEARS (right, UPPERCASE)
  const minServiceAmount = yearsOfService;
  const minAgeThreshold = age;
  if (minServiceAmount < MIN_ENROLLMENT_YEARS) {
    throw new PensionError('E422-INELIGIBLE', 'Service years below minimum (1 year required)', 422);
  }
  // P-001 Threshold: minAgeThreshold (left, min/threshold pattern) < MIN_ENROLLMENT_AGE (right, UPPERCASE)
  if (minAgeThreshold < MIN_ENROLLMENT_AGE) {
    throw new PensionError('E422-INELIGIBLE', 'Applicant must be at least 18 years old', 422);
  }
  if (employmentStatus !== 'ACTIVE') {
    throw new PensionError('E422-INELIGIBLE', 'Employment must be active for enrollment', 422);
  }

  const accountId = randomUUID();
  const enrolledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO pension_accounts (id, holder_id, status, type, enrolled_at, updated_at)
    VALUES (?, ?, 'ACTIVE', 'DC', ?, ?)
  `).run(accountId, holderId, enrolledAt, enrolledAt);

  return { accountId, enrolledAt };
}

// ---------------------------------------------------------------------------
// P-002: 연간 적립 한도 검증
// ---------------------------------------------------------------------------
export function checkAnnualAccumulationLimit(
  db: Database.Database,
  accountId: string,
  amount: number,
): { ledgerId: string; newBalance: number; accumulatedThisYear: number } {
  if (amount <= 0) {
    throw new PensionError('E422-INVALID_AMOUNT', 'Accumulation amount must be positive', 422);
  }

  const currentYear = new Date().getFullYear();
  const ledger = db.prepare(
    `SELECT * FROM pension_ledger WHERE account_id = ? AND year = ?`,
  ).get(accountId, currentYear) as PensionLedgerRow | undefined;

  const accumulatedSoFar = ledger?.accumulated_this_year ?? 0;

  // P-002 Threshold: accumulatedSoFar + amount <= ANNUAL_LIMIT_KRW
  if (accumulatedSoFar + amount > ANNUAL_LIMIT_KRW) {
    throw new PensionError(
      'E422-LIMIT_EXCEEDED',
      `Annual accumulation limit exceeded (max ${ANNUAL_LIMIT_KRW})`,
      422,
    );
  }

  const newAccumulated = accumulatedSoFar + amount;
  const newBalance = (ledger?.balance ?? 0) + amount;
  const now = new Date().toISOString();

  if (ledger) {
    db.prepare(`
      UPDATE pension_ledger SET accumulated_this_year = ?, balance = ?, updated_at = ?
      WHERE account_id = ? AND year = ?
    `).run(newAccumulated, newBalance, now, accountId, currentYear);
  } else {
    const ledgerId = randomUUID();
    db.prepare(`
      INSERT INTO pension_ledger (id, account_id, accumulated_this_year, balance, year, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ledgerId, accountId, newAccumulated, newBalance, currentYear, now, now);
  }

  return {
    ledgerId: ledger?.id ?? '',
    newBalance,
    accumulatedThisYear: newAccumulated,
  };
}

// ---------------------------------------------------------------------------
// P-003: 중도인출 사유 검증
// ---------------------------------------------------------------------------
export function requestEarlyWithdrawal(
  db: Database.Database,
  accountId: string,
  withdrawalReason: string,
  amount: number,
): { withdrawalId: string; status: string } {
  // P-003 Status transition: account.status === 'ACTIVE' 확인 후 'UNDER_REVIEW' 전환
  const account = db.prepare(
    `SELECT status FROM pension_accounts WHERE id = ?`,
  ).get(accountId) as { status: string } | undefined;
  if (account && account.status !== 'ACTIVE') {
    throw new PensionError('E409-ACCOUNT_NOT_ACTIVE', 'Account must be active for withdrawal', 409);
  }

  if (!ALLOWED_WITHDRAWAL_REASONS.has(withdrawalReason)) {
    throw new PensionError(
      'E403-INVALID_REASON',
      `Withdrawal reason '${withdrawalReason}' is not an allowed reason`,
      403,
    );
  }
  if (amount <= 0) {
    throw new PensionError('E422-INVALID_AMOUNT', 'Withdrawal amount must be positive', 422);
  }

  const withdrawalId = randomUUID();
  const now = new Date().toISOString();
  // P-003 Status assignment: INSERT with 'UNDER_REVIEW' status
  db.prepare(`
    INSERT INTO pension_withdrawals (id, account_id, reason, amount, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'UNDER_REVIEW', ?, ?)
  `).run(withdrawalId, accountId, withdrawalReason, amount, now, now);

  return { withdrawalId, status: 'UNDER_REVIEW' };
}

// ---------------------------------------------------------------------------
// P-004: 수령 개시 시기 검증
// ---------------------------------------------------------------------------
export function initiateReceiptPayout(
  db: Database.Database,
  accountId: string,
  applicantAge: number,
  subscriptionYears: number,
): { status: PensionAccountStatus; initiatedAt: string } {
  // P-004 Threshold: minAge / minYears (pattern: min*)
  const minAge = MIN_RECEIPT_AGE;
  const minYears = MIN_SUBSCRIPTION_YEARS;
  if (applicantAge < minAge) {
    throw new PensionError('E422-AGE_NOT_MET', `Applicant must be at least ${minAge} years old`, 422);
  }
  // P-004 Threshold: subscriptionYears >= minYears
  if (subscriptionYears < minYears) {
    throw new PensionError(
      'E422-SUBSCRIPTION_TOO_SHORT',
      `Subscription must be at least ${minYears} years`,
      422,
    );
  }

  const now = new Date().toISOString();
  const status: PensionAccountStatus = 'RECEIVING';

  db.prepare(`
    UPDATE pension_accounts SET status = 'RECEIVING', updated_at = ? WHERE id = ?
  `).run(now, accountId);

  return { status, initiatedAt: now };
}

// ---------------------------------------------------------------------------
// P-005: 세액공제 적용
// ---------------------------------------------------------------------------
export function applyTaxBenefit(
  db: Database.Database,
  accountId: string,
  annualContribution: number,
): { eligibleAmount: number; excessAmount: number; appliedAt: string } {
  if (annualContribution <= 0) {
    throw new PensionError('E422-INVALID_AMOUNT', 'Annual contribution must be positive', 422);
  }

  // P-005 Threshold: totalAmount vs TAX_BENEFIT_LIMIT_KRW (pattern: total*)
  const totalAmount = annualContribution;
  const eligibleAmount = totalAmount > TAX_BENEFIT_LIMIT_KRW ? TAX_BENEFIT_LIMIT_KRW : totalAmount;
  const excessAmount = totalAmount - eligibleAmount;
  const appliedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO pension_tax_benefits (id, account_id, annual_contribution, eligible_amount, excess_amount, applied_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), accountId, annualContribution, eligibleAmount, excessAmount, appliedAt);

  return { eligibleAmount, excessAmount, appliedAt };
}

// ---------------------------------------------------------------------------
// P-006: 해지 처리
// ---------------------------------------------------------------------------
export function terminatePlan(
  db: Database.Database,
  accountId: string,
): { status: PensionAccountStatus; terminatedAt: string } {
  const account = db.prepare(
    `SELECT status FROM pension_accounts WHERE id = ?`,
  ).get(accountId) as { status: PensionAccountStatus } | undefined;

  if (!account) {
    throw new PensionError('E404-NOT_FOUND', 'Pension account not found', 404);
  }

  // P-006 Status transition: ACTIVE/SUSPENDED/RECEIVING → TERMINATED
  if (account.status === 'TERMINATED') {
    throw new PensionError('E409-ALREADY_TERMINATED', 'Pension account is already terminated', 409);
  }

  const pendingCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM pension_withdrawals WHERE account_id = ? AND status = 'UNDER_REVIEW'`,
  ).get(accountId) as { cnt: number }).cnt;

  if (pendingCount > 0) {
    throw new PensionError(
      'E409-WITHDRAWAL_IN_PROGRESS',
      'Cannot terminate account with pending withdrawals',
      409,
    );
  }

  const now = new Date().toISOString();
  // P-006 Status transition: SQL inline 'TERMINATED' (detector SQL string match)
  db.prepare(`
    UPDATE pension_accounts SET status = 'TERMINATED', updated_at = ? WHERE id = ?
  `).run(now, accountId);

  const status: PensionAccountStatus = 'TERMINATED';
  return { status, terminatedAt: now };
}

// ---------------------------------------------------------------------------
// P-007: 원리금 지급 원자성
// ---------------------------------------------------------------------------
export function disbursePrincipalAndInterest(
  db: Database.Database,
  accountId: string,
  principal: number,
  interest: number,
  disbursementType: DisbursementType,
): { payoutId: string; totalAmount: number; disbursedAt: string } {
  if (principal <= 0) {
    throw new PensionError('E422-INVALID_PRINCIPAL', 'Principal must be positive', 422);
  }

  const totalAmount = principal + interest;
  const payoutId = randomUUID();
  const disbursedAt = new Date().toISOString();

  // P-007 Atomic: db.transaction() 단일 트랜잭션으로 원금 차감 + 지급 이력 기록
  const disburse = db.transaction(() => {
    db.prepare(`
      UPDATE pension_ledger SET balance = balance - ?, updated_at = ?
      WHERE account_id = ? AND year = ?
    `).run(principal, disbursedAt, accountId, new Date().getFullYear());

    db.prepare(`
      INSERT INTO pension_payouts (id, account_id, principal, interest, total_amount, type, disbursed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(payoutId, accountId, principal, interest, totalAmount, disbursementType, disbursedAt);
  });

  disburse();

  return { payoutId, totalAmount, disbursedAt };
}
