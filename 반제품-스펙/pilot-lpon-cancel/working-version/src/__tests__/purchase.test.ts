import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  requestPurchase,
  completePurchase,
  checkMonthlyLimit,
  handleIdempotentPurchase,
  refundUnusedPurchase,
  PurchaseError,
} from '../domain/purchase.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.prepare(
    `CREATE TABLE purchase_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      request_id TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      voucher_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
  db.prepare(
    `CREATE TABLE vouchers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      face_amount INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      purchased_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT
    )`
  ).run();
  return db;
}

describe('BP-001: requestPurchase (한도 검증)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('정상 요청 — pending 상태 INSERT', () => {
    const result = requestPurchase(db, 'user-1', 100_000, 'req-1');
    expect(result.status).toBe('pending');

    const row = db.prepare('SELECT amount, status FROM purchase_transactions WHERE id = ?').get(result.purchaseId) as {
      amount: number;
      status: string;
    };
    expect(row.amount).toBe(100_000);
    expect(row.status).toBe('pending');
  });

  it('한도 초과 (>500_000) → HTTP 422', () => {
    expect(() => requestPurchase(db, 'user-1', 1_000_000, 'req-1')).toThrow(/per-purchase limit/);
  });

  it('음수 금액 → HTTP 422', () => {
    expect(() => requestPurchase(db, 'user-1', -1, 'req-1')).toThrow(/positive/);
  });
});

describe('BP-002: completePurchase (atomic vouchers INSERT)', () => {
  let db: Database.Database;
  let purchaseId: string;

  beforeEach(() => {
    db = createTestDb();
    purchaseId = requestPurchase(db, 'user-1', 50_000, 'req-1').purchaseId;
  });

  it('정상 완료 — pending → completed + voucher INSERT', () => {
    const result = completePurchase(db, purchaseId);
    expect(result.status).toBe('completed');

    const purchase = db.prepare('SELECT status, voucher_id FROM purchase_transactions WHERE id = ?').get(purchaseId) as {
      status: string;
      voucher_id: string;
    };
    expect(purchase.status).toBe('completed');
    expect(purchase.voucher_id).toBe(result.voucherId);

    const voucher = db.prepare('SELECT face_amount, balance FROM vouchers WHERE id = ?').get(result.voucherId) as {
      face_amount: number;
      balance: number;
    };
    expect(voucher.face_amount).toBe(50_000);
    expect(voucher.balance).toBe(50_000);
  });

  it('이미 completed → HTTP 422', () => {
    completePurchase(db, purchaseId);
    expect(() => completePurchase(db, purchaseId)).toThrow(/not in pending state/);
  });
});

describe('BP-003: checkMonthlyLimit (월 한도)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('월 누적 0원 + 신규 100_000 → 허용', () => {
    const result = checkMonthlyLimit(db, 'user-1', 100_000);
    expect(result.allowed).toBe(true);
    expect(result.monthlyTotal).toBe(0);
  });

  it('월 누적 2_900_000 + 200_000 → 한도 초과 HTTP 422', () => {
    const p1 = requestPurchase(db, 'user-1', 500_000, 'req-1').purchaseId;
    completePurchase(db, p1);
    const p2 = requestPurchase(db, 'user-1', 500_000, 'req-2').purchaseId;
    completePurchase(db, p2);
    const p3 = requestPurchase(db, 'user-1', 500_000, 'req-3').purchaseId;
    completePurchase(db, p3);
    const p4 = requestPurchase(db, 'user-1', 500_000, 'req-4').purchaseId;
    completePurchase(db, p4);
    const p5 = requestPurchase(db, 'user-1', 500_000, 'req-5').purchaseId;
    completePurchase(db, p5);
    const p6 = requestPurchase(db, 'user-1', 400_000, 'req-6').purchaseId;
    completePurchase(db, p6);
    // 누적 2_900_000

    expect(() => checkMonthlyLimit(db, 'user-1', 200_000)).toThrow(/Monthly purchase limit exceeded/);
  });
});

describe('BP-004: handleIdempotentPurchase (이중 발행 방지)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('신규 요청 — duplicate=false', () => {
    const result = handleIdempotentPurchase(db, 'req-new');
    expect(result.duplicate).toBe(false);
  });

  it('완료된 요청 → 기존 voucherId 반환 (이중 발행 방지)', () => {
    const purchaseId = requestPurchase(db, 'user-1', 100_000, 'req-1').purchaseId;
    const completed = completePurchase(db, purchaseId);

    const result = handleIdempotentPurchase(db, 'req-1');
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.voucherId).toBe(completed.voucherId);
  });

  it('processing 상태 → HTTP 409 PURCHASE_IN_PROGRESS', () => {
    const purchaseId = requestPurchase(db, 'user-1', 100_000, 'req-2').purchaseId;
    db.prepare(`UPDATE purchase_transactions SET status = 'processing' WHERE id = ?`).run(purchaseId);

    expect(() => handleIdempotentPurchase(db, 'req-2')).toThrow(/Purchase already in progress/);
  });
});

describe('BP-005: refundUnusedPurchase (7일 이내 + 미사용)', () => {
  let db: Database.Database;
  let voucherId: string;

  beforeEach(() => {
    db = createTestDb();
    const purchaseId = requestPurchase(db, 'user-1', 50_000, 'req-r').purchaseId;
    voucherId = completePurchase(db, purchaseId).voucherId;
  });

  it('정상 환불 — 잔액=액면가 + 7일 이내', () => {
    const result = refundUnusedPurchase(db, voucherId);
    expect(result.refundedAmount).toBe(50_000);

    const v = db.prepare('SELECT status FROM vouchers WHERE id = ?').get(voucherId) as { status: string };
    expect(v.status).toBe('REFUNDED');
  });

  it('일부 사용 → HTTP 422 (USED)', () => {
    db.prepare(`UPDATE vouchers SET balance = 30_000 WHERE id = ?`).run(voucherId);
    expect(() => refundUnusedPurchase(db, voucherId)).toThrow(/partially used/);
  });

  it('7일 초과 → PERIOD_EXPIRED', () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE vouchers SET purchased_at = ? WHERE id = ?`).run(oldDate, voucherId);
    expect(() => refundUnusedPurchase(db, voucherId)).toThrow(/Refund period expired/);
  });
});
