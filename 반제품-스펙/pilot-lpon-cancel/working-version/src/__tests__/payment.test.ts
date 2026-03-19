import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { processPayment, PaymentError, type CardApi, type NotificationService } from '../domain/payment.js';

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
  db.prepare(`INSERT INTO vouchers (id, user_id, face_amount, balance, status, purchased_at, expires_at) VALUES ('voucher-1', 'user-1', 100000, 100000, 'ACTIVE', datetime('now'), datetime('now', '+1 year'))`).run();
  db.prepare(`INSERT INTO merchants (id, name, business_number, owner_user_id, status) VALUES ('merchant-1', 'Test Shop', '123-45-67890', 'merchant-owner', 'ACTIVE')`).run();
}

const successCardApi: CardApi = {
  async authorize() { return { approvalId: 'AUTH-TEST-001' }; },
};

const failCardApi: CardApi = {
  async authorize() { throw new Error('Card system down'); },
};

const smsSpy = { called: false, amount: 0 };
const trackingSmsService: NotificationService = {
  async sendPaymentSms(_userId, amount) {
    smsSpy.called = true;
    smsSpy.amount = amount;
  },
};

describe('FN-003: 결제', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
    smsSpy.called = false;
    smsSpy.amount = 0;
  });

  it('BL-014: 정상 결제 — 잔액 차감 + PAID 상태', async () => {
    const result = await processPayment(db, {
      userId: 'user-1',
      voucherId: 'voucher-1',
      merchantId: 'merchant-1',
      amount: 30_000,
      method: 'QR',
    });

    expect(result.status).toBe('PAID');
    expect(result.balanceAfter).toBe(70_000);

    const voucher = db.prepare('SELECT balance FROM vouchers WHERE id = ?').get('voucher-1') as { balance: number };
    expect(voucher.balance).toBe(70_000);
  });

  it('BL-014: 잔액 부족 시 결제 거부 (E422-BAL)', async () => {
    try {
      await processPayment(db, {
        userId: 'user-1',
        voucherId: 'voucher-1',
        merchantId: 'merchant-1',
        amount: 200_000,
        method: 'QR',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentError);
      expect((err as PaymentError).code).toBe('E422-BAL');
    }
  });

  it('E404-V: 존재하지 않는 상품권', async () => {
    try {
      await processPayment(db, {
        userId: 'user-1',
        voucherId: 'nonexistent',
        merchantId: 'merchant-1',
        amount: 10_000,
        method: 'QR',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as PaymentError).code).toBe('E404-V');
    }
  });

  it('E404-M: 존재하지 않는 가맹점', async () => {
    try {
      await processPayment(db, {
        userId: 'user-1',
        voucherId: 'voucher-1',
        merchantId: 'nonexistent',
        amount: 10_000,
        method: 'QR',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as PaymentError).code).toBe('E404-M');
    }
  });

  it('E409-MS: 비활성 가맹점 결제 거부', async () => {
    db.prepare(`UPDATE merchants SET status = 'SUSPENDED' WHERE id = 'merchant-1'`).run();

    try {
      await processPayment(db, {
        userId: 'user-1',
        voucherId: 'voucher-1',
        merchantId: 'merchant-1',
        amount: 10_000,
        method: 'QR',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as PaymentError).code).toBe('E409-MS');
    }
  });

  it('CARD 결제 시 카드사 승인 실패 → E502', async () => {
    try {
      await processPayment(db, {
        userId: 'user-1',
        voucherId: 'voucher-1',
        merchantId: 'merchant-1',
        amount: 10_000,
        method: 'CARD',
      }, failCardApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as PaymentError).code).toBe('E502');
    }
  });

  it('CARD 결제 정상 승인', async () => {
    const result = await processPayment(db, {
      userId: 'user-1',
      voucherId: 'voucher-1',
      merchantId: 'merchant-1',
      amount: 10_000,
      method: 'CARD',
    }, successCardApi);

    expect(result.status).toBe('PAID');
    expect(result.balanceAfter).toBe(90_000);
  });

  it('BL-015: 5만원 이상 결제 시 SMS 발송', async () => {
    await processPayment(db, {
      userId: 'user-1',
      voucherId: 'voucher-1',
      merchantId: 'merchant-1',
      amount: 50_000,
      method: 'QR',
    }, successCardApi, trackingSmsService);

    expect(smsSpy.called).toBe(true);
    expect(smsSpy.amount).toBe(50_000);

    // payment_notifications 확인
    const notif = db.prepare('SELECT status FROM payment_notifications WHERE recipient_id = ?').get('user-1') as { status: string };
    expect(notif.status).toBe('SENT');
  });

  it('BL-015: 5만원 미만 결제 시 SMS 미발송', async () => {
    await processPayment(db, {
      userId: 'user-1',
      voucherId: 'voucher-1',
      merchantId: 'merchant-1',
      amount: 49_999,
      method: 'QR',
    }, successCardApi, trackingSmsService);

    expect(smsSpy.called).toBe(false);
  });
});
