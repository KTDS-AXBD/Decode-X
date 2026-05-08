import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-LOYALTY (LP-001~LP-006): Loyalty Points 합성 도메인 — 10번째 도메인
//   - loyalty-points spec-container rules.md 기반 PoC source
//   - 합성 schema: loyalty_accounts, loyalty_ledger_entries
//   - 비금융 일반화 패턴 — 적립/사용/만료/등급/환불 회수
//   - withRuleId 재사용 10번째 도메인 (신규 detector 0개)
//   - VoucherError code-in-message 패턴 적용 (S274 메타 학습 M3)
// ---------------------------------------------------------------------------

export interface LoyaltyAccountRow {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  grade: string;
  status: string;
  earned_at: string;
  expires_at: string;
}

const DAILY_EARN_LIMIT = 10_000;
const VALIDITY_DAYS = 365;
const CLAWBACK_WINDOW_DAYS = 30;
const GRADE_SILVER_THRESHOLD = 50_000;
const GRADE_GOLD_THRESHOLD = 200_000;

// ---------------------------------------------------------------------------
// LP-001: 적립 (사용자당 일일 ≤ 10,000P)
// (ThresholdCheck detector)
// ---------------------------------------------------------------------------
export function earnPoints(
  db: Database.Database,
  userId: string,
  amount: number,
  source: string
): { ledgerId: string; newBalance: number; earnedAt: string } {
  const today = new Date().toISOString().slice(0, 10);
  const todayEarned = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS sum FROM loyalty_ledger_entries
       WHERE account_id IN (SELECT id FROM loyalty_accounts WHERE user_id = ?)
       AND direction = 'EARN' AND substr(created_at, 1, 10) = ?`
    )
    .get(userId, today) as { sum: number };

  // LP-001 threshold: 일일 적립 한도 10,000P
  if (todayEarned.sum + amount > DAILY_EARN_LIMIT) {
    throw new LoyaltyError(
      'E429-LIMIT',
      `Daily earn limit ${DAILY_EARN_LIMIT}P exceeded (today=${todayEarned.sum}, requested=${amount})`,
      429
    );
  }

  // 계정 조회 또는 생성
  let account = db.prepare(`SELECT * FROM loyalty_accounts WHERE user_id = ?`).get(userId) as
    | LoyaltyAccountRow
    | undefined;
  const earnedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + VALIDITY_DAYS * 86_400_000).toISOString();

  if (!account) {
    const accountId = randomUUID();
    db.prepare(
      `INSERT INTO loyalty_accounts (id, user_id, balance, total_earned, grade, status, earned_at, expires_at)
       VALUES (?, ?, 0, 0, 'BRONZE', 'active', ?, ?)`
    ).run(accountId, userId, earnedAt, expiresAt);
    account = db.prepare(`SELECT * FROM loyalty_accounts WHERE id = ?`).get(accountId) as LoyaltyAccountRow;
  }

  const ledgerId = randomUUID();
  db.prepare(
    `UPDATE loyalty_accounts SET balance = balance + ?, total_earned = total_earned + ?, expires_at = ? WHERE id = ?`
  ).run(amount, amount, expiresAt, account.id);
  db.prepare(
    `INSERT INTO loyalty_ledger_entries (id, account_id, direction, amount, source, created_at)
     VALUES (?, ?, 'EARN', ?, ?, ?)`
  ).run(ledgerId, account.id, amount, source, earnedAt);

  return { ledgerId, newBalance: account.balance + amount, earnedAt };
}

// ---------------------------------------------------------------------------
// LP-002: 사용 가능 검증 (잔액 + 활성 상태)
// (ThresholdCheck detector)
// ---------------------------------------------------------------------------
export function usePoints(
  db: Database.Database,
  userId: string,
  amount: number
): { canUse: boolean; balance: number } {
  const account = db
    .prepare(`SELECT * FROM loyalty_accounts WHERE user_id = ?`)
    .get(userId) as LoyaltyAccountRow | undefined;
  if (!account) {
    throw new LoyaltyError('E404-ACCOUNT', `Loyalty account for user ${userId} not found`, 404);
  }

  // LP-002 threshold: 잔액 검증
  if (account.balance < amount) {
    throw new LoyaltyError(
      'E422-BAL',
      `Insufficient balance (have=${account.balance}, want=${amount})`,
      422
    );
  }
  if (account.status !== 'active') {
    throw new LoyaltyError('E409-STATUS', `Account status=${account.status}, not usable`, 409);
  }

  return { canUse: true, balance: account.balance };
}

// ---------------------------------------------------------------------------
// LP-003: 사용 시 차감 (atomic)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function redeemPoints(
  db: Database.Database,
  userId: string,
  amount: number,
  reference: string
): { ledgerId: string; remainingBalance: number; redeemedAt: string } {
  const account = db
    .prepare(`SELECT * FROM loyalty_accounts WHERE user_id = ?`)
    .get(userId) as LoyaltyAccountRow | undefined;
  if (!account) {
    throw new LoyaltyError('E404-ACCOUNT', `Loyalty account for user ${userId} not found`, 404);
  }
  if (account.balance < amount) {
    throw new LoyaltyError('E422-BAL', `Insufficient balance for redeem`, 422);
  }

  const ledgerId = randomUUID();
  const redeemedAt = new Date().toISOString();
  const remainingBalance = account.balance - amount;

  // LP-003 atomic: balance update + ledger insert
  const tx = db.transaction(() => {
    db.prepare(`UPDATE loyalty_accounts SET balance = balance - ? WHERE id = ?`).run(amount, account.id);
    db.prepare(
      `INSERT INTO loyalty_ledger_entries (id, account_id, direction, amount, source, created_at)
       VALUES (?, ?, 'REDEEM', ?, ?, ?)`
    ).run(ledgerId, account.id, amount, reference, redeemedAt);

    // 무결성 검증
    const after = db.prepare(`SELECT balance FROM loyalty_accounts WHERE id = ?`).get(account.id) as
      | { balance: number }
      | undefined;
    if (!after) {
      throw new LoyaltyError('E500-INTEGRITY', 'Account missing — rollback', 500);
    }
  });
  tx();

  return { ledgerId, remainingBalance, redeemedAt };
}

// ---------------------------------------------------------------------------
// LP-004: 만료 자동 소멸 (1년 경과)
// (StatusTransition detector: active → expired)
// ---------------------------------------------------------------------------
export function expirePoints(
  db: Database.Database,
  userId: string
): { expired: boolean; finalBalance: number; status: string } {
  const account = db
    .prepare(`SELECT * FROM loyalty_accounts WHERE user_id = ?`)
    .get(userId) as LoyaltyAccountRow | undefined;
  if (!account) {
    throw new LoyaltyError('E404-ACCOUNT', `Loyalty account for user ${userId} not found`, 404);
  }

  const now = Date.now();
  const expiresMs = new Date(account.expires_at).getTime();

  // LP-004 status transition: active → expired (1년 경과 시)
  if (account.status === 'active' && now > expiresMs) {
    db.prepare(`UPDATE loyalty_accounts SET status = 'expired', balance = 0 WHERE id = ?`).run(account.id);
    return { expired: true, finalBalance: 0, status: 'expired' };
  }

  return { expired: false, finalBalance: account.balance, status: account.status };
}

// ---------------------------------------------------------------------------
// LP-005: 등급 승급 (누적 적립 임계)
// (StatusTransition detector: BRONZE → SILVER → GOLD)
// ---------------------------------------------------------------------------
export function promoteGrade(
  db: Database.Database,
  userId: string
): { promoted: boolean; oldGrade: string; newGrade: string } {
  const account = db
    .prepare(`SELECT * FROM loyalty_accounts WHERE user_id = ?`)
    .get(userId) as LoyaltyAccountRow | undefined;
  if (!account) {
    throw new LoyaltyError('E404-ACCOUNT', `Loyalty account for user ${userId} not found`, 404);
  }

  const oldGrade = account.grade;
  let newGrade = oldGrade;

  // LP-005 status transition: 등급 승급 (BRONZE → SILVER → GOLD)
  if (account.total_earned >= GRADE_GOLD_THRESHOLD && oldGrade !== 'GOLD') {
    newGrade = 'GOLD';
  } else if (
    account.total_earned >= GRADE_SILVER_THRESHOLD &&
    oldGrade === 'BRONZE'
  ) {
    newGrade = 'SILVER';
  }

  if (newGrade !== oldGrade) {
    db.prepare(`UPDATE loyalty_accounts SET grade = ? WHERE id = ?`).run(newGrade, account.id);
    return { promoted: true, oldGrade, newGrade };
  }
  return { promoted: false, oldGrade, newGrade };
}

// ---------------------------------------------------------------------------
// LP-006: 환불 시 회수 (적립 후 30일 이내)
// (ThresholdCheck detector: days > 30 || already used)
// ---------------------------------------------------------------------------
export function clawbackOnRefund(
  db: Database.Database,
  ledgerId: string
): { clawbackAmount: number; clawbackedAt: string } {
  const earnEntry = db
    .prepare(`SELECT * FROM loyalty_ledger_entries WHERE id = ? AND direction = 'EARN'`)
    .get(ledgerId) as { id: string; account_id: string; amount: number; created_at: string } | undefined;
  if (!earnEntry) {
    throw new LoyaltyError('E404-LEDGER', `Earn ledger ${ledgerId} not found`, 404);
  }

  const now = Date.now();
  const earnMs = new Date(earnEntry.created_at).getTime();
  const daysSinceEarn = Math.floor((now - earnMs) / 86_400_000);

  // LP-006 threshold check: 30일 초과
  if (daysSinceEarn > CLAWBACK_WINDOW_DAYS) {
    throw new LoyaltyError(
      'E422-WINDOW',
      `Clawback denied: ${daysSinceEarn} days since earn (limit ${CLAWBACK_WINDOW_DAYS})`,
      422
    );
  }

  const account = db
    .prepare(`SELECT balance FROM loyalty_accounts WHERE id = ?`)
    .get(earnEntry.account_id) as { balance: number } | undefined;
  if (!account || account.balance < earnEntry.amount) {
    throw new LoyaltyError(
      'E422-USED',
      `Clawback denied: balance ${account?.balance ?? 0} < earned ${earnEntry.amount}`,
      422
    );
  }

  const clawbackedAt = new Date().toISOString();
  db.prepare(`UPDATE loyalty_accounts SET balance = balance - ?, total_earned = total_earned - ? WHERE id = ?`).run(
    earnEntry.amount,
    earnEntry.amount,
    earnEntry.account_id
  );
  db.prepare(
    `INSERT INTO loyalty_ledger_entries (id, account_id, direction, amount, source, created_at)
     VALUES (?, ?, 'CLAWBACK', ?, ?, ?)`
  ).run(randomUUID(), earnEntry.account_id, earnEntry.amount, `clawback_of_${earnEntry.id}`, clawbackedAt);

  return { clawbackAmount: earnEntry.amount, clawbackedAt };
}

// ---------------------------------------------------------------------------
// Error class (S274 메타 학습 M3 — code-in-message 패턴)
// ---------------------------------------------------------------------------
export class LoyaltyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(`[${code}] ${message}`);
    this.name = 'LoyaltyError';
  }
}
