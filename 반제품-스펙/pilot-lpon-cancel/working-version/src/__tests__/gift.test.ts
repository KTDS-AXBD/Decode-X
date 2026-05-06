import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  acceptGift,
  rejectGift,
  expireGift,
  cancelGift,
  transferGiftBalance,
  GiftError,
} from '../domain/gift.js';

// ---------------------------------------------------------------------------
// 합성 schema (lpon-gift PoC — 운영 schema 미존재)
// ---------------------------------------------------------------------------
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.prepare(
    `CREATE TABLE vouchers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
  db.prepare(
    `CREATE TABLE gift_transactions (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
  db.prepare(
    `CREATE TABLE gift_ledger_entries (
      id TEXT PRIMARY KEY,
      gift_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
  return db;
}

function seedVoucher(db: Database.Database, userId: string, balance: number) {
  db.prepare(`INSERT INTO vouchers (id, user_id, balance) VALUES (?, ?, ?)`).run(
    `v-${userId}`,
    userId,
    balance
  );
}

function seedGift(
  db: Database.Database,
  giftId: string,
  senderId: string,
  receiverId: string,
  amount: number,
  status: string,
  expiresOffsetMs = 60 * 60 * 1000
): void {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresOffsetMs).toISOString();
  db.prepare(`
    INSERT INTO gift_transactions (id, sender_id, receiver_id, amount, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(giftId, senderId, receiverId, amount, status, expiresAt, now.toISOString(), now.toISOString());
}

// ---------------------------------------------------------------------------
// BL-G002: 수신자 선물 수락
// ---------------------------------------------------------------------------
describe('BL-G002: acceptGift (status pending → accepted, balance transfer)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedVoucher(db, 'sender-1', 0); // 이미 차감됨 가정 (BL-G001 발송 시점)
    seedVoucher(db, 'receiver-1', 0);
    seedGift(db, 'g-001', 'sender-1', 'receiver-1', 10_000, 'pending');
  });

  it('정상 수락 — pending → accepted, receiver +amount', () => {
    const result = acceptGift(db, 'g-001', 'receiver-1');
    expect(result.status).toBe('accepted');
    expect(result.receiverBalance).toBe(10_000);

    const gift = db.prepare('SELECT status FROM gift_transactions WHERE id = ?').get('g-001') as { status: string };
    expect(gift.status).toBe('accepted');

    const ledger = db.prepare('SELECT direction, amount FROM gift_ledger_entries WHERE gift_id = ?').get('g-001') as {
      direction: string;
      amount: number;
    };
    expect(ledger.direction).toBe('CREDIT_RECEIVER');
    expect(ledger.amount).toBe(10_000);
  });

  it('이미 accepted → HTTP 422', () => {
    acceptGift(db, 'g-001', 'receiver-1');
    expect(() => acceptGift(db, 'g-001', 'receiver-1')).toThrow(GiftError);
  });

  it('expired (expires_at 과거) → HTTP 422', () => {
    seedGift(db, 'g-002', 'sender-1', 'receiver-1', 5_000, 'pending', -60 * 60 * 1000);
    expect(() => acceptGift(db, 'g-002', 'receiver-1')).toThrow(/expired/i);
  });

  it('Not your gift (다른 receiver) → HTTP 403', () => {
    expect(() => acceptGift(db, 'g-001', 'receiver-2')).toThrow(/Not your gift/);
  });
});

// ---------------------------------------------------------------------------
// BL-G003: 수신자 선물 거절
// ---------------------------------------------------------------------------
describe('BL-G003: rejectGift (status pending → rejected, sender restore)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedVoucher(db, 'sender-1', 0);
    seedVoucher(db, 'receiver-1', 0);
    seedGift(db, 'g-001', 'sender-1', 'receiver-1', 10_000, 'pending');
  });

  it('정상 거절 — pending → rejected, sender 잔액 복원', () => {
    const result = rejectGift(db, 'g-001', 'receiver-1');
    expect(result.status).toBe('rejected');

    const sender = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get('sender-1') as { balance: number };
    expect(sender.balance).toBe(10_000);

    const ledger = db.prepare('SELECT direction FROM gift_ledger_entries WHERE gift_id = ?').get('g-001') as {
      direction: string;
    };
    expect(ledger.direction).toBe('RESTORE_SENDER');
  });

  it('이미 처리된 선물 → HTTP 422', () => {
    rejectGift(db, 'g-001', 'receiver-1');
    expect(() => rejectGift(db, 'g-001', 'receiver-1')).toThrow(/already processed/);
  });
});

// ---------------------------------------------------------------------------
// BL-G004: 만료 처리 (ES-GIFT-001 보호)
// ---------------------------------------------------------------------------
describe('BL-G004: expireGift (status pending → expired, sender restore)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedVoucher(db, 'sender-1', 0);
    seedVoucher(db, 'receiver-1', 0);
  });

  it('정상 만료 — expires_at 과거 + pending → expired, sender 복원', () => {
    seedGift(db, 'g-001', 'sender-1', 'receiver-1', 7_000, 'pending', -60 * 60 * 1000);
    const result = expireGift(db, 'g-001');
    expect(result.status).toBe('expired');

    const sender = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get('sender-1') as { balance: number };
    expect(sender.balance).toBe(7_000);
  });

  it('ES-GIFT-001: 이미 accepted → 만료 처리 거부 (HTTP 422)', () => {
    seedGift(db, 'g-001', 'sender-1', 'receiver-1', 7_000, 'accepted', -60 * 60 * 1000);
    expect(() => expireGift(db, 'g-001')).toThrow(/Cannot expire accepted gift/);
  });

  it('아직 만료 안 됨 → HTTP 422', () => {
    seedGift(db, 'g-001', 'sender-1', 'receiver-1', 7_000, 'pending', 60 * 60 * 1000);
    expect(() => expireGift(db, 'g-001')).toThrow(/has not expired/);
  });
});

// ---------------------------------------------------------------------------
// BL-G005: 발송자 취소 (ES-GIFT-002 보호)
// ---------------------------------------------------------------------------
describe('BL-G005: cancelGift (status pending → canceled, sender restore)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedVoucher(db, 'sender-1', 0);
    seedVoucher(db, 'receiver-1', 0);
  });

  it('정상 취소 — pending → canceled, sender 즉시 복원', () => {
    seedGift(db, 'g-001', 'sender-1', 'receiver-1', 5_000, 'pending');
    const result = cancelGift(db, 'g-001', 'sender-1');
    expect(result.status).toBe('canceled');

    const sender = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get('sender-1') as { balance: number };
    expect(sender.balance).toBe(5_000);
  });

  it('ES-GIFT-002: 이미 accepted → 취소 거부 (HTTP 422)', () => {
    seedGift(db, 'g-001', 'sender-1', 'receiver-1', 5_000, 'accepted');
    expect(() => cancelGift(db, 'g-001', 'sender-1')).toThrow(/Cannot cancel accepted gift/);
  });
});

// ---------------------------------------------------------------------------
// BL-G006: 잔액 이전 atomic transaction
// ---------------------------------------------------------------------------
describe('BL-G006: transferGiftBalance (atomic 2-row ledger + balance)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedVoucher(db, 'sender-1', 100_000);
    seedVoucher(db, 'receiver-1', 0);
  });

  it('정상 이체 — 2 ledger rows, sender -amount / receiver +amount', () => {
    const result = transferGiftBalance(db, 'g-tx-001', 'sender-1', 'receiver-1', 30_000);
    expect(result.debitLedgerId).toBeTruthy();
    expect(result.creditLedgerId).toBeTruthy();

    const sender = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get('sender-1') as { balance: number };
    const receiver = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get('receiver-1') as {
      balance: number;
    };
    expect(sender.balance).toBe(70_000);
    expect(receiver.balance).toBe(30_000);

    const ledgerCount = db.prepare('SELECT COUNT(*) as c FROM gift_ledger_entries WHERE gift_id = ?').get('g-tx-001') as {
      c: number;
    };
    expect(ledgerCount.c).toBe(2);
  });

  it('롤백 — receiver 부재 시 transaction 전체 롤백 (atomicity)', () => {
    expect(() => transferGiftBalance(db, 'g-tx-002', 'sender-1', 'nonexistent-user', 50_000)).toThrow(
      /Receiver voucher missing/
    );

    const sender = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get('sender-1') as { balance: number };
    expect(sender.balance).toBe(100_000); // 변화 없음 (롤백)

    const ledgerCount = db.prepare('SELECT COUNT(*) as c FROM gift_ledger_entries WHERE gift_id = ?').get('g-tx-002') as {
      c: number;
    };
    expect(ledgerCount.c).toBe(0); // 롤백
  });

  it('Insufficient balance → HTTP 422', () => {
    expect(() => transferGiftBalance(db, 'g-tx-003', 'sender-1', 'receiver-1', 200_000)).toThrow(
      /Insufficient sender balance/
    );
  });

  it('Negative amount → HTTP 422', () => {
    expect(() => transferGiftBalance(db, 'g-tx-004', 'sender-1', 'receiver-1', -1)).toThrow(/positive/);
  });
});
