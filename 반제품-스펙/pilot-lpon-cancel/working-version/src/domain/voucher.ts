import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-VOUCHER (V-001~V-006): Generic Voucher 합성 도메인 — 9번째 도메인
//   - generic-voucher spec-container rules.md 기반 PoC source
//   - 합성 schema: vouchers, voucher_ledger_entries
//   - 비금융 일반화 패턴 — 카드/쿠폰/포인트 도메인 추상화 PoC
//   - withRuleId 재사용 9번째 도메인 (신규 detector 0개)
// ---------------------------------------------------------------------------

export interface VoucherRow {
  id: string;
  issuer_id: string;
  owner_id: string;
  balance: number;
  status: string;
  issued_at: string;
  expires_at: string;
  transferred_count: number;
  used_count: number;
}

const ISSUE_DAILY_LIMIT = 1000;
const VALIDITY_DAYS = 365;
const REFUND_WINDOW_DAYS = 7;
const AUTO_DESTROY_THRESHOLD = 1000;

// ---------------------------------------------------------------------------
// V-001: 바우처 발행 (issuer당 일일 발행 ≤ 1,000건)
// (ThresholdCheck detector: count(today_issued) >= ISSUE_DAILY_LIMIT)
// ---------------------------------------------------------------------------
export function issueVoucher(
  db: Database.Database,
  issuerId: string,
  ownerId: string,
  amount: number
): { voucherId: string; issuedAt: string; expiresAt: string } {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const todayIssued = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM vouchers WHERE issuer_id = ? AND substr(issued_at, 1, 10) = ?`
    )
    .get(issuerId, today) as { cnt: number };

  // V-001 threshold: 일일 발행 한도 1,000건
  if (todayIssued.cnt >= ISSUE_DAILY_LIMIT) {
    throw new VoucherError('E429-LIMIT', `Daily issue limit ${ISSUE_DAILY_LIMIT} exceeded`, 429);
  }

  const voucherId = randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + VALIDITY_DAYS * 86_400_000).toISOString();

  db.prepare(
    `INSERT INTO vouchers (id, issuer_id, owner_id, balance, status, issued_at, expires_at, transferred_count, used_count)
     VALUES (?, ?, ?, ?, 'active', ?, ?, 0, 0)`
  ).run(voucherId, issuerId, ownerId, amount, issuedAt, expiresAt);

  return { voucherId, issuedAt, expiresAt };
}

// ---------------------------------------------------------------------------
// V-002: 사용 가능 검증 (issued_at + 365일 이내)
// (ThresholdCheck detector: now > expires_at)
// ---------------------------------------------------------------------------
export function useVoucher(
  db: Database.Database,
  voucherId: string
): { canUse: boolean; expiresAt: string; daysLeft: number } {
  const v = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(voucherId) as VoucherRow | undefined;
  if (!v) {
    throw new VoucherError('E404-VOUCHER', `Voucher ${voucherId} not found`, 404);
  }

  const now = Date.now();
  const expiresMs = new Date(v.expires_at).getTime();
  const daysLeft = Math.floor((expiresMs - now) / 86_400_000);

  // V-002 threshold: 365일 초과 시 expired
  if (now > expiresMs) {
    throw new VoucherError('E410-EXPIRED', `Voucher expired (validity ${VALIDITY_DAYS} days)`, 410);
  }
  if (v.status !== 'active') {
    throw new VoucherError('E409-STATUS', `Voucher status=${v.status}, not usable`, 409);
  }

  return { canUse: true, expiresAt: v.expires_at, daysLeft };
}

// ---------------------------------------------------------------------------
// V-003: 사용 시 잔액 차감 (atomic)
// (AtomicTransaction detector: db.transaction()(() => { ... }))
// ---------------------------------------------------------------------------
export function redeemVoucher(
  db: Database.Database,
  voucherId: string,
  amount: number
): { ledgerId: string; remainingBalance: number; redeemedAt: string } {
  const v = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(voucherId) as VoucherRow | undefined;
  if (!v) {
    throw new VoucherError('E404-VOUCHER', `Voucher ${voucherId} not found`, 404);
  }
  if (v.balance < amount) {
    throw new VoucherError('E422-BAL', 'Insufficient balance', 422);
  }

  const ledgerId = randomUUID();
  const redeemedAt = new Date().toISOString();
  const remainingBalance = v.balance - amount;

  // V-003 atomic: balance update + ledger insert + used_count increment
  const tx = db.transaction(() => {
    db.prepare(`UPDATE vouchers SET balance = balance - ?, used_count = used_count + 1 WHERE id = ?`).run(
      amount,
      voucherId
    );
    db.prepare(
      `INSERT INTO voucher_ledger_entries (id, voucher_id, direction, amount, created_at)
       VALUES (?, ?, 'DEBIT_REDEEM', ?, ?)`
    ).run(ledgerId, voucherId, amount, redeemedAt);

    // 무결성 검증 — voucher row 부재 시 throw → tx 자동 롤백
    const after = db.prepare(`SELECT balance FROM vouchers WHERE id = ?`).get(voucherId) as
      | { balance: number }
      | undefined;
    if (!after) {
      throw new VoucherError('E500-INTEGRITY', 'Voucher missing — rollback', 500);
    }
  });
  tx();

  return { ledgerId, remainingBalance, redeemedAt };
}

// ---------------------------------------------------------------------------
// V-004: 잔액 ≤ 1,000원 자동 소멸
// (StatusTransition detector: status active → destroyed)
// ---------------------------------------------------------------------------
export function autoDestroyVoucher(
  db: Database.Database,
  voucherId: string
): { destroyed: boolean; finalBalance: number; status: string } {
  const v = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(voucherId) as VoucherRow | undefined;
  if (!v) {
    throw new VoucherError('E404-VOUCHER', `Voucher ${voucherId} not found`, 404);
  }

  // V-004 status transition: active → destroyed (잔액 1,000원 이하 시)
  if (v.status === 'active' && v.balance <= AUTO_DESTROY_THRESHOLD) {
    db.prepare(`UPDATE vouchers SET status = 'destroyed', balance = 0 WHERE id = ?`).run(voucherId);
    return { destroyed: true, finalBalance: 0, status: 'destroyed' };
  }

  return { destroyed: false, finalBalance: v.balance, status: v.status };
}

// ---------------------------------------------------------------------------
// V-005: 환불 (사용 0건 + 발행 후 7일 이내)
// (ThresholdCheck detector: used_count > 0 || days > 7)
// ---------------------------------------------------------------------------
export function refundVoucher(
  db: Database.Database,
  voucherId: string
): { refundable: boolean; refundedAt: string; refundAmount: number } {
  const v = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(voucherId) as VoucherRow | undefined;
  if (!v) {
    throw new VoucherError('E404-VOUCHER', `Voucher ${voucherId} not found`, 404);
  }

  const now = Date.now();
  const issuedMs = new Date(v.issued_at).getTime();
  const daysSinceIssue = Math.floor((now - issuedMs) / 86_400_000);

  // V-005 threshold check 1: 사용 0건
  if (v.used_count > 0) {
    throw new VoucherError('E422-USED', `Refund denied: used ${v.used_count} times`, 422);
  }

  // V-005 threshold check 2: 발행 후 7일 이내
  if (daysSinceIssue > REFUND_WINDOW_DAYS) {
    throw new VoucherError(
      'E422-WINDOW',
      `Refund denied: ${daysSinceIssue} days since issue (limit ${REFUND_WINDOW_DAYS})`,
      422
    );
  }

  const refundedAt = new Date().toISOString();
  db.prepare(`UPDATE vouchers SET status = 'refunded', balance = 0 WHERE id = ?`).run(voucherId);

  return { refundable: true, refundedAt, refundAmount: v.balance };
}

// ---------------------------------------------------------------------------
// V-006: 양도 1회만 (status 전이 active → transferred)
// (StatusTransition detector: status check + assignment)
// ---------------------------------------------------------------------------
export function transferVoucher(
  db: Database.Database,
  voucherId: string,
  newOwnerId: string
): { transferredAt: string; previousOwner: string; newOwner: string } {
  const v = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(voucherId) as VoucherRow | undefined;
  if (!v) {
    throw new VoucherError('E404-VOUCHER', `Voucher ${voucherId} not found`, 404);
  }

  // V-006 status transition: 1회만 양도 가능
  if (v.transferred_count >= 1) {
    throw new VoucherError('E423-LOCKED', 'Voucher already transferred (1회 한도)', 423);
  }
  if (v.status !== 'active') {
    throw new VoucherError('E409-STATUS', `Voucher status=${v.status}, not transferable`, 409);
  }

  const transferredAt = new Date().toISOString();
  const previousOwner = v.owner_id;

  db.prepare(
    `UPDATE vouchers SET owner_id = ?, transferred_count = transferred_count + 1, status = 'transferred' WHERE id = ?`
  ).run(newOwnerId, voucherId);

  return { transferredAt, previousOwner, newOwner: newOwnerId };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class VoucherError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(`[${code}] ${message}`);
    this.name = 'VoucherError';
  }
}
