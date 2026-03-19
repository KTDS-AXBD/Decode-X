import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { processCancel, processNetworkCancel, CancelError, type CardCancelApi } from '../domain/cancel.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const sql = readFileSync(join(__dirname, '..', '..', 'migrations', '0001_init.sql'), 'utf-8');
  db.exec(sql);
  return db;
}

function seedTestData(db: Database.Database) {
  db.prepare(`INSERT INTO users (id, name, phone, role, status) VALUES ('user-1', 'Test User', '010-1234-5678', 'USER', 'ACTIVE')`).run();
  db.prepare(`INSERT INTO users (id, name, phone, role, status) VALUES ('merchant-owner', 'Owner', '010-9876-5432', 'MERCHANT', 'ACTIVE')`).run();
  db.prepare(`INSERT INTO vouchers (id, user_id, face_amount, balance, status, purchased_at, expires_at) VALUES ('voucher-1', 'user-1', 100000, 70000, 'ACTIVE', datetime('now'), datetime('now', '+1 year'))`).run();
  db.prepare(`INSERT INTO merchants (id, name, business_number, owner_user_id, status) VALUES ('merchant-1', 'Test Shop', '123-45-67890', 'merchant-owner', 'ACTIVE')`).run();
  // 결제 건 생성 (30,000원 결제, 잔액 70,000)
  db.prepare(`INSERT INTO payments (id, user_id, merchant_id, voucher_id, amount, method, status, paid_at, idempotency_key) VALUES ('payment-1', 'user-1', 'merchant-1', 'voucher-1', 30000, 'QR', 'PAID', datetime('now'), 'idem-key-1')`).run();
}

const successApi: CardCancelApi = {
  async requestCancel() { return { externalCancelId: 'CXL-TEST-001' }; },
};

const failApi: CardCancelApi = {
  async requestCancel() { throw new Error('Card cancel system down'); },
};

describe('FN-004: 결제 취소', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
  });

  it('BL-016: 정상 취소 — 잔액 복구 + CANCELED 상태', async () => {
    const result = await processCancel(db, {
      userId: 'user-1',
      userRole: 'USER',
      paymentId: 'payment-1',
      reason: '단순 변심',
    }, successApi);

    expect(result.status).toBe('CANCEL_REQUESTED');

    // 잔액 복구 확인
    const voucher = db.prepare('SELECT balance FROM vouchers WHERE id = ?').get('voucher-1') as { balance: number };
    expect(voucher.balance).toBe(100_000); // 70,000 + 30,000

    // payments 상태 확인
    const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get('payment-1') as { status: string };
    expect(payment.status).toBe('CANCELED');

    // cancel_transactions 생성 확인
    const cancel = db.prepare('SELECT cancel_amount, requester_type FROM cancel_transactions WHERE payment_id = ?').get('payment-1') as { cancel_amount: number; requester_type: string };
    expect(cancel.cancel_amount).toBe(30_000);
    expect(cancel.requester_type).toBe('USER');
  });

  it('E404: 존재하지 않는 결제', async () => {
    try {
      await processCancel(db, {
        userId: 'user-1',
        userRole: 'USER',
        paymentId: 'nonexistent',
        reason: 'test',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CancelError);
      expect((err as CancelError).code).toBe('E404');
    }
  });

  it('E409-ST: 이미 취소된 결제 재취소 시도', async () => {
    // 먼저 취소
    await processCancel(db, {
      userId: 'user-1', userRole: 'USER', paymentId: 'payment-1', reason: '첫 취소',
    }, successApi);

    // 재취소 시도
    try {
      await processCancel(db, {
        userId: 'user-1', userRole: 'USER', paymentId: 'payment-1', reason: '재취소',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as CancelError).code).toBe('E409-ST');
    }
  });

  it('E403: 타인의 결제 취소 시도', async () => {
    db.prepare(`INSERT INTO users (id, name, phone, role, status) VALUES ('user-2', 'Other', '010-0000-0000', 'USER', 'ACTIVE')`).run();

    try {
      await processCancel(db, {
        userId: 'user-2',
        userRole: 'USER',
        paymentId: 'payment-1',
        reason: '남의 결제 취소',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as CancelError).code).toBe('E403');
    }
  });

  it('ADMIN은 타인의 결제도 취소 가능', async () => {
    const result = await processCancel(db, {
      userId: 'admin-1',
      userRole: 'ADMIN',
      paymentId: 'payment-1',
      reason: '관리자 취소',
    }, successApi);

    expect(result.status).toBe('CANCEL_REQUESTED');

    const cancel = db.prepare('SELECT requester_type FROM cancel_transactions WHERE payment_id = ?').get('payment-1') as { requester_type: string };
    expect(cancel.requester_type).toBe('ADMIN');
  });

  it('E422-PD: 취소 가능 기간 초과 (7일)', async () => {
    // 8일 전 결제로 변경
    db.prepare(`UPDATE payments SET paid_at = datetime('now', '-8 days') WHERE id = 'payment-1'`).run();

    try {
      await processCancel(db, {
        userId: 'user-1', userRole: 'USER', paymentId: 'payment-1', reason: '기간 초과',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as CancelError).code).toBe('E422-PD');
    }
  });

  it('CARD 결제 취소 시 카드사 API 실패 → E502', async () => {
    // CARD 결제로 변경
    db.prepare(`UPDATE payments SET method = 'CARD' WHERE id = 'payment-1'`).run();

    try {
      await processCancel(db, {
        userId: 'user-1', userRole: 'USER', paymentId: 'payment-1', reason: '카드 취소',
      }, failApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as CancelError).code).toBe('E502');
    }
  });
});

describe('BL-042: 결제 망 취소', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
  });

  it('망취소 정상 처리 — 잔액 복구', () => {
    const result = processNetworkCancel(db, 'payment-1', 'idem-key-1');
    expect(result.status).toBe('NETWORK_CANCELED');

    const voucher = db.prepare('SELECT balance FROM vouchers WHERE id = ?').get('voucher-1') as { balance: number };
    expect(voucher.balance).toBe(100_000);
  });
});
